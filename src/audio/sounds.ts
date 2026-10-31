// Sound effects made with the Web Audio API (no sound files): blocks sound
// like what they are made of, villagers hum, and mods get spooky sounds.
// Everything is kept soft, like in Minecraft; the pause menu turns sounds off.

import type { Material } from './materials';
import { audioSettings } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (!audioSettings.sounds) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** All sounds go through one soft limiter, so many at once never get too loud. */
function out(a: AudioContext): AudioNode {
  if (!master) {
    const limiter = a.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.ratio.value = 6;
    master = a.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(a.destination);
  }
  return master;
}

function blip(
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
  endFrequency = frequency * 0.5,
): void {
  const a = audio();
  if (!a || volume <= 0.001) return;
  const start = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.01, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out(a));
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** A burst of noise (bangs, hisses, whooshes). `from`/`to` move a filter. */
function noise(
  duration: number,
  volume: number,
  from: number,
  to: number,
  delay = 0,
  type: BiquadFilterType = 'lowpass',
  q = 1,
): void {
  const a = audio();
  if (!a || volume <= 0.001) return;
  const length = Math.ceil(a.sampleRate * duration);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const start = a.currentTime + delay;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  const gain = a.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(out(a));
  source.start(start);
}

/** A voice-like hum: a buzzing tone shaped by two mouth filters (villagers). */
function hum(pitch: [number, number], duration: number, volume: number, vowel = [700, 1200]): void {
  const a = audio();
  if (!a || volume <= 0.001) return;
  const start = a.currentTime;
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch[0], start);
  osc.frequency.linearRampToValueAtTime(pitch[1], start + duration);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.06);
  gain.gain.setValueAtTime(volume, start + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  for (const f of vowel) {
    const formant = a.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = f;
    formant.Q.value = 6;
    osc.connect(formant).connect(gain);
  }
  // A closed mouth: mostly the low hum.
  const low = a.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 400;
  osc.connect(low).connect(gain);
  gain.connect(out(a));
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** A rough growl: a buzzing tone that wobbles, through a dark filter. */
function growl(
  frequency: number,
  endFrequency: number,
  duration: number,
  volume: number,
  delay = 0,
  attack = 0.15,
): void {
  const a = audio();
  if (!a || volume <= 0.001) return;
  const start = a.currentTime + delay;
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(frequency, start);
  osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  // A slow wobble makes it sound alive.
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 7;
  depth.gain.value = frequency * 0.08;
  lfo.connect(depth).connect(osc.frequency);
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 4;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.setValueAtTime(volume, start + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter).connect(gain).connect(out(a));
  osc.start(start);
  lfo.start(start);
  osc.stop(start + duration + 0.05);
  lfo.stop(start + duration + 0.05);
}

/** Quieter far away (0–1). */
function near(distance: number): number {
  return Math.max(0, 1 - distance / 64);
}

const vary = (v: number, amount = 0.12) => v * (1 - amount + Math.random() * amount * 2);

/** How each material sounds: noise colour, its brightness, and a knock. */
const MATERIAL: Record<
  Material,
  { from: number; to: number; type: BiquadFilterType; knock: number; length: number }
> = {
  stone: { from: 2200, to: 500, type: 'bandpass', knock: 140, length: 0.16 },
  wood: { from: 1100, to: 300, type: 'bandpass', knock: 220, length: 0.14 },
  grass: { from: 1400, to: 300, type: 'lowpass', knock: 0, length: 0.18 },
  sand: { from: 5000, to: 2000, type: 'highpass', knock: 0, length: 0.2 },
  gravel: { from: 2600, to: 700, type: 'bandpass', knock: 0, length: 0.22 },
  glass: { from: 6000, to: 2500, type: 'highpass', knock: 0, length: 0.12 },
  wool: { from: 700, to: 200, type: 'lowpass', knock: 0, length: 0.14 },
  metal: { from: 3000, to: 1200, type: 'bandpass', knock: 600, length: 0.18 },
};

function material(m: Material, volume: number, length = 1): void {
  const s = MATERIAL[m];
  noise(s.length * length, volume, vary(s.from), s.to, 0, s.type, m === 'gravel' ? 3 : 1);
  if (s.knock) blip(vary(s.knock), 0.08 * length, 'triangle', volume * 0.6);
  if (m === 'gravel') noise(0.08, volume * 0.6, 3000, 1500, 0.07, 'bandpass', 3);
}

export const sounds = {
  click: () => blip(900, 0.04, 'square', 0.04),
  fuse: () => noise(0.9, 0.08, 4000, 1500, 0, 'highpass'),
  boom: (distance: number) => {
    const v = near(distance);
    noise(1.4, 0.5 * v, 900, 60);
    blip(70, 0.6, 'sine', 0.3 * v);
  },
  launch: (distance: number) => noise(0.7, 0.12 * near(distance), 400, 3000, 0, 'bandpass'),
  pop: (distance: number) => {
    const v = near(distance);
    noise(0.5, 0.25 * v, 2500, 200);
    // Crackles after the bang.
    for (let i = 0; i < 6; i++) noise(0.05, 0.06 * v, 6000, 3000, 0.25 + i * 0.09, 'highpass');
  },
  /** A block breaks (a bigger crunch than placing). */
  breakBlock: (m: Material = 'stone') => {
    material(m, 0.16, 1.6);
    if (m === 'glass') {
      // Glass shatters into tinkles.
      for (let i = 0; i < 5; i++) blip(vary(2600, 0.3), 0.08, 'sine', 0.03, i * 0.03, 2000);
    }
  },
  /** A block goes down. */
  placeBlock: (m: Material = 'stone') => material(m, 0.12),
  /** Tapping a block while digging it. */
  dig: (m: Material) => material(m, 0.05, 0.6),
  /** A footstep, quiet like in Minecraft. */
  step: (m: Material) => material(m, 0.035, 0.7),
  /** Kept for places that only want "something went down". */
  place: () => material('wood', 0.08),
  break: () => material('stone', 0.1, 1.2),
  /** You pick something up: a little rising pop. */
  pickup: () => blip(vary(500, 0.25), 0.07, 'sine', 0.05, 0, 900),
  eat: () => {
    for (let i = 0; i < 3; i++) noise(0.07, 0.07, 1800, 600, i * 0.11, 'bandpass', 2);
  },
  burp: () => blip(130, 0.25, 'sawtooth', 0.03, 0.4, 90),
  /** You get hurt: a soft thump. */
  hurt: () => {
    blip(vary(220), 0.16, 'square', 0.05, 0, 120);
    noise(0.12, 0.08, 900, 200);
  },
  /** A tool breaks. */
  toolBreak: () => {
    noise(0.18, 0.12, 4000, 800, 0, 'bandpass', 2);
    blip(800, 0.2, 'triangle', 0.05, 0, 300);
  },
  /** A new experience level: a bright little chime. */
  levelUp: () => {
    [523, 784, 1046].forEach((f, i) => blip(f, 0.25, 'triangle', 0.05, i * 0.1, f * 1.01));
  },
  /** The enchanting table glitters. */
  enchant: () => {
    for (let i = 0; i < 8; i++) blip(1200 + Math.random() * 1400, 0.3, 'sine', 0.025, i * 0.06);
  },
  /** The bowstring twangs (stronger when fully drawn). */
  bow: (power: number) => {
    blip(220 + power * 120, 0.18, 'triangle', 0.05, 0, 120);
    noise(0.15, 0.05 + power * 0.05, 3000, 900, 0, 'bandpass', 2);
  },
  splash: () => noise(0.5, 0.12, 2500, 300, 0, 'lowpass'),
  /** Armour goes on. */
  equip: () => {
    noise(0.12, 0.06, 3000, 1200, 0, 'bandpass', 3);
    blip(500, 0.1, 'triangle', 0.03, 0.05, 400);
  },
  /** A sword hits a creature. */
  hit: (strong: boolean) => {
    noise(0.1, strong ? 0.12 : 0.08, 1800, 500, 0, 'bandpass');
    if (strong) blip(1600, 0.12, 'triangle', 0.03, 0, 1200);
  },
  /** A villager says "hmm" (yes = pleased, no = not interested). */
  villager: (mood: 'hmm' | 'yes' | 'no', distance = 0) => {
    const v = 0.05 * near(distance * 2);
    if (mood === 'yes') hum([vary(150, 0.08), 190], 0.35, v, [600, 1000]);
    else if (mood === 'no') hum([vary(170, 0.08), 120], 0.4, v, [500, 900]);
    else hum([vary(150, 0.1), vary(135, 0.1)], 0.45, v);
  },
  door: (open: boolean) => {
    noise(0.12, 0.08, open ? 900 : 600, open ? 300 : 200, 0, 'bandpass');
    blip(open ? 220 : 160, 0.08, 'triangle', 0.06);
  },
  /** A piston pushing out or pulling back. */
  piston: (distance: number) => noise(0.18, 0.1 * near(distance), 700, 250, 0, 'bandpass'),
  join: () => {
    blip(520, 0.12, 'sine', 0.06);
    blip(780, 0.15, 'sine', 0.06, 0.11);
  },
  /** Spooky sounds for mods (kept far away and soft). */
  thunder: () => {
    noise(2.2, 0.35, 600, 40);
    noise(1.2, 0.2, 2000, 200, 0.05);
  },
  whisper: () => {
    noise(1.4, 0.05, 3000, 1200, 0, 'bandpass', 3);
    noise(0.9, 0.04, 2500, 1500, 0.5, 'bandpass', 3);
  },
  laugh: () => {
    [330, 300, 340, 290, 320].forEach((f, i) => blip(f, 0.14, 'sawtooth', 0.03, i * 0.14));
  },
  bell: () => {
    blip(196, 1.8, 'sine', 0.08, 0, 190);
    blip(392, 1.2, 'sine', 0.02, 0, 380);
    blip(196, 1.8, 'sine', 0.05, 0.8, 190);
  },
  heartbeat: () => {
    blip(60, 0.18, 'sine', 0.22);
    blip(55, 0.2, 'sine', 0.18, 0.22);
  },
  magic: () => {
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.18, 'triangle', 0.05, i * 0.09));
  },
  /** An old door creaking somewhere. */
  creak: () => {
    const a = audio();
    if (!a) return;
    const start = a.currentTime;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, start);
    osc.frequency.linearRampToValueAtTime(140, start + 0.6);
    osc.frequency.linearRampToValueAtTime(70, start + 1.3);
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 8;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
    osc.connect(filter).connect(gain).connect(out(a));
    osc.start(start);
    osc.stop(start + 1.4);
  },
  /** A far-away howl. */
  howl: () => {
    blip(380, 0.6, 'sine', 0.025, 0, 560);
    blip(560, 1.8, 'sine', 0.03, 0.55, 300);
  },
  /** A water drop echoing in the dark. */
  drip: () => {
    blip(1400, 0.12, 'sine', 0.04, 0, 2400);
    blip(1400, 0.12, 'sine', 0.015, 0.35, 2400);
  },
  /** A cold wind rising and falling. */
  wind: () => noise(3.5, 0.05, 300, 1400, 0, 'bandpass', 4),
  /** A giant's roar: a deep growl with a rough edge. */
  roar: () => {
    growl(55, 38, 2.2, 0.16);
    growl(82, 50, 1.8, 0.08, 0.08);
    noise(2.2, 0.18, 900, 120, 0, 'lowpass');
  },
  /** A long, low hum that makes the air feel heavy. */
  drone: () => {
    growl(41, 39, 6, 0.07, 0, 2.5);
    blip(61.7, 6, 'sine', 0.05, 0, 60);
  },
  /** The sound stutters, as if the world itself glitched. */
  glitch: () => {
    for (let i = 0; i < 9; i++) {
      noise(0.04, 0.09, 4000 + Math.random() * 3000, 800, i * 0.055, 'bandpass', 6);
      if (i % 3 === 0) blip(90 + Math.random() * 400, 0.05, 'square', 0.03, i * 0.055, 60);
    }
  },
  /** A far, thin scream that falls away. */
  scream: () => {
    blip(1400, 1.4, 'sawtooth', 0.025, 0, 380);
    blip(1480, 1.3, 'triangle', 0.02, 0.05, 420);
    noise(1.4, 0.05, 5000, 1200, 0, 'bandpass', 3);
  },
  /** A jump-scare hit: a harsh clash of notes, a metal screech and a bang. */
  stinger: () => {
    for (const f of [220, 233, 311, 466, 622]) blip(f, 1.1, 'sawtooth', 0.045, 0, f * 0.97);
    blip(2400, 0.9, 'square', 0.02, 0, 1700);
    noise(0.9, 0.35, 6000, 300, 0, 'lowpass');
    growl(48, 36, 1.2, 0.18);
  },
  /** Teeth snapping shut. */
  bite: () => {
    noise(0.06, 0.4, 5000, 1500, 0, 'highpass', 2);
    noise(0.12, 0.3, 1200, 200, 0.03, 'bandpass', 3);
    blip(140, 0.12, 'square', 0.08, 0.02, 60);
  },
  /** Something long and wet stretching out, creaking. */
  stretch: () => {
    const a = audio();
    if (!a) return;
    const start = a.currentTime;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, start);
    osc.frequency.exponentialRampToValueAtTime(260, start + 0.9);
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, start);
    filter.frequency.exponentialRampToValueAtTime(1800, start + 0.9);
    filter.Q.value = 10;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.95);
    osc.connect(filter).connect(gain).connect(out(a));
    osc.start(start);
    osc.stop(start + 1);
    noise(0.9, 0.06, 2000, 600, 0, 'bandpass', 4);
  },
  /** A twisted little giggle far away. */
  giggle: () => {
    [620, 700, 580, 760, 540, 820].forEach((f, i) =>
      blip(f, 0.11, 'triangle', 0.025, i * 0.12 + Math.random() * 0.03, f * 0.8),
    );
  },
  /** The ground rumbles (big footsteps, something rising). */
  rumble: () => {
    noise(1.8, 0.3, 160, 40, 0, 'lowpass');
    blip(38, 1.6, 'sine', 0.22, 0, 30);
  },
};

export type SoundName = keyof typeof sounds;
