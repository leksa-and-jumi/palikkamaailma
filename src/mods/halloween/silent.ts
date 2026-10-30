// 🌑 The Silent One just stands far away and watches. Look straight at it
// and it vanishes – find it again and again. If you don't look, it comes
// closer… In the end it stands right behind you.

import type { ModApi } from '../types';
import { SILENT } from './models';
import {
  aroundPlayer,
  burst,
  distance,
  lookingAt,
  me,
  moveTowards,
  yawTo,
  type Encounter,
  type Outcome,
  type Vec,
} from './encounter';

const FINDS = 4;
const HITS = 3;
const LOOK_TIME = 0.6;
const PATIENCE = 14;
const TOUCH_EVERY = 1.5;

type Phase = 'watch' | 'gone' | 'final';

export function silentOne(): Encounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let phase: Phase = 'watch';
  let looked = 0;
  let unseen = 0;
  let found = 0;
  let hits = 0;
  let timer = 0;
  let touch = 0;
  let glitch = 3;
  const who = { emoji: '🌑', name: 'Hiljainen', color: '#e8e8f0' };

  const place = (api: ModApi, dist: number) => {
    at = aroundPlayer(api, dist, Math.random() * Math.PI * 2);
  };

  const show = (api: ModApi) => {
    api.actor('silent', SILENT, { ...at, yaw: yawTo(at, me(api)), visible: phase !== 'gone' });
    api.bossBar(
      phase === 'final' ? '🌑 Hiljainen' : `🌑 Hiljainen (löydetty ${found}/${FINDS})`,
      phase === 'final' ? 1 - hits / HITS : 1,
    );
  };

  return {
    who,
    trophy: {
      id: 'halloween-silent',
      emoji: '💎',
      name: 'Varjokristalli',
      description: 'Löysit Hiljaisen neljä kertaa ja voitit sen.',
    },
    mood: {
      fogColor: 0x5a5a60,
      fogNear: 6,
      fogFar: 42,
      darkness: 0.45,
      tint: 'rgba(0,0,0,0.15)',
      vignette: 0.5,
    },
    intro: ['…', '(Joku katsoo sinua. Etsi se.)'],
    defeat: 'Sinä… et pelännyt. Hyvä. Pidä tämä kristalli.',
    escape: '…',
    start(api) {
      place(api, 20);
      show(api);
    },
    update(api, dt): Outcome {
      if (hits >= HITS) return 'won';
      const p = me(api);
      if (distance(at, p) > 60) return 'fled';
      glitch -= dt;
      if (glitch <= 0) {
        glitch = 4 + Math.random() * 6;
        api.flash('rgba(255,255,255,0.18)', 0.15);
      }
      if (phase === 'gone') {
        timer -= dt;
        if (timer <= 0) {
          if (found >= FINDS) {
            // Right behind you.
            phase = 'final';
            at = aroundPlayer(api, 2, Math.PI);
            api.sound('heartbeat');
            api.say(who, '…Löysit minut.');
          } else {
            phase = 'watch';
            place(api, 20 - found * 3);
          }
        }
      } else if (phase === 'watch') {
        if (lookingAt(api, at, 12)) {
          looked += dt;
          unseen = 0;
          if (looked >= LOOK_TIME) {
            found++;
            looked = 0;
            phase = 'gone';
            timer = 2;
            burst(api, { ...at, y: at.y + 1.2 }, [0x222222, 0xffffff], 12);
            api.sound('whisper');
            api.toast(`🌑 Löysit sen! (${found}/${FINDS})`);
          }
        } else {
          looked = 0;
          unseen += dt;
          if (unseen >= PATIENCE) {
            // Tired of waiting: it comes closer.
            unseen = 0;
            const d = distance(at, p);
            if (d < 4) {
              api.flash('rgba(0,0,0,0.85)', 0.8);
              api.hurt(2, 'Hiljainen kosketti sinua.');
              place(api, 18);
            } else {
              at = aroundPlayer(
                api,
                d / 2,
                Math.atan2(at.x - p.x, at.z - p.z) -
                  Math.atan2(api.player.look[0], api.player.look[2]),
              );
              api.sound('heartbeat');
            }
          }
        }
      } else {
        touch -= dt;
        if (distance(at, p) > 1.2) moveTowards(at, { ...p, y: at.y }, 1.6 * dt);
        else if (touch <= 0) {
          touch = TOUCH_EVERY;
          api.flash('rgba(0,0,0,0.7)', 0.5);
          api.hurt(2, 'Hiljainen kosketti sinua.');
        }
        at.y = api.groundY(at.x, at.z, at.y);
      }
      show(api);
      return 'fight';
    },
    hit(api) {
      if (phase !== 'final') return;
      hits++;
      api.sound('break');
      burst(api, { ...at, y: at.y + 1.2 }, [0xffffff, 0x111111]);
      at = aroundPlayer(api, 3, Math.PI * (hits % 2 ? 0.6 : -0.6));
    },
    end(api) {
      api.removeActor('silent');
    },
  };
}
