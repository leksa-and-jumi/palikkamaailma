// The mods window (from the pause menu): every mod with a switch. Mods
// change only how the game behaves, so switching never breaks a world.

import { MODS } from '../mods/registry';
import type { ModManager } from '../mods/manager';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class ModsScreen {
  private mods: ModManager | null = null;
  private toggle: (id: string) => void = () => undefined;

  constructor() {
    $('mods-close').addEventListener('click', () => this.close());
    $('mods-screen').addEventListener('mousedown', (e) => {
      if (e.target === $('mods-screen')) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    });
  }

  get isOpen(): boolean {
    return !$('mods-screen').hidden;
  }

  open(mods: ModManager, toggle: (id: string) => void): void {
    this.mods = mods;
    this.toggle = toggle;
    mods.onChange = () => this.render();
    $('mods-screen').hidden = false;
    this.render();
  }

  close(): void {
    $('mods-screen').hidden = true;
    if (this.mods) this.mods.onChange = null;
    this.mods = null;
  }

  private render(): void {
    const mods = this.mods;
    if (!mods) return;
    $('mods-list').replaceChildren(
      ...MODS.map((mod) => {
        const on = mods.isOn(mod.id);
        const card = document.createElement('button');
        card.className = `mod-card${on ? ' on' : ''}`;
        card.setAttribute('aria-pressed', String(on));
        const emoji = document.createElement('span');
        emoji.className = 'mod-emoji';
        emoji.textContent = mod.emoji;
        const text = document.createElement('span');
        text.className = 'mod-text';
        const name = document.createElement('strong');
        name.textContent = mod.name;
        const about = document.createElement('small');
        about.textContent = mod.description;
        text.append(name, about);
        const state = document.createElement('span');
        state.className = 'mod-switch';
        state.textContent = on ? 'Päällä' : 'Pois';
        card.append(emoji, text, state);
        card.addEventListener('click', () => this.toggle(mod.id));
        return card;
      }),
    );
  }
}
