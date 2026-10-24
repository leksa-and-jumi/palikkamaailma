// Everything drawn on top of the 3D world: hotbar, hearts and hunger, world
// code, players, chat and the magic builder window.

import { SURVIVAL } from '../config';
import { BLUEPRINTS } from '../logic/blueprints';
import { HOTBAR_SIZE, type Inventory } from '../logic/inventory';
import { getItem } from '../logic/items';
import type { Vitals } from '../logic/survival';
import type { RoomStatus } from '../net/room';
import { fillSlot } from './slots';

const CHAT_LINES = 8;
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

  openChat(onSend: (text: string) => void, onClose: () => void): void {
    const form = $('chat-form') as HTMLFormElement;
    const input = $('chat-input') as HTMLInputElement;
    const log = $('chat-log');
    form.hidden = false;
    log.classList.add('open');
    input.value = '';
    input.focus();
    const close = () => {
      form.hidden = true;
      log.classList.remove('open');
      input.onkeydown = null;
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

  openBuilder(onBuild: (prompt: string) => Promise<string | null>, onClose: () => void): void {
    const screen = $('builder');
    const input = $('builder-prompt') as HTMLInputElement;
    const message = $('builder-message');
    const form = $('builder-form') as HTMLFormElement;
    message.textContent = '';
    message.classList.remove('error');

    const close = () => {
      screen.hidden = true;
      onClose();
    };

    const run = async (prompt: string) => {
      if (!prompt.trim()) return;
      const buttons = screen.querySelectorAll('button');
      buttons.forEach((b) => (b.disabled = true));
      message.classList.remove('error');
      message.textContent = '✨ Taikaa tehdään…';
      const error = await onBuild(prompt);
      buttons.forEach((b) => (b.disabled = false));
      if (error) {
        message.textContent = error;
        message.classList.add('error');
      } else {
        input.value = '';
        close();
      }
    };

    $('blueprints').replaceChildren(
      ...BLUEPRINTS.map((b) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${b.emoji} ${b.name}`;
        button.addEventListener('click', () => void run(b.name));
        return button;
      }),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      void run(input.value);
    };
    $('builder-close').onclick = close;
    screen.hidden = false;
    input.focus();
  }

  get builderOpen(): boolean {
    return !$('builder').hidden;
  }
}
