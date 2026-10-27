import { describe, expect, it } from 'vitest';
import { AIR, POWERED_RAIL, POWERED_RAIL_ON, RAIL, STONE } from './blocks';
import { cartY, placeCart, stepCart, type CartWorld } from './minecart';

function world(blocks: Record<string, number>, shown: Record<string, number> = {}): CartWorld {
  const getBlock = (x: number, y: number, z: number) =>
    blocks[`${x},${y},${z}`] ?? (y <= 0 ? STONE : AIR);
  return {
    getBlock,
    shownBlock: (x, y, z) => shown[`${x},${y},${z}`] ?? getBlock(x, y, z),
  };
}

function run(w: CartWorld, cart: ReturnType<typeof placeCart>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) stepCart(cart!, w, 1 / 60);
  return cart!;
}

/** East–west rails from x = 0 to x = length - 1 at y = 1. */
function line(length: number, extra: Record<string, number> = {}) {
  const blocks: Record<string, number> = { ...extra };
  for (let x = 0; x < length; x++) blocks[`${x},1,0`] ??= RAIL + 1;
  return blocks;
}

describe('minecarts', () => {
  it('rolls along a straight track and slows down', () => {
    const w = world(line(30));
    const cart = placeCart(w.getBlock, 2, 1, 0)!;
    cart.heading = 1;
    cart.speed = 4;
    run(w, cart, 1);
    expect(cart.x).toBeGreaterThan(5.5);
    expect(cart.speed).toBeLessThan(4);
    expect(cart.z).toBeCloseTo(0.5);
  });

  it('stops at the end of the track', () => {
    const w = world(line(5));
    const cart = placeCart(w.getBlock, 1, 1, 0)!;
    cart.heading = 1;
    cart.speed = 6;
    run(w, cart, 3);
    expect(cart.speed).toBe(0);
    expect(cart.cell).toEqual([4, 1, 0]);
    expect(cart.x).toBeLessThan(5);
  });

  it('goes round a curve', () => {
    // East along z = 0, then a curve at x = 3 turning south (west–south curve).
    const blocks = line(3);
    blocks['3,1,0'] = RAIL + 8;
    for (let z = 1; z < 10; z++) blocks[`3,1,${z}`] = RAIL;
    const w = world(blocks);
    const cart = placeCart(w.getBlock, 0, 1, 0)!;
    cart.heading = 1;
    cart.speed = 5;
    run(w, cart, 1);
    expect(cart.heading).toBe(2);
    expect(cart.x).toBeCloseTo(3.5);
    expect(cart.z).toBeGreaterThan(2);
  });

  it('speeds up going down a slope and climbs up one', () => {
    // Flat at y = 2 (on stone), a slope at x = 2 climbing west, then flat at y = 1.
    const blocks: Record<string, number> = {
      '0,1,0': STONE,
      '1,1,0': STONE,
      '0,2,0': RAIL + 1,
      '1,2,0': RAIL + 1,
      '2,1,0': RAIL + 5,
    };
    for (let x = 3; x < 20; x++) blocks[`${x},1,0`] = RAIL + 1;
    const w = world(blocks);
    const cart = placeCart(w.getBlock, 0, 2, 0)!;
    cart.heading = 1;
    cart.speed = 1;
    let highest = 0;
    for (let i = 0; i < 240; i++) {
      stepCart(cart, w, 1 / 60);
      highest = Math.max(highest, cart.speed);
    }
    expect(cart.cell[1]).toBe(1);
    expect(highest).toBeGreaterThan(1.3);
    expect(cartY(cart, w.getBlock)).toBeCloseTo(1);
  });

  it('a powered rail pushes, an unpowered one brakes', () => {
    const on = line(40, { '5,1,0': POWERED_RAIL + 1 });
    const powered = world(on, { '5,1,0': POWERED_RAIL_ON + 1 });
    const fast = placeCart(powered.getBlock, 3, 1, 0)!;
    fast.heading = 1;
    fast.speed = 2;
    run(powered, fast, 1.2);
    expect(fast.speed).toBeGreaterThan(3);
    const off = world(on);
    const slow = placeCart(off.getBlock, 3, 1, 0)!;
    slow.heading = 1;
    slow.speed = 2;
    run(off, slow, 2);
    expect(slow.speed).toBe(0);
    expect(slow.cell[0]).toBe(5);
  });
});
