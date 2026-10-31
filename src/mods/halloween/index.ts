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
import type { Encounter, Vec } from './encounter';
import { me, burst } from './encounter';
import { ikiyo } from './ikiyo';
import { prelude as makePrelude, type Prelude } from './prelude';
import { stranger } from './stranger';
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

/** Ikiyö comes only for those who have every trophy: they tell the host with this tag. */
const GIANT_TAG = 'all-trophies';
/** Those wearing the dawn's crown (/aamunkoitto) tell the host with this tag. */
const DAWN_TAG = 'dawn';
/** On this device, for this player in every world: the crown is on. */
const DAWN_KEY = 'halloween.dawn';
/** On this device, about this world: what Ikiyö has done here. */
const WORLD_KEY = 'halloween.ikiyo';
/** After the first visit, it sometimes comes as a friendly stranger instead of a story. */
const STRANGER_CHANCE = 0.5;
const GIANT_FIRST = 45;
const GIANT_AGAIN: [number, number] = [360, 540];
/** A tag older than this means the player left or lost it. */
const TAG_FRESH = 30;

const IKIYO_TROPHY = ikiyo().trophy;
const TROPHIES: readonly Trophy[] = [...CAST.map((make) => make().trophy), MASTER, IKIYO_TROPHY];

/** What Ikiyö has done in this world (remembered on this device, never in the world). */
interface WorldStory {
  /** The whole diary story has been told here. */
  story?: boolean;
  /** How many times it has come here. */
  visits?: number;
  /** The dawn beat it here: it never comes to this world again. */
  beaten?: boolean;
}

function worldStory(api: ModApi): WorldStory {
  const saved = api.recall(WORLD_KEY);
  return typeof saved === 'object' && saved !== null ? (saved as WorldStory) : {};
}

function rememberStory(api: ModApi, change: WorldStory): void {
  api.remember(WORLD_KEY, { ...worldStory(api), ...change });
}

/** Have you turned on the dawn's crown (this device, every world)? */
function wearsCrown(api: ModApi): boolean {
  return api.recall(DAWN_KEY, true) === true;
}

let current: Encounter | null = null;
let wait = FIRST_WAIT;
let next = 0;
let lines: string[] = [];
let lineTimer = 0;
let scareTimer = SCARE_EVERY[0];
let giant: Encounter | null = null;
/**
 * What comes before Ikiyö: the diary story (the whole story the first time
 * in each world, then a short warning), or a friendly stranger who changes.
 */
let prelude: (Prelude & { spot?(): Vec | null; hit?(api: ModApi, id: string): void }) | null = null;
let giantWait = GIANT_FIRST;
let clock = 0;
/** Who has every trophy (player id → when they last said so). */
const tagged = new Map<string, number>();
/** Who wears the dawn's crown (player id → when they last said so). */
const crowned = new Map<string, number>();

/** Players the characters may come for: in survival (not creative), not dead (and for Ikiyö: with every trophy). */
function hunted(api: ModApi, only?: ReadonlySet<string>): ModPlayer[] {
  return api.players.filter(
    (p, i) =>
      !p.safe && !(i === 0 && (api.dead || api.mode !== 'survival')) && (!only || only.has(p.id)),
  );
}

/** Everyone the six may still come for: not those Ikiyö has marked. */
function unmarked(api: ModApi): Set<string> {
  const marked = worthy(api);
  return new Set(api.players.map((p) => p.id).filter((id) => !marked.has(id)));
}

/** The players who have won every trophy (the others said so lately; your own you know). */
function worthy(api: ModApi): Set<string> {
  // Where the dawn has beaten it, it never comes again.
  if (worldStory(api).beaten) return new Set();
  const ids = new Set([...tagged].filter(([, t]) => clock - t < TAG_FRESH).map(([id]) => id));
  const mine = api.players[0];
  if (mine && api.hasTrophy(MASTER.id)) ids.add(mine.id);
  return ids;
}

/**
 * The api for the character, as if the nearest hunted player were "you":
 * it looks at, hurts and slows that player, wherever they are.
 */
