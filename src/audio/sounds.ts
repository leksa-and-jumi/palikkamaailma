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

export const sounds = {
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
