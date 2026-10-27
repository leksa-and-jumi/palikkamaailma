// Room server for multiplayer. Every world code has its own Durable Object
// ("room"): it remembers the changed blocks and tells everyone in the room
// where the others are and what they build.
//
// Players are animals (no names) and there is no list of rooms: you join with
// a code. Chat is on (the parent decided so); it is rate limited per player.
// Only the game's own web pages may connect (ALLOWED_ORIGINS).

import { DurableObject } from 'cloudflare:workers';
import { COMMANDS, DROPS, FIREWORKS, NET } from '../src/config';
import { isValidWorldCode } from '../src/logic/codes';
import {
  advanceFurnace,
  containerItems,
  emptyContainer,
  isContainerBlock,
  positionKey,
  type Container,
} from '../src/logic/containers';
import {
  parseClientMessage,
  type DroppedItem,
  type PlayerInfo,
  type ServerMessage,
} from '../src/logic/protocol';
import type { Edit } from '../src/logic/world';
import {
  chunkKeyOf,
  groupByChunk,
  mergeEdits,
  packEdits,
  toChunkEdits,
  unpackEdits,
  type ChunkEdits,
} from './editStore';

export interface Env {
  WORLD_ROOM: DurableObjectNamespace<WorldRoom>;
  /** Comma-separated list of web pages allowed to connect. */
  ALLOWED_ORIGINS: string;
  /** Convex HTTP actions URL (…convex.site). If set, world codes must exist there. */
  CONVEX_SITE_URL?: string;
}

const ROOM_PATH = /^\/room\/([^/]+)\/ws$/;
const ID_LENGTH = 8;

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    if (!isAllowedOrigin(request.headers.get('Origin'), env)) {
      return new Response('Forbidden', { status: 403 });
    }
    const code = decodeURIComponent(match[1]!);
    if (!isValidWorldCode(code)) return new Response('Bad world code', { status: 400 });

    const stub = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(code));
    const headers = new Headers(request.headers);
    headers.set('X-World-Code', code);
    return stub.fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;

/** What the room remembers about each connected player (survives hibernation). */
interface Attachment {
  id: string;
  /** Null until the player says hello. */
  player: PlayerInfo | null;
  /** When this player's recent chat messages were sent (ms). */
  chatTimes?: number[];
  /** When this player's recent rockets were launched (ms). */
  fireworkTimes?: number[];
  /** When this player's recent /tpa, /kutsu and /aika were sent (ms). */
  requestTimes?: number[];
  /** Lying in a bed, and how far the clock must jump to reach the morning. */
  sleeping?: boolean;
  skip?: number;
}

/** Storage layout version; 2 = edits packed per chunk, items in one row. */
const SCHEMA_VERSION = '2';

