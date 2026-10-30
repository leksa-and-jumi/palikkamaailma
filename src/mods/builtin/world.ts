// Mods that change the world around you (only how it behaves, never its blocks).

import type { Recipe } from '../../logic/recipes';
import type { Mod } from '../types';

export const alwaysDay: Mod = {
  id: 'always-day',
  emoji: '☀️',
  name: 'Ikuinen päivä',
  description: 'Aurinko paistaa aina keskipäivän korkeudelta.',
  effects: { timeOfDay: 0.25 },
};

const EASY_RECIPES: readonly Recipe[] = [
  { kind: 'shapeless', ingredients: ['gravel'], result: { key: 'flint', count: 1 } },
  {
    kind: 'shapeless',
    ingredients: ['rotten_flesh', 'rotten_flesh'],
    result: { key: 'leather', count: 1 },
  },
  { kind: 'shapeless', ingredients: ['bone'], result: { key: 'white', count: 1 } },
];

export const easyRecipes: Mod = {
  id: 'easy-recipes',
  emoji: '📜',
  name: 'Helpot reseptit',
  description: 'Sora → piikivi, 2 mätää lihaa → nahka, luu → valkoinen villa.',
  effects: { recipes: EASY_RECIPES },
};

const RAINBOW = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x0a84ff, 0xaf52de];

export const rainbowTrail: Mod = {
  id: 'rainbow-trail',
  emoji: '🌈',
  name: 'Sateenkaarijälki',
  description: 'Jalkojesi perään jää kimalteleva sateenkaari.',
  tick(api) {
    const p = api.player;
    if (Math.hypot(p.vx, p.vz) < 0.5) return;
    const color = RAINBOW[Math.floor(performance.now() / 120) % RAINBOW.length]!;
    api.sparkle(p.x, p.y + 0.15, p.z, color);
  },
  onEnable(api) {
    api.toast('🌈 Sateenkaari seuraa sinua!');
  },
};
