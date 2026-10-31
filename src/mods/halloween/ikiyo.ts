// 👁️ Ikiyö, the seventh: it only comes for those who have won all six
// trophies, by day or by night. A giant that whispers in broken sentences.
// It has three moods, each darker than the last:
//   1. Kuiskaus (whisper): grey fog, heartbeats; claws slam down on red circles.
//   2. Punainen kuu (red moon): red sky, lightning; it screams (you slow down)
//      and sends floating skulls at you (hit them: it hurts the giant too).
//   3. Ikiyö (endless night): almost dark; it glitches away and comes back behind you.
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
import { IKIYO, MARK, WISP } from './ikiyoModel';

const MAX_HP = 180;
/** The last sliver: below this it leaves (or, with the secret, is beaten). */
const LAST = 4;
const PHASE_2 = 0.66;
const PHASE_3 = 0.33;
/** How far away it likes to hover. */
const KEEP_AWAY = 15;
/** About sixteen blocks tall. */
const SIZE = 1.3;
const DRIFT_SPEED = 2.2;
const ATTACK_EVERY: [number, number] = [5.5, 8.5];
const SLAM_WARNING = 1.5;
const SLAM_RADIUS = 3.6;
const SLAM_DAMAGE = 4;
const WISP_SPEED = 5.5;
const WISP_DAMAGE = 2;
const WISP_HIT = 7;
const MAX_WISPS = 6;
const TAUNT_EVERY: [number, number] = [11, 18];
const SOUND_EVERY: [number, number] = [6, 11];
const HEARTBEAT_EVERY = 2.2;
/** Seconds it takes to sink away with its last sliver. */
const FADE_TIME = 9;

const MOODS: Record<1 | 2 | 3, Atmosphere> = {
  1: {
    music: 'ikiyo-1',
    fogColor: 0x0e0e16,
    fogNear: 4,
    fogFar: 44,
    darkness: 0.55,
    vignette: 0.6,
    tint: 'rgba(40,40,90,0.18)',
  },
  2: {
    music: 'ikiyo-2',
    fogColor: 0x2a0406,
    fogNear: 3,
    fogFar: 38,
    darkness: 0.62,
    vignette: 0.75,
    tint: 'rgba(150,0,0,0.22)',
    lightning: true,
  },
  3: {
    music: 'ikiyo-3',
    fogColor: 0x020203,
    fogNear: 2,
    fogFar: 26,
    darkness: 0.86,
    vignette: 0.95,
    tint: 'rgba(0,0,0,0.25)',
  },
};

const TAUNTS = [
  'Kuulen… sydämesi…',
  'Kukaan… ei ole… koskaan…',
  'Sinun palikkasi… ovat… minun…',
  'Hhhhh… lähempänä… kuin…',
  'Juokse… jos…',
  'Minä… näen… sinut…',
];
const HIT_LINES = ['Heh… heh… hhhh…', 'Sinä… et voi…', 'Kutittaa… vain…'];

