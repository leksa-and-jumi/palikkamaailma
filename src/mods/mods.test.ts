import { describe, expect, it } from 'vitest';
import { findRecipe } from '../logic/recipes';
import { itemId } from '../logic/items';
import { combineEffects } from './effects';
import { ModManager } from './manager';
import { MODS, modById } from './registry';
import type { ModApi } from './types';

function api(): ModApi & { toasts: string[]; sparks: number } {
  const state = {
    toasts: [] as string[],
    sparks: 0,
    player: { x: 0, y: 50, z: 0, vx: 3, vz: 0, onGround: true },
    toast(text: string) {
      state.toasts.push(text);
    },
    sparkle() {
      state.sparks++;
    },
  };
  return state;
}

describe('mods', () => {
  it('have unique ids that are safe to save', () => {
    const ids = MODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,32}$/);
    for (const m of MODS) expect(m.name.length).toBeGreaterThan(0);
  });

  it('put their rules together', () => {
    const e = combineEffects([
      modById('moon-jump')!,
      modById('super-speed')!,
      modById('always-day')!,
    ]);
    expect(e.gravity).toBeLessThan(1);
    expect(e.walkSpeed).toBeGreaterThan(1);
    expect(e.timeOfDay).toBe(0.25);
    expect(e.miningSpeed).toBe(1);
    expect(combineEffects([]).timeOfDay).toBeNull();
  });

  it('turn on and off, and their recipes come and go with them', () => {
    const mods = new ModManager(api());
    const gravel = [{ id: itemId('gravel'), count: 1 }, null, null, null];
    expect(findRecipe(gravel, 2)).toBeNull();
    mods.toggle('easy-recipes');
    expect(findRecipe(gravel, 2)?.result.key).toBe('flint');
    mods.toggle('easy-recipes');
    expect(findRecipe(gravel, 2)).toBeNull();
    expect(mods.ids).toEqual([]);
  });

  it('keep unknown ids from a newer game', () => {
    const mods = new ModManager(api());
    mods.set(['future-mod', 'never-hungry']);
    expect(mods.active.map((m) => m.id)).toEqual(['never-hungry']);
    expect(mods.ids).toEqual(['future-mod', 'never-hungry']);
    expect(mods.effects.hunger).toBe(0);
  });

  it('only do things that fade away when they run', () => {
    const a = api();
    const mods = new ModManager(a);
    mods.set(MODS.map((m) => m.id));
    mods.tick(0.1);
    expect(a.sparks).toBeGreaterThan(0);
    mods.stop();
    expect(mods.effects.walkSpeed).toBe(1);
  });
});
