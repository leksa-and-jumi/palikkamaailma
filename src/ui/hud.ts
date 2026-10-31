// Everything drawn on top of the 3D world: hotbar, hearts and hunger, world
// code, players and chat.

import { AVATARS, SURVIVAL } from '../config';
import { LOOKS, faceIcon } from '../render/skins';
import { HOTBAR_SIZE, type Inventory } from '../logic/inventory';
import { levelOf, stackName } from '../logic/enchanting';
import type { Vitals } from '../logic/survival';
import { LETTER_SECONDS, readingSeconds } from '../mods/reading';
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

  /** Everyone in the world as little pixel faces (the animal's name on hover). */
  setPlayers(avatars: string[]): void {
    $('players').replaceChildren(
      ...avatars.map((a) => {
        const icon = faceIcon(a, 28);
        icon.className = 'player-face';
        icon.title = AVATARS.find((x) => x.emoji === a)?.name ?? '';
        return icon;
      }),
    );
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

  /** The experience bar: your level and how far to the next. */
  setXp(points: number): void {
    const { level, progress } = levelOf(points);
    $('xp-fill').style.width = `${Math.round(progress * 100)}%`;
    $('xp-level').textContent = level > 0 ? String(level) : '';
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
    el.textContent = stack ? stackName(stack) : '';
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
    // Players get their pixel face; game messages keep their emoji (💡).
    if (LOOKS[avatar]) {
      const icon = faceIcon(avatar, 20);
      icon.className = 'chat-face';
      line.append(icon, document.createTextNode(` ${text}`));
    } else line.textContent = `${avatar} ${text}`;
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

  // --- Mods: mood, flashes, boss bar and speech ----------------------------

  private dialogueTimer: ReturnType<typeof setTimeout> | null = null;
  private typing: ReturnType<typeof setInterval> | null = null;

  /** A colour and dark edges over the screen (mods' mood). */
  /** Black lids closing over the screen from above and below (0 open – 1 shut). */
  setEyelids(amount: number): void {
    const v = `${(Math.max(0, Math.min(1, amount)) * 52).toFixed(1)}%`;
    const lids = $('eyelids');
    lids.hidden = amount <= 0.001;
    if (lids.style.getPropertyValue('--lid') !== v) lids.style.setProperty('--lid', v);
  }

  setAtmosphere(tint: string | null, vignette: number): void {
    const layers: string[] = [];
    if (vignette > 0) {
      layers.push(
        `radial-gradient(ellipse at center, transparent ${Math.round(60 - vignette * 40)}%, rgba(0,0,0,${0.5 + vignette * 0.45}))`,
      );
    }
    if (tint) layers.push(`linear-gradient(${tint}, ${tint})`);
    $('atmo').style.background = layers.join(', ');
  }

  /** A quick flash of colour that fades away. */
  flash(color: string, seconds: number): void {
    const el = $('screen-flash');
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${seconds}s ease-out`;
      el.style.opacity = '0';
    });
  }

  /** A mod's little badge (Ikiyö has marked you); it pulses faster with `level`. */
  setModMark(text: string | null, level: number): void {
    const el = $('mod-mark');
    el.hidden = text === null;
    if (text === null) return;
    if ($('mod-mark-text').textContent !== text) $('mod-mark-text').textContent = text;
    el.style.setProperty('--pulse', `${(2.4 - Math.min(1, Math.max(0, level)) * 1.8).toFixed(2)}s`);
  }

  bossBar(name: string | null, health = 1): void {
    $('boss-bar').hidden = name === null;
    if (name === null) return;
    $('boss-name').textContent = name;
    $('boss-fill').style.width = `${Math.max(0, Math.min(1, health)) * 100}%`;
  }

  /** Someone talks: the text types itself out, then the box hides. */
  say(face: string, name: string, color: string, text: string, minSeconds = 0): void {
    $('dialogue').hidden = false;
    $('dialogue-face').textContent = face;
    $('dialogue-name').textContent = name;
    $('dialogue-name').style.color = color;
    const el = $('dialogue-text');
    el.textContent = '';
    const letters = [...text];
    let i = 0;
    if (this.typing) clearInterval(this.typing);
    this.typing = setInterval(() => {
      el.textContent += letters[i++] ?? '';
      if (i >= letters.length && this.typing) clearInterval(this.typing);
    }, LETTER_SECONDS * 1000);
    if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
    // Long enough to read (or to hear the voice to the end).
    this.dialogueTimer = setTimeout(
      () => ($('dialogue').hidden = true),
      Math.max(readingSeconds(text), minSeconds) * 1000,
    );
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
