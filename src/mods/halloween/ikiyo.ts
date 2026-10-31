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
// It can't be beaten: with its very last sliver of life it sinks into the
// ground to "charge up", and comes back later. Unless someone knows the
// secret word… (see `arm`).

import type { Atmosphere, ModApi } from '../types';
import {
  aroundPlayer,
  burst,
  distance,
  me,
  moveTowards,
  yawTo,
  type Encounter,
  type Vec,
} from './encounter';
import { EYES, IKIYO, IKIYO_HEAD, MARK, NECK, PUFF, WISP } from './ikiyoModel';

const MAX_HP = 180;
/** The last sliver: below this it leaves (or, with the secret, is beaten). */
const LAST = 4;
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
];
const HIT_LINES = [
  '{laughs maniacally} Heh… heh… hhhh…',
  '{growls} Sinä… et voi…',
  '{whispers} Kutittaa… {screams} VAIN!',
];
/** Screamed right in your face. */
const SCREAMS = [
  '{screams} HHHAAAAAAAAH!',
  '{shrieks} KIIIIIRRRRGH!',
  '{screams} SINÄÄÄÄ!',
  '{growls} GRRRAAAAAH!',
];

/** Ikiyö's own words at the end of the story told before it comes (prelude.ts). */
export const OMEN_LINES = {
  /** The last line of the diary, in another hand. */
  story: '{whispers} Nyt… on… sinun… {screams} VUOROSI!',
  /** When it comes back later (the short warning). */
  again: '{whispers} Minä… muistan… {growls} sinut…',
} as const;

type Wisp = Vec & { id: string; age: number };
type Head = 'rest' | 'windup' | 'lunge' | 'bite' | 'retract';

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

export interface IkiyoEncounter extends Encounter {
  /** The secret word was said: now its last life can be taken. */
  arm(api: ModApi): void;
}

