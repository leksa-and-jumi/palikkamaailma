// Makes the game's background music with Google Lyria 3 (through
// OpenRouter) into public/music/, and lists the tracks in
// src/audio/musicTracks.json (track → seconds). Only missing tracks are made
// (about $0.08 each), so running it again costs nothing.
//
// Calm tracks play now and then in the normal game (long quiet gaps between,
// like in Minecraft); the Halloween tracks play very quietly while a
// character visits.
//
// Usage: OPENROUTER_API_KEY=… node scripts/music.mjs   (or the key in .env.local)
// Needs macOS afconvert to make the smaller .m4a files.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/music');
const LIST = path.join(ROOT, 'src/audio/musicTracks.json');
const MODEL = 'google/lyria-3-pro-preview';

const CALM =
  'Instrumental only, no vocals, no singing, no drums. Background music for a calm blocky sandbox building game for children: very quiet and gentle, lots of space and silence between notes, soft reverb, slow tempo.';
const SPOOKY =
  'Instrumental only, no vocals, no singing, no lyrics. Very quiet, subtle background underscore for a Halloween boss in a blocky game for children aged 7–10: creepy and mysterious but never too scary, soft dynamics, no sudden loud hits.';

/** Ikiyö, the seventh: scarier than the others, but still made for children. */
const DREAD =
  'Instrumental only, no vocals, no singing, no lyrics, no screams. Dark horror film underscore for a giant shadow monster in a blocky game for children aged 7–10: genuinely creepy and tense, ominous and menacing, but no sudden loud jump scares, controlled dynamics, cinematic.';

const TRACKS = [
  {
    id: 'aamu',
    prompt: `${CALM} Solo felt piano, a sparse wandering melody with long pauses over a soft warm pad, morning light, peaceful and nostalgic, about 60 bpm.`,
  },
  {
    id: 'niitty',
    prompt: `${CALM} Soft acoustic piano with light warm strings, pastoral meadow on a sunny day, a calm melody that drifts, hopeful and cozy.`,
  },
  {
    id: 'puro',
    prompt: `${CALM} Mellow electric piano and soft synth pads that flow like a little stream, dreamy, relaxing, minimal.`,
  },
  {
    id: 'tahdet',
    prompt: `${CALM} Night time under the stars: slow quiet piano notes with gentle celesta sparkles and a deep soft pad, lullaby feel, very minimal.`,
  },
  {
    id: 'luola',
    prompt: `${CALM} Deep in a cave: distant echoing piano notes over a low warm drone, mysterious but calm, very sparse.`,
  },
  {
    id: 'nether',
    prompt: `${CALM} A hot dark underworld: warm low ambient drone with slow deep piano chords and a far-away rumble, a little ominous but still calm.`,
  },
  {
    id: 'valikko',
    prompt: `${CALM} A welcoming title theme: calm nostalgic piano melody with soft pads, gentle and inviting.`,
  },
  {
    id: 'halloween-king',
    prompt: `${SPOOKY} A playful-creepy slow waltz in a minor key with pizzicato strings, harpsichord and a low bassoon, a pumpkin king in his field.`,
  },
  {
    id: 'halloween-maiden',
    prompt: `${SPOOKY} An ethereal slow music box melody with misty airy synth pads, haunting and dreamy, a ghost hiding in the fog.`,
  },
  {
    id: 'halloween-count',
    prompt: `${SPOOKY} Slow gothic pipe organ chords in a minor key, far away in a castle, with soft low strings and a red moon.`,
  },
  {
    id: 'halloween-captain',
    prompt: `${SPOOKY} An eerie slow sea shanty in a minor key on a creaky accordion and low cello, a ghost ship in a distant storm.`,
  },
  {
    id: 'halloween-spider',
    prompt: `${SPOOKY} A tense quiet ostinato of plucked strings and soft ticking over a low drone, something creeping closer in the dark.`,
  },
  {
    id: 'halloween-silent',
    prompt: `${SPOOKY} Almost silent dark ambient: a deep soft drone with very sparse single piano notes, uneasy and still.`,
  },
  {
    id: 'ikiyo-1',
    prompt: `${DREAD} Phase one, the whisper: a deep sub-bass drone, slow distant breathing-like swells, sparse detuned music-box notes, faint ticking, unsettling and very slow.`,
  },
  {
    id: 'ikiyo-2',
    prompt: `${DREAD} Phase two, the red moon: slow heavy taiko-like drum hits far away, dissonant low strings sliding, a dark organ chord, rising tension, still not too loud.`,
  },
  {
    id: 'ikiyo-3',
    prompt: `${DREAD} Phase three, endless night: a slow heartbeat pulse, deep rumbling drone, eerie high glassy tones that bend out of tune, almost silent moments in between, deep dread.`,
  },
];

function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  for (const file of ['.env.local', '../palikkamaailma/.env.local']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('OPENROUTER_API_KEY='));
    if (line) return line.slice('OPENROUTER_API_KEY='.length).trim();
  }
  throw new Error('OPENROUTER_API_KEY puuttuu');
}

/** Lyria sends the song as base64 mp3 pieces in a stream. */
async function compose(key, prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['audio'],
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  let audio = '';
  let text = '';
  for (const line of (await res.text()).split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    const delta = JSON.parse(data).choices?.[0]?.delta;
    audio += delta?.audio?.data ?? '';
    text += delta?.content ?? '';
  }
  return audio
    ? Buffer.from(audio, 'base64')
    : (console.log(`  (ei ääntä: ${text.slice(0, 120)})`), null);
}

const key = apiKey();
fs.mkdirSync(OUT, { recursive: true });
const list = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : {};
for (const track of TRACKS) {
  const file = path.join(OUT, `${track.id}.m4a`);
  if (list[track.id] && fs.existsSync(file)) continue;
  const mp3 = path.join(os.tmpdir(), `music-${process.pid}.mp3`);
  // Sometimes no song comes back: one more try.
  const song = (await compose(key, track.prompt)) ?? (await compose(key, track.prompt));
  if (!song) {
    console.log(`⚠️ ${track.id}: ei onnistunut`);
    continue;
  }
  fs.writeFileSync(mp3, song);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '80000', mp3, file]);
  const info = execFileSync('afinfo', [file], { encoding: 'utf8' });
  fs.unlinkSync(mp3);
  list[track.id] = Math.round(Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 0));
  console.log(`🎵 ${track.id}: ${list[track.id]} s`);
  // Saved after every track, so a break halfway loses nothing.
  fs.writeFileSync(LIST, `${JSON.stringify(list, null, 2)}\n`);
}
const kept = Object.fromEntries(
  Object.entries(list).filter(([id]) => TRACKS.some((t) => t.id === id)),
);
fs.writeFileSync(LIST, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`Valmis: ${Object.keys(kept).length} kappaletta.`);
