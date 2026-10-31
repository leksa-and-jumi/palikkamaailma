// 🕯️ After Ikiyö has taken everything you had, it is gone for a while…
// and in the dark you hear the ones it took before you, whispering to each
// other and to you: a small scared voice and a very old one. Red eyes open
// around you (they are theirs), steps come when you stand still, and in the
// end Ikiyö itself starts counting, like in hide and seek.

import type { Atmosphere, ModApi, Speaker } from '../types';
import { aroundPlayer, me, yawTo, type Vec } from './encounter';
import { EYES } from './ikiyoModel';
import { Speech } from './scene';

const SMALL: Speaker = { emoji: '🕯️', name: 'Pieni ääni', color: '#c4cad8' };
const OLD: Speaker = { emoji: '🌫️', name: 'Vanha ääni', color: '#a3aba6' };
const IKIYO: Speaker = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

/** The small voice (a child it took long ago). */
const SMALL_LINES = [
  'Psst. Hei. Kuuletko meitä?',
  'Se vei kaiken. Niin se teki minullekin.',
  'Ensin tavarat. Sitten valot. Sitten…',
  'Älä pelkää, uusi. Se haluaa, että pelkäät.',
  'Mutta älä usko sitä, kun se anelee. Se valehtelee aina.',
  'Kuulen sen taas. Se laskee…',
];
/** The old voice (it has been here longest). */
const OLD_LINES = [
  'Miekan. Haarniskan. Jopa leivän.',
  'Hys. Se kuuntelee aina.',
  'Me olemme niitä silmiä pimeässä. Me katsomme sinua.',
  'Se on heikko nyt. Vielä vähän… ja se alkaa anella.',
  'Se ei ole poissa. Se vain leikkii piilosta.',
];
/** Ikiyö, far away, then near. */
const IKIYO_LINES = [
  '{whispers} Minä… kuulen… teidät…',
  '{whispers} Kahdeksan… yhdeksän… {giggles} kymmenen…',
  '{whispers} Valmis… tai… ei… {screams} TÄÄLTÄ TULLAAN!',
];

const MAX_EYES = 6;

export interface Whispers {
  /** True when it is over and Ikiyö comes back. */
  update(api: ModApi, dt: number): boolean;
  end(api: ModApi): void;
}

export function whispers(): Whispers {
  const speech = new Speech(0.9);
  let over = -1;
  let dark = 0.4;
  let eyesWanted = 0;
  let heartbeat = 2.5;
  let fast = false;
  let stillFor = 0;
  let stepsIn = 6;
  let last: Vec | null = null;
  let eyes: (Vec & { id: string; age: number; life: number })[] = [];
  let counter = 0;

  const small = (i: number, then?: (api: ModApi) => void) =>
    speech.add(SMALL, SMALL_LINES[i]!, then);
  const old = (i: number, then?: (api: ModApi) => void) => speech.add(OLD, OLD_LINES[i]!, then);
  const ikiyo = (i: number, then?: (api: ModApi) => void) =>
    speech.add(IKIYO, IKIYO_LINES[i]!, then);

  small(0);
  small(1);
  old(0);
  small(2, () => {
    eyesWanted = 2;
  });
  old(1);
  ikiyo(0, (api) => {
    api.sound('knock');
    api.shake(0.2, 0.6);
  });
  small(3);
  old(2, () => {
    eyesWanted = MAX_EYES;
  });
  old(3);
  small(4);
  old(4);
  small(5, () => {
    fast = true;
  });
  ikiyo(1, () => {
    dark = 0.85;
  });
  ikiyo(2, (api) => {
    api.sound('stinger');
    api.shake(0.6, 1);
    over = 1.4;
  });

  const mood = (): Atmosphere => ({
    fogColor: 0x0a0a10,
    fogNear: 3,
    fogFar: 34,
    darkness: dark,
    vignette: 0.85,
    tint: 'rgba(20,20,40,0.22)',
    eyelids: fast ? 0.35 : 0.12,
    // Silence: only the whispers.
    music: undefined,
  });

  return {
    update(api, dt) {
      speech.update(api, dt);
      if (dark < 0.7 && !fast) dark = Math.min(0.7, dark + dt * 0.02);
      api.atmosphere(mood());
      const p = me(api);

      // Your heart races at the end.
      heartbeat -= dt;
      if (heartbeat <= 0) {
        heartbeat = fast ? 0.55 : 1.8;
        api.sound('heartbeat');
      }
      // Steps when you stand still.
      const moved = last ? Math.hypot(p.x - last.x, p.z - last.z) : 0;
      last = { ...p };
      stillFor = moved < 0.02 ? stillFor + dt : 0;
      stepsIn -= dt;
      if (stillFor > 1.5 && stepsIn <= 0) {
        stepsIn = 6 + Math.random() * 4;
        api.sound('steps');
      }

      // Their eyes, opening around you in the dark.
      if (eyes.length < eyesWanted && Math.random() < dt * 1.5) {
        const spot = aroundPlayer(api, 6 + Math.random() * 8, Math.random() * Math.PI * 2);
        eyes.push({
          id: `weyes${counter++}`,
          ...spot,
          y: spot.y + 0.8 + Math.random() * 1.8,
          age: 0,
          life: 4 + Math.random() * 5,
        });
      }
      for (const e of [...eyes]) {
        e.age += dt;
        if (e.age > e.life) {
          api.removeActor(e.id);
          eyes = eyes.filter((x) => x !== e);
        } else api.actor(e.id, EYES, { ...e, yaw: yawTo(e, p), scale: 1.3 });
      }

      if (over > 0) over -= dt;
      return over !== -1 && over <= 0;
    },
    end(api) {
      for (const e of eyes) api.removeActor(e.id);
      eyes = [];
    },
  };
}
