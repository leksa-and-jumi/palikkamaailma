// The little figure next to the armor slots (like the player in Minecraft's
// inventory): it wears what you wear, with your animal's face.

import type { Slot } from '../logic/inventory';
import { getItem, type ArmorMaterial } from '../logic/items';

const COLORS: Record<ArmorMaterial, [string, string]> = {
  leather: ['#8b5a2b', '#6b4220'],
  iron: ['#dcdcdc', '#a8a8a8'],
  gold: ['#f6d045', '#c99a1a'],
  diamond: ['#56e8e0', '#2aa8a8'],
};
const PIXEL = 5;

/** Draws the figure: head, body, arms and legs, then the armor over them. */
export function drawDoll(canvas: HTMLCanvasElement, armor: readonly Slot[], face: string): void {
  canvas.width = 16 * PIXEL;
  canvas.height = 33 * PIXEL;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * PIXEL, y * PIXEL, w * PIXEL, h * PIXEL);
  };
  const material = (i: number) => {
    const slot = armor[i];
    const m = slot ? getItem(slot.id)?.armor?.material : undefined;
    return m ? COLORS[m] : null;
  };
  // The body.
  box(4, 8, 8, 12, '#3a7ad0');
  box(0, 8, 4, 12, '#e0b090');
  box(12, 8, 4, 12, '#e0b090');
  box(4, 20, 4, 12, '#34408a');
  box(8, 20, 4, 12, '#34408a');
  box(4, 31, 8, 2, '#3a2a20');
  // The head is your animal.
  box(4, 0, 8, 8, '#f4e4c8');
  ctx.font = `${7 * PIXEL}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(face, 8 * PIXEL, 4.4 * PIXEL);
  // Armor on top.
  const helmet = material(0);
  if (helmet) {
    box(3, -1, 10, 3, helmet[0]);
    box(3, 2, 1, 5, helmet[1]);
    box(12, 2, 1, 5, helmet[1]);
  }
  const chest = material(1);
  if (chest) {
    box(3, 8, 10, 11, chest[0]);
    box(0, 8, 4, 5, chest[1]);
    box(12, 8, 4, 5, chest[1]);
    box(7, 9, 2, 9, chest[1]);
  }
  const legs = material(2);
  if (legs) {
    box(4, 19, 8, 3, legs[1]);
    box(4, 22, 3.5, 7, legs[0]);
    box(8.5, 22, 3.5, 7, legs[0]);
  }
  const boots = material(3);
  if (boots) {
    box(3.5, 29, 4.5, 4, boots[0]);
    box(8, 29, 4.5, 4, boots[0]);
    box(3.5, 32, 9, 1, boots[1]);
  }
}
