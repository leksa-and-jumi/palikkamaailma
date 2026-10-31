// 👁️ Ikiyö, the seventh: it only comes for those who have won all six
// trophies, by day or by night. A giant whose neck is one long mouth full of
// fangs, with a head on the end that never blinks. It whispers, then
// screams in the middle of a sentence. It has three moods, each worse:
//   1. Kuiskaus (whisper): grey fog, heartbeats; its neck shoots out to bite,
//      claws slam down on red circles.
//   2. Punainen kuu (red moon): red sky, lightning, screams that slow you
//      down, flying skulls (hit them: it hurts the giant too), the lights flicker.
//   3. Ikiyö (endless night): almost dark; it glitches away and comes back behind you.
// And always, now and then: everything goes quiet… and its head is right in
// front of your face, screaming.
//
// What it is like: very old, very lonely and very childish. It plays games
// with you (hide and seek, tag, hot and cold), it collects things (and
// players), it lies, and it is a coward when it is losing.
//   - Now and then it leaves to play hide and seek: the fight stops, and
//     the dread builds (hot… hotter…) until it finds you.
//   - With a tenth of its life left it laughs at you, takes everything you
//     carry and wear, and vanishes: the ones it took before whisper in the
//     dark (whispers.ts) until it comes back.
//   - One hit from the end it begs for mercy, gives your things back and
//     crawls away… then comes back with all its life ("I tricked you!").
//   - The second time it sinks into the ground to charge up. Only a player
//     wearing the dawn's crown (/aamunkoitto, see index.ts) can strike the
//     last blow while it begs.

import type { Atmosphere, ModApi } from '../types';
import {
  aroundPlayer,
  burst,
  distance,
  lookingAt,
  me,
  moveTowards,
  yawTo,
  type Encounter,
  type Vec,
} from './encounter';
import { EYES, IKIYO, IKIYO_HEAD, MARK, NECK, PUFF, WATCHER, WISP } from './ikiyoModel';
import { Speech } from './scene';
import { whispers, type Whispers } from './whispers';

const MAX_HP = 180;
/** The last sliver: one hit from the end it begs. */
const LAST = 4;
/** With this much life left it takes your things. */
const STRIP_AT = MAX_HP * 0.1;
/** Without your things you still hurt it this much (bare hands, but it is weak). */
const NAKED_HIT = 3;
const PHASE_2 = 0.66;
const PHASE_3 = 0.33;
/** How far away it likes to hover. */
const KEEP_AWAY = 15;
/** About sixteen blocks tall. */
const SIZE = 1.3;
const ATTACK_EVERY: [number, number] = [4.5, 7.5];
const SLAM_WARNING = 1.5;
const SLAM_RADIUS = 3.6;
const SLAM_DAMAGE = 4;
const WISP_SPEED = 5.5;
const WISP_DAMAGE = 2;
const WISP_HIT = 7;
const MAX_WISPS = 6;
const TAUNT_EVERY: [number, number] = [10, 16];
const SOUND_EVERY: [number, number] = [5, 9];
const HEARTBEAT_EVERY = 2.2;
/** Seconds it takes to sink away with its last sliver. */
const FADE_TIME = 9;

/** The neck: how many pieces, how long at rest, how far it reaches. */
const NECK_PIECES = 10;
const NECK_REST = 3.2 * SIZE;
const NECK_REACH = 26;
const LUNGE_WINDUP = 0.8;
const LUNGE_SPEED = 34;
const RETRACT_SPEED = 13;
const BITE_DAMAGE = 4;
const BITE_HOLD = 0.6;
/** The jump scare: quiet first, then the face in yours. */
const SCARE_EVERY: [number, number] = [24, 42];
const SCARE_QUIET = 2.3;
const SCARE_HOLD = 1.3;
const FLICKER_TIME = 2.4;
/** It doesn't walk or drift: it vanishes in smoke and is somewhere else. */
const TELEPORT_EVERY: [number, number] = [3.2, 5.8];
const STUTTER_GAP = 0.28;
const PUFF_LIFE = 2.6;
const MAX_PUFFS = 4;
const STROBE_TIME = 0.4;
/** Red eyes opening in the dark around you. */
const EYES_EVERY: [number, number] = [2.5, 5];
const MAX_EYES = 8;
/** Faces flashing on the screen: how many there are, and how often a split-second one comes. */
const FACES = 4;
const SUBLIMINAL_EVERY: [number, number] = [15, 35];
/** Where the neck starts on the body, and the head's middle, above their feet. */
const SOCKET = (1.2 + 9.6) * SIZE;
const HEAD_MIDDLE = 1.9 * SIZE;
/** Hide and seek: seconds of fighting between games, and how long it hides. */
const HIDE_EVERY: [number, number] = [45, 70];
const HIDE_TIME: [number, number] = [22, 32];
/** Begging, crawling away, and the calm before it comes back with all its life. */
const SLINK_TIME = 6;
const RELIEF_TIME = 24;
const REFILL_TIME = 2.5;

const MOODS: Record<1 | 2 | 3, Atmosphere> = {
  1: {
    music: 'ikiyo-1',
    fogColor: 0x0e0e16,
    fogNear: 4,
    fogFar: 44,
    darkness: 0.58,
    vignette: 0.65,
    tint: 'rgba(40,40,90,0.2)',
  },
  2: {
    music: 'ikiyo-2',
    fogColor: 0x2a0406,
    fogNear: 3,
    fogFar: 38,
    darkness: 0.66,
    vignette: 0.8,
    tint: 'rgba(150,0,0,0.25)',
    lightning: true,
  },
  3: {
    music: 'ikiyo-3',
    fogColor: 0x020203,
    fogNear: 2,
    fogFar: 26,
    darkness: 0.88,
    vignette: 0.97,
    tint: 'rgba(0,0,0,0.28)',
  },
};

