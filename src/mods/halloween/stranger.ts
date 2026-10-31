// 🙂 Sometimes Ikiyö does not come with a story: a friendly stranger in a
// long coat walks up to you instead, waving, a lantern in its hand, saying
// kind things in a soft voice. Something is not quite right… the closer it
// gets, the more wrong it is: its smile is too wide, its eyes go black, it
// only moves when you are not looking. When it reaches you (or you hit it,
// or you wait too long), it changes, and Ikiyö rises where it stood.

import type { Atmosphere, ModApi, Speaker } from '../types';
import { aroundPlayer, burst, distance, lookingAt, me, yawTo, type Vec } from './encounter';
import { CHANGE_LINES } from './ikiyo';
import { STRANGER, STRANGER_WRONG } from './ikiyoModel';
import { Speech } from './scene';

const KIND: Speaker = { emoji: '🙂', name: 'Muukalainen', color: '#ffe0a8' };
const IKIYO: Speaker = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

/** Kind words, one by one, as it walks up to you. */
const STRANGER_LINES = [
  'Hei! Hei siellä! Älä pelkää, minä olen ystävä.',
  'Eksyitkö? Minä tiedän tien kotiin. Tule, tule lähemmäs.',
  'Minulla on sinulle lahja. Ihan pieni. Ihan oikea.',
  'Me voidaan leikkiä. Minä tiedän tosi hauskan leikin.',
  'Sinulla on niin kauniit tavarat. Saanko koskea?',
];
/** When you back away from it. */
const AWAY_LINES = ['Miksi sinä perääntyt? Minä olen kiltti. Kaikki sanovat niin.'];
/** Once it has gone wrong: slow and flat. */
const WRONG_LINES = [
  'Seiso paikallasi. Seiso. Paikallasi.',
  'Älä käännä selkääsi minulle.',
  'Minä olen ihan kiltti. Ihan. Kiltti.',
];

const START = 36;
const WALK = 1.25;
/** It goes wrong this close (or after this long). */
const WRONG_AT = 7;
const WRONG_AFTER = 40;
/** It changes this close (or after this long once wrong). */
const CHANGE_AT = 3.2;
const CHANGE_AFTER = 26;
const CHANGE_TIME = 2.2;

export interface Stranger {
  /** True when it has changed and Ikiyö should rise. */
  update(api: ModApi, dt: number): boolean;
  hit(api: ModApi, id: string): void;
  /** Where Ikiyö rises. */
  spot(): Vec | null;
  end(api: ModApi): void;
}

export function stranger(): Stranger {
  const speech = new Speech(1.6);
  let at: Vec | null = null;
  let time = 0;
  let wrongTime = -1;
  let change = -1;
  let next = 0;
  let nearest = Infinity;
  let backed = false;
  let wrongLine = 0;
  let wrongLineIn = 4;
  let twitch: Vec = { x: 0, y: 0, z: 0 };

  const goWrong = (api: ModApi) => {
    if (wrongTime >= 0) return;
    wrongTime = 0;
    speech.clear();
    api.sound('glitch');
    api.flash('rgba(0,0,0,0.8)', 0.12);
    api.screamer(1, 0.06);
  };

  const startChange = (api: ModApi) => {
    if (change >= 0) return;
    change = 0;
    speech.clear();
    goWrong(api);
    api.say(IKIYO, CHANGE_LINES[0]!);
    api.sound('stinger');
    api.sound('glitch');
  };

  const mood = (): Atmosphere => ({
    fogColor: 0x1e1e26,
    fogNear: 8,
    fogFar: wrongTime >= 0 ? 46 : 80,
    darkness: change >= 0 ? 0.8 : wrongTime >= 0 ? 0.5 : 0.2,
    vignette: wrongTime >= 0 ? 0.6 : 0.25,
    // Very quiet: only the wind.
    music: undefined,
  });

  return {
    update(api, dt) {
      time += dt;
      const p = me(api);
      if (!at) {
        // Far away, right where you look.
        at = aroundPlayer(api, START, (Math.random() - 0.5) * 0.4);
        api.sound('wind');
      }
      speech.update(api, dt);
      api.atmosphere(mood());
      const d = distance(p, at);

      if (change >= 0) {
        // It shakes and twitches… then bursts into smoke.
        change += dt;
        twitch = {
          x: (Math.random() - 0.5) * 0.4,
          y: (Math.random() - 0.5) * 0.2,
          z: (Math.random() - 0.5) * 0.4,
        };
        api.shake(0.3 + change * 0.3, 0.2);
        if (Math.random() < dt * 6) api.sound('glitch');
        if (change >= CHANGE_TIME) {
          api.screamer(2, 0.4);
          api.sound('shriek');
          api.sound('roar');
          api.flash('rgba(0,0,0,1)', 1.2);
          burst(api, { ...at, y: at.y + 1 }, [0x050508, 0x1a0a0a, 0xff2010], 40);
          api.removeActor('stranger');
          return true;
        }
      } else if (wrongTime < 0) {
        // Kind: it walks to you, waving, and talks.
        if (d > 2.5) {
          at.x += ((p.x - at.x) / d) * WALK * dt;
          at.z += ((p.z - at.z) / d) * WALK * dt;
          at.y = api.groundY(at.x, at.z, at.y);
        }
        if (speech.empty && next < STRANGER_LINES.length && time > 1.5) {
          speech.add(KIND, STRANGER_LINES[next++]!);
        }
        nearest = Math.min(nearest, d);
        if (!backed && d > nearest + 5) {
          backed = true;
          speech.add(KIND, AWAY_LINES[0]!);
        }
        if (d < WRONG_AT || time > WRONG_AFTER) goWrong(api);
      } else {
        // Wrong: it only moves while you are not looking, in jerks.
        wrongTime += dt;
        if (!lookingAt(api, at, 25) && d > 1.5) {
          const step = Math.min(d - 1.5, dt * 4.5);
          at.x += ((p.x - at.x) / d) * step;
          at.z += ((p.z - at.z) / d) * step;
          at.y = api.groundY(at.x, at.z, at.y);
        }
        wrongLineIn -= dt;
        if (wrongLineIn <= 0 && wrongLine < WRONG_LINES.length) {
          wrongLineIn = 7;
          speech.add(KIND, WRONG_LINES[wrongLine++]!);
        }
        if (Math.random() < dt * 0.4) api.sound('giggle');
        if (d < CHANGE_AT || wrongTime > CHANGE_AFTER) startChange(api);
      }

      api.actor('stranger', wrongTime >= 0 ? STRANGER_WRONG : STRANGER, {
        x: at.x + twitch.x,
        y: at.y + twitch.y,
        z: at.z + twitch.z,
        yaw: yawTo(at, p),
      });
      return false;
    },
    hit(api, id) {
      if (id === 'stranger') startChange(api);
    },
    spot() {
      return at;
    },
    end(api) {
      api.removeActor('stranger');
    },
  };
}
