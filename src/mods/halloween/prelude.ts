// 📖 Before Ikiyö comes: a story, read from the diary of someone who played
// in this world before you, while strange things start to happen around you.
// It gets worse as it goes: knocking where there are no doors, footsteps
// when you stand still, someone "joins" the world, the sun goes out, red
// eyes in the dark, and a tall figure that is always a little closer when
// you turn around. Then silence, one line in another hand… and it rises.
// Psychological dread, not gore. The first time in each world it is the
// whole story (about three minutes); later only a short warning.

import { speechSeconds } from '../reading';
import type { Atmosphere, ModApi, Speaker } from '../types';
import { aroundPlayer, lookingAt, me, yawTo, type Vec } from './encounter';
import { OMEN_LINES } from './ikiyo';
import { EYES, WATCHER } from './ikiyoModel';

const DIARY: Speaker = { emoji: '📖', name: 'Päiväkirja', color: '#cfc6b4' };
const IKIYO: Speaker = { emoji: '👁️', name: 'Ikiyö', color: '#ff3b2f' };

/** The diary, read aloud. */
const STORY_LINES = [
  'Tämä maailma ei ole ensimmäinen. Ennen sinua täällä pelasi joku toinen.',
  'Hänkin voitti kaikki kuusi. Hän luuli, että kauhu oli ohi. Hän oli väärässä.',
  'Hänen päiväkirjastaan löytyi tämä: ”Kuulen askeleita, vaikka seison aivan hiljaa.”',
  '”Tänään joku koputti kolme kertaa. Tässä maailmassa ei ole ovia, joihin voisi koputtaa.”',
  '”Aurinko ei laskenut. Se vain… sammui. Kuin joku olisi painanut sen kiinni.”',
  '”Kun käännyn, se seisoo aina vähän lähempänä. Se ei liiku, kun katson sitä.”',
  '”Älä katso sitä silmiin. Ne eivät ole sen silmät. Ne ovat niiden, jotka se on vienyt.”',
  '”Kuulen sen nyt maan alta. Se raapii. Se tietää, missä minä nukun.”',
  'Siihen päiväkirja loppui. Häntä ei koskaan löydetty. Hänen maailmansa on yhä täällä… sinun maailmasi alla.',
  'Päiväkirjan viimeisellä sivulla oli vielä yksi rivi. Se oli kirjoitettu eri käsialalla.',
];
/** The short warning when it comes back to this world (a different one each time). */
const AGAIN_LINES = [
  'Se palasi. Ne palaavat aina.',
  'Päiväkirjaan oli ilmestynyt uusi sivu. Joku oli piirtänyt siihen sinut.',
  'Kuuletko? Joku koputtaa taas. Kolme kertaa.',
  'Kaikki silmät pimeässä kääntyivät yhtä aikaa sinua kohti.',
];

type Step = { at: number; run: (api: ModApi, s: State) => void };

interface Spoken {
  who: Speaker;
  text: string;
  /** Happens as the line starts (Ikiyö's scream). */
  then?: (api: ModApi, s: State) => void;
}

interface State {
  /** Lines wait their turn, so none is cut short. */
  queue: Spoken[];
  /** When Ikiyö rises (set by its last line). */
  riseAt: number;
  dark: number;
  quiet: boolean;
  /** The tall figure: where it stands, and whether it creeps up on you. */
  watcher: (Vec & { creeping: boolean; seen: number }) | null;
  eyes: (Vec & { age: number }) | null;
  stillFor: number;
  stepsIn: number;
  stepsOn: boolean;
}

const tell = (s: State, text: string) => s.queue.push({ who: DIARY, text });
const line = (i: number) => (_api: ModApi, s: State) => tell(s, STORY_LINES[i]!);

/** The whole story: about three minutes, worse and worse. */
const STORY: readonly Step[] = [
  { at: 0, run: (api) => api.sound('wind') },
  { at: 3, run: line(0) },
  { at: 15, run: line(1) },
  { at: 27, run: (api) => api.sound('knock') },
  {
    at: 31,
    run: (api, s) => {
      line(2)(api, s);
      s.stepsOn = true;
    },
  },
  {
    at: 46,
    run: (api, s) => {
      // A tall figure, far away at the edge of the fog. Look at it and it is gone.
      s.watcher = {
        ...aroundPlayer(api, 34, (Math.random() - 0.5) * 1.2),
        creeping: false,
        seen: 0,
      };
      api.sound('drone');
    },
  },
  { at: 60, run: line(3) },
  {
    at: 66,
    run: (api) => {
      api.sound('knock');
      api.shake(0.12, 0.4);
    },
  },
  {
    at: 76,
    run: (api) => {
      api.toast('👤 ??? liittyi maailmaan.');
      api.sound('whisper');
    },
  },
  {
    at: 84,
    run: (api, s) => {
      line(4)(api, s);
      // The sun goes out.
      s.quiet = true;
      s.dark = 0.01;
    },
  },
  {
    at: 98,
    run: (api, s) => {
      s.eyes = { ...aroundPlayer(api, 16, (Math.random() - 0.5) * 0.8), age: 0 };
      api.sound('giggle');
    },
  },
  {
    at: 106,
    run: (api, s) => {
      line(5)(api, s);
      // Now it is behind you, and it comes closer every time you look away.
      s.watcher = { ...aroundPlayer(api, 22, Math.PI), creeping: true, seen: 0 };
    },
  },
  { at: 122, run: line(6) },
  {
    at: 134,
    run: (api, s) => {
      line(7)(api, s);
      api.sound('rumble');
      api.shake(0.25, 1.5);
    },
  },
  {
    at: 142,
    run: (api) => {
      api.toast('👤 ??? on aivan takanasi.');
      api.sound('steps');
    },
  },
  { at: 148, run: line(8) },
  {
    at: 161,
    run: (api, s) => {
      // Total silence… and a face, too fast to be sure.
      api.screamer(0, 0.07);
      s.watcher = null;
      s.eyes = null;
      s.stepsOn = false;
      s.dark = 0.85;
    },
  },
  { at: 166, run: line(9) },
  { at: 170, run: (_api, s) => ikiyoSays(s, OMEN_LINES.story) },
];

