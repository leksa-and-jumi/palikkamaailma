// Redstone (punakivi): levers, buttons, redstone blocks and redstone torches
// give power, dust carries it (one step weaker per block, 15 at most), and
// lamps, TNT and firework launchers use it. Rules are a simpler Minecraft.
//
// Only the switches are stored in the world (a lever is on or off). Everything
// else (which dust glows, which lamp is lit) is worked out again on every
// computer from the same blocks, so nothing extra is sent over the network.

import { REDSTONE } from '../config';
import {
  BUTTON,
  BUTTON_ON,
  FIREWORK_LAUNCHER,
  LEVER,
  LEVER_ON,
  REDSTONE_BLOCK,
  REDSTONE_LAMP,
  REDSTONE_LAMP_ON,
  REDSTONE_TORCH,
  REDSTONE_TORCH_OFF,
  REDSTONE_WIRE,
  REDSTONE_WIRE_ON,
  TNT,
  isOpaque,
} from './blocks';

export interface CircuitWorld {
  /** The real block (never the redstone look). */
  getBlock(x: number, y: number, z: number): number;
  /** Is this part of the world in memory? Far away circuits wait. */
  isLoaded(x: number, z: number): boolean;
}

/** A block that should look different: [x, y, z, look id or null for normal]. */
export type Look = [number, number, number, number | null];

export interface TickResult {
  looks: Look[];
  /** TNT and launchers that just got power: [x, y, z, block id]. */
  started: [number, number, number, number][];
}

const REDSTONE_THINGS = new Set([
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
]);

/** Does redstone dust join this block (and does the circuit care about it)? */
export function isRedstoneThing(id: number): boolean {
  return REDSTONE_THINGS.has(id);
}

/** Things that use power. */
const USERS = new Set([REDSTONE_LAMP, TNT, FIREWORK_LAUNCHER]);

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

export class Circuit {
  /** Every redstone block in the world (they only come from players). */
  private readonly parts = new Map<string, Pos>();
  private wire = new Map<string, number>();
  private unlit = new Set<string>();
  private powered = new Set<string>();
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

  /** One redstone tick (Minecraft: 0.1 s). */
  tick(world: CircuitWorld): TickResult {
    this.ticks++;
    const get = (x: number, y: number, z: number) => world.getBlock(x, y, z);
    const opaque = (x: number, y: number, z: number) => isOpaque(get(x, y, z));
    const lit = (x: number, y: number, z: number) => {
      const k = key(x, y, z);
      return !this.unlit.has(k) && (this.burntUntil.get(k) ?? 0) <= this.ticks;
    };
    const isSource = (x: number, y: number, z: number) => {
      const id = get(x, y, z);
      if (id === LEVER_ON || id === BUTTON_ON || id === REDSTONE_BLOCK) return true;
      return id === REDSTONE_TORCH && lit(x, y, z);
    };
    /** A solid block a lever touches, or with a lit torch under it. */
    const strong = (x: number, y: number, z: number) => {
      if (!opaque(x, y, z)) return false;
      if (get(x, y - 1, z) === REDSTONE_TORCH && lit(x, y - 1, z)) return true;
      return SIDES.some(([dx, dy, dz]) => {
        const id = get(x + dx, y + dy, z + dz);
        return id === LEVER_ON || id === BUTTON_ON;
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
    for (const [x, y, z] of wires) {
      const fed = SIDES.some(([dx, dy, dz]) => {
        const [nx, ny, nz] = [x + dx, y + dy, z + dz];
        return isSource(nx, ny, nz) || strong(nx, ny, nz);
      });
      if (fed) {
        wire.set(key(x, y, z), REDSTONE.maxPower);
        queue.push([x, y, z]);
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
    const fedAt = (x: number, y: number, z: number) =>
      SIDES.some(([dx, dy, dz]) => {
        const [nx, ny, nz] = [x + dx, y + dy, z + dz];
        // A torch never powers the block it stands on.
        if (dy === 1 && get(nx, ny, nz) === REDSTONE_TORCH) return false;
        if (isSource(nx, ny, nz) || wireAt(nx, ny, nz)) return true;
        return strong(nx, ny, nz) || weak(nx, ny, nz);
      });

    // 2. Lamps, TNT and launchers.
    const powered = new Set<string>();
    const started: TickResult['started'] = [];
    for (const p of active) {
      const id = get(...p);
      if (!USERS.has(id) || !fedAt(...p)) continue;
      const k = key(...p);
      powered.add(k);
      const wasOn = this.powered.has(k);
      // TNT lights even when placed next to power; launchers wait for a new signal.
      if (!wasOn && (id === TNT || this.known.has(k))) started.push([...p, id]);
    }
    this.powered = powered;

    // 3. Torches turn off when the block under them has power (next tick).
    const unlit = new Set<string>();
    for (const [x, y, z] of active) {
      if (get(x, y, z) !== REDSTONE_TORCH) continue;
      const k = key(x, y, z);
      const off = strong(x, y - 1, z) || weak(x, y - 1, z);
      if (off) unlit.add(k);
      if (off !== this.unlit.has(k)) this.flipped(k);
    }
    this.unlit = unlit;

    // 4. How things look.
    const looks: Look[] = [];
    const seen = new Set<string>();
    for (const [x, y, z] of active) {
      const k = key(x, y, z);
      this.known.add(k);
      seen.add(k);
      const id = get(x, y, z);
      let look: number | null = null;
      if (id === REDSTONE_WIRE && wireAt(x, y, z)) look = REDSTONE_WIRE_ON;
      if (id === REDSTONE_LAMP && powered.has(k)) look = REDSTONE_LAMP_ON;
      if (id === REDSTONE_TORCH && !lit(x, y, z)) look = REDSTONE_TORCH_OFF;
      if ((this.looks.get(k) ?? null) === look) continue;
      if (look === null) this.looks.delete(k);
      else this.looks.set(k, look);
      looks.push([x, y, z, look]);
    }
    // Removed parts go back to normal.
    for (const k of [...this.looks.keys()]) {
      if (seen.has(k) || this.parts.has(k)) continue;
      this.looks.delete(k);
      const [x, y, z] = k.split(',').map(Number) as Pos;
      looks.push([x, y, z, null]);
    }
    for (const k of [...this.known]) if (!this.parts.has(k)) this.known.delete(k);
    return { looks, started };
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
