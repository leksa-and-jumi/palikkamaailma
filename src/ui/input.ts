// Keyboard and mouse. The mouse is locked to the game while playing.

import { PLAYER } from '../config';

export interface InputHandlers {
  onBreak(): void;
  onPlace(): void;
  onPick(): void;
  onSlot(index: number): void;
  onScroll(direction: number): void;
  onToggleFly(): void;
  /** Returns true if the key was used (then it is not typed into a text box). */
  onKey(code: string): boolean;
  onLockChange(locked: boolean): void;
}

/** Holding a mouse button repeats breaking/placing this often (seconds). */
const REPEAT_TIME = 0.25;

export class Input {
  private readonly keys = new Set<string>();
  private lastSpace = -Infinity;
  private held: 0 | 2 | null = null;
  private holdTimer = 0;
  yawDelta = 0;
  pitchDelta = 0;
  enabled = false;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    document.addEventListener('keydown', (e) => this.keyDown(e));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yawDelta -= e.movementX * PLAYER.mouseSensitivity;
      this.pitchDelta -= e.movementY * PLAYER.mouseSensitivity;
    });
    canvas.addEventListener('mousedown', (e) => this.mouseDown(e));
    document.addEventListener('mouseup', () => (this.held = null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (this.enabled && this.locked) this.handlers.onScroll(Math.sign(e.deltaY));
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.keys.clear();
        this.held = null;
      }
      this.handlers.onLockChange(this.locked);
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    const request = this.canvas.requestPointerLock() as Promise<void> | undefined;
    // Some browsers refuse right after Esc; the player can click again.
    request?.catch(() => undefined);
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  axis(negative: string[], positive: string[]): number {
    const n = negative.some((k) => this.keys.has(k)) ? 1 : 0;
    const p = positive.some((k) => this.keys.has(k)) ? 1 : 0;
    return p - n;
  }

  /** Call every frame: repeats breaking/placing while a button is held. */
  update(dt: number): void {
    if (this.held === null || !this.locked) return;
    this.holdTimer -= dt;
    if (this.holdTimer <= 0) {
      this.holdTimer = REPEAT_TIME;
      if (this.held === 0) this.handlers.onBreak();
      else this.handlers.onPlace();
    }
  }

  takeLook(): [number, number] {
    const look: [number, number] = [this.yawDelta, this.pitchDelta];
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return look;
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.target instanceof HTMLInputElement) return;
    if (this.handlers.onKey(e.code)) {
      e.preventDefault();
      return;
    }
    if (!this.locked) return;
    if (e.code === 'Space' && !e.repeat) {
      const now = performance.now() / 1000;
      if (now - this.lastSpace < PLAYER.doubleTapTime) {
        this.handlers.onToggleFly();
        this.lastSpace = -Infinity;
      } else {
        this.lastSpace = now;
      }
    }
    if (/^Digit[1-9]$/.test(e.code)) this.handlers.onSlot(Number(e.code.slice(5)) - 1);
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }

  private mouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    if (!this.locked) {
      this.lock();
      return;
    }
    if (e.button === 0) {
      this.held = 0;
      this.holdTimer = REPEAT_TIME;
      this.handlers.onBreak();
    } else if (e.button === 2) {
      this.held = 2;
      this.holdTimer = REPEAT_TIME;
      this.handlers.onPlace();
    } else if (e.button === 1) {
      e.preventDefault();
      this.handlers.onPick();
    }
  }
}
