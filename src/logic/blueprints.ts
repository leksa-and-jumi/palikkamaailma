// Ready-made builds for the magic builder. Used for the quick buttons and
// whenever the AI is not available (no internet or no OpenRouter key).

import type { Shape } from './shapes';

export interface Blueprint {
  id: string;
  emoji: string;
  /** Finnish name on the button. */
  name: string;
  /** Words that pick this blueprint when typed (Finnish and English). */
  words: readonly string[];
  shapes: readonly Shape[];
}

export const BLUEPRINTS: readonly Blueprint[] = [
  {
    id: 'house',
    emoji: '🏠',
    name: 'Talo',
    words: ['talo', 'mökki', 'koti', 'house', 'home'],
    shapes: [
      { shape: 'box', block: 'cobblestone', from: [0, 0, 0], to: [6, 0, 6] },
      { shape: 'walls', block: 'planks', from: [0, 1, 0], to: [6, 3, 6] },
      { shape: 'box', block: 'log', from: [0, 1, 0], to: [0, 3, 0] },
      { shape: 'box', block: 'log', from: [6, 1, 0], to: [6, 3, 0] },
      { shape: 'box', block: 'log', from: [0, 1, 6], to: [0, 3, 6] },
      { shape: 'box', block: 'log', from: [6, 1, 6], to: [6, 3, 6] },
      { shape: 'box', block: 'air', from: [3, 1, 0], to: [3, 2, 0] },
      { shape: 'box', block: 'glass', from: [1, 2, 0], to: [1, 2, 0] },
      { shape: 'box', block: 'glass', from: [5, 2, 0], to: [5, 2, 0] },
      { shape: 'box', block: 'glass', from: [0, 2, 3], to: [0, 2, 3] },
      { shape: 'box', block: 'glass', from: [6, 2, 3], to: [6, 2, 3] },
      { shape: 'pyramid', block: 'brick', center: [3, 4, 3], radius: 4 },
      { shape: 'box', block: 'lamp', from: [3, 3, 3], to: [3, 3, 3] },
    ],
  },
  {
    id: 'tower',
    emoji: '🗼',
    name: 'Torni',
    words: ['torni', 'tower', 'majakka'],
    shapes: [
      { shape: 'cylinder', block: 'cobblestone', center: [0, 0, 3], radius: 3, height: 14 },
      { shape: 'cylinder', block: 'air', center: [0, 1, 3], radius: 2, height: 13 },
      { shape: 'box', block: 'air', from: [0, 1, 0], to: [0, 2, 0] },
      { shape: 'cylinder', block: 'planks', center: [0, 14, 3], radius: 4, height: 1 },
      { shape: 'walls', block: 'cobblestone', from: [-4, 15, -1], to: [4, 15, 7] },
      { shape: 'box', block: 'lamp', from: [0, 15, 3], to: [0, 15, 3] },
    ],
  },
  {
    id: 'castle',
    emoji: '🏰',
    name: 'Linna',
    words: ['linna', 'castle', 'linnoitus', 'palatsi'],
    shapes: [
      { shape: 'walls', block: 'stone', from: [0, 0, 0], to: [14, 5, 14] },
      { shape: 'box', block: 'air', from: [6, 0, 0], to: [8, 3, 0] },
      { shape: 'cylinder', block: 'cobblestone', center: [0, 0, 0], radius: 2, height: 9 },
      { shape: 'cylinder', block: 'cobblestone', center: [14, 0, 0], radius: 2, height: 9 },
      { shape: 'cylinder', block: 'cobblestone', center: [0, 0, 14], radius: 2, height: 9 },
      { shape: 'cylinder', block: 'cobblestone', center: [14, 0, 14], radius: 2, height: 9 },
      { shape: 'pyramid', block: 'blue', center: [0, 9, 0], radius: 2 },
      { shape: 'pyramid', block: 'blue', center: [14, 9, 0], radius: 2 },
      { shape: 'pyramid', block: 'blue', center: [0, 9, 14], radius: 2 },
      { shape: 'pyramid', block: 'blue', center: [14, 9, 14], radius: 2 },
      { shape: 'box', block: 'planks', from: [4, 0, 4], to: [10, 8, 10] },
      { shape: 'box', block: 'air', from: [7, 0, 4], to: [7, 1, 4] },
      { shape: 'box', block: 'gold', from: [7, 9, 7], to: [7, 11, 7] },
      { shape: 'box', block: 'red', from: [8, 11, 7], to: [9, 11, 7] },
    ],
  },
  {
    id: 'tree',
    emoji: '🌳',
    name: 'Iso puu',
    words: ['puu', 'tree', 'metsä'],
    shapes: [
      { shape: 'box', block: 'log', from: [0, 0, 3], to: [1, 9, 4] },
      { shape: 'sphere', block: 'leaves', center: [0, 11, 3], radius: 5 },
    ],
  },
  {
    id: 'pyramid',
    emoji: '🔺',
    name: 'Pyramidi',
    words: ['pyramidi', 'pyramid', 'egypti'],
    shapes: [
      { shape: 'pyramid', block: 'sand', center: [0, 0, 8], radius: 8 },
      { shape: 'box', block: 'air', from: [0, 0, 0], to: [0, 1, 4] },
      { shape: 'box', block: 'gold', from: [0, 8, 8], to: [0, 8, 8] },
    ],
  },
  {
    id: 'snowman',
    emoji: '⛄',
    name: 'Lumiukko',
    words: ['lumiukko', 'snowman', 'lumi'],
    shapes: [
      { shape: 'sphere', block: 'snow', center: [0, 2, 3], radius: 3 },
      { shape: 'sphere', block: 'snow', center: [0, 6, 3], radius: 2 },
      { shape: 'sphere', block: 'snow', center: [0, 9, 3], radius: 1 },
      { shape: 'box', block: 'black', from: [-1, 9, 2], to: [-1, 9, 2] },
      { shape: 'box', block: 'black', from: [1, 9, 2], to: [1, 9, 2] },
      { shape: 'box', block: 'orange', from: [0, 9, 1], to: [0, 9, 1] },
    ],
  },
];

/** Finds a blueprint that matches the typed words, if any. */
export function findBlueprint(prompt: string): Blueprint | undefined {
  const words = prompt.toLowerCase().split(/[^a-zåäö]+/);
  return BLUEPRINTS.find((b) => b.words.some((w) => words.some((typed) => typed.startsWith(w))));
}
