// Redstone (punakivi): levers, buttons, pressure plates, redstone blocks,
// redstone torches and repeaters give power, dust carries it (one step weaker
// per block, 15 at most), and lamps, TNT, launchers, doors, trapdoors, gates
// and pistons use it. Rules are a simpler Minecraft.
//
// Only the switches are stored in the world (a lever is on or off). Everything
// else (which dust glows, which lamp is lit, which door is open) is worked out
// again on every computer from the same blocks, so nothing extra is sent over
// the network. Only pistons really move blocks: one computer sends the move.

import { PISTONS, REDSTONE } from '../config';
import {
  AIR,
  BUTTON,
  BUTTON_ON,
  FACING_STEPS,
  FENCE_GATE,
  FIREWORK_LAUNCHER,
  IRON_DOOR,
  LEVER,
  LEVER_ON,
  OAK_DOOR,
  OAK_PLATE,
  OAK_PLATE_ON,
  PISTON,
  PISTON_BASE_ON,
  PISTON_HEAD,
  REDSTONE_BLOCK,
  REDSTONE_LAMP,
  REDSTONE_LAMP_ON,
  REDSTONE_TORCH,
  REDSTONE_TORCH_OFF,
  REDSTONE_WIRE,
  REDSTONE_WIRE_ON,
  REPEATER,
  STICKY_HEAD,
  STICKY_PISTON,
  STONE_PLATE,
  STONE_PLATE_ON,
  TNT,
  TRAPDOOR,
  WALL_BUTTON,
  WALL_BUTTON_ON,
  WALL_LEVER,
  WALL_LEVER_ON,
  getBlockType,
  isOpaque,
} from './blocks';
import type { Edit } from './world';

export interface CircuitWorld {
  /** The real block (never the redstone look). */
  getBlock(x: number, y: number, z: number): number;
  /** Is this part of the world in memory? Far away circuits wait. */
  isLoaded(x: number, z: number): boolean;
  /** Is someone standing on the pressure plate here? */
  isPressed?(x: number, y: number, z: number): boolean;
  /** May this computer move blocks with a piston right now? */
  mayPush?(x: number, y: number, z: number): boolean;
}

/** A block that should look different: [x, y, z, look id or null for normal]. */
export type Look = [number, number, number, number | null];

export interface TickResult {
  looks: Look[];
  /** TNT and launchers that just got power: [x, y, z, block id]. */
  started: [number, number, number, number][];
  /** Blocks moved by pistons (to store and send). */
  moves: Edit[];
  /** Pistons that went out or in (for the sound). */
  pistons: [number, number, number][];
}

const range = (base: number, count: number) => Array.from({ length: count }, (_, i) => base + i);

const WALL_LEVERS_ON = new Set(range(WALL_LEVER_ON, 4));
const WALL_BUTTONS_ON = new Set(range(WALL_BUTTON_ON, 4));
/** Switches that are on: they power everything around them. */
const SWITCHES_ON = new Set([LEVER_ON, BUTTON_ON, ...WALL_LEVERS_ON, ...WALL_BUTTONS_ON]);
const PLATES = new Set([STONE_PLATE, OAK_PLATE]);
const REPEATERS = new Set(range(REPEATER, 4));
const PISTONS_ALL = new Set([...range(PISTON, 6), ...range(STICKY_PISTON, 6)]);

/** Flips a lever (on the floor or a wall); null if it is not a lever. */
export function flipLever(id: number): number | null {
  if (id === LEVER) return LEVER_ON;
  if (id === LEVER_ON) return LEVER;
  if (id >= WALL_LEVER && id < WALL_LEVER + 4) return id + 4;
  if (id >= WALL_LEVER_ON && id < WALL_LEVER_ON + 4) return id - 4;
  return null;
}

/** A button pushed in, or null if it is not a button that is up. */
export function pressButton(id: number): number | null {
  if (id === BUTTON) return BUTTON_ON;
  if (id >= WALL_BUTTON && id < WALL_BUTTON + 4) return id + 4;
  return null;
}

