// Lines that wait their turn: the next one is said only when the last one
// has been read (and heard), so no line is ever cut short. Used by the
// story scenes and by Ikiyö's own long speeches.

import { speechSeconds } from '../reading';
import type { ModApi, Speaker } from '../types';

interface Line {
  who: Speaker;
  text: string;
  /** Happens as the line starts (a scream, a flash). */
  then?: (api: ModApi) => void;
}

export class Speech {
  private queue: Line[] = [];
  private timer = 0;

  /** `pause`: a breath between lines (seconds). */
  constructor(private readonly pause = 1.2) {}

  add(who: Speaker, text: string, then?: (api: ModApi) => void): void {
    this.queue.push({ who, text, then });
  }

  clear(): void {
    this.queue = [];
    this.timer = 0;
  }

  update(api: ModApi, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    const line = this.queue.shift();
    if (!line) return;
    api.say(line.who, line.text);
    this.timer = speechSeconds(line.text) + this.pause;
    line.then?.(api);
  }

  /** Everything has been said and heard. */
  get done(): boolean {
    return this.queue.length === 0 && this.timer <= 0;
  }

  /** Nothing waits its turn (the last line may still be going). */
  get empty(): boolean {
    return this.queue.length === 0;
  }
}
