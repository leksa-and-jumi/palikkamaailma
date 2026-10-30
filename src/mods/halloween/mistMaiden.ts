// 👻 The Mist Maiden comes with a thick fog. She appears here and there for
// a moment – hit her before she fades. Sometimes she sneaks up behind you!

import type { ModApi } from '../types';
import { MIST_MAIDEN } from './models';
import {
  aroundPlayer,
  burst,
  me,
  yawTo,
  type Encounter,
  type Outcome,
  type Vec,
} from './encounter';

const HITS = 5;
const SHOWN = 3;
const HIDDEN = 2.5;
const BOO_TIME = 1.6;

export function mistMaiden(): Encounter {
  let at: Vec = { x: 0, y: 0, z: 0 };
  let visible = false;
  let timer = 2;
  let hits = 0;
  let appearances = 0;
  /** Behind you: she says boo if you don't turn round in time. */
  let sneaking = false;
  let whisper = 0;
  const who = { emoji: '👻', name: 'Usvaneito', color: '#bfe4ff' };

  const show = (api: ModApi) => {
    api.actor('maiden', MIST_MAIDEN, {
      x: at.x,
      y: at.y + 0.2 + Math.sin(performance.now() / 400) * 0.15,
      z: at.z,
      yaw: yawTo(at, me(api)),
      visible,
    });
    api.bossBar('👻 Usvaneito', 1 - hits / HITS);
  };

  const appear = (api: ModApi) => {
    appearances++;
    sneaking = appearances % 3 === 0;
    at = sneaking
      ? aroundPlayer(api, 1.8, Math.PI)
      : aroundPlayer(api, 4 + Math.random() * 3, (Math.random() - 0.5) * 2.4);
    visible = true;
    timer = sneaking ? BOO_TIME : SHOWN;
    if (sneaking) api.sound('whisper');
  };

  return {
    who,
    trophy: {
      id: 'halloween-mist',
      emoji: '🏮',
      name: 'Usvalyhty',
      description: 'Löysit Usvaneidon sumun keskeltä viisi kertaa.',
    },
    mood: {
      fogColor: 0xc8d4e0,
      fogNear: 2,
      fogFar: 22,
      darkness: 0.3,
      tint: 'rgba(180,200,255,0.12)',
    },
    intro: ['Shhh… kuuletko? Usva tulee… ja minä sen mukana.', 'Löydätkö minut ennen kuin katoan?'],
    defeat: 'Sinä… näit minut joka kerta. Usva hälvenee. Kiitos, että leikit kanssani.',
    escape: 'Usva vie minut… mutta usva palaa aina.',
    start(api) {
      api.sound('whisper');
      appear(api);
      show(api);
    },
    update(api, dt): Outcome {
      if (hits >= HITS) return 'won';
      timer -= dt;
      whisper -= dt;
      if (whisper <= 0) {
        whisper = 7;
        api.sound('whisper');
      }
      if (timer <= 0) {
        if (visible && sneaking) {
          api.flash('rgba(255,255,255,0.9)', 0.6);
          api.say(who, 'BUU!');
          api.hurt(2, 'Usvaneito säikäytti!');
        }
        if (visible) {
          visible = false;
          timer = HIDDEN;
        } else appear(api);
      }
      show(api);
      return 'fight';
    },
    hit(api) {
      if (!visible) return;
      hits++;
      visible = false;
      timer = HIDDEN;
      burst(api, at, [0xffffff, 0xbfe4ff]);
      api.sound('pop');
      if (hits < HITS)
        api.say(
          who,
          ['Löysit minut!', 'Hihii, nopea olet!', 'Mistä tiesit?', 'Vielä kerran…'][hits - 1] ??
            '…',
        );
    },
    end(api) {
      api.removeActor('maiden');
    },
  };
}
