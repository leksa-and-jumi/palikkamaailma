// The title "PALIKKAMAAILMA" drawn like Minecraft's: chunky pixel letters
// made of cobblestone, with a dark 3D edge. Drawn small, then made big
// without smoothing so it stays blocky.

import { getAtlasCanvas } from '../render/textures';
import { ATLAS_COLUMNS, tileIndex } from '../logic/atlas';
import { RENDER } from '../config';

const SCALE = 4;
const DEPTH = 3;

const SPLASHES = [
  'Nyt Netherillä!',
  'Kaivosvaunuja!',
  'Juliuksen ja Leon peli!',
  'Kuuhyppy!',
  '100 % palikoita!',
  'Kutsu kaveri!',
  'Varo creeperiä!',
  'Taikarakentaja!',
  'Rakenna korkealle!',
  'Pokaaleja!',
];

export function randomSplash(): string {
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)]!;
}

/** A small canvas with one block picture, for patterns. */
function tileCanvas(name: Parameters<typeof tileIndex>[0]): HTMLCanvasElement {
  const S = RENDER.tilePixels;
  const i = tileIndex(name);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  c.getContext('2d')!.drawImage(
    getAtlasCanvas(),
    (i % ATLAS_COLUMNS) * S,
    Math.floor(i / ATLAS_COLUMNS) * S,
    S,
    S,
    0,
    0,
    S,
    S,
  );
  return c;
}

export function drawTitleLogo(canvas: HTMLCanvasElement, text = 'PALIKKAMAAILMA'): void {
  const w = Math.floor(canvas.width / SCALE);
  const h = Math.floor(canvas.height / SCALE);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const size = Math.floor(h * 0.62);
  ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = Math.min(1, (w - 12) / ctx.measureText(text).width);
  ctx.font = `900 ${Math.floor(size * fit)}px "Arial Black", Impact, system-ui, sans-serif`;
  const x = w / 2 - DEPTH / 2;
  const y = h / 2 - DEPTH / 2;

  // The dark side of the letters (the 3D edge).
  for (let d = DEPTH; d >= 1; d--) {
    ctx.fillStyle = d === 1 ? '#2a2a2e' : '#1a1a1d';
    ctx.fillText(text, x + d, y + d);
  }
  // The front: cobblestone, a little lighter at the top.
  const front = document.createElement('canvas');
  front.width = w;
  front.height = h;
  const f = front.getContext('2d')!;
  f.font = ctx.font;
  f.textAlign = 'center';
  f.textBaseline = 'middle';
  f.fillStyle = '#fff';
  f.fillText(text, x, y);
  f.globalCompositeOperation = 'source-in';
  f.fillStyle = f.createPattern(tileCanvas('cobble'), 'repeat')!;
  f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'source-atop';
  const shine = f.createLinearGradient(0, 0, 0, h);
  shine.addColorStop(0, 'rgba(255,255,255,0.35)');
  shine.addColorStop(0.55, 'rgba(255,255,255,0)');
  f.fillStyle = shine;
  f.fillRect(0, 0, w, h);
  ctx.drawImage(front, 0, 0);

  const big = canvas.getContext('2d')!;
  big.imageSmoothingEnabled = false;
  big.clearRect(0, 0, canvas.width, canvas.height);
  big.drawImage(small, 0, 0, canvas.width, canvas.height);
}
