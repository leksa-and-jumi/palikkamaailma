import { describe, expect, it } from 'vitest';
import { CHEST, FURNACE } from './blocks';
import {
  advanceFurnace,
  containerItems,
  emptyContainer,
  parseContainer,
  type FurnaceState,
} from './containers';
import { itemId } from './items';

function furnace(): FurnaceState {
  return emptyContainer(FURNACE, 0) as FurnaceState;
}

describe('furnace', () => {
  it('smelts raw iron with coal, 10 seconds each', () => {
    const f = furnace();
    f.input = { id: itemId('raw_iron'), count: 3 };
    f.fuel = { id: itemId('coal'), count: 1 };
    advanceFurnace(f, 25_000);
    expect(f.output).toEqual({ id: itemId('iron_ingot'), count: 2 });
    expect(f.input).toEqual({ id: itemId('raw_iron'), count: 1 });
    expect(f.fuel).toBeNull();
    expect(f.burnLeft).toBeCloseTo(55);
  });

  it('keeps working while nobody looks, until the fuel ends', () => {
    const f = furnace();
    f.input = { id: itemId('sand'), count: 64 };
    f.fuel = { id: itemId('planks'), count: 2 };
    advanceFurnace(f, 3_600_000);
    // Two planks burn 30 s = 3 glass.
    expect(f.output).toEqual({ id: itemId('glass'), count: 3 });
    expect(f.burnLeft).toBe(0);
  });

  it('does not burn fuel when there is nothing to cook', () => {
    const f = furnace();
    f.fuel = { id: itemId('coal'), count: 5 };
    advanceFurnace(f, 100_000);
    expect(f.fuel).toEqual({ id: itemId('coal'), count: 5 });
  });

  it('leaves the bucket when lava burns', () => {
    const f = furnace();
    f.input = { id: itemId('beef'), count: 1 };
    f.fuel = { id: itemId('lava_bucket'), count: 1 };
    advanceFurnace(f, 11_000);
    expect(f.fuel).toEqual({ id: itemId('bucket'), count: 1 });
    expect(f.output).toEqual({ id: itemId('cooked_beef'), count: 1 });
  });
});

describe('containers', () => {
  it('makes an empty chest of 27 slots', () => {
    const chest = emptyContainer(CHEST, 0);
    expect(chest?.kind).toBe('chest');
    expect(chest && chest.kind === 'chest' && chest.slots.length).toBe(27);
  });

  it('lists the items inside', () => {
    const f = furnace();
    f.input = { id: itemId('sand'), count: 2 };
    f.output = { id: itemId('glass'), count: 1 };
    expect(containerItems(f)).toHaveLength(2);
  });

  it('checks data from the network', () => {
    expect(parseContainer({ kind: 'chest', slots: [] }, 0)).toBeNull();
    const ok = parseContainer({ kind: 'furnace', input: { id: 4, count: 1 }, updated: 5 }, 10);
    expect(ok).toMatchObject({ kind: 'furnace', input: { id: 4, count: 1 }, fuel: null });
    expect(parseContainer({ kind: 'oven' }, 0)).toBeNull();
  });
});
