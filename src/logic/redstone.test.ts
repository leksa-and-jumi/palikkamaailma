import { describe, expect, it } from 'vitest';
import {
  AIR,
  FIREWORK_LAUNCHER,
  LEVER,
  LEVER_ON,
  REDSTONE_LAMP,
  REDSTONE_LAMP_ON,
  REDSTONE_TORCH,
  REDSTONE_TORCH_OFF,
  REDSTONE_WIRE,
  REDSTONE_WIRE_ON,
  STONE,
  TNT,
} from './blocks';
import { Circuit, type CircuitWorld, type TickResult } from './redstone';

/** A tiny world: a stone floor at y = 0 and whatever we put on it. */
class TestWorld implements CircuitWorld {
  readonly blocks = new Map<string, number>();
  readonly circuit = new Circuit();

  getBlock(x: number, y: number, z: number): number {
    return this.blocks.get(`${x},${y},${z}`) ?? (y === 0 ? STONE : AIR);
  }

  isLoaded(): boolean {
    return true;
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks.set(`${x},${y},${z}`, id);
    this.circuit.track(x, y, z, id);
  }

  tick(times = 1): TickResult {
    let result: TickResult = { looks: [], started: [] };
    for (let i = 0; i < times; i++) result = this.circuit.tick(this);
    return result;
  }
}

/** A lever at x = 0, dust from x = 1 to `length`, and a lamp after it. */
function line(length: number): TestWorld {
  const w = new TestWorld();
  w.set(0, 1, 0, LEVER);
  for (let x = 1; x <= length; x++) w.set(x, 1, 0, REDSTONE_WIRE);
  w.set(length + 1, 1, 0, REDSTONE_LAMP);
  return w;
}

describe('redstone', () => {
  it('lights a lamp when the lever is turned on', () => {
    const w = line(3);
    w.tick();
    expect(w.circuit.isPowered(4, 1, 0)).toBe(false);
    w.set(0, 1, 0, LEVER_ON);
    const { looks } = w.tick();
    expect(w.circuit.isPowered(4, 1, 0)).toBe(true);
    expect(looks).toContainEqual([4, 1, 0, REDSTONE_LAMP_ON]);
    expect(looks).toContainEqual([1, 1, 0, REDSTONE_WIRE_ON]);
  });

  it('turns the lamp off again with the lever', () => {
    const w = line(3);
    w.set(0, 1, 0, LEVER_ON);
    w.tick();
    w.set(0, 1, 0, LEVER);
    const { looks } = w.tick();
    expect(w.circuit.isPowered(4, 1, 0)).toBe(false);
    expect(looks).toContainEqual([4, 1, 0, null]);
  });

  it('gets one weaker per block and stops after 15', () => {
    const w = line(16);
    w.set(0, 1, 0, LEVER_ON);
    w.tick();
    expect(w.circuit.wirePower(1, 1, 0)).toBe(15);
    expect(w.circuit.wirePower(5, 1, 0)).toBe(11);
    expect(w.circuit.wirePower(15, 1, 0)).toBe(1);
    expect(w.circuit.wirePower(16, 1, 0)).toBe(0);
    expect(w.circuit.isPowered(17, 1, 0)).toBe(false);
  });

  it('climbs up and down a step', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, LEVER_ON);
    w.set(1, 1, 0, REDSTONE_WIRE);
    w.set(2, 1, 0, STONE);
    w.set(2, 2, 0, REDSTONE_WIRE);
    w.set(3, 1, 0, REDSTONE_WIRE);
    w.tick();
    expect(w.circuit.wirePower(2, 2, 0)).toBe(14);
    expect(w.circuit.wirePower(3, 1, 0)).toBe(13);
  });

  it('a redstone torch turns off when its block gets power (NOT gate)', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, STONE);
    w.set(0, 2, 0, REDSTONE_TORCH);
    w.set(1, 1, 0, REDSTONE_WIRE);
    w.set(2, 1, 0, LEVER);
    w.set(0, 2, 1, REDSTONE_LAMP);
    w.tick(2);
    expect(w.circuit.isTorchLit(0, 2, 0)).toBe(true);
    expect(w.circuit.isPowered(0, 2, 1)).toBe(true);
    w.set(2, 1, 0, LEVER_ON);
    const looks = [...w.tick().looks, ...w.tick().looks];
    expect(w.circuit.isTorchLit(0, 2, 0)).toBe(false);
    expect(looks).toContainEqual([0, 2, 0, REDSTONE_TORCH_OFF]);
    w.tick();
    expect(w.circuit.isPowered(0, 2, 1)).toBe(false);
  });

  it('lights TNT and fires a launcher only when the power comes', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, LEVER);
    w.set(1, 1, 0, TNT);
    w.set(-1, 1, 0, FIREWORK_LAUNCHER);
    expect(w.tick().started).toEqual([]);
    w.set(0, 1, 0, LEVER_ON);
    const { started } = w.tick();
    expect(started).toContainEqual([1, 1, 0, TNT]);
    expect(started).toContainEqual([-1, 1, 0, FIREWORK_LAUNCHER]);
    // Still on: nothing new starts.
    expect(w.tick().started).toEqual([]);
  });

  it('a torch blinking too fast burns out', () => {
    // The torch powers dust that runs back round into its own block.
    const w = new TestWorld();
    w.set(0, 1, 0, STONE);
    w.set(0, 2, 0, REDSTONE_TORCH);
    w.set(1, 1, 0, STONE);
    w.set(1, 2, 0, REDSTONE_WIRE);
    for (const [x, z] of [
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
    ] as const) {
      w.set(x, 1, z, REDSTONE_WIRE);
    }
    let flips = 0;
    let last = true;
    for (let i = 0; i < 40; i++) {
      w.tick();
      const lit = w.circuit.isTorchLit(0, 2, 0);
      if (lit !== last) flips++;
      last = lit;
    }
    expect(flips).toBeGreaterThanOrEqual(7);
    expect(flips).toBeLessThan(20);
  });

  it('forgets removed blocks and shows them normally again', () => {
    const w = line(1);
    w.set(0, 1, 0, LEVER_ON);
    w.tick();
    w.set(1, 1, 0, AIR);
    const { looks } = w.tick();
    expect(looks).toContainEqual([1, 1, 0, null]);
    expect(w.circuit.size).toBe(2);
  });
});
