// The Halloween characters' recorded voices (made by scripts/voices.mjs).
// A line finds its voice by its text, so the others in multiplayer hear it
// too when the host's character talks. Ikiyö's voice goes through a monster
// filter: lower and rough, with a much deeper ghost of itself trailing
// behind, a long echo and a shaking volume.

import { audioSettings } from './settings';
import { voiceId } from './voiceId';
import lines from './voiceLines.json';

const VOLUME = 0.85;
/** The monster voice is slowed down (lower) by this much; its ghost even more. */
const MONSTER_RATE = 0.86;
const GHOST_RATE = 0.6;
const recorded: Readonly<Record<string, number>> = lines;
let playing: HTMLAudioElement | null = null;
let playingNodes: AudioScheduledSourceNode[] = [];

export type VoiceFx = 'monster';

/** How long the recorded line lasts (0 when it has no voice). */
export function voiceSeconds(text: string, fx?: VoiceFx): number {
  const s = recorded[voiceId(text)] ?? 0;
  return fx === 'monster' && s > 0 ? s / MONSTER_RATE : s;
}

function stopPlaying(): void {
  playing?.pause();
  playing = null;
  for (const n of playingNodes) {
    try {
      n.stop();
    } catch {
      // Already finished.
    }
  }
  playingNodes = [];
}

/** Says the line out loud if it has a voice. Returns its length in seconds. */
export function speak(text: string, fx?: VoiceFx): number {
  const seconds = voiceSeconds(text, fx);
  if (seconds <= 0 || !audioSettings.sounds) return 0;
  stopPlaying();
  const url = `${import.meta.env.BASE_URL}voices/${voiceId(text)}.m4a`;
  if (fx === 'monster') {
    void playMonster(url);
    return seconds;
  }
  const audio = new Audio(url);
  audio.volume = VOLUME;
  void audio.play().catch(() => {
    // The browser blocked it (no click yet): the words still show.
  });
  playing = audio;
  return seconds;
}

// --- The monster voice ---------------------------------------------------------

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
let echo: AudioBuffer | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A rough edge for the voice. */
function distortion(a: AudioContext, amount: number): WaveShaperNode {
  const shaper = a.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/** A long, dark echo (made from fading noise). */
function echoBuffer(a: AudioContext): AudioBuffer {
  if (echo) return echo;
  const length = Math.floor(a.sampleRate * 2.6);
  echo = a.createBuffer(2, length, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = echo.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.4;
  }
  return echo;
}

async function playMonster(url: string): Promise<void> {
  const a = context();
  if (!a) return;
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => a.decodeAudioData(b));
    buffers.set(url, pending);
  }
  let buffer: AudioBuffer;
  try {
    buffer = await pending;
  } catch {
    buffers.delete(url);
    return;
  }
  const start = a.currentTime + 0.02;
  const out = a.createGain();
  out.gain.value = 1;
  out.connect(a.destination);
  // The shaking volume.
  const shake = a.createGain();
  shake.gain.value = 0.85;
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 5.5;
  depth.gain.value = 0.22;
  lfo.connect(depth).connect(shake.gain);
  shake.connect(out);
  // The voice itself: lower and rough.
  const voice = a.createBufferSource();
  voice.buffer = buffer;
  voice.playbackRate.value = MONSTER_RATE;
  const rough = distortion(a, 14);
  const voiceGain = a.createGain();
  voiceGain.gain.value = 0.75;
  voice.connect(rough).connect(voiceGain).connect(shake);
  // Its ghost: much deeper and dark, trailing behind.
  const ghost = a.createBufferSource();
  ghost.buffer = buffer;
  ghost.playbackRate.value = GHOST_RATE;
  const dark = a.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 900;
  const ghostGain = a.createGain();
  ghostGain.gain.value = 0.5;
  ghost.connect(dark).connect(ghostGain).connect(shake);
  // The long echo.
  const room = a.createConvolver();
  room.buffer = echoBuffer(a);
  const wet = a.createGain();
  wet.gain.value = 0.42;
  voiceGain.connect(room);
  ghostGain.connect(room);
  room.connect(wet).connect(out);
  voice.start(start);
  ghost.start(start + 0.06);
  lfo.start(start);
  const end = start + buffer.duration / GHOST_RATE + 0.2;
  lfo.stop(end);
  playingNodes = [voice, ghost, lfo];
}
