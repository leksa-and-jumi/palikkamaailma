// Every mod in the game, in the order the mods window shows them.
// A new mod: write it in builtin/ and add it here (see CLAUDE.md "Modit").

import { moonJump, superSpeed } from './builtin/movement';
import { fastMining, neverHungry, noMonsters } from './builtin/survival';
import { alwaysDay, easyRecipes, rainbowTrail } from './builtin/world';
import type { Mod, Trophy } from './types';

export const MODS: readonly Mod[] = [
  moonJump,
  superSpeed,
  fastMining,
  neverHungry,
  noMonsters,
  alwaysDay,
  easyRecipes,
  rainbowTrail,
];

const BY_ID = new Map(MODS.map((m) => [m.id, m]));

export function modById(id: string): Mod | undefined {
  return BY_ID.get(id);
}

/** Every trophy any mod can give, in mod order. */
export function allTrophies(): { mod: Mod; trophy: Trophy }[] {
  return MODS.flatMap((mod) => (mod.trophies ?? []).map((trophy) => ({ mod, trophy })));
}
