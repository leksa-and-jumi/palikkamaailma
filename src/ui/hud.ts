// Everything drawn on top of the 3D world: hotbar, hearts and hunger, world
// code, players and chat.

import { SURVIVAL } from '../config';
import { HOTBAR_SIZE, type Inventory } from '../logic/inventory';
import { getItem } from '../logic/items';
import type { Vitals } from '../logic/survival';
import type { RoomStatus } from '../net/room';
import { fillSlot } from './slots';

const CHAT_LINES = 10;
/** Command hints shown under the chat box at most. */
const CHAT_HINTS = 6;
const CHAT_FADE_MS = 10_000;
const TOAST_MS = 2600;
const ITEM_NAME_MS = 1400;
const HURT_FLASH_MS = 120;
const ICON_PIXELS = 9;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const STATUS_TEXT: Record<RoomStatus | 'solo', string> = {
  connecting: '🟡 Yhdistetään…',
  online: '🟢 Moninpeli päällä',
  offline: '🔴 Ei yhteyttä kavereihin – pidä peli auki, rakennukset lähtevät kun yhteys palaa',
  full: '⛔ Maailma on täynnä',
  missing: '❓ Maailmaa ei löytynyt',
  solo: '🧍 Pelaat yksin',
};

// Tiny pixel icons for the bars: full, half and empty.
const ICONS = {
  heart: ['.rr.rr...', 'rRrrrrr..', 'rrrrrrr..', '.rrrrr...', '..rrr....', '...r.....'],
  food: ['.....bb..', '....bbbb.', '...bbbbb.', '..mbbbb..', '.mm.bb...', 'mm.......', 'w........'],
  armor: [
    '.aaaaaaa.',
    'aaaaaaaaa',
    'aaaaaaaaa',
    '.aaaaaaa.',
    '.aaaaaaa.',
    '..aaaaa..',
    '...aaa...',
  ],
  bubble: ['..bbb....', '.b...b...', 'b.w...b..', 'b.....b..', '.b...b...', '..bbb....'],
} as const;
const COLORS: Record<string, string> = {
  r: '#e02020',
  R: '#ff9a9a',
  b: '#b0703a',
  m: '#e8d8c0',
  w: '#ffffff',
  a: '#d0d4da',
};
const EMPTY_COLOR = 'rgba(0,0,0,0.45)';

function pixelIcon(kind: keyof typeof ICONS, fill: 'full' | 'half' | 'empty'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PIXELS;
  const ctx = canvas.getContext('2d')!;
  const rows = ICONS[kind];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '.') return;
      const lit = fill === 'full' || (fill === 'half' && x < 4);
      ctx.fillStyle = lit ? (kind === 'bubble' ? '#7fc8ff' : COLORS[c]!) : EMPTY_COLOR;
      ctx.fillRect(x, y + 1, 1, 1);
    });
  });
  return canvas;
}

function fillBar(el: HTMLElement, kind: keyof typeof ICONS, value: number, max: number): void {
  const icons: HTMLCanvasElement[] = [];
  for (let i = 0; i < max / 2; i++) {
    const left = value - i * 2;
    icons.push(pixelIcon(kind, left >= 2 ? 'full' : left === 1 ? 'half' : 'empty'));
  }
  el.replaceChildren(...icons);
}

export class Hud {
  selected = 0;
  private inventory: Inventory | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private nameTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVitals = '';

  show(visible: boolean): void {
    $('hud').hidden = !visible;
  }

  /** The hotbar shows the first 9 slots of this inventory. */
  setInventory(inventory: Inventory): void {
    this.inventory = inventory;
    inventory.onChange = () => this.renderHotbar();
    this.renderHotbar();
  }

  setWorld(emoji: string, code: string, solo: boolean): void {
    $('world-card').textContent = solo ? `${emoji} Oma saari` : `${emoji} Koodi: ${code}`;
    $('pause-code').textContent = solo
      ? 'Tämä saari tallentuu tälle koneelle.'
      : `Kerro kaverille koodi ${code}, niin hän pääsee samaan maailmaan!`;
  }

  setStatus(status: RoomStatus | 'solo'): void {
    $('status').textContent = STATUS_TEXT[status];
  }

  setPlayers(avatars: string[]): void {
    $('players').textContent = avatars.join('');
  }

  setFlying(flying: boolean): void {
    $('flying').hidden = !flying;
  }

  /** Hearts, food, armor and air (survival only; null hides them). */
  setVitals(v: Vitals | null, armorPoints: number, underwater: boolean): void {
    $('vitals').hidden = v === null;
    if (!v) return;
    const air = underwater ? Math.ceil((v.air / SURVIVAL.maxAir) * 20) : 20;
    const key = `${Math.ceil(v.health)},${v.hunger},${armorPoints},${air}`;
    if (key === this.lastVitals) return;
    this.lastVitals = key;
    fillBar($('health-bar'), 'heart', Math.ceil(v.health), SURVIVAL.maxHealth);
    fillBar($('hunger-bar'), 'food', v.hunger, SURVIVAL.maxHunger);
    if (armorPoints > 0) fillBar($('armor-bar'), 'armor', armorPoints, 20);
    else $('armor-bar').replaceChildren();
    if (air < 20) fillBar($('air-bar'), 'bubble', air, 20);
    else $('air-bar').replaceChildren();
  }