export class WorldRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  // Caches, so rows are read once while the room is awake (cleared on hibernation).
  private readonly chunks = new Map<string, ChunkEdits>();
  private allChunksLoaded = false;
  private editCount: number | null = null;
  private droppedItems: DroppedItem[] | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS edit_chunks (chunk TEXT PRIMARY KEY, data BLOB NOT NULL)',
    );
    // One row per chest or furnace; only read when someone opens it.
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS containers (pos TEXT PRIMARY KEY, data TEXT NOT NULL)',
    );
    if (this.meta('schema') !== SCHEMA_VERSION) this.migrate();
  }

  private meta(key: string): string | undefined {
    return this.sql.exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', key).toArray()[0]?.v;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', key, value);
  }

  /** Moves worlds saved in the old one-row-per-block format to chunk rows (runs once). */
  private migrate(): void {
    const hasOld = (name: string) =>
      this.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name)
        .toArray().length > 0;
    let count = 0;
    if (hasOld('edits')) {
      const old = this.sql
        .exec<{ x: number; y: number; z: number; b: number }>('SELECT x, y, z, b FROM edits')
        .toArray()
        .map((r): Edit => [r.x, r.y, r.z, r.b]);
      for (const [key, edits] of groupByChunk(old)) {
        const chunk = toChunkEdits(edits);
        count += chunk.size;
        this.writeChunk(key, chunk);
      }
      this.sql.exec('DROP TABLE edits');
    }
    if (hasOld('items')) {
      const items = this.sql
        .exec<{ data: string }>('SELECT data FROM items')
        .toArray()
        .map((r) => JSON.parse(r.data) as DroppedItem);
      this.setMeta('items', JSON.stringify(items));
      this.sql.exec('DROP TABLE items');
    }
    this.setMeta('editCount', String(count));
    this.setMeta('schema', SCHEMA_VERSION);
  }

  // --- Changed blocks -----------------------------------------------------

  private loadChunk(key: string): ChunkEdits {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const row = this.sql
        .exec<{ data: ArrayBuffer }>('SELECT data FROM edit_chunks WHERE chunk = ?', key)
        .toArray()[0];
      chunk = toChunkEdits(row ? unpackEdits(row.data) : []);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private writeChunk(key: string, chunk: ChunkEdits): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO edit_chunks (chunk, data) VALUES (?, ?)',
      key,
      packEdits(chunk.values()),
    );
  }

  private getEditCount(): number {
    this.editCount ??= Number(this.meta('editCount') ?? 0);
    return this.editCount;
  }

  /**
   * Saves edits: one read (first time) and one write per chunk, plus the counter.
   * Chests and furnaces that were replaced are listed in `removedContainers`.
   */
  private storeEdits(edits: Edit[], removedContainers: Edit[] = []): boolean {
    if (this.getEditCount() + edits.length > NET.maxStoredEdits) return false;
    let added = 0;
    for (const [key, group] of groupByChunk(edits)) {
      const chunk = this.loadChunk(key);
      // Containers only exist where a player placed one, so the old edit tells.
      for (const edit of group) {
        const old = chunk.get(`${edit[0]},${edit[1]},${edit[2]}`);
        if (old && isContainerBlock(old[3]) && old[3] !== edit[3]) removedContainers.push(old);
      }
      added += mergeEdits(chunk, group);
      this.writeChunk(key, chunk);
    }
    if (added > 0) {
      this.editCount = this.getEditCount() + added;
      this.setMeta('editCount', String(this.editCount));
    }
    return true;
  }

  private loadAllChunks(): void {
    if (this.allChunksLoaded) return;
    for (const row of this.sql.exec<{ chunk: string; data: ArrayBuffer }>(
      'SELECT chunk, data FROM edit_chunks',
    )) {
      if (!this.chunks.has(row.chunk))
        this.chunks.set(row.chunk, toChunkEdits(unpackEdits(row.data)));
    }
    this.allChunksLoaded = true;
  }

  // --- Chests and furnaces -----------------------------------------------

  /** The block a player placed here, if any (containers are never generated). */
  private blockAt(p: [number, number, number]): number | undefined {
    return this.loadChunk(chunkKeyOf(p[0], p[2])).get(positionKey(p))?.[3];
  }

  private loadContainer(p: [number, number, number]): Container | null {
    const block = this.blockAt(p);
    if (block === undefined || !isContainerBlock(block)) return null;
    const row = this.sql
      .exec<{ data: string }>('SELECT data FROM containers WHERE pos = ?', positionKey(p))
      .toArray()[0];
    const data = row ? (JSON.parse(row.data) as Container) : emptyContainer(block, Date.now())!;
    if (data.kind === 'furnace') {
      advanceFurnace(data, Date.now());
      this.saveContainer(p, data);
    }
    return data;
  }

  private saveContainer(p: [number, number, number], data: Container): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO containers (pos, data) VALUES (?, ?)',
      positionKey(p),
      JSON.stringify(data),
    );
  }

  private spillContainer(p: [number, number, number]): void {
    const key = positionKey(p);
    const row = this.sql
      .exec<{ data: string }>('DELETE FROM containers WHERE pos = ? RETURNING data', key)
      .toArray()[0];
    if (!row) return;
    const data = JSON.parse(row.data) as Container;
    if (data.kind === 'furnace') advanceFurnace(data, Date.now());
    const items = this.items();
    for (const item of containerItems(data)) {
      const drop: DroppedItem = {
        id: crypto.randomUUID(),
        item,
        p: [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5],
        v: [(Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2],
        time: Date.now(),
      };
      items.push(drop);
      this.broadcast({ t: 'item', drop });
    }
    this.saveItems();
  }

  // --- Items on the ground ------------------------------------------------

  /** Items still lying around (old ones disappear). Kept in one row. */
  private items(): DroppedItem[] {
    if (!this.droppedItems) {
      const saved = this.meta('items');
      this.droppedItems = saved ? (JSON.parse(saved) as DroppedItem[]) : [];
    }
    const oldest = Date.now() - DROPS.lifetime * 1000;
    this.droppedItems = this.droppedItems.filter((d) => d.time >= oldest);
    return this.droppedItems;
  }

  private saveItems(): void {
    this.setMeta('items', JSON.stringify(this.items()));
  }

  async fetch(request: Request): Promise<Response> {
    const code = request.headers.get('X-World-Code') ?? '';
    if (!(await this.worldExists(code))) {
      return new Response('World not found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { id: crypto.randomUUID().slice(0, ID_LENGTH), player: null };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Asks Convex once whether the world code was really made in the game. */
  private async worldExists(code: string): Promise<boolean> {
    const site = this.env.CONVEX_SITE_URL;
    if (!site) return true;
    if (this.meta('verified')) return true;
    try {
      const response = await fetch(`${site}/world?code=${encodeURIComponent(code)}`);
      if (!response.ok) return false;
      this.setMeta('verified', code);
      return true;
    } catch {
      // If Convex cannot be reached, let the kids play anyway.
      return true;
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) return;
    const me = ws.deserializeAttachment() as Attachment;

    switch (msg.t) {
      case 'hello': {
        if (me.player) return;
        const others = this.players().filter((p) => p.id !== me.id);
        if (others.length >= NET.maxPlayersPerRoom) {
          this.send(ws, { t: 'full' });
          ws.close(4000, 'Room full');
          return;
        }
        me.player = { id: me.id, avatar: msg.avatar, p: [0, 0, 0], yaw: 0, pitch: 0 };
        ws.serializeAttachment(me);
        this.send(ws, {
          t: 'welcome',
          you: me.id,
          players: others,
          items: this.items(),
          timeOffset: this.timeOffset(),
        });
        this.sendAllEdits(ws);
        this.broadcast({ t: 'join', player: me.player }, ws);
        return;
      }
      case 'move': {
        if (!me.player) return;
        me.player = { ...me.player, p: msg.p, yaw: msg.yaw, pitch: msg.pitch, safe: msg.safe };
        ws.serializeAttachment(me);
        this.broadcast(
          {
            t: 'move',
            id: me.id,
            p: msg.p,
            yaw: msg.yaw,
            pitch: msg.pitch,
            mobs: msg.mobs,
            safe: msg.safe,
          },
          ws,
        );
        return;
      }
      case 'set': {
        if (!me.player) return;
        const removed: Edit[] = [];
        if (!this.storeEdits(msg.edits, removed)) return;
        this.broadcast({ t: 'set', edits: msg.edits }, ws);
        // A broken chest or furnace spills its items.
        for (const [x, y, z] of removed) this.spillContainer([x, y, z]);
        return;
      }
      case 'open': {
        if (!me.player) return;
        const data = this.loadContainer(msg.p);
        if (data) this.send(ws, { t: 'container', p: msg.p, data });
        return;
      }
      case 'container': {
        if (!me.player) return;
        const block = this.blockAt(msg.p);
        const kind = block === undefined ? null : emptyContainer(block, 0)?.kind;
        if (kind !== msg.data.kind) return;
        if (msg.data.kind === 'furnace') msg.data.updated = Date.now();
        this.saveContainer(msg.p, msg.data);
        this.broadcast({ t: 'container', p: msg.p, data: msg.data }, ws);
        return;
      }
      case 'drop': {
        if (!me.player) return;
        const items = this.items();
        if (items.length >= DROPS.maxPerRoom) return;
        const drop: DroppedItem = {
          id: crypto.randomUUID(),
          item: msg.item,
          p: msg.p,
          v: msg.v,
          time: Date.now(),
        };
        items.push(drop);
        this.saveItems();
        this.broadcast({ t: 'item', drop });
        return;
      }
      case 'pickup': {
        if (!me.player) return;
        // Only the first player to ask gets it.
        const items = this.items();
        const index = items.findIndex((d) => d.id === msg.id);
        if (index < 0) return;
        items.splice(index, 1);
        this.saveItems();
        this.broadcast({ t: 'picked', id: msg.id, by: me.id });
        return;
      }
      case 'hitMob': {
        if (!me.player) return;
        this.broadcast({ ...msg, by: me.id }, ws);
        return;
      }
      case 'hurtPlayer': {
        if (!me.player) return;
        // Only the player who got hurt needs to hear it.
        for (const other of this.ctx.getWebSockets()) {
          const a = other.deserializeAttachment() as Attachment | null;
          if (a?.id === msg.id) this.send(other, msg);
        }
        return;
      }
      case 'chat': {
        if (!me.player) return;
        const now = Date.now();
        const recent = (me.chatTimes ?? []).filter((t) => now - t < NET.chatWindowMs);
        if (recent.length >= NET.chatRateLimit) return;
        me.chatTimes = [...recent, now];
        ws.serializeAttachment(me);
        this.broadcast({ t: 'chat', id: me.id, avatar: me.player.avatar, text: msg.text }, ws);
        return;
      }
      case 'ask':
      case 'answer': {
        // Teleport requests go only to the player asked.
        if (!me.player || !this.allowRequest(ws, me)) return;
        const out: ServerMessage =
          msg.t === 'ask'
            ? { t: 'ask', from: me.id, avatar: me.player.avatar, kind: msg.kind }
            : {
                t: 'answer',
                from: me.id,
                avatar: me.player.avatar,
                kind: msg.kind,
                yes: msg.yes,
                ...(msg.p ? { p: msg.p } : {}),
              };
        for (const other of this.ctx.getWebSockets()) {
          const a = other.deserializeAttachment() as Attachment | null;
          if (a?.id === msg.to && a.player) this.send(other, out);
        }
        return;
      }
      case 'sleep': {
        if (!me.player) return;
        me.sleeping = msg.on;
        me.skip = msg.skip;
        ws.serializeAttachment(me);
        this.checkSleepers(me);
        return;
      }
      case 'time': {
        if (!me.player || !this.allowRequest(ws, me)) return;
        this.moveClock(msg.skip, { avatar: me.player.avatar });
        return;
      }
      case 'firework': {
        // Not stored: the others just see it fly. Rate limited like chat.
        if (!me.player) return;
        const now = Date.now();
        const recent = (me.fireworkTimes ?? []).filter((t) => now - t < NET.chatWindowMs);
        if (recent.length >= FIREWORKS.rateLimit) return;
        me.fireworkTimes = [...recent, now];
        ws.serializeAttachment(me);
        this.broadcast({ t: 'firework', p: msg.p, kind: msg.kind, seed: msg.seed }, ws);
        return;
      }
    }
  }

  /** Requests and clock changes are rate limited like chat. */
  private allowRequest(ws: WebSocket, me: Attachment): boolean {
    const now = Date.now();
    const recent = (me.requestTimes ?? []).filter((t) => now - t < NET.chatWindowMs);
    if (recent.length >= COMMANDS.rateLimit) return false;
    me.requestTimes = [...recent, now];
    ws.serializeAttachment(me);
    return true;
  }

  private timeOffset(): number {
    return Number(this.meta('timeOffset') ?? 0);
  }

  /** Moves the world's clock forward for everyone (one meta row). */
  private moveClock(skip: number, extra: { avatar?: string; slept?: boolean }): void {
    const offset = this.timeOffset() + skip;
    this.setMeta('timeOffset', String(offset));
    this.broadcast({ t: 'time', offset, ...extra });
  }

  /** When everyone is in bed, the night is skipped (like Minecraft). */
  private checkSleepers(me: Attachment): void {
    const sockets = this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, a: ws.deserializeAttachment() as Attachment | null }))
      .filter((s) => !!s.a?.player);
    const sleeping = sockets.filter((s) => s.a!.sleeping).length;
    if (sleeping < sockets.length || sleeping === 0) {
      this.broadcast({ t: 'sleepers', sleeping, total: sockets.length });
      return;
    }
    for (const { ws, a } of sockets) {
      a!.sleeping = false;
      ws.serializeAttachment(a);
    }
    this.moveClock(me.skip ?? 0, { slept: true });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (me?.player) {
      // Nobody waits for a sleeper who left.
      me.player = null;
      me.sleeping = false;
      try {
        ws.serializeAttachment(me);
      } catch {
        // Already gone.
      }
      this.broadcast({ t: 'leave', id: me.id }, ws);
      const sleeper = this.ctx
        .getWebSockets()
        .map((other) => other.deserializeAttachment() as Attachment | null)
        .find((a) => a?.player && a.sleeping);
      if (sleeper) this.checkSleepers(sleeper);
    }
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }

  private players(): PlayerInfo[] {
    return this.ctx
      .getWebSockets()
      .map((ws) => (ws.deserializeAttachment() as Attachment | null)?.player)
      .filter((p): p is PlayerInfo => !!p);
  }

  private sendAllEdits(ws: WebSocket): void {
    this.loadAllChunks();
    let page: Edit[] = [];
    for (const chunk of this.chunks.values()) {
      for (const edit of chunk.values()) {
        page.push(edit);
        if (page.length >= NET.editsPerWelcomePage) {
          this.send(ws, { t: 'edits', edits: page, done: false });
          page = [];
        }
      }
    }
    this.send(ws, { t: 'edits', edits: page, done: true });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The player just left.
    }
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const other = ws.deserializeAttachment() as Attachment | null;
      if (!other?.player) continue;
      try {
        ws.send(text);
      } catch {
        // Ignore players who just left.
      }
    }
  }
}
