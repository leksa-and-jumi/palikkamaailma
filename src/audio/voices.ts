// The Halloween characters' recorded voices (made by scripts/voices.mjs).
// A line finds its voice by its text, so the others in multiplayer hear it
// too when the host's character talks.

import { audioSettings } from './settings';
import { voiceId } from './voiceId';
import lines from './voiceLines.json';

const VOLUME = 0.85;
const recorded: Readonly<Record<string, number>> = lines;
let playing: HTMLAudioElement | null = null;

/** How long the recorded line lasts (0 when it has no voice). */
export function voiceSeconds(text: string): number {
  return recorded[voiceId(text)] ?? 0;
}

/** Says the line out loud if it has a voice. Returns its length in seconds. */
export function speak(text: string): number {
  const seconds = voiceSeconds(text);
  if (seconds <= 0 || !audioSettings.sounds) return 0;
  playing?.pause();
  const audio = new Audio(`${import.meta.env.BASE_URL}voices/${voiceId(text)}.m4a`);
  audio.volume = VOLUME;
  void audio.play().catch(() => {
    // The browser blocked it (no click yet): the words still show.
  });
  playing = audio;
  return seconds;
}
