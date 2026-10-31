// Jump-scare faces that slam onto the screen for a split second: drawn by
// code (our own faces, nothing copied), shaking hard, flickering, zooming
// at you, with static and the colours splitting. Ikiyö uses them.

/** How many different faces there are. */
export const SCREAMER_FACES = 4;

const W = 360;
const H = 440;
const cache = new Map<number, HTMLCanvasElement>();

/** A random number that is the same every time for a face. */
function seeded(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function grain(ctx: CanvasRenderingContext2D, amount: number, rand: () => number): void {
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
}

function paleFace(ctx: CanvasRenderingContext2D, stretch: number): void {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.5, W * 0.6);
  g.addColorStop(0, '#d9d4c8');
  g.addColorStop(0.6, '#8f887b');
  g.addColorStop(1, '#1a1714');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.5, W * 0.38, H * 0.44 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Black, bottomless eyes with a tiny point of light. */
function holeEyes(ctx: CanvasRenderingContext2D, y: number, size: number, pupil: string): void {
  for (const x of [W * 0.34, W * 0.66]) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, size);
    g.addColorStop(0, '#000');
    g.addColorStop(0.75, '#050302');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(x + size * 0.1, y - size * 0.1, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Long jagged teeth along an edge. */
function teeth(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  dir: 1 | -1,
  long: number,
  rand: () => number,
): void {
  ctx.fillStyle = '#e9e2cf';
  for (let x = x0; x < x1; x += 9 + rand() * 6) {
    const l = long * (0.5 + rand() * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5, y + dir * l);
    ctx.lineTo(x + 10, y);
    ctx.fill();
  }
}

function drawFace(i: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = seeded(i + 3);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  switch (i % SCREAMER_FACES) {
    case 0: {
      // The long pale one: huge black eyes and a mouth that hangs open far too wide.
      paleFace(ctx, 1);
      holeEyes(ctx, H * 0.36, 46, '#fff');
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.72, 62, 92, 0, 0, Math.PI * 2);
      ctx.fill();
      teeth(ctx, W / 2 - 52, W / 2 + 50, H * 0.72 - 82, 1, 26, rand);
      teeth(ctx, W / 2 - 50, W / 2 + 52, H * 0.72 + 84, -1, 22, rand);
      break;
    }
    case 1: {
      // The grin: from ear to ear, far too many teeth, tiny red eyes.
      paleFace(ctx, 0.92);
      for (const x of [W * 0.36, W * 0.64]) {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(x, H * 0.38, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff2010';
        ctx.beginPath();
        ctx.arc(x, H * 0.38, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#100000';
      ctx.beginPath();
      ctx.moveTo(W * 0.1, H * 0.55);
      ctx.quadraticCurveTo(W / 2, H * 0.92, W * 0.9, H * 0.55);
      ctx.quadraticCurveTo(W / 2, H * 0.7, W * 0.1, H * 0.55);
      ctx.fill();
      for (let k = 0; k < 2; k++) {
        const y = H * (0.6 + k * 0.08);
        teeth(ctx, W * 0.16, W * 0.84, y, 1, 18, rand);
      }
      break;
    }
    case 2: {
      // The melting one: eyes running down, a crooked mouth.
      paleFace(ctx, 1.05);
      holeEyes(ctx, H * 0.38, 36, '#ff3a2a');
      ctx.fillStyle = '#050302';
      for (const x of [W * 0.34, W * 0.66]) {
        for (let k = 0; k < 4; k++) {
          const dx = x - 20 + rand() * 40;
          ctx.fillRect(dx, H * 0.42, 5 + rand() * 6, 60 + rand() * 120);
        }
      }
      ctx.save();
      ctx.translate(W / 2, H * 0.74);
      ctx.rotate(-0.25);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      teeth(ctx, -60, 60, -20, 1, 14, rand);
      ctx.restore();
      break;
    }
    default: {
      // Ikiyö, too close: its blocky face, eyes burning.
      const px = 22;
      const ox = (W - 16 * px) / 2;
      const oy = 30;
      ctx.fillStyle = '#6f6862';
      ctx.fillRect(ox, oy, 16 * px, 16 * px);
      const rows = [
        'hhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhh',
        'hhh.hhhhhh.hhhhh',
        'h....h....h...h.',
        '.....bb..bb.....',
        '.bbbb......bbbb.',
        '.kkkkkk..kkkkkk.',
        '.krrrrk..krrrrk.',
        '.krryrk..kryrrk.',
        '.vkrrkk..kkrrkv.',
        '.vs..........sv.',
        '..s..v....v..s..',
        'mms..........smm',
        'mmmtmtmmmmtmtmmm',
        '.mmmmmmmmmmmmmm.',
        '..tmtmtttmtmtm..',
      ];
      const colors: Record<string, string> = {
        h: '#0b0909',
        k: '#050303',
        r: '#ff1a08',
        y: '#ffe060',
        s: '#241214',
        b: '#170a0a',
        v: '#5a0a0a',
        m: '#0a0000',
        t: '#e8e0c8',
      };
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (!colors[c]) return;
          ctx.fillStyle = colors[c]!;
          ctx.fillRect(ox + x * px, oy + y * px, px, px);
        }),
      );
      // The eyes glow.
      ctx.globalCompositeOperation = 'lighter';
      for (const x of [ox + 4 * px, ox + 12 * px]) {
        const g = ctx.createRadialGradient(x, oy + 8 * px, 2, x, oy + 8 * px, 70);
        g.addColorStop(0, 'rgba(255,40,10,0.7)');
        g.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 70, oy + 8 * px - 70, 140, 140);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // Dark streaks, grain and a red cast.
  ctx.fillStyle = 'rgba(80,0,0,0.18)';
  ctx.fillRect(0, 0, W, H);
  grain(ctx, 70, rand);
  return canvas;
}

function face(i: number): HTMLCanvasElement {
  let c = cache.get(i);
  if (!c) {
    c = drawFace(i);
    cache.set(i, c);
  }
  return c;
}

/**
 * Shows a face for `seconds` (a split second): it shakes, flickers, zooms in,
 * with static and split colours. Very short (under 0.12 s) = a subliminal flash.
 */
export function showScreamer(el: HTMLElement, variant: number, seconds: number): void {
  const img = face(((variant % SCREAMER_FACES) + SCREAMER_FACES) % SCREAMER_FACES);
  const main = el.querySelector<HTMLCanvasElement>('.screamer-face')!;
  const red = el.querySelector<HTMLCanvasElement>('.screamer-red')!;
  for (const c of [main, red]) {
    c.width = W;
    c.height = H;
    c.getContext('2d')!.drawImage(img, 0, 0);
  }
  el.hidden = false;
  const start = performance.now();
  const total = Math.max(0.05, seconds) * 1000;
  const frame = () => {
    const t = (performance.now() - start) / total;
    if (t >= 1) {
      el.hidden = true;
      return;
    }
    // Shaking hard, zooming at you, flickering off now and then.
    const shake = 28 * (1 - t * 0.5);
    const dx = (Math.random() - 0.5) * shake;
    const dy = (Math.random() - 0.5) * shake;
    const rot = (Math.random() - 0.5) * 6;
    const scale = 1 + t * 0.35 + Math.random() * 0.06;
    main.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`;
    red.style.transform = `translate(${dx + 10 + Math.random() * 8}px, ${dy - 6}px) rotate(${rot}deg) scale(${scale * 1.02})`;
    el.style.opacity = Math.random() < 0.18 ? '0' : '1';
    el.style.setProperty('--static', String(0.25 + Math.random() * 0.35));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
