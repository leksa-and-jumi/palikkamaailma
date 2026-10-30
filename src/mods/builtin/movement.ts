// Mods that change how you move.

import type { Mod } from '../types';

export const moonJump: Mod = {
  id: 'moon-jump',
  emoji: '🌙',
  name: 'Kuuhyppy',
  description: 'Painovoima on kuin kuussa: hyppäät korkealle ja leijailet alas.',
  effects: { gravity: 0.35 },
};

export const superSpeed: Mod = {
  id: 'super-speed',
  emoji: '⚡',
  name: 'Salamajalat',
  description: 'Juokset melkein kaksi kertaa nopeammin.',
  effects: { walkSpeed: 1.8 },
};
