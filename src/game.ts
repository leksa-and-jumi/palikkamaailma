// One play session in one world: moving, mining and building, survival,
// items, multiplayer, chat and the magic builder.

import {
  BUILDER,
  NET,
  PLAYER,
  SEA_LEVEL,
  SURVIVAL,
  type Difficulty,
  type GameMode,
} from './config';
import { sounds } from './audio/sounds';
import { loadLocalEdits, loadPlayer, saveLocalEdits, savePlayer } from './data/storage';
import {
  AIR,
  CHEST,
  CRAFTING_TABLE,
  DEFAULT_HOTBAR,
  FURNACE,
  LAVA,
  OBSIDIAN,
  WATER,
  getBlockType,
  isSolid,
} from './logic/blocks';
import { seedFromCode } from './logic/codes';
import { canPickUp, isExpired, liveDrop, stepDrop, type LiveDrop } from './logic/drops';
import { isContainerBlock, positionKey } from './logic/containers';
import { HOTBAR_SIZE, Inventory, stackLimit, type ItemStack } from './logic/inventory';
import { getItem, itemId } from './logic/items';
import { blockDrops, breakTime, wearsWhenMining } from './logic/mining';
import { createPlayer, overlapsBlock, stepPlayer, type PlayerState } from './logic/physics';
import { cleanChatText, type DroppedItem, type ServerMessage } from './logic/protocol';
import { raycast, type RayHit } from './logic/raycast';
import { nearSideOffset, planPlacement } from './logic/placement';
import {
  centerFootprint,
  expandShapes,
  facingFromYaw,
  placeBuild,
  type BuildBlock,
  type Vec3,
} from './logic/shapes';
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
import { dayLabel, timeOfDay } from './logic/daytime';
import { BIOME_NAMES } from './logic/terrain';
import { VoxelWorld, isInsideWorld, type Edit } from './logic/world';
import { askBuilder } from './net/convex';
import { ContainerService } from './net/containers';
import { ROOM_URL, RoomClient, type RoomStatus } from './net/room';
import { OtherPlayers } from './render/avatars';
import { BuildGhost } from './render/buildGhost';
import { CrackOverlay, DropRenderer } from './render/dropRenderer';
import type { WorldRenderer } from './render/worldRenderer';
import type { Hud } from './ui/hud';
import { BuilderScreen, type BuildResult } from './ui/builderScreen';
import { Input } from './ui/input';
import type { ExtraPanel, InventoryScreen } from './ui/inventoryScreen';
import { ChestPanel, CraftingPanel, FurnacePanel } from './ui/panels';

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
const BREAK_DROP_SPEED = 2;

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
  /** Moves the clock (ms), for testing day and night. */
  timeShift = 0;
  private readonly spawn: [number, number, number];
  private readonly drops = new Map<string, LiveDrop>();
  private readonly pickupsAsked = new Set<string>();
  private mining: { x: number; y: number; z: number; progress: number } | null = null;
  private breakCooldown = 0;
  private placeCooldown = 0;
  private fallStart: number | null = null;
  private lastX = 0;
  private lastZ = 0;

  constructor(
    private readonly options: GameOptions,
    private readonly renderer: WorldRenderer,
    private readonly hud: Hud,
    private readonly inventoryScreen: InventoryScreen,
    private readonly callbacks: { onReady(): void; onPause(paused: boolean): void },
  ) {
    this.world = new VoxelWorld(seedFromCode(options.code));
    renderer.setWorld(this.world);
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
    if (saved.inventory) this.inventory.load(saved.inventory);
    else if (this.mode === 'creative') this.giveCreativeKit();
    hud.setInventory(this.inventory);

    this.input = new Input(renderer.renderer.domElement, {
      onBreak: () => this.onBreakPressed(),
      onPlace: () => this.useItem(),
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
    this.hud.show(false);
  }

  /** Time of day, the same for everyone in this world. */
  get time(): number {
    return timeOfDay(Date.now() + this.timeShift, this.world.seed);
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
    this.updateDrops(dt);
    this.updateCamera();
    this.updateTarget();
    this.others.update(dt);
    this.renderer.render();
  }

  private movePlayer(dt: number): void {
    const [yaw, pitch] = this.input.takeLook();
    this.player.yaw += yaw;
    this.player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.player.pitch + pitch));
    const shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const wasOnGround = this.player.onGround;
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
        down: shift && this.player.flying,
        sprint: shift && !this.player.flying && this.canSprint(),
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

  private updateCamera(): void {
    const cam = this.renderer.camera;
    cam.position.set(this.player.x, this.player.y + PLAYER.eyeHeight, this.player.z);
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
    if (this.target) this.renderer.showHighlight(this.target.x, this.target.y, this.target.z);
    else this.renderer.hideHighlight();
    const m = this.mining;
    this.cracks.show(m?.x ?? 0, m?.y ?? 0, m?.z ?? 0, m ? m.progress : null);
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
    if (this.mode === 'creative') {
      this.breakTarget();
      this.breakCooldown = SURVIVAL.creativeBreakDelay;
    }
  }

  /** Called every frame: holding the mouse mines (survival) or repeats (creative). */
  private updateActions(dt: number): void {
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;
    if (this.placing) {
      this.mining = null;
      return;
    }
    if (this.input.isMouseDown(2) && this.placeCooldown <= 0) this.useItem();

    const t = this.target;
    if (!this.input.isMouseDown(0) || !t) {
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
    if (!getBlockType(block).breakable) return;
    this.change([[t.x, t.y, t.z, AIR]]);
    sounds.break();
    // Alone, the chest's items fall out here (the room server does it in multiplayer).
    if (!this.room && isContainerBlock(block)) {
      for (const item of this.containers.removeLocal([t.x, t.y, t.z])) {
        this.spawnDrop(item, [t.x + 0.5, t.y + 0.5, t.z + 0.5], true);
      }
    }
    if (this.mode !== 'survival') return;

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

  /** Right click: open a table/furnace/chest, eat, use a bucket or place a block. */
  private useItem(): void {
    this.placeCooldown = PLACE_REPEAT;
    if (this.placing) {
      this.turnPlacing();
      return;
    }
    const sneaking = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (this.target && !sneaking && this.interact(this.target)) return;
    const stack = this.selectedStack();
    const item = stack ? getItem(stack.id) : undefined;

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
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    const here = getBlockType(this.world.getBlock(x, y, z));
    if (here.id !== AIR && !here.liquid) return;
    // Don't put a solid block inside yourself.
    if (getBlockType(item.block).solid && overlapsBlock(this.player, x, y, z)) return;
    if (this.change([[x, y, z, item.block]]).length === 0) return;
    if (this.mode === 'survival') this.inventory.takeOne(this.hud.selected);
    sounds.place();
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
    const id = this.world.getBlock(t.x, t.y, t.z);
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
    });
  }

  // --- Survival -----------------------------------------------------------

  private updateSurvival(dt: number): void {
    const p = this.player;
    const feet = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const body = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    const inLava = feet === LAVA || body === LAVA;

    // Falling: remember the highest point; landing hurts after 3 blocks.
    if (p.inWater || p.flying) {
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
    [this.player.x, this.player.y, this.player.z] = this.spawn;
    this.player.vx = this.player.vy = this.player.vz = 0;
    this.fallStart = null;
    this.savePlayerNow();
    this.resume();
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
    } else if (code === 'KeyT' || code === 'Enter') {
      this.openOverlay((done) => this.hud.openChat((text) => this.sendChat(text), done));
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
    const last = this.lastSentMove;
    if (last) {
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
    this.room.send({ t: 'move', p: pos, yaw, pitch });
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
