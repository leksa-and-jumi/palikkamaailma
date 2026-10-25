// One play session in one world: moving, mining and building, survival,
// items, multiplayer, chat and the magic builder.

import {
  BUILDER,
  COMMANDS,
  DAY,
  FIREWORKS,
  MAP,
  MOBS,
  MONSTERS,
  NET,
  PISTONS,
  PLAYER,
  REDSTONE,
  SEA_LEVEL,
  SURVIVAL,
  TNT_RULES,
  VILLAGES,
  type Difficulty,
  type GameMode,
} from './config';
import { sounds } from './audio/sounds';
import { loadLocalEdits, loadPlayer, saveLocalEdits, savePlayer } from './data/storage';
import {
  AIR,
  BED,
  CHEST,
  CRAFTING_TABLE,
  DEFAULT_HOTBAR,
  FURNACE,
  LAVA,
  OBSIDIAN,
  TNT,
  TNT_LIT,
  WATER,
  getBlockType,
  isSolid,
} from './logic/blocks';
import { seedFromCode } from './logic/codes';
import { canPickUp, isExpired, liveDrop, stepDrop, type LiveDrop } from './logic/drops';
import { isContainerBlock, positionKey } from './logic/containers';
import { blastHit, explode } from './logic/explosion';
import { randomKind } from './logic/fireworks';
import { HOTBAR_SIZE, Inventory, stackLimit, type ItemStack } from './logic/inventory';
import { getItem, itemId } from './logic/items';
import { blockDrops, breakTime, wearsWhenMining } from './logic/mining';
import { createPlayer, overlapsBlock, stepPlayer, type PlayerState } from './logic/physics';
import { cleanChatText, type DroppedItem, type ServerMessage } from './logic/protocol';
import { raycast, type RayHit } from './logic/raycast';
import { nearSideOffset, planPlacement } from './logic/placement';
import { planPlace } from './logic/placing';
import {
  centerFootprint,
  expandShapes,
  facingFromYaw,
  placeBuild,
  type BuildBlock,
  type Vec3,
} from './logic/shapes';
import { Circuit, flipLever, isButton, pressButton, releaseButton } from './logic/redstone';
import { blockQuery, boxBounds, fallingWith, renderBoxes } from './logic/blockShapes';
import { findSpawn } from './logic/spawn';
import {
  addExhaustion,
  eat,
  fallDamage,
  freshVitals,
  hurt,
  isDead,
  loadVitals,
  tickVitals,
  type Vitals,
} from './logic/survival';
import { dayLabel, dayNumber, daylight, isNight, timeOfDay } from './logic/daytime';
import {
  COMMAND_LIST,
  animalName,
  commandHints,
  findPlayer,
  parseCommand,
  type Command,
  type RequestKind,
  type Someone,
} from './logic/commands';
import { BIOME_NAMES } from './logic/terrain';
import { VoxelWorld, chunkOf, editKey, isInsideWorld, type Edit } from './logic/world';
import { askBuilder } from './net/convex';
import { ContainerService } from './net/containers';
import { ROOM_URL, RoomClient, type RoomStatus } from './net/room';
import { OtherPlayers } from './render/avatars';
import { BuildGhost } from './render/buildGhost';
import { CrackOverlay, DropRenderer } from './render/dropRenderer';
import { Effects } from './render/effects';
import type { WorldRenderer } from './render/worldRenderer';
import type { Hud } from './ui/hud';
import { BuilderScreen, type BuildResult } from './ui/builderScreen';
import { Input } from './ui/input';
import type { ExtraPanel, InventoryScreen } from './ui/inventoryScreen';
import { ChestPanel, CraftingPanel, FurnacePanel, TradePanel } from './ui/panels';
import { greeting, thanks, tradesFor } from './logic/trades';
import { PROFESSION_NAMES } from './logic/villages';
import { MOB_TYPES, PERSONALITY_NAMES } from './logic/mobs';
import { HURT_REASONS, MobManager, villagerProfession } from './play/mobManager';
import { MobRenderer } from './render/mobRenderer';
import { MapScreen } from './ui/mapScreen';
import { MapTiles, drawMap, villagesIn, type MapMarker } from './ui/worldMap';

export interface GameOptions {
  code: string;
  emoji: string;
  avatar: string;
  /** Alone on this device: saved in the browser, no room server. */
  solo: boolean;
  mode: GameMode;
  difficulty: Difficulty;
}

/** Chunks around the spawn point that must be ready before playing. */
const SPAWN_READY_RADIUS = 2;
/** Start playing without the room server after this long (ms). */
const ROOM_WAIT_MS = 6000;
const SAVE_DELAY_MS = 1500;
const PLAYER_SAVE_INTERVAL = 5;
const MAX_PITCH = Math.PI / 2 - 0.01;
/** Holding the right mouse button places again this often (seconds). */
const PLACE_REPEAT = 0.25;
const DROP_THROW_SPEED = 5;
/** How far to look for villages for the pause menu hint (blocks). */
const VILLAGE_SEARCH = 1600;
const BREAK_DROP_SPEED = 2;
/** A slow frame may run at most this many redstone ticks. */
const MAX_REDSTONE_TICKS = 3;
/** The screen shake fades out in about this many seconds. */
const SHAKE_TIME = 0.5;

function isPosition(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
}

function parseKey(key: string): [number, number, number] {
  return key.split(',').map(Number) as [number, number, number];
}

/** A dice number from a block position (the same on every computer). */
function positionSeed(x: number, y: number, z: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
}

const REQUEST_ERRORS = {
  nobody: '🧍 Muita pelaajia ei ole nyt maailmassa.',
  who: '❓ Kenen luo? Kirjoita esimerkiksi /tpa kettu (tai /pelaajat)',
  many: '🦊🦊 Samoja eläimiä on monta. Kirjoita numero perään, esim. /tpa kettu 2',
  missing: '🔍 En löytänyt sitä pelaajaa. Kirjoita /pelaajat',
} as const;

/** Times of day that /aika and sleeping jump to (0 = sunrise). */
const MORNING = 0.02;
const NIGHT = 0.6;

/** How many ms until the time of day `target` comes (0…1). */
function skipTo(now: number, target: number): number {
  return Math.round(((((target - now) % 1) + 1) % 1) * DAY.length * 1000);
}

const BUILDER_ERRORS: Record<string, string> = {
  'too-many': '😅 Nyt on taiottu tosi paljon. Odota hetki ja kokeile uudestaan!',
  'no-world': '❓ Tätä maailmaa ei löytynyt.',
  'bad-request': '✏️ Kirjoita ensin, mitä rakennetaan.',
  failed: '🤔 En keksinyt tuota. Kokeile toisilla sanoilla tai valitse valmis!',
};

export class Game {
  readonly world: VoxelWorld;
  readonly inventory = new Inventory();
  private readonly player: PlayerState;
  private readonly others: OtherPlayers;
  private readonly input: Input;
  private readonly dropRenderer: DropRenderer;
  private readonly cracks: CrackOverlay;
  private room: RoomClient | null = null;
  private containers!: ContainerService;
  /** The chest or furnace window that is open (to show others' changes). */
  private openContainer: { key: string; panel: FurnacePanel | ChestPanel } | null = null;
  private myId = 'me';
  private readonly avatars = new Map<string, string>();
  private target: RayHit | null = null;
  private lastFrame = performance.now();
  private readonly startedAt = performance.now();
  private moveTimer = 0;
  private moveIdle = 0;
  /** Position and look last sent to the room: x, y, z, yaw, pitch. */
  private lastSentMove: [number, number, number, number, number] | null = null;
  private running = true;
  private ready = false;
  private paused = true;
  private dead = false;
  private overlayOpen = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private playerSaveTimer = 0;
  /** Edits made while the connection was down; sent when it comes back. */
  private pending: Edit[] = [];
  /** Blocks as they were before the last magic build, for undo. */
  private undo: Edit[] = [];
  private readonly builder: BuilderScreen;
  private readonly ghost: BuildGhost;
  /** A magic build that follows your aim until you place it. */
  private placing: {
    build: BuildBlock[];
    /** Extra quarter turns from R or the right mouse button. */
    turns: number;
    /** The facing the ghost was built for (it is rebuilt when this changes). */
    shownFacing: number | null;
    origin: Vec3 | null;
    facing: 0 | 1 | 2 | 3;
  } | null = null;

  mode: GameMode;
  vitals: Vitals;
  /** Experience points (from defeating creatures; enchanting uses them). */
  xp = 0;
  readonly mobs: MobManager;
  private readonly mobRenderer: MobRenderer;
  /** The creature under the crosshair (closer than any block), if any. */
  private targetMob: { id: string; distance: number } | null = null;
  private attackCooldown = 0;
  private mobSyncTimer = 0;
  /** Moves the clock (ms), for testing day and night. */
  timeShift = 0;
  /** Nights slept and /aika (ms), the same for everyone in the room. */
  private timeOffset = 0;
  /** Your home (/asetakoti), or null. */
  private home: [number, number, number] | null = null;
  /** A /tpa or /kutsu from someone, waiting for yes or no. */
  private request: { from: string; avatar: string; kind: RequestKind; until: number } | null = null;
  /** Players we asked, so only their answers can move us. */
  private readonly asked = new Map<string, RequestKind>();
  /** Lying in a bed. */
  private sleeping = false;
  private readonly spawn: [number, number, number];
  /** Where you wake up after dying (your bed), or null for the world's start. */
  private bedSpawn: [number, number, number] | null = null;
  private readonly drops = new Map<string, LiveDrop>();
  private readonly pickupsAsked = new Set<string>();
  private mining: { x: number; y: number; z: number; progress: number } | null = null;
  private breakCooldown = 0;
  private placeCooldown = 0;
  private fallStart: number | null = null;
  private lastX = 0;
  private lastZ = 0;

