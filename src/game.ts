// One play session in one world: moving, building, multiplayer and the magic builder.

import { BUILDER, NET, PLAYER, SEA_LEVEL } from './config';
import { sounds } from './audio/sounds';
import { loadLocalEdits, saveLocalEdits } from './data/storage';
import { AIR, getBlockType, isSolid } from './logic/blocks';
import { seedFromCode } from './logic/codes';
import { createPlayer, overlapsBlock, stepPlayer, type PlayerState } from './logic/physics';
import { cleanChatText, type ServerMessage } from './logic/protocol';
import { raycast, type RayHit } from './logic/raycast';
import { findSpawn } from './logic/spawn';
import { BIOME_NAMES } from './logic/terrain';
import { centerBuild, expandShapes, facingFromYaw, placeBuild } from './logic/shapes';
import { VoxelWorld, type Edit } from './logic/world';
import { askBuilder } from './net/convex';
import { ROOM_URL, RoomClient, type RoomStatus } from './net/room';
import { OtherPlayers } from './render/avatars';
import type { WorldRenderer } from './render/worldRenderer';
import type { Hud } from './ui/hud';
import { Input } from './ui/input';

export interface GameOptions {
  code: string;
  emoji: string;
  avatar: string;
  /** Alone on this device: saved in the browser, no room server. */
  solo: boolean;
}

/** Chunks around the spawn point that must be ready before playing. */
const SPAWN_READY_RADIUS = 2;
const SAVE_DELAY_MS = 1500;
const MAX_PITCH = Math.PI / 2 - 0.01;

const BUILDER_ERRORS: Record<string, string> = {
  'too-many': '😅 Nyt on taiottu tosi paljon. Odota hetki ja kokeile uudestaan!',
  'no-world': '❓ Tätä maailmaa ei löytynyt.',
  'bad-request': '✏️ Kirjoita ensin, mitä rakennetaan.',
  failed: '🤔 En keksinyt tuota. Kokeile toisilla sanoilla tai valitse valmis!',
};

export class Game {
  readonly world: VoxelWorld;
  private readonly player: PlayerState;
  private readonly others: OtherPlayers;
  private readonly input: Input;
  private room: RoomClient | null = null;
  private readonly avatars = new Map<string, string>();
  private target: RayHit | null = null;
  private lastFrame = performance.now();
  private moveTimer = 0;
  private lastSent = '';
  private running = true;
  private ready = false;
  private paused = true;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Edits made while the connection was down; sent when it comes back. */
  private pending: Edit[] = [];
  /** Blocks as they were before the last magic build, for undo. */
  private undo: Edit[] = [];

  constructor(
    private readonly options: GameOptions,
    private readonly renderer: WorldRenderer,
    private readonly hud: Hud,
    private readonly callbacks: { onReady(): void; onPause(paused: boolean): void },
  ) {
    this.world = new VoxelWorld(seedFromCode(options.code));
    renderer.setWorld(this.world);
    this.others = new OtherPlayers(renderer.scene);

    const [sx, sy, sz] = findSpawn(this.world);
    this.player = createPlayer(sx, sy, sz);

    this.input = new Input(renderer.renderer.domElement, {
      onBreak: () => this.breakBlock(),
      onPlace: () => this.placeBlock(),
      onPick: () => this.pickBlock(),
      onSlot: (i) => hud.select(i),
      onScroll: (d) => hud.select(hud.selected + d),
      onToggleFly: () => {
        this.player.flying = !this.player.flying;
        this.player.vy = 0;
      },
      onKey: (code) => this.onKey(code),
      onLockChange: (locked) => this.setPaused(!locked),
    });

    hud.setWorld(options.emoji, options.code, options.solo);
    this.avatars.set('me', options.avatar);
    this.updatePlayerList();

    if (options.solo || !ROOM_URL) {
      hud.setStatus('solo');
      this.world.applyEdits(loadLocalEdits(options.code));
    } else {
      this.room = new RoomClient(options.code, options.avatar, {
        onMessage: (msg) => this.onServerMessage(msg),
        onStatus: (status) => this.onRoomStatus(status),
      });
    }
    requestAnimationFrame(() => this.frame());
  }

  /** Locks the mouse and starts playing (needs a click from the player). */
  resume(): void {
    this.input.enabled = true;
    this.input.lock();
  }

  stop(): void {
    this.running = false;
    this.input.enabled = false;
    this.input.unlock();
    this.room?.close();
    this.flushSave();
    this.others.clear();
    this.hud.show(false);
  }

  // --- Main loop --------------------------------------------------------

