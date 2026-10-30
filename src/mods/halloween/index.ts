// 🎃 Kauhu-Halloween: six spooky main characters, each with its own story,
// weather and way to beat it. They only come for players in survival, one
// at a time at night (or with /kauhu). In multiplayer the host runs them and
// everyone near sees the same character and fights it together; it goes
// after the nearest player. Beat one for its trophy (everyone near gets it).
// Nothing is ever stored in the world: turn the mod off and it is all gone.

import { speechSeconds } from '../reading';
import type { Mod, ModApi, ModEffects, ModPlayer, ModSound, Trophy } from '../types';
import { ALL_SPECS } from './models';
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
/** Now and then a far-away sound, to make you jump (seconds between, at night / with a character). */
const SCARE_EVERY: [number, number] = [50, 110];
const SCARE_EVERY_VISIT: [number, number] = [22, 45];
const SCARES: readonly ModSound[] = ['creak', 'howl', 'drip', 'wind', 'whisper'];
/** A short breath between the lines a character says when it arrives. */
const LINE_PAUSE = 0.6;
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
let scareTimer = SCARE_EVERY[0];

/** Players the characters may come for: in survival (not creative), not dead. */
function hunted(api: ModApi): ModPlayer[] {
  return api.players.filter(
    (p, i) => !p.safe && !(i === 0 && (api.dead || api.mode !== 'survival')),
  );
}

/**
 * The api for the character, as if the nearest hunted player were "you":
 * it looks at, hurts and slows that player, wherever they are.
 */
function focus(api: ModApi): ModApi | null {
  const list = hunted(api);
  if (list.length === 0) return null;
  const at = current?.where();
  const target = at
    ? list.reduce((a, b) =>
        Math.hypot(a.x - at.x, a.z - at.z) <= Math.hypot(b.x - at.x, b.z - at.z) ? a : b,
      )
    : list[Math.floor(Math.random() * list.length)]!;
  // Defined, not assigned: in the game player, mode and dead are getters.
  return Object.create(api, {
    player: { value: target },
    mode: { value: 'survival' },
    dead: { value: false },
    hurt: { value: (amount: number, reason: string) => api.hurtPlayer(target.id, amount, reason) },
    effect: {
      value: (effects: ModEffects, seconds: number) => api.effectFor(target.id, effects, seconds),
    },
  }) as ModApi;
}

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
  shared: true,
  actorSpecs: ALL_SPECS,
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
        const f = focus(api);
        if (!f) {
          api.toast('🛠️ Kauhuhahmot tulevat vain selviytyjä-tilassa.');
          return;
        }
        if (current) {
          api.toast(`${current.who.emoji} ${current.who.name} on jo täällä!`);
          return;
        }
        begin(f, (id) => api.hasTrophy(id));
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
    const f = focus(api);
    if (current && f) current.hit(f, id, damage);
  },
  onTrophy(api) {
    // Fought together on someone else's computer: the crown when all six are won.
    if (CAST.every((make) => api.hasTrophy(make().trophy.id)) && api.trophy(MASTER.id)) {
      api.toast(`🏆 ${MASTER.emoji} ${MASTER.name}! Voitit kaikki!`);
    }
  },
  tick(api, dt) {
    const f = focus(api);
    if (!f) {
      // Creative is safe, and when nobody can be hunted the character leaves.
      if (current) stop(api);
      return;
    }
    // Rare, quiet sounds far away: more often while a character visits.
    if (current || api.night) {
      scareTimer -= dt;
      if (scareTimer <= 0) {
        const [a, b] = current ? SCARE_EVERY_VISIT : SCARE_EVERY;
        scareTimer = a + Math.random() * (b - a);
        f.sound(SCARES[Math.floor(Math.random() * SCARES.length)]!);
      }
    }
    if (current) {
      lineTimer -= dt;
      if (lines.length > 0 && lineTimer <= 0) {
        const line = lines.shift()!;
        f.say(current.who, line);
        lineTimer = speechSeconds(line) + LINE_PAUSE;
      }
      const outcome = current.update(f, dt);
      if (outcome !== 'fight') finish(f, outcome);
      return;
    }
    if (!api.night) return;
    wait -= dt;
    if (wait <= 0) begin(f, (id) => api.hasTrophy(id));
  },
};

/** For tests: forget everything between runs. */
export function resetHalloween(): void {
  current = null;
  wait = FIRST_WAIT;
  scareTimer = SCARE_EVERY[0];
  next = 0;
  lines = [];
}
