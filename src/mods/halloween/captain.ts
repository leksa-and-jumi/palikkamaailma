// ☠️ Captain Luukala rises in a storm with his skeleton crew. While the crew
// stands he is shielded – knock them down first, then face the captain.

import type { ModApi } from '../types';
import { CAPTAIN, DECKHAND } from './models';
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

const CREW = 3;
const CREW_HITS = 2;
const CAPTAIN_HITS = 3;
const WALK = 2.3;
const HIT_EVERY = 1.3;

interface Sailor extends Vec {
  id: string;
  hits: number;
  cooldown: number;
}

export function captainLuukala(): Encounter {
  let captain: Sailor = { id: 'captain', x: 0, y: 0, z: 0, hits: 0, cooldown: 0 };
  let crew: Sailor[] = [];
  let toldShield = 0;
  const who = { emoji: '☠️', name: 'Kapteeni Luukala', color: '#ff8a5a' };

  const walk = (api: ModApi, s: Sailor, dt: number, damage: number, reason: string) => {
    const p = me(api);
    s.cooldown -= dt;
    if (distance(s, p) > 1.3) {
      moveTowards(s, { ...p, y: s.y }, WALK * dt);
      s.y = api.groundY(s.x, s.z, s.y);
    } else if (s.cooldown <= 0) {
      s.cooldown = HIT_EVERY;
      api.hurt(damage, reason);
    }
  };

  const show = (api: ModApi) => {
    const p = me(api);
    api.actor('captain', CAPTAIN, {
      ...captain,
      yaw: yawTo(captain, p),
      label: crew.length > 0 ? '🛡️' : undefined,
    });
    for (const s of crew) api.actor(s.id, DECKHAND, { ...s, yaw: yawTo(s, p) });
    api.bossBar('☠️ Kapteeni Luukala', 1 - captain.hits / CAPTAIN_HITS);
  };

  return {
    who,
    trophy: {
      id: 'halloween-captain',
      emoji: '🧭',
      name: 'Kapteenin kompassi',
      description: 'Kaadoit kummitusmiehistön ja Kapteeni Luukalan myrskyssä.',
    },
    mood: {
      fogColor: 0x1a2230,
      fogNear: 6,
      fogFar: 45,
      darkness: 0.55,
      rain: true,
      lightning: true,
      vignette: 0.3,
    },
    intro: [
      'Arrr! Myrsky nostaa merirosvot haudoistaan!',
      'Pojat, kimppuun! Kukaan ei ohita Kapteeni Luukalaa!',
    ],
    defeat: 'Arrr… paras taistelu sataan vuoteen. Ota kompassini, merenkulkija.',
    escape: 'Juokse vain, maakrapu! Myrsky palaa!',
    start(api) {
      api.sound('thunder');
      const c = aroundPlayer(api, 10, 0);
      captain = { id: 'captain', ...c, hits: 0, cooldown: 0 };
      crew = Array.from({ length: CREW }, (_, i) => ({
        id: `sailor${i}`,
        ...aroundPlayer(api, 6, (i - 1) * 0.9),
        hits: 0,
        cooldown: 1,
      }));
      show(api);
    },
    update(api, dt): Outcome {
      if (captain.hits >= CAPTAIN_HITS) return 'won';
      if (distance(captain, me(api)) > 48) return 'fled';
      toldShield -= dt;
      for (const s of crew) walk(api, s, dt, 2, 'Luurankomerirosvo huitaisi!');
      if (crew.length === 0) walk(api, captain, dt, 3, 'Kapteenin miekka osui!');
      show(api);
      return 'fight';
    },
    hit(api, id) {
      const sailor = crew.find((s) => s.id === id);
      if (sailor) {
        sailor.hits++;
        api.sound('break');
        if (sailor.hits >= CREW_HITS) {
          burst(api, { ...sailor, y: sailor.y + 1 }, [0xffffff, 0xdedbd0]);
          api.removeActor(sailor.id);
          crew = crew.filter((s) => s !== sailor);
          if (crew.length === 0) api.say(who, 'Mitä?! Koko miehistö! Nyt saat nähdä, maakrapu!');
        }
        return;
      }
      if (id !== 'captain') return;
      if (crew.length > 0) {
        if (toldShield <= 0) {
          toldShield = 4;
          api.toast('🛡️ Merirosvot suojaavat kapteenia – kaada ne ensin!');
        }
        return;
      }
      captain.hits++;
      api.sound('break');
      burst(api, { ...captain, y: captain.y + 1.5 }, [0xff8a5a, 0xffffff], 12);
      if (captain.hits < CAPTAIN_HITS)
        api.say(who, captain.hits === 1 ? 'Arrr! Hyvä isku!' : 'Kylkiluuni kolisevat!');
    },
    where() {
      return captain;
    },
    end(api) {
      api.removeActor('captain');
      for (const s of crew) api.removeActor(s.id);
      crew = [];
    },
  };
}