  private frame(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.renderer.updateChunks(this.player.x, this.player.z);
    if (!this.ready) {
      const waiting = this.room?.waitingForWelcome ?? false;
      if (
        !waiting &&
        this.renderer.pendingChunks(this.player.x, this.player.z, SPAWN_READY_RADIUS) === 0
      ) {
        this.ready = true;
        this.input.enabled = true;
        this.callbacks.onReady();
      }
    }

    if (this.ready && !this.paused) {
      const [yaw, pitch] = this.input.takeLook();
      this.player.yaw += yaw;
      this.player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.player.pitch + pitch));
      const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      stepPlayer(
        {
          isSolid: (x, y, z) => isSolid(this.world.getBlock(x, y, z)),
          isLiquid: (x, y, z) => getBlockType(this.world.getBlock(x, y, z)).liquid,
        },
        this.player,
        {
          forward: this.input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
          right: this.input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
          jump: this.input.isDown('Space'),
          down: sprint && this.player.flying,
          sprint: sprint && !this.player.flying,
        },
        dt,
      );
      this.input.update(dt);
      this.hud.setFlying(this.player.flying);
      const biome = this.world.terrain.biomeAt(
        Math.floor(this.player.x),
        Math.floor(this.player.z),
      );
      this.hud.setBiome(BIOME_NAMES[biome]);
      this.sendMove(dt);
    }

    this.updateCamera();
    this.updateTarget();
    this.others.update(dt);
    this.renderer.render();
  }

  private updateCamera(): void {
    const cam = this.renderer.camera;
    cam.position.set(this.player.x, this.player.y + PLAYER.eyeHeight, this.player.z);
    cam.rotation.set(this.player.pitch, this.player.yaw, 0);
    const eye = this.world.getBlock(
      Math.floor(cam.position.x),
      Math.floor(cam.position.y),
      Math.floor(cam.position.z),
    );
    this.renderer.setUnderwater(getBlockType(eye).liquid);
  }

  private lookDirection(): [number, number, number] {
    const { yaw, pitch } = this.player;
    return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  }

  private updateTarget(): void {
    const [dx, dy, dz] = this.lookDirection();
    this.target = raycast(
      this.player.x,
      this.player.y + PLAYER.eyeHeight,
      this.player.z,
      dx,
      dy,
      dz,
      PLAYER.reach,
      (x, y, z) => {
        const b = getBlockType(this.world.getBlock(x, y, z));
        return b.id !== AIR && !b.liquid;
      },
    );
    if (this.target) this.renderer.showHighlight(this.target.x, this.target.y, this.target.z);
    else this.renderer.hideHighlight();
  }

  // --- Building ---------------------------------------------------------

  private breakBlock(): void {
    const t = this.target;
    if (!t || !getBlockType(this.world.getBlock(t.x, t.y, t.z)).breakable) return;
    this.change([[t.x, t.y, t.z, AIR]]);
    sounds.break();
  }

  private placeBlock(): void {
    const t = this.target;
    if (!t) return;
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    const here = getBlockType(this.world.getBlock(x, y, z));
    if (here.id !== AIR && !here.liquid) return;
    const block = this.hud.selectedBlock;
    // Don't put a solid block inside yourself.
    if (getBlockType(block).solid && overlapsBlock(this.player, x, y, z)) return;
    this.change([[x, y, z, block]]);
    sounds.place();
  }

  private pickBlock(): void {
    const t = this.target;
    if (!t) return;
    const id = this.world.getBlock(t.x, t.y, t.z);
    if (getBlockType(id).placeable) this.hud.chooseBlock(id);
  }

  /** Changes blocks here and tells the room (or saves them on this device). */
  private change(edits: Edit[]): Edit[] {
    const changed = edits.filter(([x, y, z, id]) => this.world.setBlock(x, y, z, id));
    if (changed.length === 0) return changed;
    if (this.room) {
      if (this.room.isOpen && !this.room.waitingForWelcome) this.sendEdits(changed);
      else this.pending.push(...changed);
    } else {
      this.scheduleSave();
    }
    return changed;
  }

  private sendEdits(edits: Edit[]): void {
    for (let i = 0; i < edits.length; i += NET.maxEditsPerMessage) {
      this.room?.send({ t: 'set', edits: edits.slice(i, i + NET.maxEditsPerMessage) });
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_DELAY_MS);
  }

  private flushSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.room) saveLocalEdits(this.options.code, this.world.edits());
  }

  // --- Magic builder ----------------------------------------------------

  private async magicBuild(prompt: string): Promise<string | null> {
    const answer = await askBuilder(this.options.code, prompt);
    if (!answer.ok) return BUILDER_ERRORS[answer.reason] ?? BUILDER_ERRORS.failed!;

    const blocks = centerBuild(expandShapes(answer.shapes));
    if (blocks.length === 0) return BUILDER_ERRORS.failed!;
    const facing = facingFromYaw(this.player.yaw);
    const [dx, , dz] = [
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ][facing]!;
    const ox = Math.floor(this.player.x) + dx! * BUILDER.distanceAhead;
    const oz = Math.floor(this.player.z) + dz! * BUILDER.distanceAhead;
    const ground = Math.max(this.world.surfaceY(ox, oz), SEA_LEVEL);
    const placed = placeBuild(blocks, [ox, ground + 1, oz], facing);

    const before: Edit[] = placed.map(([x, y, z]) => [x, y, z, this.world.getBlock(x, y, z)]);
    const changed = this.change(placed);
    const changedKeys = new Set(changed.map(([x, y, z]) => `${x},${y},${z}`));
    this.undo = before.filter(([x, y, z]) => changedKeys.has(`${x},${y},${z}`));
    sounds.magic();
    this.hud.toast(`✨ Valmis! (${changed.length} palikkaa) – Z kumoaa`);
    return null;
  }

  private undoBuild(): void {
    if (this.undo.length === 0) return;
    this.change(this.undo);
    this.undo = [];
    this.hud.toast('↩️ Taikarakennus kumottu');
  }

  // --- Keys and pausing -------------------------------------------------

  /** Returns true when the key opened something (so it is not typed anywhere). */
  private onKey(code: string): boolean {
    if (!this.ready) return false;
    if (this.hud.pickerOpen || this.hud.builderOpen || this.hud.chatOpen) return false;
    if (code === 'KeyE') {
      this.openOverlay((done) => this.hud.openPicker(done));
    } else if (code === 'KeyB') {
      this.openOverlay((done) => this.hud.openBuilder((prompt) => this.magicBuild(prompt), done));
    } else if (code === 'KeyT' || code === 'Enter') {
      this.openOverlay((done) => this.hud.openChat((text) => this.sendChat(text), done));
    } else if (code === 'KeyZ' && this.input.locked) {
      this.undoBuild();
    } else {
      return false;
    }
    return true;
  }

  private sendChat(raw: string): void {
    const text = cleanChatText(raw);
    if (!text) return;
    this.hud.addChat(this.options.avatar, text);
    this.room?.send({ t: 'chat', text });
  }

  /** Shows a window over the game; the mouse comes back when it closes. */
  private openOverlay(open: (done: () => void) => void): void {
    this.overlayOpen = true;
    this.input.unlock();
    open(() => {
      this.overlayOpen = false;
      this.resume();
    });
  }

  private overlayOpen = false;

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.callbacks.onPause(paused && !this.overlayOpen);
  }

  // --- Multiplayer ------------------------------------------------------

  private sendMove(dt: number): void {
    if (!this.room?.isOpen) return;
    this.moveTimer -= dt;
    if (this.moveTimer > 0) return;
    this.moveTimer = 1 / NET.moveSendRate;
    const round = (v: number) => Math.round(v * 100) / 100;
    const p: [number, number, number] = [
      round(this.player.x),
      round(this.player.y),
      round(this.player.z),
    ];
    const yaw = round(this.player.yaw);
    const pitch = round(this.player.pitch);
    const key = `${p.join()},${yaw},${pitch}`;
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.room.send({ t: 'move', p, yaw, pitch });
  }

  private onRoomStatus(status: RoomStatus): void {
    this.hud.setStatus(status);
    if (status === 'offline') {
      this.others.clear();
      for (const id of [...this.avatars.keys()]) if (id !== 'me') this.avatars.delete(id);
      this.updatePlayerList();
    }
  }

  private onServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.others.clear();
        for (const p of msg.players) {
          this.others.add(p);
          this.avatars.set(p.id, p.avatar);
        }
        this.updatePlayerList();
        this.lastSent = '';
        if (this.pending.length > 0) {
          this.sendEdits(this.pending);
          this.pending = [];
        }
        return;
      case 'edits':
        this.world.applyEdits(msg.edits);
        return;
      case 'join':
        this.others.add(msg.player);
        this.avatars.set(msg.player.id, msg.player.avatar);
        this.updatePlayerList();
        if (this.ready) {
          sounds.join();
          this.hud.toast(`${msg.player.avatar} tuli maailmaan!`);
        }
        return;
      case 'leave':
        this.others.remove(msg.id);
        this.avatars.delete(msg.id);
        this.updatePlayerList();
        return;
      case 'move':
        this.others.move(msg.id, msg.p, msg.yaw, msg.pitch);
        return;
      case 'set':
        this.world.applyEdits(msg.edits);
        return;
      case 'chat':
        this.hud.addChat(msg.avatar, msg.text);
        return;
      case 'full':
        this.hud.toast('⛔ Maailma on täynnä. Kokeile myöhemmin!');
        return;
    }
  }

  private updatePlayerList(): void {
    this.hud.setPlayers([...this.avatars.values()]);
  }
}
