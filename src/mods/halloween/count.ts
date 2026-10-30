// 🦇 Count Batula circles high under a red moon, then swoops down at you.
// After a swoop he must rest on the ground a moment – that's your chance!

import type { ModApi } from '../types';
import { COUNT } from './models';
import {
  burst,
  distance,
  me,
  moveTowards,
  yawTo,
  type Encounter,
  type Outcome,
  type Vec,
} from './encounter';

const HITS = 3;
const CIRCLE_TIME = 5;
const REST_TIME = 2.6;
const DIVE_SPEED = 11;

type Phase = 'circle' | 'dive' | 'rest';

export function countBatula(): Encounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let phase: Phase = 'circle';
  let timer = CIRCLE_TIME;
  let angle = 0;
  let hits = 0;
  let toldHint = false;
  const who = { emoji: '🦇', name: 'Kreivi Lepakkola', color: '#ff5a6a' };

  const show = (api: ModApi) => {
    api.actor('count', COUNT, { ...at, yaw: yawTo(at, me(api)) });
    api.bossBar('🦇 Kreivi Lepakkola', 1 - hits / HITS);
    // Little bats flutter round him.
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      api.sparkle(
        at.x + Math.cos(a) * 1.4,
        at.y + 1.6 + Math.random(),
        at.z + Math.sin(a) * 1.4,
        0x22181c,
      );
    }
  };

  return {
    who,
    trophy: {
      id: 'halloween-count',
      emoji: '🧛',
      name: 'Kreivin viitta',
      description: 'Voitit Kreivi Lepakkolan punaisen kuun alla.',
    },
    mood: {
      music: 'halloween-count',
      fogColor: 0x2a0508,
      fogNear: 10,
      fogFar: 60,
      darkness: 0.5,
      tint: 'rgba(160,0,20,0.15)',
      vignette: 0.4,
    },
    intro: [
      'Hyvää iltaa… Olen odottanut sinua sata vuotta. Ha-haa!',
      'Kuu on punainen, ja lepakkoni ovat nälkäisiä!',
    ],
    defeat: 'Ei… aamu tulee pian, ja sinä olet liian nopea. Viittani on sinun.',
    escape: 'Pakenet? Kreivi muistaa sinut, ha-haa!',
    start(api) {
      api.sound('bell');
      api.sound('laugh');
      at = { x: api.player.x + 8, y: api.player.y + 7, z: api.player.z };
      show(api);
    },
    update(api, dt): Outcome {
      if (hits >= HITS) return 'won';
      const p = me(api);
      if (distance(at, p) > 50) return 'fled';
      timer -= dt;
      if (phase === 'circle') {
        angle += dt * 0.9;
        moveTowards(
          at,
          { x: p.x + Math.cos(angle) * 8, y: p.y + 7, z: p.z + Math.sin(angle) * 8 },
          9 * dt,
        );
        if (timer <= 0) {
          phase = 'dive';
          api.animate('count', 'cast');
          api.sound('laugh');
        }
      } else if (phase === 'dive') {
        if (moveTowards(at, { ...p, y: p.y }, DIVE_SPEED * dt) || distance(at, p) < 1.2) {
          if (Math.abs(at.y - p.y) < 2) {
            api.animate('count', 'attack');
            api.hurt(3, 'Kreivi Lepakkola puraisi!');
            api.flash('rgba(200,0,30,0.5)', 0.5);
          }
          at = { x: at.x + 1.5, y: api.groundY(at.x + 1.5, at.z, p.y), z: at.z };
          phase = 'rest';
          timer = REST_TIME;
          if (!toldHint) {
            toldHint = true;
            api.toast('🦇 Kreivi lepää maassa – lyö nyt!');
          }
        }
      } else if (timer <= 0) {
        phase = 'circle';
        timer = CIRCLE_TIME;
      }
      show(api);
      return 'fight';
    },
    hit(api) {
      if (phase !== 'rest') {
        api.say(who, 'Liian korkealla! Ha-haa!');
        return;
      }
      hits++;
      api.animate('count', 'hurt');
      burst(api, { ...at, y: at.y + 1 }, [0xff2030, 0x222222]);
      api.sound('pop');
      phase = 'circle';
      timer = CIRCLE_TIME;
      if (hits < HITS) api.say(who, hits === 1 ? 'Auh! Viittani!' : 'Nyt riittää leikit!');
    },
    where() {
      return at;
    },
    end(api) {
      api.removeActor('count');
    },
  };
}