type Wisp = Vec & { id: string; age: number };

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

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
  const who = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

  const mood = (): Atmosphere => {
    // The dark edges beat like a heart.
    const m = MOODS[phase];
    return { ...m, vignette: Math.min(1, (m.vignette ?? 0) + Math.max(0, Math.sin(pulse)) * 0.08) };
  };

  const show = (api: ModApi) => {
    const sink = fading >= 0 ? Math.min(1, fading / FADE_TIME) * 12 : 0;
    const up = (Math.min(1, rise) - 1) * 13;
    api.actor('ikiyo', IKIYO, {
      ...at,
      y: at.y + up - sink,
      yaw: yawTo(at, me(api)),
      scale: SIZE,
    });
    for (const w of wisps) api.actor(w.id, WISP, { ...w, yaw: yawTo(w, me(api)) });
    if (slam) api.actor('mark', MARK, { ...slam, yaw: slam.t * 2 });
    else api.removeActor('mark');
    api.bossBar(`👁️ Ikiyö`, Math.max(0.01, hp / MAX_HP));
  };

  const say = (api: ModApi, text: string) => api.say(who, text);

  const goPhase = (api: ModApi, next: 2 | 3) => {
    phase = next;
    api.animate('ikiyo', 'cast');
    api.sound('roar');
    api.sound('scream');
    api.shake(1, 2.5);
    api.flash(next === 2 ? 'rgba(200,0,0,0.85)' : 'rgba(0,0,0,0.95)', 1.6);
    say(
      api,
      next === 2
        ? 'Kuu… muuttuu… punaiseksi… kun minä…'
        : 'Valot… sammuvat… yksi… kerrallaan… ja sitten…',
    );
  };

  const doSlam = (api: ModApi) => {
    const p = me(api);
    slam = { x: p.x, y: api.groundY(p.x, p.z, p.y), z: p.z, t: 0 };
    api.sound('drone');
    api.sound('rumble');
  };

  const doScream = (api: ModApi) => {
    api.animate('ikiyo', 'cast');
    api.sound('roar');
    api.sound('scream');
    api.shake(0.75, 1.8);
    api.flash('rgba(120,0,0,0.6)', 0.9);
    api.effect({ walkSpeed: 0.55, jumpSpeed: 0.7 }, 3.5);
    const p = me(api);
    const d = Math.max(1, distance(p, at));
    api.push(((p.x - at.x) / d) * 9, 4, ((p.z - at.z) / d) * 9);
  };

  const doWisps = (api: ModApi) => {
    api.animate('ikiyo', 'cast');
    api.sound('whisper');
    for (let i = 0; i < 3 && wisps.length < MAX_WISPS; i++) {
      const a = Math.random() * Math.PI * 2;
      wisps.push({
        id: `wisp${counter++}`,
        x: at.x + Math.sin(a) * 2.5,
        y: at.y + 7 + Math.random() * 2,
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
    api.sound('scream');
  };

  const attack = (api: ModApi) => {
    const choices: ((api: ModApi) => void)[] = [doSlam];
    if (phase >= 2) choices.push(doScream, doWisps);
    if (phase >= 3) choices.push(doBlink, doSlam);
    choices[Math.floor(Math.random() * choices.length)]!(api);
  };

  const ambience = (api: ModApi, dt: number) => {
    pulse += dt * 3;
    // A heartbeat you can feel: the ground trembles with it.
    heartbeat -= dt;
    if (heartbeat <= 0) {
      heartbeat = HEARTBEAT_EVERY - phase * 0.35;
      api.sound('heartbeat');
      api.shake(0.12 + phase * 0.05, 0.25);
    }
    soundIn -= dt;
    if (soundIn <= 0) {
      soundIn = between(SOUND_EVERY);
      const sounds = ['drone', 'glitch', 'whisper', 'rumble', 'creak'] as const;
      api.sound(sounds[Math.floor(Math.random() * sounds.length)]!);
    }
    // Dark smoke and red sparks drift off it.
    if (Math.random() < dt * 6) {
      api.sparkle(
        at.x + (Math.random() - 0.5) * 4,
        at.y + 2 + Math.random() * 10,
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
      say(api, 'Mitä… tuo… valo… on…?');
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
      burst(api, { ...at, y: at.y + 6 }, [0xfff2b0, 0xffd060, 0xffffff], 24);
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
      'Kuusi… pokaalia… ja nyt… sinä…',
      'Minä olin täällä… ennen kuin… ensimmäinen palikka…',
      'Älä… katso… taakse…',
    ],
    defeat: 'Aamu… ei… EI… minä…',
    escape: 'Minä… lataan… voimani… ja palaan… kun et…',
    start(api) {
      // It rises out of the ground in front of you.
      at = aroundPlayer(api, KEEP_AWAY + 4, 0);
      rise = 0;
      api.sound('rumble');
      api.sound('roar');
      api.shake(0.9, 3);
      api.flash('rgba(0,0,0,0.9)', 2);
      show(api);
    },
    update(api, dt) {
      if (won) return 'won';
      rise += dt / 3;
      ambience(api, dt);
      api.atmosphere(mood());

      // The last sliver: it sinks away to charge up (or the secret beats it).
      if (fading >= 0) {
        fading += dt;
        if (Math.random() < dt * 3) api.sound('glitch');
        api.shake(0.35, 0.2);
        show(api);
        if (fading >= FADE_TIME) return 'fled';
        return 'fight';
      }

      // Hover at a distance, drifting round you; come closer for a slam.
      const p = me(api);
      const goal = slam
        ? { x: slam.x + (at.x - slam.x) * 0.35, y: slam.y, z: slam.z + (at.z - slam.z) * 0.35 }
        : aroundPlayer(api, KEEP_AWAY, Math.sin(pulse * 0.05) * 0.8);
      moveTowards(
        at,
        { ...goal, y: api.groundY(goal.x, goal.z, p.y) },
        DRIFT_SPEED * (slam ? 2.5 : 1) * dt,
      );

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
      } else {
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
          api.sound('pop');
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
        say(api, TAUNTS[Math.floor(Math.random() * TAUNTS.length)]!);
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
      } else if (id !== 'ikiyo') {
        return;
      }
      hp = Math.max(LAST, hp - damage);
      api.animate('ikiyo', 'hurt');
      if (Math.random() < 0.3) api.sound('glitch');
      if (hitLineIn <= 0 && Math.random() < 0.35) {
        hitLineIn = 8;
        say(api, HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)]!);
      }
      if (phase === 1 && hp <= MAX_HP * PHASE_2) goPhase(api, 2);
      else if (phase === 2 && hp <= MAX_HP * PHASE_3) goPhase(api, 3);
      if (hp <= LAST) {
        if (armed) arm(api);
        else {
          // It can't be beaten: it leaves to charge up.
          fading = 0;
          slam = null;
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
      api.removeActor('mark');
      for (const w of wisps) api.removeActor(w.id);
      wisps = [];
    },
    where() {
      return at;
    },
  };
}