// Lines: {tags} tell the recorded voice how to say it (whisper, then scream);
// they are not shown in the speech box.
const TAUNTS = [
  '{whispers} Kuulen… sydämesi… {growls} se lyö… liian kovaa…',
  '{whispers} Kukaan… ei ole… koskaan… {screams} KOSKAAN!',
  '{growls} Sinun palikkasi… ovat… {screams} MINUN!',
  '{whispers} Hhhhh… lähempänä… {screams} LÄHEMPÄNÄ!',
  '{whispers} Juokse… jos… {laughs maniacally}',
  '{whispers} Minä… näen… sinut… {shrieks} NÄEN SINUT!',
  '{whispers} Takanasi… {growls} ei… vaan…',
  '{giggles} Hippa! {whispers} Sinä… olet… hippa…',
  '{whispers} Minä… keräilen… {growls} pelaajia.',
  '{whispers} Edellinen… huusi… kauniimmin… {laughs maniacally}',
  '{whispers} Aamu… ei… tule… {screams} EI KOSKAAN!',
  '{giggles} Kaikki… sinun… palikkasi… {whispers} ovat… minun… leluja…',
  '{growls} Sinä… olet… {whispers} minun… lempilelu…',
  '{whispers} Minä olin täällä… yksin… {screams} NIIN KAUAN!',
];
const HIT_LINES = [
  '{laughs maniacally} Heh… heh… hhhh…',
  '{growls} Sinä… et voi…',
  '{whispers} Kutittaa… {screams} VAIN!',
  '{giggles} Taas! {whispers} Lyö… taas…',
  '{growls} Tuo… sattui… {screams} MELKEIN!',
];
/** When its bite or claws get you. */
const GOT_YOU_LINES = [
  '{giggles} Maistuu… pelolta…',
  '{whispers} Vielä… vähän… {giggles} vielä…',
  '{laughs maniacally} Sinä… olet… niin… hidas…',
];
/** Screamed right in your face. */
const SCREAMS = [
  '{screams} HHHAAAAAAAAH!',
  '{shrieks} KIIIIIRRRRGH!',
  '{screams} SINÄÄÄÄ!',
  '{growls} GRRRAAAAAH!',
];
/** Hide and seek: it goes… */
const HIDE_LINES = [
  '{giggles} Leikitään… piilosta… {whispers} minä… etsin…',
  '{whispers} Silmät… kiinni… {giggles} minä… lasken…',
  '{whispers} Minä… menen… nyt… {giggles} vai… menenkö…?',
];
/** …it gets closer (cold, warm, hot)… */
const HOT_COLD_LINES = [
  '{whispers} Kylmä… kylmä…',
  '{whispers} Lämmin… {giggles} lämpimämpi…',
  '{whispers} Kuuma… {giggles} poltetta…',
];
/** …and it finds you. */
const FOUND_LINES = [
  '{shrieks} LÖYSIN SINUT!',
  '{screams} PÖÖ!',
  '{laughs maniacally} Täällä… minä… olin… {screams} KOKO AJAN!',
];
/** A tenth of its life left: it laughs at you and takes everything. */
const STRIP_LINES = [
  '{laughs maniacally} Luuletko… voittavasi? {whispers} Pikku… pikku… pelaaja…',
  '{whispers} Annas… kun… otan… {growls} miekkasi…',
  '{giggles} Ja haarniskasi… {whispers} ja kaiken… muun…',
  '{laughs maniacally} Katso itseäsi! {whispers} Ei mitään… jäljellä…',
];
/** One hit from the end: it begs. */
const BEG_LINES = [
  '{sobbing} Armoa… armoa… älä lyö…',
  '{whimpers} Minä annan… kaiken takaisin… {sobbing} ota… ota…',
  '{sobbing} Minä olin vain… niin yksin… niin kauan…',
  '{whimpers} Lupaan… etten tule… koskaan… takaisin…',
];
/** Hit while it begs (by someone without the crown). */
const MERCY_LINES = ['{whimpers} Ai! Älä… älä…', '{sobbing} Ei enää… pyydän…'];
/** The second time it begs: it means it this time (does it?). */
const BEG_AGAIN_LINES = ['{whimpers} Tällä kertaa… oikeasti… {sobbing} armoa…'];
/** It crawls away… */
const SLINK_LINES = ['{sobbing} Minä… menen… nyt…'];
/** …and comes back with all its life. */
const TRICK_LINES = [
  '{laughs maniacally} HUIJASIN! {screams} MINÄ HUIJASIN!',
  '{laughs maniacally} Armoa? {screams} MINÄ EN TUNNE ARMOA!',
];
/** A crown-bearer is near while it begs. */
const LIGHT_LINES = ['{whispers} Mitä… tuo… valo… {shrieks} EI VALOA!'];
/** The first time it comes to a world. */
const FIRST_LINES = [
  '{whispers} Kuusi… pokaalia… {screams} JA NYT SINÄ!',
  '{growls} Minä olin täällä… ennen kuin… {whispers} ensimmäinen palikka…',
  '{whispers} Älä… katso… taakse… {shrieks} ÄLÄ!',
];
/** When it comes again to a world it has visited. */
const AGAIN_LINES = [
  '{whispers} Sinä… palasit… {giggles} minä… tiesin…',
  '{growls} Viime kerralla… sinä… {whispers} melkein…',
  '{giggles} Leikitäänkö… taas…?',
];
/** The friendly stranger turns into it (stranger.ts). */
export const CHANGE_LINES = ['{whispers} Kiltti…? {screams} MINÄ EN OLE KILTTI!'];

/** Ikiyö's own words at the end of the story told before it comes (prelude.ts). */
export const OMEN_LINES = {
  /** The last line of the diary, in another hand. */
  story: '{whispers} Nyt… on… sinun… {screams} VUOROSI!',
  /** When it comes back later (the short warning). */
  again: '{whispers} Minä… muistan… {growls} sinut…',
} as const;

type Wisp = Vec & { id: string; age: number };
type Head = 'rest' | 'windup' | 'lunge' | 'bite' | 'retract';
/**
 * fight: the battle. hide: gone, playing hide and seek. taunt: laughing at
 * you while it takes your things. whisper: gone, the lost ones whisper.
 * beg: begging for mercy. slink: crawling away. calm: pretending to be gone.
 * fade: sinking into the ground to charge up (the end of the visit).
 */
type Mode = 'fight' | 'hide' | 'taunt' | 'whisper' | 'beg' | 'slink' | 'calm' | 'fade';

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

export interface IkiyoOptions {
  /** Is this player wearing the dawn's crown (/aamunkoitto)? */
  dawn(playerId: string): boolean;
  /** How many times it has come to this world before. */
  visit: number;
  /** Where it rises (where the friendly stranger stood), instead of in front of you. */
  from?: Vec;
}

