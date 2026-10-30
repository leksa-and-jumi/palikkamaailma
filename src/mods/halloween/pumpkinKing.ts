// 🎃 The Pumpkin King throws pumpkin bombs. They are too hard to break his
// armour – but hit a bomb and it flies back at him!

import type { ModApi } from '../types';
import { PUMPKIN_BOMB, PUMPKIN_KING } from './models';
import {
  aroundPlayer,
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
const THROW_EVERY = 3;
const BOMB_SPEED = 5.5;
const BACK_SPEED = 10;

interface Bomb extends Vec {
  id: string;
  back: boolean;
  age: number;
}

export function pumpkinKing(): Encounter {
  let king: Vec = { x: 0, y: 0, z: 0 };
  let hits = 0;
  let timer = 2;
  let hintTimer = 0;
  let bombs: Bomb[] = [];
  let counter = 0;
  const who = { emoji: '🎃', name: 'Kurpitsakuningas', color: '#ffa63a' };

  const show = (api: ModApi) => {
    api.actor('king', PUMPKIN_KING, { ...king, yaw: yawTo(king, me(api)) });
    api.bossBar(`🎃 Kurpitsakuningas`, 1 - hits / HITS);
  };

  return {
    who,
    trophy: {
      id: 'halloween-pumpkin',
      emoji: '🎃',
      name: 'Kultainen kurpitsa',
      description: 'Löit Kurpitsakuninkaan omilla pommeillaan.',
    },
    mood: {
      fogColor: 0x3a1c08,
      fogNear: 8,
      fogFar: 55,
      darkness: 0.4,
      tint: 'rgba(255,120,0,0.12)',
      vignette: 0.3,
    },
    intro: [
      'Hohhoijaa! Kuka uskaltaa kulkea MINUN kurpitsapelloillani?',
      'Minun kurpitsahaarniskani ei hajoa ikinä. Hohhoo!',
    ],
    defeat: 'Auuu… kurpitsani! Hyvä on, pelto on sinun. Hyvää Halloweenia!',
    escape: 'Pakenit! Hohhoo! Palaan ensi yönä…',
    start(api) {
      king = aroundPlayer(api, 11, 0);
      api.sound('bell');
      api.sound('laugh');
      show(api);
    },
    update(api, dt): Outcome {
      if (hits >= HITS) return 'won';
      if (distance(king, me(api)) > 45) return 'fled';
      timer -= dt;
      hintTimer -= dt;
      if (timer <= 0) {
        timer = THROW_EVERY;
        bombs.push({
          id: `bomb${counter++}`,
          x: king.x,
          y: king.y + 1.8,
          z: king.z,
          back: false,
          age: 0,
        });
        api.sound('pop');
      }
      const target = { ...me(api), y: api.player.y + 1 };
      const kingTop = { ...king, y: king.y + 1.8 };
      for (const b of bombs) {
        b.age += dt;
        const arrived = b.back
          ? moveTowards(b, kingTop, BACK_SPEED * dt)
          : moveTowards(b, target, BOMB_SPEED * dt);
        if (arrived && b.back) {
          hits++;
          b.age = 99;
          api.sound('boom');
          burst(api, kingTop, [0xff9a2e, 0xffe040]);
          api.say(who, hits < HITS ? 'AUTS! Ei omaa pommia päin!' : 'Kurpitsani… se halkesi!');
        } else if (arrived) {
          b.age = 99;
          api.sound('boom');
          burst(api, b, [0xff9a2e, 0x333333], 12);
          api.hurt(3, 'Kurpitsapommi räjähti!');
          api.push((b.x - api.player.x) * -2, 5, (b.z - api.player.z) * -2);
        }
        if (b.age > 7) api.removeActor(b.id);
        else api.actor(b.id, PUMPKIN_BOMB, { x: b.x, y: b.y - 0.25, z: b.z, yaw: b.age * 4 });
      }
      bombs = bombs.filter((b) => b.age <= 7);
      if (hintTimer < -30) hintTimer = 0;
      show(api);
      return 'fight';
    },
    hit(api, id) {
      const bomb = bombs.find((b) => b.id === id);
      if (bomb && !bomb.back) {
        bomb.back = true;
        api.sound('click');
        return;
      }
      if (id === 'king' && hintTimer <= 0) {
        hintTimer = 4;
        api.say(who, 'Hah! Haarniskani on liian kova. Mutta älä vain lyö pommejani takaisin…');
      }
    },
    where() {
      return king;
    },
    end(api) {
      api.removeActor('king');
      for (const b of bombs) api.removeActor(b.id);
      bombs = [];
    },
  };
}