/** A pressed button popping back up, or null. */
export function releaseButton(id: number): number | null {
  if (id === BUTTON_ON) return BUTTON;
  if (WALL_BUTTONS_ON.has(id)) return id - 4;
  return null;
}

export function isButton(id: number): boolean {
  return id === BUTTON || id === BUTTON_ON || (id >= WALL_BUTTON && id < WALL_BUTTON_ON + 4);
}

/** Things dust joins to when it is drawn. */
const DUST_JOINS = new Set([
  REDSTONE_WIRE,
  REDSTONE_WIRE_ON,
  LEVER,
  LEVER_ON,
  BUTTON,
  BUTTON_ON,
  REDSTONE_TORCH,
  REDSTONE_TORCH_OFF,
  REDSTONE_LAMP,
  REDSTONE_LAMP_ON,
  REDSTONE_BLOCK,
  FIREWORK_LAUNCHER,
  TNT,
  STONE_PLATE,
  STONE_PLATE_ON,
  OAK_PLATE,
  OAK_PLATE_ON,
  ...range(REPEATER, 8),
  ...range(WALL_LEVER, 16),
]);

/** Does redstone dust join this block when it is drawn? */
export function joinsDust(id: number): boolean {
  return DUST_JOINS.has(id);
}

/** Doors, trapdoors and gates open with power. */
const OPENABLE = new Set([OAK_DOOR, IRON_DOOR, TRAPDOOR, FENCE_GATE]);

export function isOpenable(id: number): boolean {
  return OPENABLE.has(getBlockType(id).item);
}

/** Does the circuit care about this block? */
export function isRedstoneThing(id: number): boolean {
  return DUST_JOINS.has(id) || PISTONS_ALL.has(id) || isOpenable(id);
}

const SIDES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;
const FLAT = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

type Pos = [number, number, number];

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function add(p: readonly number[], s: readonly number[], times = 1): Pos {
  return [p[0]! + s[0]! * times, p[1]! + s[1]! * times, p[2]! + s[2]! * times];
}

const STUCK_KEYS = new Set(['obsidian', 'chest', 'furnace', 'enchanting_table', 'tnt_lit']);

/** Blocks a piston can't move: bedrock, obsidian, chests, doors and other pistons. */
function isStuck(id: number): boolean {
  const b = getBlockType(id);
  return !b.breakable || b.shownOnly || !!b.partner || STUCK_KEYS.has(b.key) || PISTONS_ALL.has(id);
}

/** Blocks a piston pushes away by breaking them (plants, torches, dust). */
function isFragile(id: number): boolean {
  const b = getBlockType(id);
  return id === AIR || b.liquid || (!b.solid && b.shape !== 'cube') || b.support !== null;
}

export class Circuit {
  /** Every redstone block in the world (they only come from players). */
  private readonly parts = new Map<string, Pos>();
  private wire = new Map<string, number>();
  private unlit = new Set<string>();
  private powered = new Set<string>();
  /** Repeaters giving power out of their front this tick. */
  private repeatersOn = new Set<string>();
  /** Pistons that are pushed out, and the tick they last moved. */
  private readonly extended = new Set<string>();
  private readonly pistonMoved = new Map<string, number>();
  /** Parts that have been worked out once (new launchers don't fire at once). */
  private readonly known = new Set<string>();
  private readonly looks = new Map<string, number>();
  /** Ticks when each torch turned on or off, to stop very fast blinking. */
  private readonly flips = new Map<string, number[]>();
  private readonly burntUntil = new Map<string, number>();
  private ticks = 0;

  /** Call for every changed block. */
  track(x: number, y: number, z: number, id: number): void {
    const k = key(x, y, z);
    if (isRedstoneThing(id)) this.parts.set(k, [x, y, z]);
    else this.parts.delete(k);
  }

  get size(): number {
    return this.parts.size;
  }

  /** How strong the dust here is (0–15). */
  wirePower(x: number, y: number, z: number): number {
    return this.wire.get(key(x, y, z)) ?? 0;
  }

  isPowered(x: number, y: number, z: number): boolean {
    return this.powered.has(key(x, y, z));
  }