export function ikiyo(options: IkiyoOptions = { dawn: () => false, visit: 0 }): Encounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let hp = MAX_HP;
  let phase: 1 | 2 | 3 = 1;
  let mode: Mode = 'fight';
  let modeTime = 0;
  /** 0 = the first life; 1 = it came back after begging. */
  let round = 0;
  let attackIn = 4;
  let slam: (Vec & { t: number }) | null = null;
  let wisps: Wisp[] = [];
  let counter = 0;
  let tauntIn = between(TAUNT_EVERY);
  let soundIn = 2;
  let heartbeat = 0;
  let hitLineIn = 0;
  let won = false;
  let rise = 0;
  let pulse = 0;
  let time = 0;
  let shrink = 1;
  let refill = -1;
  // The head on its neck.
  let head: Vec = { x: 0, y: 0, z: 0 };
  let headMode: Head = 'rest';
  let headTimer = 0;
  let biteAt: Vec = { x: 0, y: 0, z: 0 };
  let twitch = 0;
  let twitchOffset: Vec = { x: 0, y: 0, z: 0 };
  // Jump scares and flickering lights.
  // The first scare comes soon after it rises.
  let scareIn = 11 + Math.random() * 4;
  let quiet = -1;
  let peek = -1;
  /** The next scare is the end of hide and seek ("found you!"). */
  let found = false;
  let flicker = -1;
  let teleportIn = 2.5;
  let stutter: Vec[] = [];
  let stutterIn = 0;
  let strobe = 0;
  let puffs: (Vec & { id: string; age: number })[] = [];
  let eyesIn = 3;
  let subliminalIn = between(SUBLIMINAL_EVERY);
  let eyes: (Vec & { id: string; age: number; life: number; yaw: number })[] = [];
  // Hide and seek, its long speeches, and those it took things from.
  let hideIn = between(HIDE_EVERY);
  let hideLength = 0;
  let hotCold = 0;
  let watcher: (Vec & { gone: boolean }) | null = null;
  let scene: Whispers | null = null;
  let stripped: string[] = [];
  let naked = false;
  let mercyIn = 0;
  const speech = new Speech(0.5);
  const who = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

  const gone = () => mode === 'hide' || mode === 'whisper' || mode === 'calm';
  const bodyY = () => {
    const sink = mode === 'fade' ? Math.min(1, modeTime / FADE_TIME) * 14 : 0;
    const up = (Math.min(1, rise) - 1) * 15;
    return at.y + up - sink;
  };
  const size = () => SIZE * shrink;
  const socket = (): Vec => ({ x: at.x, y: bodyY() + SOCKET * shrink, z: at.z });
  const eye = (api: ModApi): Vec => ({ x: api.player.x, y: api.player.y + 1.6, z: api.player.z });
  const restHead = () => {
    head = { ...socket(), y: socket().y + NECK_REST * shrink };
  };
  const setMode = (next: Mode) => {
    mode = next;
    modeTime = 0;
  };

  const mood = (api: ModApi): Atmosphere => {
    const m = MOODS[phase];
    // Your eyelids feel heavy: they droop with each heartbeat, more when it is near.
    const near = Math.max(0, 1 - distance(me(api), at) / 14);
    const lids = 0.06 + Math.max(0, Math.sin(pulse)) * 0.08 + near * 0.25 + (phase - 1) * 0.05;
    if (mode === 'fade' || mode === 'beg' || mode === 'slink') return { ...m, eyelids: 0 };
    if (mode === 'hide') {
      // It is gone… the music stops, and the dark creeps back as it comes closer.
      const k = Math.min(1, modeTime / hideLength);
      return {
        ...m,
        music: undefined,
        lightning: false,
        darkness: (m.darkness ?? 0) * (0.55 + 0.45 * k),
        vignette: Math.min(1, 0.4 + k * 0.6),
        eyelids: Math.min(0.7, 0.04 + k * 0.4 + Math.max(0, Math.sin(pulse)) * 0.1 * k),
      };
    }
    // Before a scare everything goes quiet, darker… and your eyes slowly close.
    if (quiet >= 0) {
      return {
        ...m,
        music: undefined,
        darkness: Math.min(1, (m.darkness ?? 0) + 0.2),
        eyelids: Math.min(0.88, 0.2 + (quiet / SCARE_QUIET) * 0.7),
      };
    }
    // …and snap open when it is in your face.
    if (peek >= 0) return { ...m, eyelids: 0 };
    // The lights flicker off and on (long flicker, or a quick strobe when it teleports).
    if (flicker >= 0 || strobe > 0) {
      const off = Math.random() < 0.55;
      return {
        ...m,
        darkness: off ? 0.99 : 0.25,
        vignette: off ? 1 : m.vignette,
        eyelids: off ? 0.5 : lids,
      };
    }
    // The dark edges beat like a heart.
    return {
      ...m,
      vignette: Math.min(1, (m.vignette ?? 0) + Math.max(0, Math.sin(pulse)) * 0.08),
      eyelids: Math.min(0.6, lids),
    };
  };

  /** Gone in a puff of smoke… and somewhere else. */
  const teleport = (api: ModApi, to: Vec) => {
    leavePuff(api);
    at = { ...to, y: api.groundY(to.x, to.z, me(api).y) };
    restHead();
    strobe = STROBE_TIME;
    api.sound('glitch');
    if (Math.random() < 0.4) api.sound('whisper');
    api.flash(Math.random() < 0.5 ? 'rgba(0,0,0,0.85)' : 'rgba(110,0,0,0.5)', 0.18);
    api.shake(0.25, 0.2);
    // Now and then a face in the flicker, too short to be sure you saw it.
    if (phase >= 2 && Math.random() < 0.15) api.screamer(Math.floor(Math.random() * FACES), 0.07);
  };

  const leavePuff = (api: ModApi) => {
    puffs.push({ id: `puff${counter++}`, ...at, y: bodyY(), age: 0 });
    while (puffs.length > MAX_PUFFS) api.removeActor(puffs.shift()!.id);
  };

  /** Where it goes next: round you, often behind; or it stutters closer. */
  const nextPlace = (api: ModApi) => {
    if (phase >= 2 ? Math.random() < 0.4 : Math.random() < 0.2) {
      // Jump, jump, jump… closer, then away.
      const side = (Math.random() - 0.5) * 1.2;
      stutter = [11, 8, 5.5].map((d) => aroundPlayer(api, d, side + (Math.random() - 0.5) * 0.3));
      stutter.push(aroundPlayer(api, KEEP_AWAY, Math.PI + side));
      stutterIn = 0;
      api.sound('giggle');
      return;
    }
    const behind = Math.random() < 0.35;
    const angle = behind ? Math.PI + (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 2.4;
    teleport(api, aroundPlayer(api, 10 + Math.random() * 6, angle));
  };

  /** Smoke curtains thin out; red eyes open and close round you; a face flashes. */
  const effects = (api: ModApi, dt: number, eyeRate: number = phase) => {
    strobe = Math.max(0, strobe - dt);
    subliminalIn -= dt;
    if (subliminalIn <= 0 && quiet < 0 && peek < 0) {
      subliminalIn = between(SUBLIMINAL_EVERY) / phase;
      if (phase >= 2 || Math.random() < 0.4) {
        api.screamer(Math.floor(Math.random() * FACES), 0.08 + Math.random() * 0.05);
        api.sound('glitch');
      }
    }
    for (const puff of [...puffs]) {
      puff.age += dt;
      if (puff.age > PUFF_LIFE) {
        api.removeActor(puff.id);
        puffs = puffs.filter((x) => x !== puff);
      }
    }
    eyesIn -= dt;
    if (eyesIn <= 0 && eyes.length < MAX_EYES && quiet < 0 && eyeRate > 0) {
      eyesIn = between(EYES_EVERY) / eyeRate;
      const spot = aroundPlayer(api, 7 + Math.random() * 7, Math.random() * Math.PI * 2);
      eyes.push({
        id: `eyes${counter++}`,
        ...spot,
        y: spot.y + 0.8 + Math.random() * 2,
        age: 0,
        life: 3 + Math.random() * 3,
        yaw: 0,
      });
    }
    for (const e of [...eyes]) {
      e.age += dt;
      e.yaw = yawTo(e, me(api));
      if (e.age > e.life || quiet >= 0) {
        api.removeActor(e.id);
        eyes = eyes.filter((x) => x !== e);
      }
    }
  };

  const show = (api: ModApi) => {
    const p = me(api);
    const hidden = peek >= 0 || gone();
    const s = size();
    api.actor('ikiyo', IKIYO, {
      ...at,
      y: bodyY(),
      yaw: yawTo(at, p),
      scale: s,
      visible: !hidden,
    });
    // The head looks you in the eye (it hangs low while it begs).
    const e = eye(api);
    const hx = e.x - head.x;
    const hz = e.z - head.z;
    const hy = e.y - (head.y + HEAD_MIDDLE * shrink);
    const begging = mode === 'beg' || mode === 'slink';
    api.actor('head', IKIYO_HEAD, {
      x: head.x + twitchOffset.x,
      y: head.y + twitchOffset.y,
      z: head.z + twitchOffset.z,
      yaw:
        (mode === 'slink' ? Math.atan2(hx, hz) : Math.atan2(-hx, -hz)) +
        (twitch > 0 ? (Math.random() - 0.5) * 0.6 : 0),
      pitch: begging ? -0.5 : Math.atan2(hy, Math.hypot(hx, hz)),
      scale: s,
      visible: !gone(),
    });
    // The neck: a chain of pieces from the body to the head.
    const so = socket();
    const d = { x: head.x - so.x, y: head.y + 0.3 * s - so.y, z: head.z - so.z };
    const flat = Math.hypot(d.x, d.z);
    const yaw = flat > 0.3 ? Math.atan2(-d.x, -d.z) : yawTo(so, p);
    const pitch = -Math.atan2(flat, d.y);
    for (let i = 0; i < NECK_PIECES; i++) {
      const k = i / NECK_PIECES;
      api.actor(`n${i}`, NECK, {
        x: so.x + d.x * k,
        y: so.y + d.y * k,
        z: so.z + d.z * k,
        yaw,
        pitch,
        scale: s,
        visible: !hidden,
      });
    }
    for (const w of wisps) api.actor(w.id, WISP, { ...w, yaw: yawTo(w, p) });
    for (const puff of puffs) {
      const k = puff.age / PUFF_LIFE;
      api.actor(puff.id, PUFF, {
        ...puff,
        yaw: puff.age,
        scale: SIZE * (0.9 + k * 0.8),
        // It flickers away at the end.
        visible: k < 0.7 || Math.random() < 0.5,
      });
    }
    for (const ey of eyes) api.actor(ey.id, EYES, { ...ey, scale: 1.4 });
    if (slam) api.actor('mark', MARK, { ...slam, yaw: slam.t * 2 });
    else api.removeActor('mark');
    if (watcher) api.actor('watcher', WATCHER, { ...watcher, yaw: yawTo(watcher, p), scale: 1.2 });
    else api.removeActor('watcher');
    // The boss bar: "???" while it hides, nothing while it pretends to be gone.
    const bar = refill >= 0 ? Math.min(1, refill / REFILL_TIME) : Math.max(0.01, hp / MAX_HP);
    if (mode === 'calm' || mode === 'slink') api.bossBar(null);
    else api.bossBar(gone() ? '👁️ ???' : '👁️ Ikiyö', bar);
  };

  const say = (api: ModApi, text: string) => api.say(who, text);

  const goPhase = (api: ModApi, next: 2 | 3) => {
    phase = next;
    api.screamer(Math.floor(Math.random() * FACES), 0.32);
    api.sound('shriek');
    api.animate('ikiyo', 'cast');
    api.animate('head', 'attack');
    api.sound('stinger');
    api.sound('roar');
    api.shake(1, 2.5);
    api.flash(next === 2 ? 'rgba(200,0,0,0.9)' : 'rgba(0,0,0,0.97)', 1.6);
    say(
      api,
      next === 2
        ? '{whispers} Kuu… muuttuu… punaiseksi… {screams} PUNAISEKSI!'
        : '{whispers} Valot… sammuvat… yksi… kerrallaan… {laughs maniacally} ja sitten…',
    );
  };

  const doSlam = (api: ModApi) => {
    const p = me(api);
    slam = { x: p.x, y: api.groundY(p.x, p.z, p.y), z: p.z, t: 0 };
    // It is suddenly right there, reaching for the red circle.
    teleport(api, aroundPlayer(api, 6.5, (Math.random() - 0.5) * 1.6));
    api.sound('drone');
    api.sound('rumble');
  };

  const doScream = (api: ModApi) => {
    api.animate('ikiyo', 'cast');
    api.animate('head', 'attack');
    api.sound('roar');
    api.sound('scream');
    api.shake(0.8, 1.8);
    api.flash('rgba(140,0,0,0.65)', 0.9);
    api.effect({ walkSpeed: 0.55, jumpSpeed: 0.7 }, 3.5);
    const p = me(api);
    const d = Math.max(1, distance(p, at));
    api.push(((p.x - at.x) / d) * 9, 4, ((p.z - at.z) / d) * 9);
  };

  const doWisps = (api: ModApi) => {
    api.animate('ikiyo', 'cast');
    api.sound('giggle');
    for (let i = 0; i < 3 && wisps.length < MAX_WISPS; i++) {
      const a = Math.random() * Math.PI * 2;
      wisps.push({
        id: `wisp${counter++}`,
        x: at.x + Math.sin(a) * 2.5,
        y: at.y + 9 + Math.random() * 2,
        z: at.z + Math.cos(a) * 2.5,
        age: 0,
      });
    }
  };

  const doBlink = (api: ModApi) => {
    api.sound('glitch');
    api.flash('rgba(0,0,0,1)', 0.7);
    api.shake(0.4, 0.4);
    // It is suddenly somewhere behind you.
    at = aroundPlayer(api, KEEP_AWAY - 1, Math.PI + (Math.random() - 0.5) * 0.8);
    restHead();
    api.sound('giggle');
  };

  /** The neck pulls back… and the head shoots out to bite. */
  const doLunge = (api: ModApi) => {
    headMode = 'windup';
    headTimer = 0;
    api.animate('head', 'attack');
    api.sound('stretch');
    api.sound('giggle');
  };

  const doFlicker = (api: ModApi) => {
    flicker = 0;
    api.sound('glitch');
  };

  const attack = (api: ModApi) => {
    const choices: ((api: ModApi) => void)[] = [doLunge, doSlam, doLunge];
    if (phase >= 2) choices.push(doScream, doWisps, doFlicker);
    if (phase >= 3) choices.push(doBlink, doLunge, doFlicker);
    pick(choices)(api);
  };

  /** It got you: now and then it is pleased about it. */
  const gotYou = (api: ModApi) => {
    if (hitLineIn <= 0 && Math.random() < 0.3) {
      hitLineIn = 8;
      say(api, pick(GOT_YOU_LINES));
    }
  };

  /** Moves the head: resting on its neck, pulling back, lunging, biting, coming back. */
  const moveHead = (api: ModApi, dt: number) => {
    const s = socket();
    const e = eye(api);
    const rest: Vec = {
      x: s.x + Math.sin(time * 0.8) * 0.7,
      y: s.y + NECK_REST * shrink + Math.sin(time * 1.3) * 0.35,
      z: s.z + Math.cos(time * 0.7) * 0.6,
    };
    headTimer += dt;
    switch (headMode) {
      case 'rest':
        moveTowards(head, rest, 8 * dt);
        break;
      case 'windup': {
        // Rears back, away from you.
        const away = Math.max(1, distance(s, e));
        moveTowards(
          head,
          {
            x: s.x - ((e.x - s.x) / away) * 2.5,
            y: s.y + NECK_REST + 3,
            z: s.z - ((e.z - s.z) / away) * 2.5,
          },
          10 * dt,
        );
        if (headTimer >= LUNGE_WINDUP) {
          headMode = 'lunge';
          headTimer = 0;
          // Aim just in front of your face (not further than the neck reaches).
          const d = { x: e.x - s.x, y: e.y - HEAD_MIDDLE - s.y, z: e.z - s.z };
          const len = Math.hypot(d.x, d.y, d.z) || 1;
          const reach = Math.min(NECK_REACH, len - 1.6);
          biteAt = {
            x: s.x + (d.x / len) * reach,
            y: s.y + (d.y / len) * reach,
            z: s.z + (d.z / len) * reach,
          };
          api.sound('stinger');
          api.sound('scream');
        }
        break;
      }
      case 'lunge':
        if (moveTowards(head, biteAt, LUNGE_SPEED * dt)) {
          headMode = 'bite';
          headTimer = 0;
          api.sound('bite');
          api.shake(0.8, 0.5);
          const mouth = { ...head, y: head.y + HEAD_MIDDLE };
          if (Math.hypot(mouth.x - e.x, mouth.y - e.y, mouth.z - e.z) < 3) {
            api.flash('rgba(160,0,0,0.75)', 0.6);
            api.hurt(BITE_DAMAGE, 'Ikiyö puraisi!');
            gotYou(api);
          }
        }
        break;
      case 'bite':
        // It stares at you for a moment…
        if (headTimer >= BITE_HOLD) {
          headMode = 'retract';
          api.sound('stretch');
        }
        break;
      case 'retract':
        if (moveTowards(head, rest, RETRACT_SPEED * dt)) headMode = 'rest';
        break;
    }
    // Now and then its head jerks.
    twitch -= dt;
    if (twitch <= 0 && Math.random() < dt * 0.35) {
      twitch = 0.18;
      twitchOffset = {
        x: (Math.random() - 0.5) * 1.6,
        y: (Math.random() - 0.5) * 0.8,
        z: (Math.random() - 0.5) * 1.6,
      };
      if (Math.random() < 0.5) api.sound('glitch');
    }
    if (twitch <= 0) twitchOffset = { x: 0, y: 0, z: 0 };
  };

  /** Quiet… quiet… and then its face in yours. */
  const scare = (api: ModApi, dt: number): boolean => {
    if (quiet >= 0) {
      quiet += dt;
      if (quiet < SCARE_QUIET) return true;
      quiet = -1;
      peek = 0;
      const p = api.player;
      const [lx, , lz] = p.look;
      const flat = Math.hypot(lx, lz) || 1;
      head = {
        x: p.x + (lx / flat) * 2.4,
        y: p.y + 1.6 - HEAD_MIDDLE,
        z: p.z + (lz / flat) * 2.4,
      };
      headMode = 'bite';
      headTimer = -SCARE_HOLD;
      api.animate('head', 'attack');
      api.sound('stinger');
      api.sound('scream');
      api.flash('rgba(255,255,255,0.95)', 0.35);
      api.shake(1, 1.3);
      say(api, pick(found ? FOUND_LINES : SCREAMS));
      found = false;
      // A face slams onto the screen.
      api.screamer(Math.floor(Math.random() * FACES), 0.45);
      api.sound('shriek');
      // It comes out of a burst of black smoke.
      burst(api, { ...head, y: head.y + HEAD_MIDDLE - 1 }, [0x050508, 0x1a0a0a, 0xff2010], 24);
      return true;
    }
    if (peek >= 0) {
      peek += dt;
      if (peek > 0.35 && peek < 0.4) api.flash('rgba(170,0,0,0.8)', 0.6);
      if (peek < SCARE_HOLD) return true;
      // Gone: it is far away again, behind you.
      peek = -1;
      api.sound('glitch');
      at = aroundPlayer(api, KEEP_AWAY, Math.PI + (Math.random() - 0.5));
      restHead();
      headMode = 'rest';
      api.sound('giggle');
      return false;
    }
    scareIn -= dt;
    if (scareIn <= 0 && headMode === 'rest' && !slam) {
      scareIn = between(SCARE_EVERY) - phase * 3;
      quiet = 0;
    }
    return false;
  };

  const ambience = (api: ModApi, dt: number) => {
    pulse += dt * 3;
    if (quiet >= 0) return;
    // A heartbeat you can feel: the ground trembles with it.
    heartbeat -= dt;
    if (heartbeat <= 0) {
      heartbeat =
        mode === 'hide'
          ? Math.max(0.5, 2.6 - (modeTime / hideLength) * 2.1)
          : HEARTBEAT_EVERY - phase * 0.4;
      api.sound('heartbeat');
      api.shake(0.12 + phase * 0.05, 0.25);
    }
    if (mode !== 'fight') return;
    soundIn -= dt;
    if (soundIn <= 0) {
      soundIn = between(SOUND_EVERY);
      api.sound(
        pick(['drone', 'glitch', 'giggle', 'whisper', 'rumble', 'creak', 'scream'] as const),
      );
    }
    // Dark smoke and red sparks drift off it.
    if (Math.random() < dt * 6) {
      api.sparkle(
        at.x + (Math.random() - 0.5) * 4,
        bodyY() + 2 + Math.random() * 12,
        at.z + (Math.random() - 0.5) * 3,
        Math.random() < 0.7 ? 0x1a1a22 : 0xff3020,
      );
    }
  };

  /** Takes its attacks back (before it hides, begs or leaves). */
  const calmDown = (api: ModApi) => {
    slam = null;
    quiet = -1;
    peek = -1;
    flicker = -1;
    stutter = [];
    headMode = 'retract';
    for (const w of wisps) api.removeActor(w.id);
    wisps = [];
  };

  // --- Hide and seek -----------------------------------------------------------

  const startHide = (api: ModApi) => {
    calmDown(api);
    setMode('hide');
    hideLength = between(HIDE_TIME);
    hotCold = 0;
    watcher = null;
    say(api, pick(HIDE_LINES));
    leavePuff(api);
    api.sound('giggle');
    api.sound('glitch');
    api.flash('rgba(0,0,0,0.9)', 0.5);
  };

  /** Gone… the music stops, then it is cold, warm, hot, and it finds you. */
  const hideTick = (api: ModApi, dt: number) => {
    const k = modeTime / hideLength;
    effects(api, dt, k < 0.3 ? 0 : 1 + k * 2);
    if (hotCold < HOT_COLD_LINES.length && k > 0.3 + hotCold * 0.25) {
      say(api, HOT_COLD_LINES[hotCold++]!);
      api.sound(hotCold === 3 ? 'steps' : 'whisper');
    }
    if (k > 0.2 && k < 0.3 && Math.random() < dt * 0.4) api.sound('knock');
    // A tall figure behind you that creeps closer whenever you look away.
    const p = me(api);
    if (!watcher && k > 0.45 && k < 0.8) {
      watcher = { ...aroundPlayer(api, 20, Math.PI), gone: false };
      api.sound('drone');
    }
    if (watcher && !lookingAt(api, watcher, 22)) {
      const d = Math.hypot(watcher.x - p.x, watcher.z - p.z);
      const step = Math.min(d - 1.5, dt * 5);
      watcher.x += ((p.x - watcher.x) / d) * step;
      watcher.z += ((p.z - watcher.z) / d) * step;
      watcher.y = api.groundY(watcher.x, watcher.z, p.y);
      if (d < 3) {
        watcher = null;
        api.sound('stinger');
        api.flash('rgba(0,0,0,0.95)', 0.8);
        api.shake(0.7, 0.6);
      }
    }
    if (k < 1) return;
    // Found you: from right behind you, or in your face.
    watcher = null;
    setMode('fight');
    teleportIn = between(TELEPORT_EVERY);
    attackIn = 3;
    hideIn = between(HIDE_EVERY);
    at = aroundPlayer(api, 7, Math.PI + (Math.random() - 0.5) * 0.6);
    restHead();
    headMode = 'rest';
    if (Math.random() < 0.6) {
      found = true;
      quiet = 0;
    } else {
      api.sound('stinger');
      api.sound('shriek');
      api.screamer(Math.floor(Math.random() * FACES), 0.3);
      api.shake(1, 1.2);
      api.flash('rgba(160,0,0,0.8)', 0.8);
      say(api, pick(FOUND_LINES));
    }
  };

  // --- A tenth left: it takes your things --------------------------------------

  const startTaunt = (api: ModApi) => {
    calmDown(api);
    setMode('taunt');
    at = aroundPlayer(api, 8, 0);
    restHead();
    api.sound('giggle');
    api.sound('stinger');
    api.flash('rgba(0,0,0,0.9)', 0.4);
    const target = api.player.id;
    speech.clear();
    speech.add(who, STRIP_LINES[0]!, (a) => a.animate('ikiyo', 'cast'));
    speech.add(who, STRIP_LINES[1]!, (a) => {
      doLunge(a);
    });
    speech.add(who, STRIP_LINES[2]!, (a) => {
      // Everything you carry and wear, gone.
      a.strip(target);
      if (!stripped.includes(target)) stripped.push(target);
      naked = true;
      a.sound('giggle');
      a.sound('glitch');
      a.flash('rgba(255,255,255,0.9)', 0.4);
      a.shake(0.6, 0.6);
      a.toast('👁️ Ikiyö vei kaikki tavarasi!');
      burst(a, { ...me(a), y: me(a).y + 1 }, [0x050508, 0xff2010, 0x2a2a30], 30);
    });
    speech.add(who, STRIP_LINES[3]!, (a) => a.sound('laugh'));
  };

  const tauntTick = (api: ModApi, dt: number) => {
    speech.update(api, dt);
    moveHead(api, dt);
    effects(api, dt, 1);
    if (!speech.done) return;
    // Gone… and the ones it took start to whisper.
    leavePuff(api);
    api.sound('glitch');
    api.flash('rgba(0,0,0,1)', 1);
    setMode('whisper');
    scene = whispers();
  };

  const whisperTick = (api: ModApi, dt: number) => {
    effects(api, dt, 0);
    if (!scene?.update(api, dt)) return;
    scene.end(api);
    scene = null;
    // Back, in your face.
    setMode('fight');
    at = aroundPlayer(api, 9, (Math.random() - 0.5) * 0.8);
    restHead();
    hideIn = between(HIDE_EVERY);
    attackIn = 2.5;
    api.screamer(Math.floor(Math.random() * FACES), 0.4);
    api.sound('roar');
    api.sound('shriek');
    api.shake(1, 1.5);
    api.flash('rgba(150,0,0,0.85)', 1);
  };

  // --- One hit from the end: it begs -------------------------------------------

  const anyDawn = (api: ModApi) => api.players.some((p) => !p.safe && options.dawn(p.id));

  const startBeg = (api: ModApi) => {
    calmDown(api);
    setMode('beg');
    naked = false;
    speech.clear();
    api.sound('scream');
    api.sound('glitch');
    api.shake(0.5, 1);
    at = aroundPlayer(api, 6, (Math.random() - 0.5) * 0.4);
    restHead();
    if (anyDawn(api)) {
      // It sees the crown's light, and it is afraid.
      speech.add(who, LIGHT_LINES[0]!, (a) => {
        a.flash('rgba(255,236,170,0.6)', 1);
        a.sound('bell');
        a.toast('👑 Aamunkoiton kruunu hehkuu… kruunun kantaja voi lyödä viimeisen iskun!');
      });
    }
    if (round === 0) {
      speech.add(who, BEG_LINES[0]!);
      speech.add(who, BEG_LINES[1]!, (a) => {
        // Your things come back.
        for (const id of stripped) a.giveBack(id);
        stripped = [];
        a.sound('magic');
      });
      speech.add(who, BEG_LINES[2]!);
      speech.add(who, BEG_LINES[3]!);
    } else speech.add(who, BEG_AGAIN_LINES[0]!);
  };

  const begTick = (api: ModApi, dt: number) => {
    speech.update(api, dt);
    // It shrinks and sinks down, its head low.
    shrink = Math.max(0.55, shrink - dt * 0.12);
    moveHead(api, dt);
    if (Math.random() < dt * 0.6) api.sound('whisper');
    if (!speech.done) return;
    if (round === 0) {
      setMode('slink');
      speech.add(who, SLINK_LINES[0]!);
    } else {
      // This time it really goes, to charge up.
      setMode('fade');
      api.sound('scream');
      api.sound('glitch');
      api.shake(0.8, 2);
      api.toast('👁️ Ikiyö vajoaa maahan… se lataa voimiaan.');
    }
  };

  /** It crawls away from you, small and sad… */
  const slinkTick = (api: ModApi, dt: number) => {
    speech.update(api, dt);
    const p = me(api);
    const d = Math.max(0.5, distance(p, at));
    at.x += ((at.x - p.x) / d) * dt * 2.2;
    at.z += ((at.z - p.z) / d) * dt * 2.2;
    at.y = api.groundY(at.x, at.z, at.y);
    shrink = Math.max(0.35, shrink - dt * 0.05);
    moveHead(api, dt);
    if (modeTime < SLINK_TIME) return;
    leavePuff(api);
    api.sound('glitch');
    setMode('calm');
    api.atmosphere(null);
    api.toast('🕯️ Ikiyö pakeni… onko se nyt ohi?');
  };

  /** …all is calm (it even looks like morning)… and then it is back, with all its life. */
  const calmTick = (api: ModApi, dt: number) => {
    effects(api, dt, 0);
    if (modeTime > RELIEF_TIME * 0.7 && modeTime - dt <= RELIEF_TIME * 0.7) api.sound('giggle');
    if (modeTime < RELIEF_TIME) return;
    round = 1;
    hp = MAX_HP;
    refill = 0;
    shrink = 1;
    phase = 2;
    rise = 0;
    setMode('fight');
    at = aroundPlayer(api, 11, 0);
    restHead();
    hideIn = between(HIDE_EVERY);
    attackIn = 4;
    api.screamer(3, 0.5);
    api.sound('stinger');
    api.sound('roar');
    api.sound('laugh');
    api.shake(1, 2.5);
    api.flash('rgba(200,0,0,0.9)', 1.5);
    say(api, pick(TRICK_LINES));
  };

  // --- The battle ----------------------------------------------------------------

  const fightTick = (api: ModApi, dt: number) => {
    // Lights flickering: it moves while it is dark.
    if (flicker >= 0) {
      flicker += dt;
      if (Math.random() < dt * 4) api.sound('glitch');
      if (flicker > FLICKER_TIME / 2 && flicker - dt <= FLICKER_TIME / 2) {
        at = aroundPlayer(api, KEEP_AWAY - 3, (Math.random() - 0.5) * 2.5);
        restHead();
        api.sound('giggle');
      }
      if (flicker >= FLICKER_TIME) flicker = -1;
    }
    if (refill >= 0) {
      refill += dt;
      if (refill >= REFILL_TIME) refill = -1;
    }

    const p = me(api);
    hideIn -= dt;
    if (scare(api, dt)) return;

    // It never walks: it vanishes in smoke and is somewhere else.
    effects(api, dt);
    if (stutter.length > 0) {
      stutterIn -= dt;
      if (stutterIn <= 0) {
        stutterIn = STUTTER_GAP;
        teleport(api, stutter.shift()!);
      }
    } else if (headMode === 'rest' && !slam) {
      teleportIn -= dt;
      if (teleportIn <= 0) {
        teleportIn = between(TELEPORT_EVERY) - phase * 0.6;
        nextPlace(api);
      }
    }
    moveHead(api, dt);

    if (slam) {
      slam.t += dt;
      if (slam.t >= SLAM_WARNING) {
        api.animate('ikiyo', 'attack');
        api.sound('boom');
        api.sound('rumble');
        api.shake(0.95, 0.7);
        burst(api, { ...slam, y: slam.y + 0.2 }, [0x1a1a1a, 0x5a5a5a, 0xff3020], 24);
        if (distance(p, slam) < SLAM_RADIUS && Math.abs(p.y - slam.y) < 3) {
          api.hurt(SLAM_DAMAGE, 'Ikiyön kynnet iskivät maahan!');
          gotYou(api);
        }
        slam = null;
      }
    } else if (headMode === 'rest') {
      attackIn -= dt;
      if (attackIn <= 0) {
        attackIn = between(ATTACK_EVERY) - phase * 0.8;
        attack(api);
      }
      // Now and then it goes off to play hide and seek.
      if (hideIn <= 0 && stutter.length === 0) {
        startHide(api);
        return;
      }
    }

    // Skulls fly at you.
    for (const w of [...wisps]) {
      w.age += dt;
      moveTowards(w, { ...p, y: p.y + 1.2 }, WISP_SPEED * dt);
      if (distance(w, p) < 1.1 && Math.abs(w.y - (p.y + 1.2)) < 1.5) {
        api.hurt(WISP_DAMAGE, 'Varjokallo puraisi!');
        api.sound('bite');
        api.removeActor(w.id);
        wisps = wisps.filter((x) => x !== w);
      } else if (w.age > 14) {
        api.removeActor(w.id);
        wisps = wisps.filter((x) => x !== w);
      }
    }

    // Broken sentences now and then.
    tauntIn -= dt;
    if (tauntIn <= 0) {
      tauntIn = between(TAUNT_EVERY);
      say(api, pick(TAUNTS));
    }
  };

  const win = (api: ModApi) => {
    won = true;
    hp = 0;
    api.flash('rgba(255,244,210,1)', 3);
    api.shake(1, 1.5);
    api.sound('scream');
    api.sound('magic');
    api.toast('🌅 Aamu koitti! Ikiyö katosi valoon.');
    burst(api, { ...at, y: bodyY() + 6 }, [0xfff2b0, 0xffd060, 0xffffff], 24);
  };

  const intro = (): string[] => {
    if (options.from) return [];
    if (options.visit === 0) return [...FIRST_LINES];
    return [AGAIN_LINES[(options.visit - 1) % AGAIN_LINES.length]!];
  };

  return {
    who,
    trophy: {
      id: 'halloween-ikiyo',
      emoji: '🌅',
      name: 'Aamunkoitto',
      description: 'Löysit salaisuuden ja löit Ikiyöltä viimeisenkin elämän.',
      secret: true,
    },
    mood: MOODS[1],
    intro: intro(),
    defeat: '{screams} Aamu… ei… EI… {whispers} minä…',
    escape: '{growls} Minä… lataan… voimani… {whispers} ja palaan… kun et…',
    start(api) {
      // It rises out of the ground in front of you (or where the stranger stood).
      at = options.from ? { ...options.from } : aroundPlayer(api, KEEP_AWAY + 4, 0);
      rise = 0;
      restHead();
      api.sound('rumble');
      api.sound('roar');
      api.sound('stinger');
      api.shake(0.9, 3);
      api.flash('rgba(0,0,0,0.95)', 2);
      show(api);
    },
    update(api, dt) {
      if (won) return 'won';
      time += dt;
      modeTime += dt;
      rise += dt / 3;
      hitLineIn -= dt;
      mercyIn -= dt;
      ambience(api, dt);
      if (mode !== 'calm') api.atmosphere(mood(api));
      switch (mode) {
        case 'fight':
          fightTick(api, dt);
          break;
        case 'hide':
          hideTick(api, dt);
          break;
        case 'taunt':
          tauntTick(api, dt);
          break;
        case 'whisper':
          whisperTick(api, dt);
          break;
        case 'beg':
          begTick(api, dt);
          break;
        case 'slink':
          slinkTick(api, dt);
          break;
        case 'calm':
          calmTick(api, dt);
          break;
        case 'fade':
          if (Math.random() < dt * 3) api.sound('glitch');
          api.shake(0.35, 0.2);
          moveHead(api, dt);
          if (modeTime >= FADE_TIME) return 'fled';
          break;
      }
      show(api);
      return 'fight';
    },
    hit(api, id, damage, by = api.player.id) {
      if (mode === 'beg') {
        // Only the one wearing the dawn's crown can strike the last blow.
        if (options.dawn(by)) win(api);
        else if (mercyIn <= 0) {
          mercyIn = 3;
          say(api, pick(MERCY_LINES));
          api.animate('ikiyo', 'hurt');
        }
        return;
      }
      if (mode !== 'fight' || peek >= 0) return;
      if (id.startsWith('wisp')) {
        const w = wisps.find((x) => x.id === id);
        if (!w) return;
        api.removeActor(id);
        wisps = wisps.filter((x) => x !== w);
        api.sound('pop');
        burst(api, w, [0xe8e2d0, 0xff3020], 10);
        damage = WISP_HIT;
      } else if (id === 'head') {
        // The head hurts most.
        damage *= 1.5;
        api.animate('head', 'hurt');
      } else if (id !== 'ikiyo' && !/^n\d+$/.test(id)) {
        return;
      }
      if (naked) damage = Math.max(damage, NAKED_HIT);
      // The first time, it always stops at a tenth to take your things.
      const takes = round === 0 && !naked && stripped.length === 0;
      hp = Math.max(takes ? STRIP_AT : LAST, hp - damage);
      api.animate('ikiyo', 'hurt');
      if (Math.random() < 0.3) api.sound('glitch');
      if (hitLineIn <= 0 && Math.random() < 0.35) {
        hitLineIn = 8;
        say(api, pick(HIT_LINES));
      }
      if (phase === 1 && hp <= MAX_HP * PHASE_2) goPhase(api, 2);
      else if (phase === 2 && hp <= MAX_HP * PHASE_3) goPhase(api, 3);
      if (hp <= LAST) startBeg(api);
      else if (takes && hp <= STRIP_AT) startTaunt(api);
    },
    end(api) {
      // Whatever it took comes back.
      for (const pid of stripped) api.giveBack(pid);
      stripped = [];
      scene?.end(api);
      scene = null;
      api.removeActor('ikiyo');
      api.removeActor('head');
      for (let i = 0; i < NECK_PIECES; i++) api.removeActor(`n${i}`);
      api.removeActor('mark');
      api.removeActor('watcher');
      for (const w of wisps) api.removeActor(w.id);
      wisps = [];
      for (const puff of puffs) api.removeActor(puff.id);
      puffs = [];
      for (const e of eyes) api.removeActor(e.id);
      eyes = [];
    },
    where() {
      return at;
    },
  };
}
