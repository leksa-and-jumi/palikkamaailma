// Draws one inventory slot: item picture, count, wear bar and enchantment shine.

import type { Slot } from '../logic/inventory';
import { getItem, maxDurability } from '../logic/items';
import { drawItemIcon } from '../render/itemIcons';

const ICON_PIXELS = 48;
const iconCache = new Map<number, string>();

/** A data URL of the item's picture (drawn once per item). */
function iconUrl(id: number): string {
  let url = iconCache.get(id);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_PIXELS;
    drawItemIcon(canvas, id);
    url = canvas.toDataURL();
    iconCache.set(id, url);
  }
  return url;
}

export function fillSlot(el: HTMLElement, stack: Slot, placeholder = ''): void {
  el.replaceChildren();
  if (!stack) {
    if (placeholder) {
      const hint = document.createElement('span');
      hint.className = 'placeholder';
      hint.textContent = placeholder;
      el.append(hint);
    }
    return;
  }
  const img = document.createElement('img');
  img.src = iconUrl(stack.id);
  img.alt = getItem(stack.id)?.name ?? '';
  img.draggable = false;
  img.style.width = '80%';
  img.style.height = '80%';
  img.style.imageRendering = 'pixelated';
  el.append(img);
  el.title = img.alt;

  if (stack.count > 1) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(stack.count);
    el.append(count);
  }
  const item = getItem(stack.id);
  const max = item ? maxDurability(item) : undefined;
  if (max && stack.damage) {
    const left = 1 - stack.damage / max;
    const bar = document.createElement('div');
    bar.className = 'durability';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(left * 100)}%`;
    fill.style.background = `hsl(${Math.round(left * 120)}, 90%, 45%)`;
    bar.append(fill);
    el.append(bar);
  }
  if (stack.enchants) {
    const glint = document.createElement('div');
    glint.className = 'glint';
    el.append(glint);
  }
}
