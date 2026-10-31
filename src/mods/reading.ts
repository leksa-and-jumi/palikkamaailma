// How long a speech box stays: the text types itself out, then waits long
// enough for a 7-year-old to read it (and for a recorded voice to finish).

import { voiceSeconds } from '../audio/voices';

/** Each letter appears this fast (seconds). */
export const LETTER_SECONDS = 0.028;
const READ_BASE = 3;
const READ_PER_LETTER = 0.07;

/** The words as shown: {tags} only tell the recorded voice how to say them. */
export function shownText(text: string): string {
  return text.replace(/\{[^}]*\}\s*/g, '').trim();
}

/** Seconds a line is shown, typing included. */
export function readingSeconds(text: string): number {
  const letters = [...shownText(text)].length;
  return letters * LETTER_SECONDS + READ_BASE + letters * READ_PER_LETTER;
}

/** Seconds before the next line: long enough to read it and hear its voice. */
export function speechSeconds(text: string): number {
  const voice = voiceSeconds(text);
  return Math.max(readingSeconds(text), voice > 0 ? voice + 1 : 0);
}