/** Later visits to this world: a knock, darkness, and it remembers you. */
function again(visit: number): readonly Step[] {
  return [
    {
      at: 0,
      run: (api, s) => {
        api.sound('knock');
        s.quiet = true;
        s.dark = 0.01;
      },
    },
    { at: 3, run: (_api, s) => tell(s, AGAIN_LINES[(visit - 1) % AGAIN_LINES.length]!) },
    { at: 6, run: (_api, s) => ikiyoSays(s, OMEN_LINES.again) },
  ];
}

/** Ikiyö's own line ends the story: as it is said, it rises. */
function ikiyoSays(s: State, text: string): void {
  s.queue.push({
    who: IKIYO,
    text,
    then: (api, st) => {
      api.sound('stinger');
      api.sound('shriek');
      // Its face, for a moment, right in yours.
      api.screamer(3, 0.5);
      api.flash('rgba(160,0,0,0.85)', 1.2);
      api.shake(1, 1.5);
      st.riseAt = 1.6;
    },
  });
}

export interface Prelude {
  /** True when the story is over and Ikiyö should rise. */
  update(api: ModApi, dt: number): boolean;
  end(api: ModApi): void;
}

/** The whole story (the first time in a world), or the short warning for its `visit`th visit. */
export function prelude(full: boolean, visit = 1): Prelude {
  const steps = full ? STORY : again(Math.max(1, visit));
  let time = 0;
  let lineTimer = 0;
  let next = 0;
  let last: Vec | null = null;
  const s: State = {
    queue: [],
    riseAt: -1,
    dark: 0,
    quiet: false,
    watcher: null,
    eyes: null,
    stillFor: 0,
    stepsIn: 4,
    stepsOn: false,
  };

  const mood = (): Atmosphere => ({
    fogColor: 0x1c1c22,
    fogNear: 6,
    fogFar: Math.max(30, 90 - time * 0.4),
    darkness: s.dark,
    vignette: Math.min(0.9, 0.15 + time / 220),
    tint: `rgba(30,30,40,${Math.min(0.25, time / 600).toFixed(3)})`,
    // Quiet: no music at all. Before that, the whisper music very low in the distance.
    music: s.quiet ? undefined : 'ikiyo-1',
  });

  return {
    update(api, dt) {
      time += dt;
      while (next < steps.length && steps[next]!.at <= time) steps[next++]!.run(api, s);
      // The next line, when the last one has been read (and heard).
      lineTimer -= dt;
      const spoken = lineTimer <= 0 ? s.queue.shift() : undefined;
      if (spoken) {
        api.say(spoken.who, spoken.text);
        lineTimer = speechSeconds(spoken.text) + 1.2;
        spoken.then?.(api, s);
      }
      if (s.riseAt > 0) s.riseAt -= dt;
      // The sun going out takes a few seconds.
      if (s.dark > 0 && s.dark < 0.72) s.dark = Math.min(0.72, s.dark + dt * 0.12);
      api.atmosphere(mood());
      const p = me(api);

      // Footsteps when you stand still.
      const moved = last ? Math.hypot(p.x - last.x, p.z - last.z) : 0;
      last = { ...p };
      s.stillFor = moved < 0.02 ? s.stillFor + dt : 0;
      s.stepsIn -= dt;
      if (s.stepsOn && s.stillFor > 1.5 && s.stepsIn <= 0) {
        s.stepsIn = 7 + Math.random() * 5;
        api.sound('steps');
      }

      // The tall figure: far away it vanishes when you look; close, it creeps when you don't.
      const w = s.watcher;
      if (w) {
        const looking = lookingAt(api, w, 22);
        if (!w.creeping && looking) {
          w.seen += dt;
          if (w.seen > 0.4) {
            s.watcher = null;
            api.sound('glitch');
          }
        } else if (w.creeping && !looking) {
          // It moves only while you look away.
          const d = Math.hypot(w.x - p.x, w.z - p.z);
          const step = Math.min(d - 1.5, dt * 6);
          w.x += ((p.x - w.x) / d) * step;
          w.z += ((p.z - w.z) / d) * step;
          w.y = api.groundY(w.x, w.z, p.y);
          if (d < 3) {
            // Right behind you… and gone.
            s.watcher = null;
            api.sound('stinger');
            api.flash('rgba(0,0,0,0.95)', 0.8);
            api.shake(0.7, 0.6);
          }
        }
      }
      if (s.watcher) {
        api.actor('watcher', WATCHER, { ...s.watcher, yaw: yawTo(s.watcher, p), scale: 1.15 });
      } else api.removeActor('watcher');

      // Red eyes in the dark that blink, then close for good.
      if (s.eyes) {
        s.eyes.age += dt;
        const open = Math.sin(s.eyes.age * 2.2) > -0.8;
        api.actor('eyes', EYES, {
          ...s.eyes,
          y: s.eyes.y + 1.6,
          yaw: yawTo(s.eyes, p),
          visible: open,
        });
        if (s.eyes.age > 9) s.eyes = null;
      } else api.removeActor('eyes');

      return s.riseAt !== -1 && s.riseAt <= 0;
    },
    end(api) {
      api.removeActor('watcher');
      api.removeActor('eyes');
    },
  };
}