function focus(
  api: ModApi,
  only = current && current === giant ? worthy(api) : undefined,
): ModApi | null {
  const list = hunted(api, only);
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
    // Only your own computer can push you.
    push: { value: target.id === api.players[0]?.id ? api.push.bind(api) : () => undefined },
    effect: {
      value: (effects: ModEffects, seconds: number) => api.effectFor(target.id, effects, seconds),
    },
  }) as ModApi;
}

function stop(api: ModApi): void {
  prelude?.end(api);
  prelude = null;
  current?.end(api);
  current = null;
  giant = null;
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

/** Does this player wear the dawn's crown? (The others said so lately; your own you know.) */
function crownOn(api: ModApi, id: string): boolean {
  if (id === api.players[0]?.id) return wearsCrown(api);
  const t = crowned.get(id);
  return t !== undefined && clock - t < TAG_FRESH;
}

/** Before Ikiyö: the whole story the first time in this world, later a warning or the stranger. */
function beginPrelude(api: ModApi): void {
  const story = worldStory(api);
  if (!story.story) {
    rememberStory(api, { story: true });
    prelude = makePrelude(true, 0);
  } else if (Math.random() < STRANGER_CHANCE) prelude = stranger();
  else prelude = makePrelude(false, story.visits ?? 1);
}

/** Ikiyö rises (for one of the players with every trophy), where the stranger stood if it came as one. */
function beginGiant(api: ModApi, from?: Vec | null): void {
  const story = worldStory(api);
  giant = ikiyo({
    dawn: (id) => crownOn(api, id),
    visit: story.visits ?? 0,
    from: from ?? undefined,
  });
  rememberStory(api, { visits: (story.visits ?? 0) + 1 });
  current = giant;
  api.atmosphere(current.mood);
  lines = [...current.intro];
  lineTimer = 2.5;
  current.start(api);
}

function finish(api: ModApi, outcome: 'won' | 'fled'): void {
  const c = current!;
  const wasGiant = c === giant;
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
  if (wasGiant) {
    if (outcome === 'won') rememberStory(api, { beaten: true });
    // It needs a long time to charge up again (or to get over losing).
    giantWait = GIANT_AGAIN[0] + Math.random() * (GIANT_AGAIN[1] - GIANT_AGAIN[0]);
    wait = Math.max(wait, WAIT_AFTER_ESCAPE);
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
        if (args.startsWith('tar')) {
          // The whole story, now (it ends with Ikiyö).
          if (!focus(api, worthy(api))) {
            api.toast('👁️ Tarina on vain niille, joilla on kaikki pokaalit (selviytyjä-tilassa)…');
            return;
          }
          if (current) stop(api);
          rememberStory(api, { story: true });
          prelude = makePrelude(true, 0);
          return;
        }
        if (args.startsWith('iki') || args.startsWith('muu')) {
          const g = focus(api, worthy(api));
          if (!g) {
            // Say why: beaten here, no trophies yet, or nobody it could come for (creative, dead).
            api.toast(
              worldStory(api).beaten
                ? '🌅 Aamu voitti Ikiyön tässä maailmassa. Se ei palaa tänne.'
                : worthy(api).size === 0
                  ? '👁️ Ikiyö tulee vain niille, joilla on kaikki pokaalit…'
                  : '👁️ Ikiyö tulee vain selviytyjä-tilassa… vaihda pois nikkaroijasta.',
            );
            return;
          }
          if (current) stop(api);
          // /kauhu muukalainen: it comes as the friendly stranger.
          if (args.startsWith('muu')) {
            prelude = stranger();
            return;
          }
          if (current) stop(api);
          beginGiant(g);
          return;
        }
        if (current) {
          api.toast(`${current.who.emoji} ${current.who.name} on jo täällä!`);
          return;
        }
        const f = focus(api, unmarked(api));
        if (!f) {
          api.toast(
            focus(api)
              ? '👁️ Ikiyö on merkinnyt sinut. Muut kauhuhahmot eivät enää uskalla tulla.'
              : '🛠️ Kauhuhahmot tulevat vain selviytyjä-tilassa.',
          );
          return;
        }
        begin(f, (id) => api.hasTrophy(id));
      },
    },
    {
      // 🌅 The secret: the dawn's crown (only yours, on in every world until you
      // say it again). Whoever wears it can strike Ikiyö's last blow while it begs.
      names: ['aamunkoitto'],
      help: '',
      hidden: true,
      local: true,
      run(api) {
        const on = !wearsCrown(api);
        api.remember(DAWN_KEY, on || null, true);
        if (on) {
          api.sound('magic');
          api.flash('rgba(255,236,170,0.6)', 1);
          api.toast(
            '👑 Aamunkoiton kruunu on päässäsi. Kun Ikiyö anelee armoa, vain sinä voit lyödä viimeisen iskun.',
          );
        } else {
          api.sound('click');
          api.toast('👑 Otit aamunkoiton kruunun pois.');
        }
      },
    },
  ],
  tags(api) {
    return [
      ...(api.hasTrophy(MASTER.id) ? [GIANT_TAG] : []),
      ...(wearsCrown(api) ? [DAWN_TAG] : []),
    ];
  },
  onTag(_api, playerId, tag) {
    if (tag === GIANT_TAG) tagged.set(playerId, clock);
    if (tag === DAWN_TAG) crowned.set(playerId, clock);
  },
  onEnable(api) {
    // A new world (or the mod turned on again): nothing carries over from before.
    resetHalloween();
    api.toast('🎃 Kauhu-Halloween alkoi… odota yötä, jos uskallat!');
  },
  onDisable(api) {
    stop(api);
    api.corner(null);
    api.mark(null);
  },
  localTick(api) {
    // Those with every trophy belong to Ikiyö now: a little red eye says so
    // (unless the dawn has beaten it in this world).
    if (api.hasTrophy(MASTER.id) && !worldStory(api).beaten) {
      api.mark('Ikiyö on merkinnyt sinut', giant || prelude ? 1 : 0.25);
    } else api.mark(null);
    // The dawn's crown, small in the corner, while you wear it.
    if (wearsCrown(api)) api.corner('👑', 'Aamunkoiton kruunu');
    else api.corner(null);
  },
  onHitActor(api, id, damage, by) {
    const f = focus(api);
    if (prelude?.hit && f) prelude.hit(f, id);
    if (current && f) current.hit(f, id, damage, by);
  },
  onTrophy(api, id) {
    // Beaten together on the host's computer: it never comes to this world again.
    if (id === IKIYO_TROPHY.id) rememberStory(api, { beaten: true });
    // Fought together on someone else's computer: the crown when all six are won.
    if (CAST.every((make) => api.hasTrophy(make().trophy.id)) && api.trophy(MASTER.id)) {
      api.toast(`🏆 ${MASTER.emoji} ${MASTER.name}! Voitit kaikki!`);
    }
  },
  tick(api, dt) {
    clock += dt;
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
    if (prelude) {
      const g2 = focus(api, worthy(api));
      if (!g2) {
        // Nobody to tell it to any more.
        prelude.end(api);
        prelude = null;
        api.atmosphere(null);
      } else if (prelude.update(g2, dt)) {
        const spot = prelude.spot?.() ?? null;
        prelude.end(g2);
        prelude = null;
        beginGiant(g2, spot);
      }
      return;
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
    // Ikiyö comes for the players with every trophy, by day or by night:
    // first the story (strange things happen), then it rises.
    const g = focus(api, worthy(api));
    if (g) {
      giantWait -= dt;
      if (giantWait <= 0 && !prelude) beginPrelude(g);
    }
    if (!api.night) return;
    wait -= dt;
    // The six come only for those Ikiyö has not marked yet.
    const n = focus(api, unmarked(api));
    if (wait <= 0 && n) begin(n, (id) => api.hasTrophy(id));
  },
};

/** For tests: forget everything between runs. */
export function resetHalloween(): void {
  current = null;
  giant = null;
  prelude = null;
  giantWait = GIANT_FIRST;
  clock = 0;
  tagged.clear();
  crowned.clear();
  wait = FIRST_WAIT;
  scareTimer = SCARE_EVERY[0];
  next = 0;
  lines = [];
}