  private readonly circuit = new Circuit();
  private readonly mapTiles: MapTiles;
  private readonly mapScreen = new MapScreen();
  private mapTimer = 0;
  private minimapOn = true;
  private readonly effects: Effects;
  private redstoneTimer = 0;
  /** Lit TNT and seconds until it goes off, by "x,y,z". */
  private readonly fuses = new Map<string, number>();
  /** Pressed buttons and seconds until they pop back up. */
  private readonly buttons = new Map<string, number>();
  /** True while this computer is breaking blocks for its own explosion. */
  private exploding = false;
  private fireworkCooldown = 0;
  /** When piston moves were sent (ms), to stay under PISTONS.maxSendsPerSecond. */
  private pistonSends: number[] = [];
  private shake = 0;

  constructor(
    private readonly options: GameOptions,
    private readonly renderer: WorldRenderer,
    private readonly hud: Hud,
    private readonly inventoryScreen: InventoryScreen,
    private readonly callbacks: { onReady(): void; onPause(paused: boolean): void },
  ) {
    this.world = new VoxelWorld(seedFromCode(options.code));
    this.world.onChange = (x, y, z, old, id) => this.onBlockChange(x, y, z, old, id);
    this.mapTiles = new MapTiles(this.world);
    renderer.setWorld(this.world);
    this.effects = new Effects(renderer.scene);
    this.effects.onBurst = (x, y, z) => sounds.pop(this.distanceTo(x, y, z));
    this.effects.viewer = () => [this.player.x, this.player.z];
    this.others = new OtherPlayers(renderer.scene);
    this.dropRenderer = new DropRenderer(renderer.scene);
    this.cracks = new CrackOverlay(renderer.scene);
    this.ghost = new BuildGhost(renderer.scene);
    this.builder = new BuilderScreen({
      ask: (prompt) => this.askBuild(prompt),
      place: (blocks) => this.startPlacing(blocks),
      toast: (text) => hud.toast(text),
    });

    this.spawn = findSpawn(this.world);
    const saved = loadPlayer(options.code);
    const start =
      saved.position &&
      isInsideWorld(...(saved.position.map(Math.floor) as [number, number, number]))
        ? saved.position
        : this.spawn;
    this.player = createPlayer(...start);
    this.player.yaw = typeof saved.yaw === 'number' ? saved.yaw : 0;
    this.lastX = this.player.x;
    this.lastZ = this.player.z;
    this.mode = saved.mode === 'creative' || saved.mode === 'survival' ? saved.mode : options.mode;
    this.vitals = loadVitals(saved.vitals);
    this.xp = typeof saved.xp === 'number' && saved.xp >= 0 ? Math.floor(saved.xp) : 0;
    this.bedSpawn = isPosition(saved.bed) ? saved.bed : null;
    this.home = isPosition(saved.home) ? saved.home : null;
    if (options.solo && typeof saved.timeOffset === 'number' && saved.timeOffset >= 0) {
      this.timeOffset = saved.timeOffset;
    }
    this.mobRenderer = new MobRenderer(renderer.scene);
    this.mobs = new MobManager({
      drop: (stack, p) => this.spawnDrop(stack, p, true),
      xp: (amount) => {
        this.xp += amount;
        this.hud.toast(`✨ +${amount} kokemusta`);
      },
      sendHit: (id, damage, from) => this.room?.send({ t: 'hitMob', id, damage, from }),
      toast: (text) => this.hud.toast(text),
      hurtPlayer: (id, damage, kind) => {
        if (id === this.myId) this.takeDamage(damage, HURT_REASONS[kind] ?? 'Hirviö osui.');
        else this.room?.send({ t: 'hurtPlayer', id, damage, kind });
      },
      blast: (x, y, z, breakBlocks) => this.blast(x, y, z, breakBlocks),
    });
    if (saved.inventory) this.inventory.load(saved.inventory);
    else if (this.mode === 'creative') this.giveCreativeKit();
    hud.setInventory(this.inventory);

    this.input = new Input(renderer.renderer.domElement, {
      onBreak: () => this.onBreakPressed(),
      onPlace: () => this.useItem(false),
      onPick: () => this.pickBlock(),
      onSlot: (i) => hud.select(i),
      onScroll: (d) => hud.select(hud.selected + d),
      onToggleFly: () => {
        if (this.mode !== 'creative') return;
        this.player.flying = !this.player.flying;
        this.player.vy = 0;
      },
      onKey: (code, e) => this.onKey(code, e),
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
    this.containers = new ContainerService(this.room, options.code);
    this.containers.onUpdate = (p, data) => {
      const open = this.openContainer;
      if (!open || open.key !== positionKey(p) || open.panel.state.kind !== data.kind) return;
      open.panel.state = data as never;
      this.inventoryScreen.refresh();
    };
    requestAnimationFrame(() => this.frame());
  }

  /** Locks the mouse and starts playing (needs a click from the player). */
  resume(): void {
    if (this.dead) return;
    this.input.enabled = true;
    this.input.lock();
  }

  stop(): void {
    this.running = false;
    this.input.enabled = false;
    this.input.unlock();
    this.room?.close();
    this.builder.stop();
    this.cancelPlacing();
    this.ghost.clear();
    this.flushSave();
    this.savePlayerNow();
    this.others.clear();
    this.dropRenderer.clear();
    this.effects.clear();
    this.world.onChange = null;
    this.hud.show(false);
  }

  /** Time of day, the same for everyone in this world. */
  get time(): number {
    return timeOfDay(this.clock, this.world.seed);
  }

  /** The world's clock (ms): the real clock plus nights slept and /aika. */
  get clock(): number {
    return Date.now() + this.timeShift + this.timeOffset;
  }

  /** Switches between creative and survival (from the pause menu). */
  toggleMode(): GameMode {
    this.mode = this.mode === 'creative' ? 'survival' : 'creative';
    if (this.mode === 'survival') {
      this.player.flying = false;
      this.fallStart = null;
    }
    this.hud.toast(this.mode === 'creative' ? '🛠️ Nikkaroija-tila' : '⚔️ Selviytyjä-tila');
    this.savePlayerNow();
    return this.mode;
  }

  private giveCreativeKit(): void {
    for (const id of DEFAULT_HOTBAR) this.inventory.add({ id, count: stackLimit(id) });
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
      // Don't wait for the room server forever: play now, changes are sent when it answers.
      const waited = performance.now() - this.startedAt > ROOM_WAIT_MS;
      const waiting = (this.room?.waitingForWelcome ?? false) && !waited;
      if (
        !waiting &&
        this.renderer.pendingChunks(this.player.x, this.player.z, SPAWN_READY_RADIUS) === 0
      ) {
        this.ready = true;
        this.input.enabled = true;
        this.callbacks.onReady();
      }
    }

    if (this.ready && !this.paused && !this.dead) {
      this.movePlayer(dt);
      this.updateActions(dt);
      if (this.mode === 'survival') this.updateSurvival(dt);
      this.hud.setFlying(this.player.flying);
      const biome = this.world.terrain.biomeAt(
        Math.floor(this.player.x),
        Math.floor(this.player.z),
      );
      this.hud.setBiome(`${BIOME_NAMES[biome]} · ${dayLabel(this.time)}`);
      this.sendMove(dt);
      this.playerSaveTimer += dt;
      if (this.playerSaveTimer >= PLAYER_SAVE_INTERVAL) {
        this.playerSaveTimer = 0;
        this.savePlayerNow();
      }
    }
    this.hud.setVitals(
      this.mode === 'survival' ? this.vitals : null,
      this.inventory.armorPoints(),
      this.headInWater(),
    );

    this.renderer.time = this.time;
    this.renderer.clock = this.clock;
    this.renderer.day = dayNumber(this.renderer.clock, this.world.seed);
    this.updateDrops(dt);
    if (this.ready) this.updateRedstone(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateTarget();
    this.others.update(dt);
    if (this.ready && !this.dead) this.updateMobs(dt);
    if (this.ready) this.updateMaps(dt);
    if (this.request && performance.now() > this.request.until) {
      this.request = null;
      this.hud.showRequest(null);
    }
    this.renderer.render();
  }

  private movePlayer(dt: number): void {
    const [yaw, pitch] = this.input.takeLook();
    this.player.yaw += yaw;
    this.player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.player.pitch + pitch));
    const shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const wasOnGround = this.player.onGround;
    stepPlayer(
      blockQuery((x, y, z) => this.world.solidLook(x, y, z)),
      this.player,
      {
        forward: this.input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
        right: this.input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
        jump: this.input.isDown('Space'),
        down: shift && this.player.flying,
        sprint: shift && !this.player.flying && this.canSprint(),
        sneak: shift,
      },
      dt,
    );
    if (this.mode === 'survival') {
      const moved = Math.hypot(this.player.x - this.lastX, this.player.z - this.lastZ);
      if (shift && !this.player.inWater) {
        addExhaustion(this.vitals, moved * SURVIVAL.exhaustion.sprintPerBlock);
      }
      if (wasOnGround && this.player.vy > 0) addExhaustion(this.vitals, SURVIVAL.exhaustion.jump);
    }
    this.lastX = this.player.x;
    this.lastZ = this.player.z;
  }

