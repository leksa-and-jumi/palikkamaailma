// Room server for multiplayer. Every world code has its own Durable Object
// ("room"): it remembers the changed blocks and tells everyone in the room
// where the others are and what they build.
//
// Players are animals (no names) and there is no list of rooms: you join with
// a code. Chat is on (the parent decided so); it is rate limited per player.
// Only the game's own web pages may connect (ALLOWED_ORIGINS).

import { DurableObject } from 'cloudflare:workers';
import { DROPS, NET } from '../src/config';
import { isValidWorldCode } from '../src/logic/codes';
import {
  parseClientMessage,
  type DroppedItem,
  type PlayerInfo,
  type ServerMessage,
} from '../src/logic/protocol';
import type { Edit } from '../src/logic/world';

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
}

export class WorldRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS edits (
      x INTEGER NOT NULL, y INTEGER NOT NULL, z INTEGER NOT NULL, b INTEGER NOT NULL,
      PRIMARY KEY (x, y, z)
    ) WITHOUT ROWID`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, time INTEGER NOT NULL
    )`);
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
    const known = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'verified'").toArray();
    if (known.length > 0) return true;
    try {
      const response = await fetch(`${site}/world?code=${encodeURIComponent(code)}`);
      if (!response.ok) return false;
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('verified', ?)", code);
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
        this.send(ws, { t: 'welcome', you: me.id, players: others, items: this.items() });
        this.sendAllEdits(ws);
        this.broadcast({ t: 'join', player: me.player }, ws);
        return;
      }
      case 'move': {
        if (!me.player) return;
        me.player = { ...me.player, p: msg.p, yaw: msg.yaw, pitch: msg.pitch };
        ws.serializeAttachment(me);
        this.broadcast({ t: 'move', id: me.id, p: msg.p, yaw: msg.yaw, pitch: msg.pitch }, ws);
        return;
      }
      case 'set': {
        if (!me.player) return;
        const stored = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM edits').one().n;
        if (stored + msg.edits.length > NET.maxStoredEdits) return;
        for (const [x, y, z, b] of msg.edits) {
          this.sql.exec(
            'INSERT OR REPLACE INTO edits (x, y, z, b) VALUES (?, ?, ?, ?)',
            x,
            y,
            z,
            b,
          );
        }
        this.broadcast({ t: 'set', edits: msg.edits }, ws);
        return;
      }
      case 'drop': {
        if (!me.player) return;
        const count = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM items').one().n;
        if (count >= DROPS.maxPerRoom) return;
        const drop: DroppedItem = {
          id: crypto.randomUUID(),
          item: msg.item,
          p: msg.p,
          v: msg.v,
          time: Date.now(),
        };
        this.sql.exec(
          'INSERT INTO items (id, data, time) VALUES (?, ?, ?)',
          drop.id,
          JSON.stringify(drop),
          drop.time,
        );
        this.broadcast({ t: 'item', drop });
        return;
      }
      case 'pickup': {
        if (!me.player) return;
        // Only the first player to ask gets it.
        const removed = this.sql
          .exec('DELETE FROM items WHERE id = ? RETURNING id', msg.id)
          .toArray();
        if (removed.length === 0) return;
        this.broadcast({ t: 'picked', id: msg.id, by: me.id });
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
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (me?.player) this.broadcast({ t: 'leave', id: me.id }, ws);
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

  /** Items still lying around (old ones disappear). */
  private items(): DroppedItem[] {
    this.sql.exec('DELETE FROM items WHERE time < ?', Date.now() - DROPS.lifetime * 1000);
    return this.sql
      .exec<{ data: string }>('SELECT data FROM items')
      .toArray()
      .map((row) => JSON.parse(row.data) as DroppedItem);
  }

  private sendAllEdits(ws: WebSocket): void {
    const rows = this.sql.exec<{ x: number; y: number; z: number; b: number }>(
      'SELECT x, y, z, b FROM edits',
    );
    let page: Edit[] = [];
    for (const row of rows) {
      page.push([row.x, row.y, row.z, row.b]);
      if (page.length >= NET.editsPerWelcomePage) {
        this.send(ws, { t: 'edits', edits: page, done: false });
        page = [];
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
