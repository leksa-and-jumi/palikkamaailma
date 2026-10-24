// Tiny sound effects made with the Web Audio API (no sound files).

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(frequency: number, duration: number, type: OscillatorType, volume: number): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, a.currentTime + duration);
  gain.gain.setValueAtTime(volume, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration);
}

/** A burst of noise (bangs, hisses, whooshes). `from`/`to` move a filter. */
function noise(
  duration: number,
  volume: number,
  from: number,
  to: number,
  delay = 0,
  type: BiquadFilterType = 'lowpass',
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
  const start = a.currentTime + delay;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = a.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(a.destination);
  source.start(start);
}

/** Quieter far away (0–1). */
function near(distance: number): number {
  return Math.max(0, 1 - distance / 64);
}

export const sounds = {
  click: () => blip(900, 0.04, 'square', 0.05),
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
  place: () => blip(420, 0.08, 'square', 0.05),
  break: () => blip(180, 0.12, 'sawtooth', 0.05),
  join: () => {
    blip(520, 0.12, 'sine', 0.08);
    setTimeout(() => blip(780, 0.15, 'sine', 0.08), 110);
  },
  magic: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => blip(f, 0.18, 'triangle', 0.07), i * 90),
    );
  },
};
