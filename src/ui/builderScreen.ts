// The magic builder window (B): type a wish or pick a ready-made build, wait
// while the magician plans it, then look at it from every side before putting
// it into the world. You can keep playing while it is being planned.

import { BLUEPRINTS } from '../logic/blueprints';
import { AIR } from '../logic/blocks';
import { buildBounds, type BuildBlock } from '../logic/shapes';
import { BuildPreview } from '../render/buildPreview';

export type BuildResult = { blocks: BuildBlock[] } | { error: string };

export interface BuilderCallbacks {
  /** Asks the magician for a build. */
  ask(prompt: string): Promise<BuildResult>;
  /** The player wants to put the build into the world. */
  place(blocks: BuildBlock[]): void;
  toast(text: string): void;
}

const TICK_MS = 1000;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** One preview for the whole page (it owns a WebGL canvas). */
let sharedPreview: BuildPreview | null = null;
function preview(): BuildPreview {
  sharedPreview ??= new BuildPreview($('preview'));
  return sharedPreview;
}

export class BuilderScreen {
  private waiting: { prompt: string; started: number } | null = null;
  private ready: { prompt: string; blocks: BuildBlock[] } | null = null;
  private error = '';
  private lastPrompt = '';
  private onClose: (() => void) | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly callbacks: BuilderCallbacks) {}

  get isOpen(): boolean {
    return !$('builder').hidden;
  }

  get isWaiting(): boolean {
    return this.waiting !== null;
  }

  open(onClose: () => void): void {
    this.onClose = onClose;
    $('builder').hidden = false;
    // Esc or a click beside the window closes it.
    $('builder').onmousedown = (e) => {
      if (e.target === $('builder')) this.close();
    };
    window.addEventListener('keydown', this.escape);
    if (this.ready) this.showPreview();
    else this.showAsk();
  }

  private readonly escape = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    this.close();
  };

  close(): void {
    if (!this.isOpen) return;
    window.removeEventListener('keydown', this.escape);
    $('builder').hidden = true;
    sharedPreview?.stop();
    this.stopTicker();
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** The game ended: forget everything that is still on the way. */
  stop(): void {
    this.stopped = true;
    this.close();
  }

  /** Puts a build back into the preview (B while placing it). */
  restore(blocks: BuildBlock[]): void {
    this.ready = { prompt: this.lastPrompt, blocks };
  }

  /** Asks for a build without opening the window (tests use this too). */
  async run(prompt: string): Promise<BuildResult> {
    prompt = prompt.trim();
    if (!prompt || this.waiting) return { error: '' };
    this.waiting = { prompt, started: performance.now() };
    this.lastPrompt = prompt;
    this.ready = null;
    this.error = '';
    if (this.isOpen) this.showAsk();
    const result = await this.callbacks.ask(prompt);
    this.waiting = null;
    if (this.stopped) return result;
    if ('error' in result) {
      this.error = result.error;
      if (this.isOpen) this.showAsk();
    } else {
      this.ready = { prompt, blocks: result.blocks };
      if (this.isOpen) this.showPreview();
      else this.callbacks.toast('✨ Taikarakennus on valmis! Paina B, niin näet sen.');
    }
    return result;
  }

  // --- Asking -------------------------------------------------------------

  private showAsk(): void {
    $('builder-ask').hidden = false;
    $('builder-view').hidden = true;
    sharedPreview?.stop();
    const input = $('builder-prompt') as HTMLInputElement;
    const form = $('builder-form') as HTMLFormElement;
    const waiting = this.waiting !== null;

    $('blueprints').replaceChildren(
      ...BLUEPRINTS.map((b) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${b.emoji} ${b.name}`;
        button.disabled = waiting;
        button.addEventListener('click', () => void this.run(b.name));
        return button;
      }),
    );
    form.querySelectorAll('button').forEach((b) => (b.disabled = waiting));
    input.disabled = waiting;
    form.onsubmit = (e) => {
      e.preventDefault();
      void this.run(input.value);
    };
    $('builder-close').textContent = waiting ? '🎮 Pelaa sillä aikaa' : 'Sulje';
    $('builder-close').onclick = () => this.close();

    this.stopTicker();
    if (waiting) {
      this.updateWaitMessage();
      this.ticker = setInterval(() => this.updateWaitMessage(), TICK_MS);
    } else {
      this.setMessage(this.error, true);
      input.focus();
    }
  }

  private updateWaitMessage(): void {
    if (!this.waiting) return;
    const seconds = Math.floor((performance.now() - this.waiting.started) / 1000);
    const wand = document.createElement('span');
    wand.className = 'wait';
    wand.textContent = '🪄';
    const note = document.createElement('small');
    note.textContent = 'Hienon rakennuksen suunnittelu voi kestää pari minuuttia.';
    const message = $('builder-message');
    message.classList.remove('error');
    message.replaceChildren(
      wand,
      ` Taikuri suunnittelee: ${this.waiting.prompt} … ${seconds} s`,
      document.createElement('br'),
      note,
    );
  }

  private setMessage(text: string, error: boolean): void {
    const message = $('builder-message');
    message.textContent = text;
    message.classList.toggle('error', error && text !== '');
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  // --- Looking at the build -----------------------------------------------

  private showPreview(): void {
    const ready = this.ready;
    if (!ready) return;
    this.stopTicker();
    $('builder-ask').hidden = true;
    $('builder-view').hidden = false;
    $('preview-title').textContent = `✨ ${ready.prompt}`;

    const solid = ready.blocks.filter((b) => b[3] !== AIR);
    const { min, max } = buildBounds(solid);
    const [w, h, d] = [0, 1, 2].map((i) => max[i]! - min[i]! + 1);
    $('preview-info').textContent =
      `📏 ${w} × ${d} palikkaa, ${h} korkea · 🧱 ${solid.length} palikkaa`;

    const view = preview();
    view.show(solid);
    const layers = $('preview-layers') as HTMLInputElement;
    layers.min = String(min[1]);
    layers.max = String(max[1]);
    layers.value = String(max[1]);
    layers.oninput = () => view.setCut(Number(layers.value));

    $('preview-place').onclick = () => {
      this.ready = null;
      this.callbacks.place(ready.blocks);
      this.close();
    };
    $('preview-retry').onclick = () => void this.run(ready.prompt);
    $('preview-back').onclick = () => {
      this.ready = null;
      ($('builder-prompt') as HTMLInputElement).value = ready.prompt;
      this.showAsk();
    };
    $('preview-close').onclick = () => {
      this.ready = null;
      this.close();
    };
  }
}
