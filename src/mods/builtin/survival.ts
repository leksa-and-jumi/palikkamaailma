// Mods that make surviving easier.

import type { Mod } from '../types';

export const fastMining: Mod = {
  id: 'fast-mining',
  emoji: '⛏️',
  name: 'Superhakku',
  description: 'Palikat rikkoutuvat neljä kertaa nopeammin.',
  effects: { miningSpeed: 4 },
};

export const neverHungry: Mod = {
  id: 'never-hungry',
  emoji: '🍗',
  name: 'Ei nälkää',
  description: 'Vatsa pysyy täynnä, vaikka juoksisit koko päivän.',
  effects: { hunger: 0 },
};

export const noMonsters: Mod = {
  id: 'no-monsters',
  emoji: '🕊️',
  name: 'Rauhallinen yö',
  description: 'Uusia hirviöitä ei tule, eläimet ja kyläläiset ovat ennallaan.',
  effects: { noMonsters: true },
};
