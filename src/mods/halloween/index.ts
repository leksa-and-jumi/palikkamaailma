// 🎃 Kauhu-Halloween: six spooky main characters, each with its own story,
// weather and way to beat it. They only come in survival, one at a time at
// night (or with /kauhu), and only you see yours. Beat one for its trophy.
// Nothing is ever stored in the world: turn the mod off and it is all gone.

import type { Mod, ModApi, ModEffects, Trophy } from '../types';
import { captainLuukala } from './captain';
import { countBatula } from './count';
import type { Encounter } from './encounter';
import { me, burst } from './encounter';
import { mistMaiden } from './mistMaiden';
import { pumpkinKing } from './pumpkinKing';
import { silentOne } from './silent';
import { spiderQueen } from './spiderQueen';

/** The characters, in the order they first come. */
const CAST: readonly (() => Encounter)[] = [
  pumpkinKing,
  mistMaiden,
  countBatula,
  captainLuukala,
  spiderQueen,
  silentOne,
];

/** Seconds of night before the first visit, and between visits. */
const FIRST_WAIT = 40;
const WAIT_AFTER_WIN = 240;
const WAIT_AFTER_ESCAPE = 120;
/** Seconds between the lines a character says when it arrives. */
const LINE_GAP = 3.2;
const CONFETTI = [0xff9a2e, 0xffe040, 0xd860ff, 0x60ffd0, 0xffffff];

const MASTER: Trophy = {
  id: 'halloween-master',
  emoji: '👑',
  name: 'Halloweenin mestari',
  description: 'Voitit kaikki kuusi kauhuhahmoa.',
};

const TROPHIES: readonly Trophy[] = [...CAST.map((make) => make().trophy), MASTER];

let current: Encounter | null = null;
let wait = FIRST_WAIT;
let next = 0;
let lines: string[] = [];
let lineTimer = 0;

function stop(api: ModApi): void {
  current?.end(api);
  current = null;
  lines = [];
  api.atmosphere(null);
  api.bossBar(null);
}

/** The next character: one you have not beaten yet if there is one. */
function begin(api: ModApi, wonBefore: (id: string) => boolean): void {
  const order = CAST.map((make, i) => ({ make, i }));
  const fresh = order.filter(({ make }) => !wonBefore(make().trophy.id));
  const pool = fresh.length > 0 ? fresh : order;
  const pick = pool.find(({ i }) => i >= next) ?? pool[0]!;
  next = (pick.i + 1) % CAST.length;
  current = pick.make();
  api.atmosphere(current.mood);
  lines = [...current.intro];
  lineTimer = 0;
  current.start(api);
}

function finish(api: ModApi, outcome: 'won' | 'fled'): void {
  const c = current!;
  const at = me(api);
  if (outcome === 'won') {
    api.say(c.who, c.defeat);
    burst(api, { ...at, y: at.y + 1 }, CONFETTI, 60);
    api.sound('magic');
    if (api.trophy(c.trophy.id)) api.toast(`🏆 Uusi pokaali: ${c.trophy.emoji} ${c.trophy.name}!`);
    if (CAST.every((make) => api.hasTrophy(make().trophy.id)) && api.trophy(MASTER.id)) {
      setTimeout(() => api.toast(`🏆 ${MASTER.emoji} ${MASTER.name}! Voitit kaikki!`), 2500);
    }
    wait = WAIT_AFTER_WIN;
  } else {
    api.say(c.who, c.escape);
    wait = WAIT_AFTER_ESCAPE;
  }
  stop(api);
}

export const halloween: Mod = {
  id: 'halloween',
  emoji: '🎃',
  name: 'Kauhu-Halloween',
  description:
    'Kuusi jännää päähahmoa tulee öisin selviytyjä-tilassa – jokaisella oma tarina. Voita ne ja kerää pokaalit! (/kauhu)',
  trophies: TROPHIES,
  commands: [
    {
      names: ['kauhu', 'halloween'],
      help: '/kauhu – kutsu kauhuhahmo heti (/kauhu lopeta lopettaa)',
      run(api, args) {
        if (args.startsWith('lop') || args === 'stop') {
          if (current) {
            stop(api);
            api.toast('🕯️ Kauhuhahmo lähti. Hengähdä hetki!');
          }
          wait = WAIT_AFTER_ESCAPE;
          return;
        }
        if (api.mode !== 'survival') {
          api.toast('🛠️ Kauhuhahmot tulevat vain selviytyjä-tilassa.');
          return;
        }
        if (current) {
          api.toast(`${current.who.emoji} ${current.who.name} on jo täällä!`);
          return;
        }
        begin(api, (id) => api.hasTrophy(id));
      },
    },
  ],
  onEnable(api) {
    wait = FIRST_WAIT;
    api.toast('🎃 Kauhu-Halloween alkoi… odota yötä, jos uskallat!');
  },
  onDisable(api) {
    stop(api);
  },
  onHitActor(api, id, damage) {
    current?.hit(api, id, damage);
  },
  liveEffects(): ModEffects | null {
    return current?.effects?.() ?? null;
  },
  tick(api, dt) {
    if (api.mode !== 'survival' || api.dead) {
      // Creative is safe, and after dying the character leaves.
      if (current) stop(api);
      return;
    }
    if (current) {
      lineTimer -= dt;
      if (lines.length > 0 && lineTimer <= 0) {
        api.say(current.who, lines.shift()!);
        lineTimer = LINE_GAP;
      }
      const outcome = current.update(api, dt);
      if (outcome !== 'fight') finish(api, outcome);
      return;
    }
    if (!api.night) return;
    wait -= dt;
    if (wait <= 0) begin(api, (id) => api.hasTrophy(id));
  },
};

/** For tests: forget everything between runs. */
export function resetHalloween(): void {
  current = null;
  wait = FIRST_WAIT;
  next = 0;
  lines = [];
}
