// 🕷️ The Spider Queen hides up in the dark and shoots sticky webs that slow
// you down. When she drops down to bite, she stays on the ground a moment.

import type { ModApi } from '../types';
import { SPIDER_QUEEN, WEB_SHOT } from './models';
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

const HITS = 4;
const HIGH = 6;
const SHOOT_EVERY = 2.6;
const DROP_EVERY = 8;
const ON_GROUND = 3;
const WEB_SPEED = 7;
const STUCK_TIME = 3;

interface Web extends Vec {
  id: string;
  age: number;
}

type Phase = 'hang' | 'drop' | 'ground' | 'climb';

export function spiderQueen(): Encounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let phase: Phase = 'hang';
  let shoot = SHOOT_EVERY;
  let drop = DROP_EVERY;
  let timer = 0;
  let hits = 0;
  let webs: Web[] = [];
  let counter = 0;
  let beat = 0;
  const who = { emoji: '🕷️', name: 'Hämähäkkikuningatar Hämärä', color: '#d0a8ff' };

  const show = (api: ModApi) => {
    api.actor('queen', SPIDER_QUEEN, { ...at, yaw: yawTo(at, me(api)) });
    for (const w of webs) api.actor(w.id, WEB_SHOT, { ...w, yaw: w.age * 3 });
    api.bossBar('🕷️ Hämähäkkikuningatar', 1 - hits / HITS);
  };

  return {
    who,
    trophy: {
      id: 'halloween-spider',
      emoji: '🕸️',
      name: 'Hopealanka',
      description: 'Pääsit Hämähäkkikuningattaren seiteistä ja voitit hänet pimeässä.',
    },
    mood: {
      fogColor: 0x0a0812,
      fogNear: 4,
      fogFar: 30,
      darkness: 0.75,
      vignette: 0.85,
      tint: 'rgba(60,0,80,0.12)',
    },
    intro: [
      'Kiiiks… Verkkoni ovat joka puolella, pikkuinen.',
      'Tule lähemmäs… pimeässä on niin mukavaa.',
    ],
    defeat: 'Kiiiks… sinä purit kaikki verkkoni. Ota tämä hopealanka, rohkea.',
    escape: 'Juokse, juokse… verkot odottavat.',
    start(api) {
      api.sound('heartbeat');
      const p = me(api);
      at = { x: p.x + 4, y: p.y + HIGH, z: p.z + 3 };
      show(api);
    },
    update(api, dt): Outcome {
      if (hits >= HITS) return 'won';
      const p = me(api);
      if (distance(at, p) > 45) return 'fled';
      beat -= dt;
      if (beat <= 0) {
        beat = 2.5;
        api.sound('heartbeat');
      }
      if (phase === 'hang') {
        moveTowards(at, { x: p.x + 3, y: p.y + HIGH, z: p.z + 3 }, 4 * dt);
        shoot -= dt;
        drop -= dt;
        if (shoot <= 0) {
          shoot = SHOOT_EVERY;
          webs.push({ id: `web${counter++}`, x: at.x, y: at.y, z: at.z, age: 0 });
        }
        if (drop <= 0) phase = 'drop';
      } else if (phase === 'drop') {
        if (moveTowards(at, { x: p.x + 1.4, y: p.y, z: p.z }, 9 * dt)) {
          api.hurt(3, 'Hämähäkkikuningatar puri!');
          api.flash('rgba(80,0,100,0.5)', 0.5);
          phase = 'ground';
          timer = ON_GROUND;
          api.toast('🕷️ Kuningatar on maassa – lyö nyt!');
        }
      } else if (phase === 'ground') {
        timer -= dt;
        if (timer <= 0) phase = 'climb';
      } else if (moveTowards(at, { x: at.x, y: p.y + HIGH, z: at.z }, 6 * dt)) {
        phase = 'hang';
        drop = DROP_EVERY;
      }
      const target = { ...p, y: p.y + 1 };
      for (const w of webs) {
        w.age += dt;
        if (moveTowards(w, target, WEB_SPEED * dt)) {
          w.age = 99;
          api.effect({ walkSpeed: 0.35, jumpSpeed: 0.6 }, STUCK_TIME);
          api.toast('🕸️ Jäit seittiin!');
        }
        if (w.age > 6) api.removeActor(w.id);
      }
      webs = webs.filter((w) => w.age <= 6);
      show(api);
      return 'fight';
    },
    hit(api, id) {
      const web = webs.find((w) => w.id === id);
      if (web) {
        web.age = 99;
        api.removeActor(web.id);
        api.sound('click');
        return;
      }
      if (id !== 'queen') return;
      if (phase !== 'ground') {
        api.say(who, 'Kiiks! Et yllä minuun täältä!');
        return;
      }
      hits++;
      api.sound('pop');
      burst(api, { ...at, y: at.y + 1 }, [0xd0a8ff, 0x2a1030]);
      phase = 'climb';
      if (hits < HITS)
        api.say(who, ['Auts!', 'Kiiiks! Jalkani!', 'Viimeinen varoitus…'][hits - 1] ?? '…');
    },
    where() {
      return at;
    },
    end(api) {
      api.removeActor('queen');
      for (const w of webs) api.removeActor(w.id);
      webs = [];
    },
  };
}
