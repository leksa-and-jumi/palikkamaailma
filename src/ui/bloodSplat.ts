// Blood on the "camera" when a big hit lands: dark red splatters near the
// edges of the screen (never over the middle, so you can still see), a few
// drops around them, a smear, and drips that run slowly down while it all
// fades away. Used sparingly: only Ikiyö's worst hits, never too often.

/** Seconds a splatter stays before it is gone. */
const LIFE = 5;
/** Seconds between two splatters at the least. */
const COOLDOWN = 2.5;
const MAX_SPLATS = 4;
/** The canvas is drawn at a lower resolution (blood does not need sharp pixels). */
const RESOLUTION = 0.5;

interface Drip {
  x: number;
  y: number;
  width: number;
  speed: number;
  length: number;
}

interface Splat {
  picture: HTMLCanvasElement;
  x: number;
  y: number;
  age: number;
  drips: Drip[];
}

/** One splatter drawn once into its own picture (blob, drops and a smear). */
function paint(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size * 2;
  c.height = size * 2;
  const ctx = c.getContext('2d')!;
  const mid = size;
  const red = (a: number) =>
    `rgba(${90 + Math.floor(Math.random() * 40)},0,${Math.floor(Math.random() * 8)},${a})`;
  // The smear: a few soft streaks dragged one way.
  const angle = Math.random() * Math.PI * 2;
  ctx.filter = `blur(${Math.max(2, size / 14)}px)`;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = red(0.25);
    ctx.lineWidth = size * (0.15 + Math.random() * 0.15);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const off = (Math.random() - 0.5) * size * 0.4;
    ctx.moveTo(mid + Math.cos(angle + 1.57) * off, mid + Math.sin(angle + 1.57) * off);
    ctx.lineTo(
      mid + Math.cos(angle) * size * 0.85 + off * 0.3,
      mid + Math.sin(angle) * size * 0.85 + off * 0.3,
    );
    ctx.stroke();
  }
  ctx.filter = 'none';
  // The main blob: a ragged ring of overlapping circles, darker in the middle.
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * size * 0.28;
    const r = size * (0.12 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(
      mid + Math.cos(a) * d,
      mid + Math.sin(a) * d,
      0,
      mid + Math.cos(a) * d,
      mid + Math.sin(a) * d,
      r,
    );
    g.addColorStop(0, red(0.85));
    g.addColorStop(0.7, red(0.7));
    g.addColorStop(1, red(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mid + Math.cos(a) * d, mid + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Drops flung out around it.
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = size * (0.4 + Math.random() * 0.55);
    ctx.fillStyle = red(0.6 + Math.random() * 0.3);
    ctx.beginPath();
    ctx.arc(
      mid + Math.cos(a) * d,
      mid + Math.sin(a) * d,
      size * (0.01 + Math.random() * 0.035),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  return c;
}

export class BloodScreen {
  private readonly ctx: CanvasRenderingContext2D;
  private splats: Splat[] = [];
  private last = 0;
  private running = false;
  private lastSplat = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Blood on the screen (0–1: a few drops – a big splatter). Too soon after the last: nothing. */
  splat(amount: number): void {
    const now = performance.now() / 1000;
    if (amount <= 0 || now - this.lastSplat < COOLDOWN) return;
    this.lastSplat = now;
    this.resize();
    const w = this.canvas.width;
    const h = this.canvas.height;
    const count = amount > 0.6 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const size = Math.min(w, h) * (0.12 + amount * 0.14) * (0.8 + Math.random() * 0.4);
      // Near an edge or a corner, never over the crosshair.
      const side = Math.floor(Math.random() * 4);
      const along = 0.1 + Math.random() * 0.8;
      const inset = 0.05 + Math.random() * 0.12;
      const x = side === 0 ? w * inset : side === 1 ? w * (1 - inset) : w * along;
      const y = side === 2 ? h * inset : side === 3 ? h * (1 - inset) : h * along;
      const drips: Drip[] = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        x: x + (Math.random() - 0.5) * size * 0.6,
        y: y + size * (0.05 + Math.random() * 0.15),
        width: size * (0.02 + Math.random() * 0.025),
        speed: size * (0.08 + Math.random() * 0.14),
        length: 0,
      }));
      this.splats.push({ picture: paint(size), x, y, age: 0, drips });
    }
    while (this.splats.length > MAX_SPLATS) this.splats.shift();
    if (!this.running) {
      this.running = true;
      this.canvas.hidden = false;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  /** All gone (a new game, or you died). */
  clear(): void {
    this.splats = [];
  }

  private resize(): void {
    const w = Math.round(window.innerWidth * RESOLUTION);
    const h = Math.round(window.innerHeight * RESOLUTION);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private frame(time: number): void {
    const dt = Math.min(0.1, (time - this.last) / 1000);
    this.last = time;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.splats) {
      s.age += dt;
      // Fresh and wet at first, then it fades away.
      const k = s.age / LIFE;
      const alpha = k < 0.15 ? 1 : Math.max(0, 1 - (k - 0.15) / 0.85);
      ctx.globalAlpha = alpha * 0.9;
      const half = s.picture.width / 2;
      ctx.drawImage(s.picture, s.x - half, s.y - half);
      // Drips run slowly down, slower and slower.
      ctx.strokeStyle = 'rgba(105,0,4,0.85)';
      ctx.lineCap = 'round';
      for (const d of s.drips) {
        d.length += d.speed * dt * Math.max(0.15, 1 - k);
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.length);
        ctx.stroke();
        ctx.fillStyle = 'rgba(105,0,4,0.85)';
        ctx.beginPath();
        ctx.arc(d.x, d.y + d.length, d.width * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.splats = this.splats.filter((s) => s.age < LIFE);
    if (this.splats.length === 0) {
      this.running = false;
      this.canvas.hidden = true;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