  /** In survival you need food to sprint (like Minecraft). */
  private canSprint(): boolean {
    return this.mode === 'creative' || this.vitals.hunger > 6;
  }

  private updateCamera(dt: number): void {
    const cam = this.renderer.camera;
    cam.position.set(this.player.x, this.player.y + PLAYER.eyeHeight, this.player.z);
    if (this.shake > 0) {
      // A big bang nearby shakes the screen.
      const amount = this.shake * TNT_RULES.shake;
      cam.position.x += (Math.random() - 0.5) * amount;
      cam.position.y += (Math.random() - 0.5) * amount;
      cam.position.z += (Math.random() - 0.5) * amount;
      this.shake = Math.max(0, this.shake - dt / SHAKE_TIME);
    }
    cam.rotation.set(this.player.pitch, this.player.yaw, 0);
    this.renderer.setUnderwater(this.headInWater());
  }

  private headInWater(): boolean {
    const eye = this.world.getBlock(
      Math.floor(this.player.x),
      Math.floor(this.player.y + PLAYER.eyeHeight),
      Math.floor(this.player.z),
    );
    return getBlockType(eye).liquid;
  }

  private lookDirection(): [number, number, number] {
    const { yaw, pitch } = this.player;
    return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  }

  private cast(hitLiquids: boolean): RayHit | null {
    const [dx, dy, dz] = this.lookDirection();
    return raycast(
      this.player.x,
      this.player.y + PLAYER.eyeHeight,
      this.player.z,
      dx,
      dy,
      dz,
      PLAYER.reach,
      (x, y, z) => {
        const b = getBlockType(this.world.getBlock(x, y, z));
        return b.id !== AIR && (hitLiquids || !b.liquid);
      },
    );
  }

  private updateTarget(): void {
    if (this.placing) {
      this.target = null;
      this.renderer.hideHighlight();
      this.cracks.show(0, 0, 0, null);
      this.updatePlacing();
      return;
    }
    this.target = this.cast(false);
    const t = this.target;
    if (t) {
      const look = (x: number, y: number, z: number) => this.world.solidLook(x, y, z);
      const boxes = renderBoxes(look(t.x, t.y, t.z), (dx, dz) => look(t.x + dx, t.y, t.z + dz));
      this.renderer.showHighlight(t.x, t.y, t.z, boxes ? boxBounds(boxes) : null);
    } else this.renderer.hideHighlight();
    const m = this.mining;
    this.cracks.show(m?.x ?? 0, m?.y ?? 0, m?.z ?? 0, m ? m.progress : null);
  }

  // --- Maps ---------------------------------------------------------------

  private updateMaps(dt: number): void {
    const { x, z } = this.player;
    const big = this.mapScreen.isOpen;
    const radius = big ? this.mapScreen.radius : MAP.miniRadius;
    this.mapTiles.update(x, z, radius, big ? MAP.bigBudgetMs : MAP.budgetMs);
    this.mapTimer -= dt;
    if (this.mapTimer > 0) return;
    this.mapTimer = MAP.redraw;
    const mini = document.getElementById('minimap') as HTMLCanvasElement | null;
    if (mini) {
      mini.hidden = !this.minimapOn;
      if (this.minimapOn) drawMap(mini, this.mapTiles, x, z, 1, this.mapMarkers(MAP.miniRadius));
    }
    if (big) this.mapScreen.draw(this.mapTiles, x, z, this.mapMarkers(radius));
  }

  /** You, your friends, villages, your bed and the start, for the maps. */
  private mapMarkers(radius: number): MapMarker[] {
    const markers: MapMarker[] = [];
    for (const v of villagesIn(this.world, this.player.x, this.player.z, radius)) {
      markers.push({ x: v.x, z: v.z, icon: '🏘️', label: 'Kylä' });
    }
    markers.push({ x: this.spawn[0], z: this.spawn[2], icon: '⭐', label: 'Alku' });
    if (this.bedSpawn) markers.push({ x: this.bedSpawn[0], z: this.bedSpawn[2], icon: '🛏️' });
    for (const p of this.others.positions()) {
      markers.push({ x: p.x, z: p.z, icon: this.avatars.get(p.id) ?? '🙂' });
    }
    markers.push({ x: this.player.x, z: this.player.z, icon: 'me', yaw: this.player.yaw });
    return markers;
  }

  // --- Mining and building ----------------------------------------------

  private selectedStack(): ItemStack | null {
    return this.inventory.slots[this.hud.selected] ?? null;
  }

  private onBreakPressed(): void {
    if (this.placing) {
      this.finishPlacing();
      this.breakCooldown = SURVIVAL.creativeBreakDelay;
      return;
    }
    if (this.targetMob) {
      this.attack(this.targetMob.id);
      return;
    }
    if (this.mode === 'creative') {
      this.breakTarget();
      this.breakCooldown = SURVIVAL.creativeBreakDelay;
    }
  }

