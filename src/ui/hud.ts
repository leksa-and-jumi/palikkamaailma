// Everything drawn on top of the 3D world: hotbar, world code, players,
// block picker and the magic builder window.

import { DEFAULT_HOTBAR, PLACEABLE_BLOCKS, getBlockType } from '../logic/blocks';
import { BLUEPRINTS } from '../logic/blueprints';
import type { RoomStatus } from '../net/room';
import { drawBlockIcon } from '../render/textures';

const ICON_PIXELS = 48;
const CHAT_LINES = 8;
const CHAT_FADE_MS = 10_000;
const TOAST_MS = 2600;
const BLOCK_NAME_MS = 1400;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function icon(blockId: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PIXELS;
  drawBlockIcon(canvas, blockId);
  return canvas;
}

const STATUS_TEXT: Record<RoomStatus | 'solo', string> = {
  connecting: '🟡 Yhdistetään…',
  online: '🟢 Moninpeli päällä',
  offline: '🔴 Yhteys katkesi, yritetään uudestaan…',
  full: '⛔ Maailma on täynnä',
  missing: '❓ Maailmaa ei löytynyt',
  solo: '🧍 Pelaat yksin',
};

export class Hud {
  readonly hotbar: number[] = [...DEFAULT_HOTBAR];
  selected = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private nameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.renderHotbar();
  }

  get selectedBlock(): number {
    return this.hotbar[this.selected]!;
  }

  show(visible: boolean): void {
    $('hud').hidden = !visible;
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

  select(index: number): void {
    this.selected = ((index % this.hotbar.length) + this.hotbar.length) % this.hotbar.length;
    this.renderHotbar();
    this.flashBlockName();
  }

  /** Puts a block in the selected slot (or selects it if already there). */
  chooseBlock(blockId: number): void {
    const existing = this.hotbar.indexOf(blockId);
    if (existing >= 0) this.selected = existing;
    else this.hotbar[this.selected] = blockId;
    this.renderHotbar();
    this.flashBlockName();
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (el.hidden = true), TOAST_MS);
  }

  private flashBlockName(): void {
    const el = $('block-name');
    el.textContent = getBlockType(this.selectedBlock).name;
    el.style.opacity = '1';
    if (this.nameTimer) clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => (el.style.opacity = '0'), BLOCK_NAME_MS);
  }

  private renderHotbar(): void {
    const bar = $('hotbar');
    bar.replaceChildren(
      ...this.hotbar.map((blockId, i) => {
        const slot = document.createElement('div');
        slot.className = `slot${i === this.selected ? ' selected' : ''}`;
        const number = document.createElement('span');
        number.textContent = String(i + 1);
        slot.append(icon(blockId), number);
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

  // --- Block picker -------------------------------------------------------

  openPicker(onClose: () => void): void {
    const grid = $('picker-grid');
    grid.replaceChildren(
      ...PLACEABLE_BLOCKS.map((blockId) => {
        const button = document.createElement('button');
        const name = document.createElement('div');
        name.textContent = getBlockType(blockId).name;
        button.append(icon(blockId), name);
        button.addEventListener('click', () => {
          this.chooseBlock(blockId);
          close();
        });
        return button;
      }),
    );
    const screen = $('picker');
    const close = () => {
      screen.hidden = true;
      onClose();
    };
    $('picker-close').onclick = close;
    screen.hidden = false;
  }

  get pickerOpen(): boolean {
    return !$('picker').hidden;
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