  flashHurt(): void {
    const el = $('hurt-flash');
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), HURT_FLASH_MS);
  }

  select(index: number): void {
    this.selected = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.renderHotbar();
    this.flashItemName();
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (el.hidden = true), TOAST_MS);
  }

  private flashItemName(): void {
    const el = $('block-name');
    const stack = this.inventory?.slots[this.selected];
    el.textContent = stack ? (getItem(stack.id)?.name ?? '') : '';
    el.style.opacity = '1';
    if (this.nameTimer) clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => (el.style.opacity = '0'), ITEM_NAME_MS);
  }

  renderHotbar(): void {
    const bar = $('hotbar');
    const slots = this.inventory?.slots.slice(0, HOTBAR_SIZE) ?? [];
    bar.replaceChildren(
      ...slots.map((stack, i) => {
        const slot = document.createElement('div');
        slot.className = `slot${i === this.selected ? ' selected' : ''}`;
        fillSlot(slot, stack);
        const number = document.createElement('span');
        number.textContent = String(i + 1);
        slot.append(number);
        return slot;
      }),
    );
  }

  // --- Chat ---------------------------------------------------------------

  addChat(avatar: string, text: string): void {
    const log = $('chat-log');
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.textContent = `${avatar} ${text}`;
    log.append(line);
    while (log.children.length > CHAT_LINES) log.firstElementChild?.remove();
    setTimeout(() => line.classList.add('faded'), CHAT_FADE_MS);
  }

  /**
   * Opens the chat box. `start` is typed in already ("/" for commands);
   * `hints` lists commands that match what is typed.
   */
  openChat(
    onSend: (text: string) => void,
    onClose: () => void,
    start = '',
    hints: (text: string) => string[] = () => [],
  ): void {
    const form = $('chat-form') as HTMLFormElement;
    const input = $('chat-input') as HTMLInputElement;
    const log = $('chat-log');
    const hint = $('chat-hint');
    form.hidden = false;
    log.classList.add('open');
    input.value = start;
    input.focus();
    const showHints = () => {
      const list = hints(input.value);
      hint.hidden = list.length === 0;
      hint.replaceChildren(
        ...list.slice(0, CHAT_HINTS).map((h) => {
          const row = document.createElement('div');
          row.textContent = h;
          return row;
        }),
      );
    };
    input.oninput = showHints;
    showHints();
    const close = () => {
      form.hidden = true;
      hint.hidden = true;
      log.classList.remove('open');
      input.onkeydown = null;
      input.oninput = null;
      onClose();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      if (input.value.trim()) onSend(input.value);
      close();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') close();
    };
  }

  // --- Teleport requests and sleeping ------------------------------------

  /** A question from another player with yes and no buttons (null hides it). */
  showRequest(text: string | null, onYes?: () => void, onNo?: () => void): void {
    const box = $('request');
    box.hidden = text === null;
    if (text === null) return;
    $('request-text').textContent = text;
    $('request-yes').onclick = () => onYes?.();
    $('request-no').onclick = () => onNo?.();
  }

  /** The dark sleep screen (null hides it). */
  showSleep(text: string | null, onWake?: () => void): void {
    const screen = $('sleep');
    screen.hidden = text === null;
    if (text === null) return;
    $('sleep-text').textContent = text;
    $('wake').onclick = () => onWake?.();
  }

  /** The purple swirl while standing in a Nether portal (0–1). */
  setPortalGlow(amount: number): void {
    const glow = $('portal-glow');
    glow.hidden = amount <= 0;
    glow.style.opacity = String(amount * 0.75);
  }

  /** "Click to play" after a window was closed with Esc (the mouse needs a click). */
  showClickHint(show: boolean): void {
    $('click-hint').hidden = !show;
  }

  get chatOpen(): boolean {
    return !$('chat-form').hidden;
  }

  setBiome(text: string): void {
    $('biome').textContent = text;
  }

  // --- Death --------------------------------------------------------------

  showDeath(reason: string, onRespawn: () => void): void {
    $('death-reason').textContent = reason;
    $('death').hidden = false;
    $('respawn').onclick = () => {
      $('death').hidden = true;
      onRespawn();
    };
  }

  // --- Magic builder ------------------------------------------------------

  /** Shows how to place a magic build while one follows your aim. */
  setPlaceHint(visible: boolean): void {
    $('place-hint').hidden = !visible;
  }
}
