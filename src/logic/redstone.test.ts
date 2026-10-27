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
  OAK_DOOR,
  PISTON,
  POWERED_RAIL,
  POWERED_RAIL_ON,
  PISTON_BASE_ON,
  PISTON_HEAD,
  REPEATER,
  REPEATER_ON,
  STICKY_PISTON,
  STONE,
  STONE_PLATE,
  STONE_PLATE_ON,
  TNT,
  WALL_LEVER_ON,
  WOOL_RED,
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

  pressedAt: string | null = null;

  isPressed(x: number, y: number, z: number): boolean {
    return this.pressedAt === `${x},${y},${z}`;
  }

  /** Applies piston moves like the game does. */
  apply(result: TickResult): TickResult {
    for (const [x, y, z, id] of result.moves) this.set(x, y, z, id);
    return result;
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks.set(`${x},${y},${z}`, id);
    this.circuit.track(x, y, z, id);
  }

  tick(times = 1): TickResult {
    let result: TickResult = { looks: [], started: [], moves: [], pistons: [] };
    for (let i = 0; i < times; i++) result = this.apply(this.circuit.tick(this));
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

  it('a repeater passes the signal on a tick later at full strength', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, LEVER);
    // The repeater faces east (+x): power goes in at the back and out the front.
    w.set(1, 1, 0, REPEATER + 1);
    w.set(2, 1, 0, REDSTONE_WIRE);
    w.tick();
    w.set(0, 1, 0, LEVER_ON);
    const first = w.tick();
    expect(w.circuit.wirePower(2, 1, 0)).toBe(0);
    w.tick();
    expect(w.circuit.wirePower(2, 1, 0)).toBe(15);
    expect(first.looks).toContainEqual([1, 1, 0, REPEATER_ON + 1]);
  });

  it('a repeater only gives power forward', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, LEVER_ON);
    w.set(1, 1, 0, REPEATER + 3);
    w.set(2, 1, 0, REDSTONE_WIRE);
    w.tick(3);
    expect(w.circuit.wirePower(2, 1, 0)).toBe(0);
  });

  it('a lever on a wall opens an iron door through the wall block', () => {
    const w = new TestWorld();
    const iron = OAK_DOOR + 16;
    w.set(1, 1, 0, iron);
    w.set(1, 2, 0, iron + 8);
    w.set(0, 2, 0, STONE);
    w.set(-1, 2, 0, WALL_LEVER_ON + 3);
    const { looks } = w.tick();
    expect(looks).toContainEqual([1, 1, 0, iron + 4]);
    expect(looks).toContainEqual([1, 2, 0, iron + 8 + 4]);
  });

  it('a pressure plate powers what is next to it while someone stands on it', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, STONE_PLATE);
    w.set(1, 1, 0, REDSTONE_LAMP);
    w.tick();
    expect(w.circuit.isPowered(1, 1, 0)).toBe(false);
    w.pressedAt = '0,1,0';
    const { looks } = w.tick();
    expect(w.circuit.isPowered(1, 1, 0)).toBe(true);
    expect(looks).toContainEqual([0, 1, 0, STONE_PLATE_ON]);
  });

  it('a piston pushes blocks and a sticky piston pulls one back', () => {
    const w = new TestWorld();
    // Facing east, with wool and stone in front.
    w.set(0, 1, 0, STICKY_PISTON + 1);
    w.set(1, 1, 0, WOOL_RED);
    w.set(2, 1, 0, STONE);
    w.set(0, 1, 1, LEVER);
    w.tick(4);
    w.set(0, 1, 1, LEVER_ON);
    const out = w.tick();
    expect(out.pistons).toEqual([[0, 1, 0]]);
    expect(w.getBlock(1, 1, 0)).toBe(AIR);
    expect(w.getBlock(2, 1, 0)).toBe(WOOL_RED);
    expect(w.getBlock(3, 1, 0)).toBe(STONE);
    expect(out.looks).toContainEqual([0, 1, 0, PISTON_BASE_ON + 1]);
    expect(out.looks).toContainEqual([1, 1, 0, PISTON_HEAD + 6 + 1]);
    w.tick(4);
    w.set(0, 1, 1, LEVER);
    const back = w.tick();
    expect(w.getBlock(1, 1, 0)).toBe(WOOL_RED);
    expect(w.getBlock(2, 1, 0)).toBe(AIR);
    expect(back.looks).toContainEqual([1, 1, 0, null]);
  });

  it('a piston can not push more than 12 blocks', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, PISTON + 1);
    for (let x = 1; x <= 13; x++) w.set(x, 1, 0, WOOL_RED);
    w.set(0, 1, 1, LEVER);
    w.tick(4);
    w.set(0, 1, 1, LEVER_ON);
    const { moves } = w.tick();
    expect(moves).toEqual([]);
    expect(w.circuit.isExtended(0, 1, 0)).toBe(false);
  });

  it('only pushes when this computer may move blocks', () => {
    const w = new TestWorld();
    w.set(0, 1, 0, PISTON + 1);
    w.set(1, 1, 0, WOOL_RED);
    w.set(0, 1, 1, LEVER);
    w.tick(4);
    w.set(0, 1, 1, LEVER_ON);
    const blocked = {
      getBlock: (x: number, y: number, z: number) => w.getBlock(x, y, z),
      isLoaded: () => true,
      mayPush: () => false,
    };
    expect(w.circuit.tick(blocked).moves).toEqual([]);
    expect(w.circuit.isExtended(0, 1, 0)).toBe(false);
  });

  it('powers a line of powered rails up to 8 away', () => {
    const w = new TestWorld();
    w.set(-1, 1, 0, LEVER_ON);
    for (let x = 0; x < 12; x++) w.set(x, 1, 0, POWERED_RAIL + 1);
    const { looks } = w.tick();
    expect(looks).toContainEqual([0, 1, 0, POWERED_RAIL_ON + 1]);
    expect(looks).toContainEqual([8, 1, 0, POWERED_RAIL_ON + 1]);
    expect(looks).not.toContainEqual([9, 1, 0, POWERED_RAIL_ON + 1]);
  });
});