export function ikiyo(): IkiyoEncounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let hp = MAX_HP;
  let phase: 1 | 2 | 3 = 1;
  let attackIn = 4;
  let slam: (Vec & { t: number }) | null = null;
  let wisps: Wisp[] = [];
  let counter = 0;
  let tauntIn = between(TAUNT_EVERY);
  let soundIn = 2;
  let heartbeat = 0;
  let hitLineIn = 0;
  let fading = -1;
  let armed = false;
  let won = false;
  let rise = 0;
  let pulse = 0;
  let time = 0;
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
  let flicker = -1;
  let teleportIn = 2.5;
  let stutter: Vec[] = [];
  let stutterIn = 0;
  let strobe = 0;
  let puffs: (Vec & { id: string; age: number })[] = [];
  let eyesIn = 3;
  let subliminalIn = between(SUBLIMINAL_EVERY);
  let eyes: (Vec & { id: string; age: number; life: number; yaw: number })[] = [];
  const who = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

  const bodyY = () => {
    const sink = fading >= 0 ? Math.min(1, fading / FADE_TIME) * 14 : 0;
    const up = (Math.min(1, rise) - 1) * 15;
    return at.y + up - sink;
  };
  const socket = (): Vec => ({ x: at.x, y: bodyY() + SOCKET, z: at.z });
  const eye = (api: ModApi): Vec => ({ x: api.player.x, y: api.player.y + 1.6, z: api.player.z });

  const mood = (api: ModApi): Atmosphere => {
    const m = MOODS[phase];
    // Your eyelids feel heavy: they droop with each heartbeat, more when it is near.
    const near = Math.max(0, 1 - distance(me(api), at) / 14);
    let lids = 0.06 + Math.max(0, Math.sin(pulse)) * 0.08 + near * 0.25 + (phase - 1) * 0.05;
    if (fading >= 0) lids = 0;
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
    puffs.push({ id: `puff${counter++}`, ...at, y: bodyY(), age: 0 });
    while (puffs.length > MAX_PUFFS) api.removeActor(puffs.shift()!.id);
    at = { ...to, y: api.groundY(to.x, to.z, me(api).y) };
    head = { ...socket(), y: socket().y + NECK_REST };
    strobe = STROBE_TIME;
    api.sound('glitch');
    if (Math.random() < 0.4) api.sound('whisper');
    api.flash(Math.random() < 0.5 ? 'rgba(0,0,0,0.85)' : 'rgba(110,0,0,0.5)', 0.18);
    api.shake(0.25, 0.2);
    // Now and then a face in the flicker, too short to be sure you saw it.
    if (phase >= 2 && Math.random() < 0.15) api.screamer(Math.floor(Math.random() * FACES), 0.07);
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
  const effects = (api: ModApi, dt: number) => {
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
    if (eyesIn <= 0 && eyes.length < MAX_EYES && quiet < 0) {
      eyesIn = between(EYES_EVERY) / phase;
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
    const peeking = peek >= 0;
    api.actor('ikiyo', IKIYO, {
      ...at,
      y: bodyY(),
      yaw: yawTo(at, p),
      scale: SIZE,
      visible: !peeking,
    });
    // The head looks you in the eye.
    const e = eye(api);
    const hx = e.x - head.x;
    const hz = e.z - head.z;
    const hy = e.y - (head.y + HEAD_MIDDLE);
    api.actor('head', IKIYO_HEAD, {
      x: head.x + twitchOffset.x,
      y: head.y + twitchOffset.y,
      z: head.z + twitchOffset.z,
      yaw: Math.atan2(-hx, -hz) + (twitch > 0 ? (Math.random() - 0.5) * 0.6 : 0),
      pitch: Math.atan2(hy, Math.hypot(hx, hz)),
      scale: SIZE,
    });
    // The neck: a chain of pieces from the body to the head.
    const s = socket();
    const d = { x: head.x - s.x, y: head.y + 0.3 * SIZE - s.y, z: head.z - s.z };
    const flat = Math.hypot(d.x, d.z);
    const yaw = flat > 0.3 ? Math.atan2(-d.x, -d.z) : yawTo(s, p);
    const pitch = -Math.atan2(flat, d.y);
    for (let i = 0; i < NECK_PIECES; i++) {
      const k = i / NECK_PIECES;
      api.actor(`n${i}`, NECK, {
        x: s.x + d.x * k,
        y: s.y + d.y * k,
        z: s.z + d.z * k,
        yaw,
        pitch,
        scale: SIZE,
        visible: !peeking,
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
    for (const e of eyes) api.actor(e.id, EYES, { ...e, scale: 1.4 });
    if (slam) api.actor('mark', MARK, { ...slam, yaw: slam.t * 2 });
    else api.removeActor('mark');
    api.bossBar(`👁️ Ikiyö`, Math.max(0.01, hp / MAX_HP));
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
    head = { ...socket(), y: socket().y + NECK_REST };
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

  /** Moves the head: resting on its neck, pulling back, lunging, biting, coming back. */
  const moveHead = (api: ModApi, dt: number) => {
    const s = socket();
    const e = eye(api);
    const rest: Vec = {
      x: s.x + Math.sin(time * 0.8) * 0.7,
      y: s.y + NECK_REST + Math.sin(time * 1.3) * 0.35,
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
      say(api, pick(SCREAMS));
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
      head = { ...socket(), y: socket().y + NECK_REST };
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
      heartbeat = HEARTBEAT_EVERY - phase * 0.4;
      api.sound('heartbeat');
      api.shake(0.12 + phase * 0.05, 0.25);
    }
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

  const arm = (api: ModApi) => {
    if (!armed) {
      armed = true;
      api.sound('magic');
      api.flash('rgba(255,236,170,0.7)', 1.2);
      say(api, '{whispers} Mitä… tuo… valo… {shrieks} EI VALOA!');
      api.toast('🌅 Aamun valo on kanssasi… vie sen viimeinen elämä!');
    }
    // With its last sliver left, the light takes it.
    if (hp <= LAST || fading >= 0) {
      won = true;
      hp = 0;
      api.flash('rgba(255,244,210,1)', 3);
      api.shake(1, 1.5);
      api.sound('scream');
      api.sound('magic');
      api.toast('🌅 Aamu koitti! Ikiyö katosi valoon.');
      burst(api, { ...at, y: bodyY() + 6 }, [0xfff2b0, 0xffd060, 0xffffff], 24);
    }
  };

  return {
    who,
    trophy: {
      id: 'halloween-ikiyo',
      emoji: '🌅',
      name: 'Aamunkoitto',
      description: 'Löysit salaisuuden ja veit Ikiyöltä viimeisenkin elämän.',
      secret: true,
    },
    mood: MOODS[1],
    intro: [
      '{whispers} Kuusi… pokaalia… {screams} JA NYT SINÄ!',
      '{growls} Minä olin täällä… ennen kuin… {whispers} ensimmäinen palikka…',
      '{whispers} Älä… katso… taakse… {shrieks} ÄLÄ!',
    ],
    defeat: '{screams} Aamu… ei… EI… {whispers} minä…',
    escape: '{growls} Minä… lataan… voimani… {whispers} ja palaan… kun et…',
    start(api) {
      // It rises out of the ground in front of you.
      at = aroundPlayer(api, KEEP_AWAY + 4, 0);
      rise = 0;
      head = { ...socket(), y: socket().y + NECK_REST };
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
      rise += dt / 3;
      ambience(api, dt);

      // The last sliver: it sinks away to charge up (or the secret beats it).
      if (fading >= 0) {
        fading += dt;
        api.atmosphere(mood(api));
        if (Math.random() < dt * 3) api.sound('glitch');
        api.shake(0.35, 0.2);
        moveHead(api, dt);
        show(api);
        if (fading >= FADE_TIME) return 'fled';
        return 'fight';
      }

      // Lights flickering: it moves while it is dark.
      if (flicker >= 0) {
        flicker += dt;
        if (Math.random() < dt * 4) api.sound('glitch');
        if (flicker > FLICKER_TIME / 2 && flicker - dt <= FLICKER_TIME / 2) {
          at = aroundPlayer(api, KEEP_AWAY - 3, (Math.random() - 0.5) * 2.5);
          head = { ...socket(), y: socket().y + NECK_REST };
          api.sound('giggle');
        }
        if (flicker >= FLICKER_TIME) flicker = -1;
      }
      api.atmosphere(mood(api));

      const p = me(api);
      if (scare(api, dt)) {
        show(api);
        return 'fight';
      }

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
          }
          slam = null;
        }
      } else if (headMode === 'rest') {
        attackIn -= dt;
        if (attackIn <= 0) {
          attackIn = between(ATTACK_EVERY) - phase * 0.8;
          attack(api);
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
      hitLineIn -= dt;
      if (tauntIn <= 0) {
        tauntIn = between(TAUNT_EVERY);
        say(api, pick(TAUNTS));
      }
      show(api);
      return 'fight';
    },
    hit(api, id, damage) {
      if (fading >= 0) return;
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
      hp = Math.max(LAST, hp - damage);
      api.animate('ikiyo', 'hurt');
      if (Math.random() < 0.3) api.sound('glitch');
      if (hitLineIn <= 0 && Math.random() < 0.35) {
        hitLineIn = 8;
        say(api, pick(HIT_LINES));
      }
      if (phase === 1 && hp <= MAX_HP * PHASE_2) goPhase(api, 2);
      else if (phase === 2 && hp <= MAX_HP * PHASE_3) goPhase(api, 3);
      if (hp <= LAST) {
        if (armed) arm(api);
        else {
          // It can't be beaten: it leaves to charge up.
          fading = 0;
          slam = null;
          quiet = -1;
          peek = -1;
          flicker = -1;
          headMode = 'retract';
          for (const w of wisps) api.removeActor(w.id);
          wisps = [];
          api.sound('scream');
          api.sound('glitch');
          api.shake(0.8, 2);
          api.toast('👁️ Ikiyö vajoaa maahan… se lataa voimiaan.');
        }
      }
    },
    arm,
    end(api) {
      api.removeActor('ikiyo');
      api.removeActor('head');
      for (let i = 0; i < NECK_PIECES; i++) api.removeActor(`n${i}`);
      api.removeActor('mark');
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