  isTorchLit(x: number, y: number, z: number): boolean {
    const k = key(x, y, z);
    return !this.unlit.has(k) && (this.burntUntil.get(k) ?? 0) <= this.ticks;
  }

  isExtended(x: number, y: number, z: number): boolean {
    return this.extended.has(key(x, y, z));
  }

  /** One redstone tick (Minecraft: 0.1 s). */
  tick(world: CircuitWorld): TickResult {
    this.ticks++;
    const get = (x: number, y: number, z: number) => world.getBlock(x, y, z);
    const opaque = (x: number, y: number, z: number) => isOpaque(get(x, y, z));
    const lit = (x: number, y: number, z: number) => {
      const k = key(x, y, z);
      return !this.unlit.has(k) && (this.burntUntil.get(k) ?? 0) <= this.ticks;
    };
    const pressed = (x: number, y: number, z: number) =>
      PLATES.has(get(x, y, z)) && !!world.isPressed?.(x, y, z);
    const repeatersOn = this.repeatersOn;
    /** Does the thing at n give power into the block at t (next to it)? */
    const powersInto = (n: Pos, t: Pos) => {
      const id = get(...n);
      if (SWITCHES_ON.has(id) || id === REDSTONE_BLOCK) return true;
      // A torch never powers the block it stands on.
      if (id === REDSTONE_TORCH) return lit(...n) && !(t[1] === n[1] - 1);
      if (PLATES.has(id)) return pressed(...n);
      if (REPEATERS.has(id) && repeatersOn.has(key(...n))) {
        const out = add(n, FACING_STEPS[id - REPEATER]!);
        return out[0] === t[0] && out[1] === t[1] && out[2] === t[2];
      }
      return false;
    };
    /** A solid block a switch touches, a lit torch under it, a repeater or a plate on it. */
    const strong = (x: number, y: number, z: number) => {
      if (!opaque(x, y, z)) return false;
      if (get(x, y - 1, z) === REDSTONE_TORCH && lit(x, y - 1, z)) return true;
      if (pressed(x, y + 1, z)) return true;
      return SIDES.some(([dx, dy, dz]) => {
        const n: Pos = [x + dx, y + dy, z + dz];
        const id = get(...n);
        if (SWITCHES_ON.has(id)) return true;
        return REPEATERS.has(id) && powersInto(n, [x, y, z]);
      });
    };

    const active: Pos[] = [];
    const wires: Pos[] = [];
    for (const [k, p] of this.parts) {
      if (!world.isLoaded(p[0], p[2])) continue;
      const id = get(...p);
      if (!isRedstoneThing(id)) {
        this.parts.delete(k);
        continue;
      }
      active.push(p);
      if (id === REDSTONE_WIRE) wires.push(p);
    }

    // 1. Dust next to a power source gets 15; every step after that is one weaker.
    const wire = new Map<string, number>();
    const queue: Pos[] = [];
    for (const p of wires) {
      const fed = SIDES.some((s) => {
        const n = add(p, s);
        return powersInto(n, p) || strong(...n);
      });
      if (fed) {
        wire.set(key(...p), REDSTONE.maxPower);
        queue.push(p);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const [x, y, z] = queue[i]!;
      const next = wire.get(key(x, y, z))! - 1;
      if (next <= 0) continue;
      for (const [nx, ny, nz] of this.joinedWires(get, x, y, z)) {
        const k = key(nx, ny, nz);
        if ((wire.get(k) ?? 0) >= next) continue;
        wire.set(k, next);
        queue.push([nx, ny, nz]);
      }
    }
    this.wire = wire;
    const wireAt = (x: number, y: number, z: number) => (wire.get(key(x, y, z)) ?? 0) > 0;

    /** A solid block with powered dust on it or pointing into it. */
    const weak = (x: number, y: number, z: number) =>
      opaque(x, y, z) &&
      (wireAt(x, y + 1, z) || FLAT.some(([dx, dz]) => wireAt(x + dx, y, z + dz)));
    /** Power reaches this block from the side `s` (a step from it). */
    const fedFrom = (p: Pos, s: readonly number[]) => {
      const n = add(p, s);
      return powersInto(n, p) || wireAt(...n) || strong(...n) || weak(...n);
    };
    const fedAt = (p: Pos, except: readonly number[] | null = null) =>
      SIDES.some(
        (s) =>
          !(except && s[0] === except[0] && s[1] === except[1] && s[2] === except[2]) &&
          fedFrom(p, s),
      );

    // 2. Lamps, TNT, launchers, doors and pistons.
    const powered = new Set<string>();
    const started: TickResult['started'] = [];
    const moves: Edit[] = [];
    const pistons: Pos[] = [];
    const doorLooks = new Map<string, number | null>();
    for (const p of active) {
      const id = get(...p);
      const type = getBlockType(id);
      const k = key(...p);
      if (PISTONS_ALL.has(id)) {
        this.updatePiston(world, p, id, fedAt(p, FACING_STEPS[type.facing!]!), moves, pistons);
        continue;
      }
      const isUser = id === REDSTONE_LAMP || id === TNT || id === FIREWORK_LAUNCHER;
      if (isOpenable(id)) {
        // Doors, trapdoors and gates: power on either half opens both.
        const other = type.partner ? add(p, type.partner) : null;
        const on = fedAt(p) || (!!other && fedAt(other));
        if (on) powered.add(k);
        doorLooks.set(k, on ? type.powered : null);
        continue;
      }
      if (!isUser || !fedAt(p)) continue;
      powered.add(k);
      const wasOn = this.powered.has(k);
      // TNT lights even when placed next to power; launchers wait for a new signal.
      if (!wasOn && (id === TNT || this.known.has(k))) started.push([...p, id]);
    }
    this.powered = powered;

    // 3. Torches turn off when the block under them has power, and repeaters
    // pass on what reaches their back (both a tick later).
    const unlit = new Set<string>();
    const nextRepeaters = new Set<string>();
    for (const p of active) {
      const id = get(...p);
      const k = key(...p);
      if (REPEATERS.has(id)) {
        if (
          fedFrom(
            p,
            FACING_STEPS[id - REPEATER]!.map((v) => (v === 0 ? 0 : -v)),
          )
        )
          nextRepeaters.add(k);
        continue;
      }
      if (id !== REDSTONE_TORCH) continue;
      const off = strong(p[0], p[1] - 1, p[2]) || weak(p[0], p[1] - 1, p[2]);
      if (off) unlit.add(k);
      if (off !== this.unlit.has(k)) this.flipped(k);
    }
    this.unlit = unlit;
    this.repeatersOn = nextRepeaters;

    // 4. How things look.
    const looks: Look[] = [];
    const seen = new Set<string>();
    const show = (k: string, x: number, y: number, z: number, look: number | null) => {
      seen.add(k);
      if ((this.looks.get(k) ?? null) === look) return;
      if (look === null) this.looks.delete(k);
      else this.looks.set(k, look);
      looks.push([x, y, z, look]);
    };
    for (const [x, y, z] of active) {
      const k = key(x, y, z);
      this.known.add(k);
      const id = get(x, y, z);
      let look: number | null = null;
      if (id === REDSTONE_WIRE && wireAt(x, y, z)) look = REDSTONE_WIRE_ON;
      if (id === REDSTONE_LAMP && powered.has(k)) look = REDSTONE_LAMP_ON;
      if (id === REDSTONE_TORCH && !lit(x, y, z)) look = REDSTONE_TORCH_OFF;
      if (PLATES.has(id) && pressed(x, y, z)) look = id + 1;
      if (REPEATERS.has(id) && nextRepeaters.has(k)) look = id + 4;
      if (doorLooks.has(k)) look = doorLooks.get(k)!;
      if (PISTONS_ALL.has(id) && this.extended.has(k)) {
        const f = getBlockType(id).facing!;
        look = PISTON_BASE_ON + f;
        const [hx, hy, hz] = add([x, y, z], FACING_STEPS[f]!);
        const head = (id >= STICKY_PISTON ? STICKY_HEAD : PISTON_HEAD) + f;
        show(key(hx, hy, hz), hx, hy, hz, head);
      }
      show(k, x, y, z, look);
    }
    // Removed parts go back to normal.
    for (const k of [...this.looks.keys()]) {
      if (seen.has(k) || this.parts.has(k)) continue;
      this.looks.delete(k);
      const [x, y, z] = k.split(',').map(Number) as Pos;
      looks.push([x, y, z, null]);
    }
    for (const k of [...this.known]) if (!this.parts.has(k)) this.known.delete(k);
    for (const k of [...this.extended]) if (!this.parts.has(k)) this.extended.delete(k);
    return { looks, started, moves, pistons };
  }

  /** Pushes a piston out (moving up to 12 blocks) or pulls it back in. */
  private updatePiston(
    world: CircuitWorld,
    p: Pos,
    id: number,
    on: boolean,
    moves: Edit[],
    sounds: Pos[],
  ): void {
    const k = key(...p);
    const out = this.extended.has(k);
    if (on === out) return;
    if (this.ticks - (this.pistonMoved.get(k) ?? -Infinity) < PISTONS.minTicks) return;
    const f = getBlockType(id).facing!;
    const step = FACING_STEPS[f]!;
    const get = (q: Pos) => world.getBlock(...q);
    const first = !this.known.has(k);
    if (on) {
      // The blocks in front, until a free spot.
      const line: [Pos, number][] = [];
      let end: Pos | null = null;
      for (let i = 1; i <= PISTONS.maxPush + 1; i++) {
        const q = add(p, step, i);
        const qid = get(q);
        if (isFragile(qid)) {
          end = q;
          break;
        }
        if (isStuck(qid) || i > PISTONS.maxPush) return;
        line.push([q, qid]);
      }
      if (!end) return;
      // A piston seen for the first time with power was pushed out already.
      if (line.length > 0 && !first) {
        if (world.mayPush && !world.mayPush(...p)) return;
        for (let i = line.length - 1; i >= 0; i--) {
          const [q, qid] = line[i]!;
          moves.push([...add(q, step), qid]);
        }
        moves.push([...line[0]![0], AIR]);
      } else if (line.length > 0) return;
      this.extended.add(k);
    } else {
      this.extended.delete(k);
      if (id >= STICKY_PISTON) {
        // A sticky piston pulls the block back with it.
        const front = add(p, step);
        const pulled = add(p, step, 2);
        const pid = get(pulled);
        const canPull = !isFragile(pid) && !isStuck(pid) && get(front) === AIR;
        if (canPull && (!world.mayPush || world.mayPush(...p))) {
          moves.push([...front, pid], [...pulled, AIR]);
        }
      }
    }
    this.pistonMoved.set(k, this.ticks);
    if (!first) sounds.push(p);
  }

  /** Dust joined to this dust: next to it, or one step up or down like stairs. */
  private joinedWires(
    get: (x: number, y: number, z: number) => number,
    x: number,
    y: number,
    z: number,
  ): Pos[] {
    const out: Pos[] = [];
    const isWire = (id: number) => id === REDSTONE_WIRE;
    const roof = isOpaque(get(x, y + 1, z));
    for (const [dx, dz] of FLAT) {
      const nx = x + dx;
      const nz = z + dz;
      if (isWire(get(nx, y, nz))) out.push([nx, y, nz]);
      if (!roof && isWire(get(nx, y + 1, nz))) out.push([nx, y + 1, nz]);
      if (!isOpaque(get(nx, y, nz)) && isWire(get(nx, y - 1, nz))) out.push([nx, y - 1, nz]);
    }
    return out;
  }

  /** A torch blinking too fast burns out for a while (like Minecraft). */
  private flipped(k: string): void {
    const recent = (this.flips.get(k) ?? []).filter((t) => this.ticks - t < REDSTONE.burnoutWindow);
    recent.push(this.ticks);
    this.flips.set(k, recent);
    if (recent.length >= REDSTONE.burnoutFlips) {
      this.burntUntil.set(k, this.ticks + REDSTONE.burnoutTicks);
      this.flips.delete(k);
    }
  }
}