  /** Called every frame: holding the mouse mines (survival) or repeats (creative). */
  private updateActions(dt: number): void {
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    this.fireworkCooldown -= dt;
    if (this.placing) {
      this.mining = null;
      return;
    }
    if (this.input.isMouseDown(2) && this.placeCooldown <= 0) this.useItem(true);

    const t = this.target;
    if (!this.input.isMouseDown(0) || !t || this.targetMob) {
      this.mining = null;
      return;
    }
    if (this.mode === 'creative') {
      if (this.breakCooldown <= 0) {
        this.breakTarget();
        this.breakCooldown = SURVIVAL.creativeBreakDelay;
      }
      return;
    }
    if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z) {
      this.mining = { x: t.x, y: t.y, z: t.z, progress: 0 };
    }
    const block = this.world.getBlock(t.x, t.y, t.z);
    const stack = this.selectedStack();
    const tool = stack ? getItem(stack.id) : undefined;
    const time = breakTime(block, tool, stack?.enchants?.efficiency ?? 0);
    this.mining.progress += time === 0 ? 1 : dt / time;
    if (this.mining.progress >= 1) {
      this.breakTarget();
      this.mining = null;
    }
  }

  private breakTarget(): void {
    const t = this.target;
    if (!t) return;
    const block = this.world.getBlock(t.x, t.y, t.z);
    // Lit TNT can't be stopped any more!
    if (!getBlockType(block).breakable || block === TNT_LIT) return;
    // Torches, doors and things standing on it fall off too.
    const fallen = fallingWith((x, y, z) => this.world.getBlock(x, y, z), [[t.x, t.y, t.z]]).map(
      ([x, y, z]): Edit => [x, y, z, this.world.getBlock(x, y, z)],
    );
    this.change([[t.x, t.y, t.z, AIR], ...fallen.map(([x, y, z]): Edit => [x, y, z, AIR])]);
    sounds.break();
    // Alone, the chest's items fall out here (the room server does it in multiplayer).
    if (!this.room && isContainerBlock(block)) {
      for (const item of this.containers.removeLocal([t.x, t.y, t.z])) {
        this.spawnDrop(item, [t.x + 0.5, t.y + 0.5, t.z + 0.5], true);
      }
    }
    if (this.mode !== 'survival') return;
    const held = this.selectedStack();
    for (const [x, y, z, id] of fallen) {
      for (const drop of blockDrops(id, held ? getItem(held.id) : undefined)) {
        this.spawnDrop({ id: drop.id, count: drop.count }, [x + 0.5, y + 0.5, z + 0.5], true);
      }
    }

    const stack = this.selectedStack();
    const tool = stack ? getItem(stack.id) : undefined;
    const drops = blockDrops(
      block,
      tool,
      Math.random,
      stack?.enchants?.fortune ?? 0,
      !!stack?.enchants?.silk_touch,
    );
    for (const drop of drops) {
      this.spawnDrop({ id: drop.id, count: drop.count }, [t.x + 0.5, t.y + 0.5, t.z + 0.5], true);
    }
    addExhaustion(this.vitals, SURVIVAL.exhaustion.mine);
    if (stack && wearsWhenMining(tool) && breakTime(block, tool) > 0) {
      this.wearSelected();
    }
  }

  /** Tools wear out; Unbreaking makes them last longer. */
  private wearSelected(): void {
    const stack = this.selectedStack();
    const unbreaking = stack?.enchants?.unbreaking ?? 0;
    if (unbreaking > 0 && Math.random() > 1 / (unbreaking + 1)) return;
    if (this.inventory.wear('slots', this.hud.selected)) {
      sounds.break();
      this.hud.toast('💥 Työkalu meni rikki!');
    }
  }

  /**
   * Right click: open a table/furnace/chest, flip a lever, press a button,
   * light TNT, launch a rocket, eat, use a bucket or place a block.
   * `repeat` = the button is held down.
   */
  private useItem(repeat: boolean): void {
    this.placeCooldown = PLACE_REPEAT;
    if (this.placing) {
      this.turnPlacing();
      return;
    }
    const sneaking = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const stack = this.selectedStack();
    const item = stack ? getItem(stack.id) : undefined;
    // Feeding an animal its favourite food.
    if (this.targetMob && item && this.mobs.feed(this.targetMob.id, item.key)) {
      if (this.mode === 'survival') this.inventory.takeOne(this.hud.selected);
      return;
    }
    if (this.targetMob && this.mobs.kindOf(this.targetMob.id) === 'villager') {
      this.talkTo(this.targetMob.id);
      return;
    }
    if (this.target && !sneaking && this.interact(this.target)) return;

    const t0 = this.target;
    if (t0 && !repeat && !sneaking) {
      const id = this.world.getBlock(t0.x, t0.y, t0.z);
      const flipped = flipLever(id);
      if (flipped !== null) {
        this.change([[t0.x, t0.y, t0.z, flipped]]);
        sounds.click();
        return;
      }
      if (isButton(id)) {
        const pushed = pressButton(id);
        if (pushed !== null) this.change([[t0.x, t0.y, t0.z, pushed]]);
        sounds.click();
        return;
      }
      const type = getBlockType(id);
      if (type.toggle !== null) {
        this.toggleBlock(t0.x, t0.y, t0.z);
        return;
      }
      if (type.item === BED) {
        this.useBed(t0.x, t0.y, t0.z);
        return;
      }
      if (id === TNT && item?.special === 'flint_and_steel') {
        this.change([[t0.x, t0.y, t0.z, TNT_LIT]]);
        if (this.mode === 'survival') this.wearSelected();
        return;
      }
    }
    if (item?.special === 'firework') {
      this.launchFromHand(item.firework ?? 0);
      return;
    }

    if (item?.food && this.mode === 'survival') {
      if (eat(this.vitals, item.food.hunger, item.food.saturation)) {
        this.inventory.takeOne(this.hud.selected);
        sounds.place();
      }
      return;
    }
    if (item?.special === 'bucket') {
      this.fillBucket();
      return;
    }
    if (item?.special === 'water_bucket' || item?.special === 'lava_bucket') {
      this.emptyBucket(item.special === 'water_bucket' ? WATER : LAVA);
      return;
    }
    if (item?.block === undefined) return;

    const t = this.target;
    if (!t) return;
    const edits = planPlace(item.block, {
      hit: t,
      look: facingFromYaw(this.player.yaw),
      pitch: this.player.pitch,
      getBlock: (x, y, z) => this.world.solidLook(x, y, z),
    });
    if (!edits) return;
    // Don't put a solid block inside yourself.
    if (edits.some(([x, y, z, id]) => isSolid(id) && overlapsBlock(this.player, x, y, z))) return;
    if (this.change(edits).length === 0) return;
    if (this.mode === 'survival') this.inventory.takeOne(this.hud.selected);
    sounds.place();
  }

  /** Opens or closes a door, trapdoor or gate (both halves of a door). */
  private toggleBlock(x: number, y: number, z: number): void {
    const type = getBlockType(this.world.getBlock(x, y, z));
    if (type.toggle === null) return;
    const edits: Edit[] = [[x, y, z, type.toggle]];
    if (type.partner) {
      const [px, py, pz] = [x + type.partner[0], y + type.partner[1], z + type.partner[2]];
      const other = getBlockType(this.world.getBlock(px, py, pz)).toggle;
      if (other !== null) edits.push([px, py, pz, other]);
    }
    this.change(edits);
    sounds.door(getBlockType(type.toggle).powered === null);
  }

  /** A bed: you wake up here next time. */
  private useBed(x: number, y: number, z: number): void {
    const type = getBlockType(this.world.getBlock(x, y, z));
    // The foot is where you lie down.
    const foot =
      type.partner && type.noDrop ? [x + type.partner[0], y, z + type.partner[2]] : [x, y, z];
    this.bedSpawn = [foot[0]! + 0.5, foot[1]! + 0.6, foot[2]! + 0.5];
    this.savePlayerNow();
    if (isNight(this.time)) this.sleepIn(...this.bedSpawn);
    else this.hud.toast('🛏️ Herätyspaikka tallennettu! Heräät tästä sängystä. Nukkua voi yöllä.');
  }

  // --- Creatures --------------------------------------------------------

  private updateMobs(dt: number): void {
    const stack = this.selectedStack();
    const others = this.others.positions();
    this.mobs.update({
      world: this.world,
      me: {
        id: this.myId,
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        holding: stack ? getItem(stack.id)?.key : undefined,
        safe: this.mode === 'creative',
      },
      others,
      dt,
      difficulty: this.options.difficulty,
      day: daylight(this.time) > 0.5,
    });
    this.mobRenderer.syncArrows(this.mobs.arrows);
    this.attackCooldown -= dt;
    const [dx, dy, dz] = this.lookDirection();
    const eye: [number, number, number] = [
      this.player.x,
      this.player.y + PLAYER.eyeHeight,
      this.player.z,
    ];
    const mob = this.mobs.pick(eye, [dx, dy, dz], MOBS.attackReach);
    // A block in front of the creature wins.
    this.targetMob = mob && (!this.target || mob.distance < this.target.distance) ? mob : null;
    this.mobRenderer.highlighted = this.targetMob?.id ?? null;
    this.mobRenderer.sync(this.mobs.views(), dt);
  }

  /**
   * A creeper exploded: smoke and a bang for everyone near. On hard it breaks
   * blocks like TNT does (and sets off TNT nearby).
   */
  private blast(x: number, y: number, z: number, breakBlocks: boolean): void {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    this.effects.explosion(x, y, z);
    sounds.boom(Math.hypot(x - this.player.x, y - this.player.y - 0.9, z - this.player.z));
    if (!breakBlocks) return;
    const blast = explode(
      (ex, ey, ez) => this.world.getBlock(ex, ey, ez),
      bx,
      by,
      bz,
      MONSTERS.blastPower,
    );
    for (const [lx, ly, lz] of blast.lit)
      this.fuses.set(editKey(lx, ly, lz), TNT_RULES.chainFuseMin);
    this.exploding = true;
    this.change(blast.edits);
    this.exploding = false;
  }

  /** "Lähin kylä: 290 palikkaa koilliseen" for the pause menu, or ''. */
  villageHint(): string {
    const { x, z } = this.player;
    let best: { d: number; dx: number; dz: number } | null = null;
    for (let gx = -VILLAGE_SEARCH; gx <= VILLAGE_SEARCH; gx += VILLAGES.regionSize / 2) {
      for (let gz = -VILLAGE_SEARCH; gz <= VILLAGE_SEARCH; gz += VILLAGES.regionSize / 2) {
        for (const v of this.world.terrain.villagesAround(x + gx, z + gz)) {
          const d = Math.hypot(v.x - x, v.z - z);
          if (!best || d < best.d) best = { d, dx: v.x - x, dz: v.z - z };
        }
      }
    }
    if (!best) return '';
    if (best.d < VILLAGES.radius) return '🏘️ Olet kylässä!';
    // North is -z. Eight directions, starting from north going clockwise.
    const names = [
      'pohjoiseen',
      'koilliseen',
      'itään',
      'kaakkoon',
      'etelään',
      'lounaaseen',
      'länteen',
      'luoteeseen',
    ];
    const angle = Math.atan2(best.dx, -best.dz);
    const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    return `🏘️ Lähin kylä: ${Math.round(best.d)} palikkaa ${names[index]}`;
  }

  /** Opens a villager's shop: they say hello and show their trades. */
  private talkTo(id: string): void {
    const v = [...this.mobs.views()].find((m) => m.id === id);
    if (!v) return;
    const profession = villagerProfession(id);
    const title = `${MOB_TYPES.villager.emoji} ${v.name} · ${PERSONALITY_NAMES[v.personality]} ${PROFESSION_NAMES[profession]}`;
    const night = daylight(this.time) < 0.5;
    const panel = new TradePanel(
      title,
      greeting(v.personality, profession, night),
      tradesFor(profession, v.personality),
      () => {
        sounds.place();
        return thanks(v.personality);
      },
    );
    this.openScreen(panel, '🏘️ Kauppa');
  }

  /** Hits the creature with what you hold (swords hit hardest). */
  private attack(id: string): void {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = MOBS.attackCooldown;
    const stack = this.selectedStack();
    const item = stack ? getItem(stack.id) : undefined;
    const sharpness = stack?.enchants?.sharpness ?? 0;
    const damage =
      (item?.tool?.damage ?? MOBS.fistDamage) + (sharpness > 0 ? 0.5 * sharpness + 0.5 : 0);
    if (!this.mobs.hit(id, damage, [this.player.x, this.player.z])) return;
    sounds.break();
    if (this.mode === 'survival') {
      addExhaustion(this.vitals, SURVIVAL.exhaustion.attack);
      if (item?.tool) this.wearSelected();
    }
  }

  /** Opens the block you right-clicked, if it opens. Returns true if it did. */
  private interact(t: RayHit): boolean {
    const block = this.world.getBlock(t.x, t.y, t.z);
    if (block === CRAFTING_TABLE) {
      this.openScreen(new CraftingPanel(3), '🪚 Työpöytä');
      return true;
    }
    if (block !== FURNACE && block !== CHEST) return false;
    const p: [number, number, number] = [t.x, t.y, t.z];
    this.input.unlock();
    this.overlayOpen = true;
    void this.containers.open(p, block).then((data) => {
      if (!data) {
        this.overlayOpen = false;
        this.hud.toast('📡 En saanut tätä auki. Kokeile uudestaan!');
        this.resume();
        return;
      }
      const save = (state: typeof data) => this.containers.save(p, state);
      const panel =
        data.kind === 'furnace' ? new FurnacePanel(data, save) : new ChestPanel(data, save);
      this.openContainer = { key: positionKey(p), panel };
      this.openScreen(panel, data.kind === 'furnace' ? '🔥 Uuni' : '📦 Arkku', () => {
        this.openContainer = null;
      });
    });
    return true;
  }

  /** Shows the inventory screen with a crafting grid, furnace or chest. */
  private openScreen(extra: ExtraPanel | null, title?: string, onClosed?: () => void): void {
    this.openOverlay((done) =>
      this.inventoryScreen.open(
        this.inventory,
        (s) => this.dropStack(s),
        this.mode,
        () => {
          onClosed?.();
          done();
        },
        extra,
        title,
      ),
    );
  }

  private fillBucket(): void {
    const t = this.cast(true);
    if (!t) return;
    const block = this.world.getBlock(t.x, t.y, t.z);
    if (block !== WATER && block !== LAVA) return;
    this.change([[t.x, t.y, t.z, AIR]]);
    if (this.mode === 'survival') {
      this.inventory.slots[this.hud.selected] = {
        id: itemId(block === WATER ? 'water_bucket' : 'lava_bucket'),
        count: 1,
      };
      this.inventory.onChange();
    }
    sounds.place();
  }

  /** Pours water or lava. Water and lava together make obsidian! */
  private emptyBucket(liquid: number): void {
    const t = this.target;
    if (!t) return;
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    if (this.world.getBlock(x, y, z) !== AIR) return;
    const other = liquid === WATER ? LAVA : WATER;
    const edits: Edit[] = [[x, y, z, liquid]];
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      if (this.world.getBlock(x + dx, y + dy, z + dz) !== other) continue;
      // The lava block turns into obsidian.
      if (liquid === LAVA) edits[0] = [x, y, z, OBSIDIAN];
      else edits.push([x + dx, y + dy, z + dz, OBSIDIAN]);
    }
    this.change(edits);
    if (this.mode === 'survival') {
      this.inventory.slots[this.hud.selected] = { id: itemId('bucket'), count: 1 };
      this.inventory.onChange();
    }
    sounds.place();
  }

  private pickBlock(): void {
    const t = this.target;
    if (!t) return;
    const id = getBlockType(this.world.getBlock(t.x, t.y, t.z)).item;
    const hotbar = this.inventory.slots.slice(0, HOTBAR_SIZE);
    const found = hotbar.findIndex((s) => s?.id === id);
    if (found >= 0) {
      this.hud.select(found);
    } else if (this.mode === 'creative' && getBlockType(id).placeable) {
      this.inventory.slots[this.hud.selected] = { id, count: stackLimit(id) };
      this.inventory.onChange();
      this.hud.select(this.hud.selected);
    }
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

  private savePlayerNow(): void {
    savePlayer(this.options.code, {
      inventory: this.inventory.toJSON(),
      vitals: this.vitals,
      position: [this.player.x, this.player.y, this.player.z],
      yaw: this.player.yaw,
      mode: this.mode,
      xp: this.xp,
      bed: this.bedSpawn ?? undefined,
      home: this.home ?? undefined,
      timeOffset: this.room ? undefined : this.timeOffset,
    });
  }

  // --- Survival -----------------------------------------------------------

  private updateSurvival(dt: number): void {
    const p = this.player;
    const feet = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const body = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    const inLava = feet === LAVA || body === LAVA;

    // Falling: remember the highest point; landing hurts after 3 blocks.
    if (p.inWater || p.flying || p.onLadder) {
      this.fallStart = null;
    } else if (!p.onGround) {
      this.fallStart = Math.max(this.fallStart ?? p.y, p.y);
    } else if (this.fallStart !== null) {
      const featherFalling = this.inventory.armor[3]?.enchants?.feather_falling ?? 0;
      const damage = fallDamage(this.fallStart - p.y) * Math.max(0, 1 - featherFalling * 0.12);
      this.fallStart = null;
      if (damage > 0) this.takeDamage(damage, 'Putosit liian korkealta.');
    }

    const damage = tickVitals(this.vitals, {
      dt,
      difficulty: this.options.difficulty,
      underwater: this.headInWater(),
      inLava,
      armorPoints: this.inventory.armorPoints(),
    });
    if (damage > 0)
      this.afterDamage(inLava ? 'Laava oli liian kuumaa.' : 'Happi tai ruoka loppui.');
  }

  /** Hurts the player (monsters will use this too). */
  takeDamage(amount: number, reason: string): void {
    if (this.mode !== 'survival' || this.dead) return;
    if (hurt(this.vitals, amount, this.inventory.armorPoints()) > 0) this.afterDamage(reason);
  }

  private afterDamage(reason: string): void {
    this.hud.flashHurt();
    sounds.break();
    // Armor wears a little with every hit.
    for (let i = 0; i < this.inventory.armor.length; i++) {
      if (this.inventory.armor[i]) this.inventory.wear('armor', i);
    }
    if (isDead(this.vitals)) this.die(reason);
  }

  private die(reason: string): void {
    this.dead = true;
    this.mining = null;
    this.input.unlock();
    if (!SURVIVAL.keepInventory) {
      for (const stack of [...this.inventory.slots, ...this.inventory.armor]) {
        if (stack) this.spawnDrop(stack, [this.player.x, this.player.y + 1, this.player.z], true);
      }
      this.inventory.clear();
    }
    this.hud.showDeath(reason, () => this.respawn());
  }

  private respawn(): void {
    this.dead = false;
    this.vitals = freshVitals();
    [this.player.x, this.player.y, this.player.z] = this.respawnPoint();
    this.player.vx = this.player.vy = this.player.vz = 0;
    this.fallStart = null;
    this.savePlayerNow();
    this.resume();
  }

  /** Your bed if it is still there, otherwise the world's start. */
  private respawnPoint(): [number, number, number] {
    const bed = this.bedSpawn;
    if (bed) {
      const id = this.world.getBlock(Math.floor(bed[0]), Math.floor(bed[1]), Math.floor(bed[2]));
      if (getBlockType(id).item === BED) return bed;
      this.bedSpawn = null;
      this.hud.toast('🛏️ Sänkysi oli kadonnut.');
    }
    return this.spawn;
  }

  // --- Items on the ground ------------------------------------------------

  /** Drops a stack into the world (shared with everyone in the room). */
  private spawnDrop(item: ItemStack, p: [number, number, number], fromBlock: boolean): void {
    const [dx, , dz] = this.lookDirection();
    const v: [number, number, number] = fromBlock
      ? [(Math.random() - 0.5) * BREAK_DROP_SPEED, 3, (Math.random() - 0.5) * BREAK_DROP_SPEED]
      : [dx * DROP_THROW_SPEED, 3, dz * DROP_THROW_SPEED];
    if (this.room?.isOpen) {
      this.room.send({ t: 'drop', item, p, v });
      return;
    }
    const drop: DroppedItem = { id: crypto.randomUUID(), item, p, v, time: Date.now() };
    this.drops.set(drop.id, liveDrop(drop));
  }

  /** Q drops one item (Ctrl+Q the whole stack) from the hand. */
  private dropSelected(all: boolean): void {
    const stack = this.selectedStack();
    if (!stack) return;
    const count = all ? stack.count : 1;
    const thrown = { ...stack, count };
    if (all) this.inventory.slots[this.hud.selected] = null;
    else this.inventory.takeOne(this.hud.selected);
    this.inventory.onChange();
    const p: [number, number, number] = [
      this.player.x,
      this.player.y + PLAYER.eyeHeight - 0.3,
      this.player.z,
    ];
    this.spawnDrop(thrown, p, false);
  }

  /** Drops something from the inventory screen (it didn't fit). */
  dropStack(stack: ItemStack): void {
    this.spawnDrop(stack, [this.player.x, this.player.y + 1, this.player.z], false);
  }

  private updateDrops(dt: number): void {
    const solid = (x: number, y: number, z: number) => isSolid(this.world.getBlock(x, y, z));
    const now = Date.now();
    for (const d of this.drops.values()) {
      if (isExpired(d, now)) {
        this.drops.delete(d.id);
        continue;
      }
      stepDrop(d, dt, solid);
      if (this.dead || !canPickUp(d, this.player.x, this.player.y, this.player.z)) continue;
      if (!this.inventory.hasRoomFor(d.item)) continue;
      if (this.room) {
        if (!this.pickupsAsked.has(d.id)) {
          this.pickupsAsked.add(d.id);
          this.room.send({ t: 'pickup', id: d.id });
        }
      } else {
        this.drops.delete(d.id);
        this.collect(d.item);
      }
    }
    this.dropRenderer.sync(this.drops.values(), performance.now() / 1000);
  }

  private collect(item: ItemStack): void {
    const left = this.inventory.add(item);
    if (left > 0) this.dropStack({ ...item, count: left });
    sounds.place();
  }

  // --- Redstone, TNT and fireworks ----------------------------------------

  /** Every block change goes through here (ours, the others' and saved ones). */
  private onBlockChange(x: number, y: number, z: number, old: number, id: number): void {
    this.circuit.track(x, y, z, id);
    this.mapTiles.markDirty(x, z);
    const k = editKey(x, y, z);
    if (id === TNT_LIT && !this.fuses.has(k)) {
      this.fuses.set(k, TNT_RULES.fuse);
      if (this.ready && this.distanceTo(x, y, z) < 24) sounds.fuse();
    }
    if (old === TNT_LIT && id !== TNT_LIT && this.fuses.delete(k) && !this.exploding) {
      // Another player's computer set it off first: show the bang here too.
      this.blastEffects(x, y, z);
    }
    if (releaseButton(id) !== null) this.buttons.set(k, REDSTONE.buttonSeconds);
    else this.buttons.delete(k);
  }

  private isLoaded(x: number, z: number): boolean {
    return this.world.hasChunk(chunkOf(x), chunkOf(z));
  }

  private distanceTo(x: number, y: number, z: number): number {
    const p = this.player;
    return Math.hypot(x - p.x, y - (p.y + PLAYER.eyeHeight), z - p.z);
  }

  private updateRedstone(dt: number): void {
    this.redstoneTimer += dt;
    for (let n = 0; this.redstoneTimer >= REDSTONE.tickSeconds; n++) {
      this.redstoneTimer -= REDSTONE.tickSeconds;
      if (n >= MAX_REDSTONE_TICKS) {
        this.redstoneTimer = 0;
        break;
      }
      if (this.circuit.size === 0) continue;
      // Piston moves are sent to the others, so not too many per second.
      const now = performance.now();
      this.pistonSends = this.pistonSends.filter((t) => now - t < 1000);
      const canSend = !this.room || this.pistonSends.length < PISTONS.maxSendsPerSecond;
      const { looks, started, moves, pistons } = this.circuit.tick({
        getBlock: (x, y, z) => (this.isLoaded(x, z) ? this.world.getBlock(x, y, z) : AIR),
        isLoaded: (x, z) => this.isLoaded(x, z),
        isPressed: (x, y, z) => this.someoneOn(x, y, z),
        mayPush: (x, _y, z) => canSend && this.movesBlocksAt(x, z),
      });
      for (const [x, y, z, look] of looks) this.world.setShown(x, y, z, look);
      for (const [x, y, z, id] of started) {
        if (id === TNT) this.change([[x, y, z, TNT_LIT]]);
        else this.launchFromBlock(x, y, z);
      }
      if (moves.length > 0 && this.change(moves).length > 0) this.pistonSends.push(now);
      for (const [x, y, z] of pistons) sounds.piston(this.distanceTo(x, y, z));
    }

    for (const [k, left] of [...this.buttons]) {
      if (left - dt > 0) {
        this.buttons.set(k, left - dt);
        continue;
      }
      this.buttons.delete(k);
      const [x, y, z] = parseKey(k);
      const up = releaseButton(this.world.getBlock(x, y, z));
      if (up !== null) this.change([[x, y, z, up]]);
    }

    for (const [k, left] of [...this.fuses]) {
      if (!this.fuses.has(k)) continue;
      const [x, y, z] = parseKey(k);
      // Far away TNT waits until someone comes near.
      if (left - dt > 0 || !this.isLoaded(x, z)) {
        this.fuses.set(k, Math.max(0, left - dt));
        continue;
      }
      this.explodeAt(x, y, z);
    }
    this.effects.setPrimed(this.fuses.keys(), performance.now() / 1000);
  }

  /** Is a player or a creature standing on this pressure plate? */
  private someoneOn(x: number, y: number, z: number): boolean {
    const on = (p: { x: number; y: number; z: number }) =>
      Math.floor(p.x) === x && Math.floor(p.z) === z && p.y >= y - 0.01 && p.y < y + 0.5;
    if (!this.dead && on(this.player)) return true;
    if (this.others.positions().some(on)) return true;
    for (const m of this.mobs.views()) if (on(m)) return true;
    return false;
  }

  /**
   * Pistons move real blocks, so only one computer does it: of the players
   * near the piston, the one with the smallest id.
   */
  private movesBlocksAt(x: number, z: number): boolean {
    if (!this.room) return true;
    const near = (p: { x: number; z: number }) => Math.hypot(p.x - x, p.z - z) < PISTONS.ownerRange;
    return !this.others.positions().some((p) => near(p) && p.id < this.myId);
  }

  private explodeAt(x: number, y: number, z: number): void {
    this.fuses.delete(editKey(x, y, z));
    if (this.world.getBlock(x, y, z) !== TNT_LIT) return;
    const blast = explode(
      (bx, by, bz) => this.world.getBlock(bx, by, bz),
      x,
      y,
      z,
      TNT_RULES.power,
    );
    // TNT lit by the blast goes off soon (a little different for each one).
    for (const [lx, ly, lz] of blast.lit) {
      const dice = (positionSeed(lx, ly, lz) % 1000) / 1000;
      const fuse =
        TNT_RULES.chainFuseMin + dice * (TNT_RULES.chainFuseMax - TNT_RULES.chainFuseMin);
      this.fuses.set(editKey(lx, ly, lz), fuse);
    }
    // Alone, blown-up chests drop their things (the room server does it in multiplayer).
    if (!this.room) {
      for (const [bx, by, bz] of blast.edits) {
        if (!isContainerBlock(this.world.getBlock(bx, by, bz))) continue;
        for (const item of this.containers.removeLocal([bx, by, bz])) {
          this.spawnDrop(item, [bx + 0.5, by + 0.5, bz + 0.5], true);
        }
      }
    }
    this.exploding = true;
    this.change(blast.edits);
    this.exploding = false;
    this.blastEffects(x, y, z);
  }

  /** Smoke, the bang, and what the blast does to you. */
  private blastEffects(x: number, y: number, z: number): void {
    this.effects.explosion(x + 0.5, y + 0.5, z + 0.5);
    const p = this.player;
    const distance = Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y + 0.9), z + 0.5 - p.z);
    sounds.boom(distance);
    const hit = blastHit(distance, TNT_RULES.power);
    if (hit.push <= 0) return;
    this.shake = Math.max(this.shake, hit.push);
    if (!p.flying) p.vy = Math.max(p.vy, hit.push * TNT_RULES.knockback);
    this.takeDamage(hit.damage, 'Dynamiitti räjähti liian läheltä! 💥');
  }

  /** A rocket from the hand: everyone in the world sees it. */
  private launchFromHand(kind: number): void {
    if (this.fireworkCooldown > 0) return;
    this.fireworkCooldown = FIREWORKS.cooldown;
    const t = this.target;
    const [dx, , dz] = this.lookDirection();
    const p: [number, number, number] = t
      ? [t.x + 0.5 + t.nx * 0.6, t.y + 0.5 + t.ny * 0.6, t.z + 0.5 + t.nz * 0.6]
      : [this.player.x + dx * 1.5, this.player.y + PLAYER.eyeHeight, this.player.z + dz * 1.5];
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.effects.launch(...p, kind, seed);
    sounds.launch(0);
    this.room?.send({ t: 'firework', p, kind, seed });
    if (this.mode === 'survival') this.inventory.takeOne(this.hud.selected);
  }

  /** A powered launcher shoots a rocket (worked out on every computer). */
  private launchFromBlock(x: number, y: number, z: number): void {
    // Same second, same rocket for everyone.
    const seed = (positionSeed(x, y, z) ^ Math.floor(Date.now() / 1000)) >>> 0;
    this.effects.launch(x + 0.5, y + 1.1, z + 0.5, randomKind(seed), seed);
    sounds.launch(this.distanceTo(x, y, z));
  }

  // --- Magic builder ----------------------------------------------------

  private async askBuild(prompt: string): Promise<BuildResult> {
    const answer = await askBuilder(this.options.code, prompt);
    if (!answer.ok) return { error: BUILDER_ERRORS[answer.reason] ?? BUILDER_ERRORS.failed! };
    const blocks = centerFootprint(expandShapes(answer.shapes));
    if (!blocks.some((b) => b[3] !== AIR)) return { error: BUILDER_ERRORS.failed! };
    return { blocks };
  }

  /** For tests in development: asks for a build and starts placing it right away. */
  async magicBuild(prompt: string): Promise<string | null> {
    const result = await this.builder.run(prompt);
    if ('error' in result) return result.error;
    this.startPlacing(result.blocks);
    return null;
  }

  private startPlacing(build: BuildBlock[]): void {
    this.placing = { build, turns: 0, shownFacing: null, origin: null, facing: 0 };
    this.hud.setPlaceHint(true);
  }

  private cancelPlacing(): void {
    this.placing = null;
    this.ghost.hide();
    this.hud.setPlaceHint(false);
  }

  private turnPlacing(): void {
    if (!this.placing) return;
    this.placing.turns = (this.placing.turns + 1) % 4;
    sounds.place();
  }

  /** Every frame: the ghost goes where you point, turned the way you look. */
  private updatePlacing(): void {
    const p = this.placing;
    if (!p) return;
    const view = facingFromYaw(this.player.yaw);
    p.facing = ((view + p.turns) % 4) as 0 | 1 | 2 | 3;
    const local = placeBuild(p.build, [0, 0, 0], p.facing);
    if (p.shownFacing !== p.facing) {
      this.ghost.setBuild(local);
      p.shownFacing = p.facing;
    }
    const [dx, dy, dz] = this.lookDirection();
    const eyeY = this.player.y + PLAYER.eyeHeight;
    const hit = raycast(
      this.player.x,
      eyeY,
      this.player.z,
      dx,
      dy,
      dz,
      BUILDER.placeReach,
      (x, y, z) => {
        const b = getBlockType(this.world.getBlock(x, y, z));
        return b.id !== AIR && b.shape !== 'cross';
      },
    );
    let target: Vec3;
    if (hit) {
      target = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz];
    } else {
      // Pointing at the sky: the build stands on the ground a bit further away.
      const x = Math.floor(this.player.x + dx * BUILDER.placeDistance);
      const z = Math.floor(this.player.z + dz * BUILDER.placeDistance);
      target = [x, Math.max(this.world.surfaceY(x, z), SEA_LEVEL) + 1, z];
    }
    // The front of the build starts where you point and it continues away from you.
    const [ox, , oz] = nearSideOffset(local, view);
    p.origin = [target[0] + ox, target[1], target[2] + oz];
    this.ghost.moveTo(...p.origin);
  }

  private finishPlacing(): void {
    const p = this.placing;
    if (!p?.origin) return;
    const { edits } = planPlacement(p.build, p.origin, p.facing, (x, y, z) =>
      this.world.getBlock(x, y, z),
    );
    const before: Edit[] = edits.map(([x, y, z]) => [x, y, z, this.world.getBlock(x, y, z)]);
    const changed = this.change(edits);
    const changedKeys = new Set(changed.map(([x, y, z]) => `${x},${y},${z}`));
    this.undo = before.filter(([x, y, z]) => changedKeys.has(`${x},${y},${z}`));
    // Chests and furnaces under the build spill their items (the room server does it in multiplayer).
    if (!this.room) {
      for (const [x, y, z, id] of this.undo) {
        if (!isContainerBlock(id)) continue;
        for (const item of this.containers.removeLocal([x, y, z])) {
          this.spawnDrop(item, [x + 0.5, y + 0.5, z + 0.5], true);
        }
      }
    }
    this.cancelPlacing();
    sounds.magic();
    this.hud.toast(`✨ Valmis! (${changed.length} palikkaa) – Z kumoaa`);
  }

  private undoBuild(): void {
    if (this.undo.length === 0) return;
    this.change(this.undo);
    this.undo = [];
    this.hud.toast('↩️ Taikarakennus kumottu');
  }

  // --- Keys and pausing -------------------------------------------------

  /** Returns true when the key opened something (so it is not typed anywhere). */
  private onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.ready || this.dead) return false;
    if (this.inventoryScreen.isOpen || this.builder.isOpen || this.hud.chatOpen) return false;
    if (this.mapScreen.isOpen) return false;
    if (code === 'KeyE') {
      // The survival backpack has the small 2 × 2 crafting grid, like Minecraft.
      this.openScreen(this.mode === 'survival' ? new CraftingPanel(2) : null);
    } else if (code === 'KeyB') {
      // While placing, B goes back to the preview with the same build.
      if (this.placing) {
        this.builder.restore(this.placing.build);
        this.cancelPlacing();
      }
      this.openOverlay((done) => this.builder.open(done));
    } else if (code === 'KeyR' && this.placing) {
      this.turnPlacing();
    } else if (code === 'KeyX' && this.placing) {
      this.cancelPlacing();
      this.hud.toast('✖️ Taikarakennus jäi asettamatta');
    } else if (code === 'KeyY' && this.request) {
      this.answerRequest(true);
    } else if (code === 'KeyX' && this.request && !this.placing) {
      this.answerRequest(false);
    } else if (code === 'Slash' || e.key === '/') {
      this.openOverlay((done) =>
        this.hud.openChat((text) => this.sendChat(text), done, '/', commandHints),
      );
    } else if (code === 'KeyM') {
      this.openOverlay((done) => this.mapScreen.open(done));
    } else if (code === 'KeyN') {
      this.minimapOn = !this.minimapOn;
      this.mapTimer = 0;
    } else if (code === 'KeyT' || code === 'Enter') {
      this.openOverlay((done) =>
        this.hud.openChat((text) => this.sendChat(text), done, '', commandHints),
      );
    } else if (code === 'KeyZ' && this.input.locked) {
      this.undoBuild();
    } else if (code === 'KeyQ' && this.input.locked) {
      this.dropSelected(e.ctrlKey || e.metaKey);
    } else {
      return false;
    }
    return true;
  }

  private sendChat(raw: string): void {
    const text = cleanChatText(raw);
    if (!text) return;
    const command = parseCommand(text);
    if (command) {
      this.runCommand(command);
      return;
    }
    this.hud.addChat(this.options.avatar, text);
    this.room?.send({ t: 'chat', text });
  }

  // --- Commands, teleport requests and sleeping ---------------------------

  /** A line from the game itself in the chat. */
  private say(text: string): void {
    this.hud.addChat('💡', text);
  }

  /** Other players with their animals (for /tpa and /pelaajat). */
  private otherPlayers(): Someone[] {
    return [...this.avatars.entries()]
      .filter(([id]) => id !== 'me' && id !== this.myId)
      .map(([id, avatar]) => ({ id, avatar }));
  }

  private runCommand(c: Command): void {
    switch (c.kind) {
      case 'help':
        for (const info of COMMAND_LIST) this.say(info.help);
        return;
      case 'tpa':
      case 'invite': {
        if (!this.room?.isOpen) {
          this.say('🧍 Olet yksin tässä maailmassa. Kutsu kaveri maailmakoodilla!');
          return;
        }
        const result = findPlayer(c.target, this.otherPlayers());
        if ('error' in result) {
          this.say(REQUEST_ERRORS[result.error]);
          return;
        }
        const who = result.found;
        this.asked.set(who.id, c.kind);
        this.room.send({ t: 'ask', to: who.id, kind: c.kind });
        this.say(
          c.kind === 'tpa'
            ? `📨 Pyysit päästä ${who.avatar}:n luo. Odotetaan vastausta…`
            : `📨 Kutsuit ${who.avatar}:n luoksesi. Odotetaan vastausta…`,
        );
        return;
      }
      case 'accept':
      case 'deny':
        if (!this.request) this.say('📭 Kukaan ei ole pyytänyt mitään.');
        else this.answerRequest(c.kind === 'accept');
        return;
      case 'home':
        if (!this.home) this.say('🏠 Sinulla ei ole vielä kotia. Kirjoita /asetakoti');
        else {
          this.teleportTo(...this.home);
          this.say('🏠 Tervetuloa kotiin!');
        }
        return;
      case 'sethome':
        this.home = [this.player.x, this.player.y, this.player.z];
        this.savePlayerNow();
        this.say('🏠 Tämä on nyt kotisi. /koti tuo sinut tänne.');
        return;
      case 'spawn':
        this.teleportTo(...this.spawn);
        this.say('⭐ Takaisin alussa!');
        return;
      case 'players': {
        const all = [this.options.avatar, ...this.otherPlayers().map((p) => p.avatar)];
        this.say(`👥 Maailmassa: ${all.map((a) => `${a} ${animalName(a)}`).join(', ')}`);
        return;
      }
      case 'where': {
        const { x, y, z } = this.player;
        const biome = BIOME_NAMES[this.world.terrain.biomeAt(Math.floor(x), Math.floor(z))];
        this.say(`📍 x ${Math.floor(x)}, y ${Math.floor(y)}, z ${Math.floor(z)} (${biome})`);
        return;
      }
      case 'time': {
        if (!c.value) {
          this.say('⏰ Kirjoita /aika päivä tai /aika yö');
          return;
        }
        const skip = skipTo(this.time, c.value === 'day' ? MORNING : NIGHT);
        if (this.room?.isOpen) this.room.send({ t: 'time', skip });
        else {
          this.timeOffset += skip;
          this.savePlayerNow();
        }
        this.say(c.value === 'day' ? '☀️ Nyt on päivä!' : '🌙 Nyt on yö!');
        return;
      }
      case 'mode':
        if (c.value && c.value !== this.mode) this.toggleMode();
        else if (!c.value) this.say('🛠️ Kirjoita /tila luova tai /tila selviytyjä');
        return;
      case 'unknown':
        this.say(`❓ En tunne komentoa /${c.name}. Kirjoita /apua`);
        return;
    }
  }

  /** Someone asked to come here (tpa) or asked you to come (invite). */
  private receiveRequest(from: string, avatar: string, kind: RequestKind): void {
    this.request = {
      from,
      avatar,
      kind,
      until: performance.now() + COMMANDS.requestSeconds * 1000,
    };
    sounds.join();
    const text =
      kind === 'tpa' ? `${avatar} haluaa tulla luoksesi.` : `${avatar} kutsuu sinut luokseen!`;
    this.hud.showRequest(
      text,
      () => this.answerRequest(true),
      () => this.answerRequest(false),
    );
  }

  private answerRequest(yes: boolean): void {
    const r = this.request;
    if (!r) return;
    this.request = null;
    this.hud.showRequest(null);
    const p: [number, number, number] = [this.player.x, this.player.y, this.player.z];
    this.room?.send({ t: 'answer', to: r.from, kind: r.kind, yes, ...(yes ? { p } : {}) });
    if (!yes) {
      this.say(`❌ Sanoit ei ${r.avatar}:lle.`);
      return;
    }
    if (r.kind === 'invite') {
      // Go to the one who invited you.
      const them = this.others.positions().find((o) => o.id === r.from);
      if (them) this.teleportTo(them.x, them.y, them.z);
      this.say(`✨ Hyppäsit ${r.avatar}:n luo!`);
    } else this.say(`✅ ${r.avatar} tulee luoksesi!`);
  }

  private receiveAnswer(
    from: string,
    avatar: string,
    kind: RequestKind,
    yes: boolean,
    p?: [number, number, number],
  ): void {
    if (this.asked.get(from) !== kind) return;
    this.asked.delete(from);
    if (!yes) {
      this.say(`🙅 ${avatar} sanoi ei.`);
      return;
    }
    if (kind === 'tpa' && p) {
      this.teleportTo(...p);
      this.say(`✨ Hyppäsit ${avatar}:n luo!`);
    } else this.say(`🎉 ${avatar} tulee luoksesi!`);
  }

  /** Jumps to a place, a little higher if it is inside blocks. */
  private teleportTo(x: number, y: number, z: number): void {
    const free = (by: number) =>
      !isSolid(this.world.getBlock(Math.floor(x), by, Math.floor(z))) &&
      !isSolid(this.world.getBlock(Math.floor(x), by + 1, Math.floor(z)));
    let ty = Math.floor(y);
    for (let i = 0; i < COMMANDS.freeSpotSearch && !free(ty); i++) ty++;
    const p = this.player;
    p.x = x;
    p.y = Math.max(y, ty);
    p.z = z;
    p.vx = p.vy = p.vz = 0;
    this.fallStart = null;
    this.lastSentMove = null;
    this.moveTimer = 0;
    sounds.magic();
  }

  /** Lies down in a bed at night; when everyone sleeps it becomes morning. */
  private sleepIn(x: number, y: number, z: number): void {
    if (!isNight(this.time)) {
      this.hud.toast('🛏️ Herätyspaikka tallennettu! Nukkua voi vain yöllä.');
      return;
    }
    this.sleeping = true;
    [this.player.x, this.player.y, this.player.z] = [x, y, z];
    this.player.vx = this.player.vy = this.player.vz = 0;
    this.overlayOpen = true;
    this.input.unlock();
    const skip = skipTo(this.time, MORNING);
    if (!this.room?.isOpen) {
      this.hud.showSleep('Hyvää yötä…');
      setTimeout(() => {
        this.timeOffset += skip;
        this.wakeUp('☀️ Hyvää huomenta!');
      }, COMMANDS.sleepFadeMs);
      return;
    }
    this.hud.showSleep('Odotetaan, että kaikki menevät nukkumaan…', () => this.wakeUp(null));
    this.room.send({ t: 'sleep', on: true, skip });
  }

  /** Gets up from the bed; `greeting` is shown when the night was skipped. */
  private wakeUp(greeting: string | null): void {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.hud.showSleep(null);
    if (greeting) this.hud.toast(greeting);
    else this.room?.send({ t: 'sleep', on: false, skip: 0 });
    this.savePlayerNow();
    this.overlayOpen = false;
    this.resume();
    // Without a click the mouse can't be caught again: show the pause menu.
    if (!this.input.locked) this.callbacks.onPause(true);
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

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.mining = null;
    this.callbacks.onPause(paused && !this.overlayOpen && !this.dead);
  }

  // --- Multiplayer ------------------------------------------------------

  /** Sends your position a few times a second, only when you really moved. */
  private sendMove(dt: number): void {
    if (!this.room?.isOpen) return;
    this.moveTimer -= dt;
    this.moveIdle += dt;
    if (this.moveTimer > 0) return;
    this.moveTimer = 1 / NET.moveSendRate;
    const p = this.player;
    // Your creatures travel in the same message, so they cost nothing extra.
    // When you stand still they are still sent, but less often.
    this.mobSyncTimer -= 1 / NET.moveSendRate;
    const mobs = this.mobSyncTimer <= 0 ? this.mobs.netList(this.others.positions()) : [];
    if (mobs.length > 0) this.mobSyncTimer = 1 / NET.mobSendRate;
    const last = this.lastSentMove;
    if (last && mobs.length === 0) {
      const moved = Math.hypot(p.x - last[0], p.y - last[1], p.z - last[2]);
      const turned = Math.abs(p.yaw - last[3]) + Math.abs(p.pitch - last[4]);
      const small = moved < NET.moveDeadZone && turned < NET.turnDeadZone;
      if (small && (moved === 0 || this.moveIdle < NET.moveKeepAlive)) return;
    }
    const round = (v: number) => Math.round(v * 100) / 100;
    const pos: [number, number, number] = [round(p.x), round(p.y), round(p.z)];
    const yaw = round(p.yaw);
    const pitch = round(p.pitch);
    this.lastSentMove = [p.x, p.y, p.z, p.yaw, p.pitch];
    this.moveIdle = 0;
    this.room.send(
      mobs.length > 0 ? { t: 'move', p: pos, yaw, pitch, mobs } : { t: 'move', p: pos, yaw, pitch },
    );
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
        this.myId = msg.you;
        this.timeOffset = msg.timeOffset ?? 0;
        this.mobs.myId = msg.you;
        this.others.clear();
        for (const p of msg.players) {
          this.others.add(p);
          this.avatars.set(p.id, p.avatar);
        }
        this.drops.clear();
        this.pickupsAsked.clear();
        for (const d of msg.items ?? []) this.drops.set(d.id, liveDrop(d));
        this.updatePlayerList();
        this.lastSentMove = null;
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
        this.mobs.forgetOwner(msg.id);
        this.others.remove(msg.id);
        this.avatars.delete(msg.id);
        this.updatePlayerList();
        return;
      case 'move':
        this.others.move(msg.id, msg.p, msg.yaw, msg.pitch);
        if (msg.mobs) this.mobs.receive(msg.id, msg.mobs);
        return;
      case 'hitMob':
        this.mobs.receiveHit(msg.id, msg.damage, msg.from);
        return;
      case 'hurtPlayer':
        if (msg.id === this.myId)
          this.takeDamage(msg.damage, HURT_REASONS[msg.kind] ?? 'Hirviö osui.');
        return;
      case 'set':
        this.world.applyEdits(msg.edits);
        return;
      case 'chat':
        this.hud.addChat(msg.avatar, msg.text);
        return;
      case 'item':
        this.drops.set(msg.drop.id, liveDrop(msg.drop));
        return;
      case 'picked': {
        const drop = this.drops.get(msg.id);
        this.drops.delete(msg.id);
        this.pickupsAsked.delete(msg.id);
        if (drop && msg.by === this.myId) this.collect(drop.item);
        return;
      }
      case 'container':
        this.containers.receive(msg.p, msg.data);
        return;
      case 'full':
        this.hud.toast('⛔ Maailma on täynnä. Kokeile myöhemmin!');
        return;
      case 'ask':
        this.receiveRequest(msg.from, msg.avatar, msg.kind);
        return;
      case 'answer':
        this.receiveAnswer(msg.from, msg.avatar, msg.kind, msg.yes, msg.p);
        return;
      case 'time':
        this.timeOffset = msg.offset;
        if (msg.slept && this.sleeping) this.wakeUp('☀️ Hyvää huomenta! Kaikki nukkuivat yön yli.');
        else if (msg.slept) this.hud.toast('☀️ Yö nukuttiin yli!');
        else if (msg.avatar) this.hud.toast(`⏰ ${msg.avatar} vaihtoi aikaa.`);
        return;
      case 'sleepers':
        if (this.sleeping) {
          this.hud.showSleep(`💤 ${msg.sleeping}/${msg.total} nukkuu. Odotetaan muita…`, () =>
            this.wakeUp(null),
          );
        } else if (msg.sleeping > 0) {
          this.hud.toast(`🛏️ ${msg.sleeping}/${msg.total} nukkuu. Mene sänkyyn, niin yö loppuu!`);
        }
        return;
      case 'firework':
        this.effects.launch(...msg.p, msg.kind, msg.seed);
        sounds.launch(this.distanceTo(...msg.p));
        return;
    }
  }

  private updatePlayerList(): void {
    this.hud.setPlayers([...this.avatars.values()]);
  }
}

/** Used by the pause menu to show the button text. */
export function modeButtonText(mode: GameMode): string {
  return mode === 'creative' ? '⚔️ Vaihda selviytyjäksi' : '🛠️ Vaihda nikkaroijaksi';
}
