import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config';
import { AIR, FENCE, LADDER, OAK_DOOR, OAK_SLAB, STONE } from './blocks';
import { blockQuery } from './blockShapes';
import { createPlayer, stepPlayer, type BlockQuery, type MoveInput } from './physics';

const NO_INPUT: MoveInput = { forward: 0, right: 0, jump: false, down: false, sprint: false };

/** A flat floor at y = 10 (top surface at 11) and a wall at x = 20. */
const flat: BlockQuery = {
  isSolid: (x, y) => y <= 10 || (x === 20 && y <= 13),
  isLiquid: () => false,
};

function simulate(
  world: BlockQuery,
  input: MoveInput,
  seconds: number,
  start = createPlayer(15.5, 11, 5.5),
) {
  for (let t = 0; t < seconds; t += 1 / 60) stepPlayer(world, start, input, 1 / 60);
  return start;
}

describe('physics', () => {
  it('falls down and stands on the ground', () => {
    const p = simulate(flat, NO_INPUT, 2, createPlayer(15.5, 20, 5.5));
    expect(p.y).toBeCloseTo(11, 2);
    expect(p.onGround).toBe(true);
  });

  it('jumps up and comes back down', () => {
    const p = simulate(flat, NO_INPUT, 0.5);
    p.vy = 0;
    stepPlayer(flat, p, { ...NO_INPUT, jump: true }, 1 / 60);
    let highest = p.y;
    for (let i = 0; i < 60; i++) {
      stepPlayer(flat, p, NO_INPUT, 1 / 60);
      highest = Math.max(highest, p.y);
    }
    expect(highest).toBeGreaterThan(12);
    expect(highest).toBeLessThan(11 + 2);
    expect(p.y).toBeCloseTo(11, 2);
  });

  it('stops at a wall', () => {
    const p = createPlayer(15.5, 11, 5.5);
    p.yaw = -Math.PI / 2; // looking towards +x
    simulate(flat, { ...NO_INPUT, forward: 1 }, 3, p);
    expect(p.x).toBeLessThan(20 - PLAYER.width / 2 + 0.01);
    expect(p.x).toBeGreaterThan(19);
  });

  it('flies up when flying and jump is held', () => {
    const p = createPlayer(15.5, 11, 5.5);
    p.flying = true;
    simulate(flat, { ...NO_INPUT, jump: true }, 1, p);
    expect(p.y).toBeGreaterThan(15);
  });

  it('sinks slowly in water', () => {
    const water: BlockQuery = { isSolid: (_x, y) => y <= 0, isLiquid: (_x, y) => y <= 20 };
    const p = simulate(water, NO_INPUT, 1, createPlayer(5.5, 15, 5.5));
    expect(p.y).toBeGreaterThan(11);
  });
});

describe('standing still', () => {
  it('stays on the ground every frame, so jumping always works', () => {
    const p = simulate(flat, NO_INPUT, 1);
    for (let i = 0; i < 30; i++) {
      stepPlayer(flat, p, NO_INPUT, 1 / 60);
      expect(p.onGround).toBe(true);
    }
  });
});

describe('boxes, steps and ladders', () => {
  /** A floor at y = 10 and one more block at (16, 11, 5) given by `id`. */
  function withBlock(id: number): BlockQuery {
    return blockQuery((x, y, z) => (y <= 10 ? STONE : x === 16 && y === 11 && z === 5 ? id : AIR));
  }
  const east = () => {
    const p = createPlayer(15.5, 11, 5.5);
    p.yaw = -Math.PI / 2;
    return p;
  };

  it('walks up a slab without jumping', () => {
    const p = simulate(withBlock(OAK_SLAB), { ...NO_INPUT, forward: 1 }, 0.25, east());
    expect(p.x).toBeGreaterThan(16.3);
    expect(p.y).toBeGreaterThan(11.4);
  });

  it('does not walk up a whole block', () => {
    const p = simulate(withBlock(STONE), { ...NO_INPUT, forward: 1 }, 1, east());
    expect(p.x).toBeLessThan(16);
    expect(p.y).toBeCloseTo(11, 2);
  });

  it('bumps into a closed door but walks through an open one', () => {
    // A door facing east has its panel on the west side of the block.
    const closed = simulate(withBlock(OAK_DOOR + 1), { ...NO_INPUT, forward: 1 }, 1, east());
    expect(closed.x).toBeLessThan(16);
    const open = simulate(withBlock(OAK_DOOR + 4 + 1), { ...NO_INPUT, forward: 1 }, 1, east());
    expect(open.x).toBeGreaterThan(17);
  });

  it('can not jump over a fence', () => {
    const p = east();
    for (let i = 0; i < 120; i++) {
      stepPlayer(withBlock(FENCE), p, { ...NO_INPUT, forward: 1, jump: true }, 1 / 60);
    }
    expect(p.x).toBeLessThan(16.4);
  });

  it('climbs up a ladder', () => {
    const ladders = blockQuery((x, y, z) =>
      y <= 10 ? STONE : x === 16 && z === 5 ? STONE : x === 15 && z === 5 ? LADDER + 3 : AIR,
    );
    const p = simulate(ladders, { ...NO_INPUT, forward: 1 }, 1, east());
    expect(p.y).toBeGreaterThan(12.5);
    expect(p.onLadder).toBe(true);
  });
});
