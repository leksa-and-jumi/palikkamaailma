// World codes like "KALA-PUU-42". Kids tell the code to each other to play
// in the same world. There is no public list of worlds.

import { CODE_NUMBER_MAX, CODE_WORDS } from '../config';
import { hashString } from './noise';

const WORDS: readonly string[] = CODE_WORDS;

export function makeWorldCode(random: () => number = Math.random): string {
  const pick = () => WORDS[Math.floor(random() * WORDS.length)]!;
  const first = pick();
  let second = pick();
  while (second === first) second = pick();
  const number = Math.floor(random() * CODE_NUMBER_MAX);
  return `${first}-${second}-${number}`;
}

/**
 * Cleans what a player typed: "kala puu 42" → "KALA-PUU-42".
 * Returns null if it is not a valid code.
 */
export function normalizeWorldCode(input: string): string | null {
  const parts = input
    .trim()
    .toUpperCase()
    .split(/[\s\-_.,]+/)
    .filter(Boolean);
  if (parts.length !== 3) return null;
  const [first, second, number] = parts as [string, string, string];
  if (!WORDS.includes(first) || !WORDS.includes(second)) return null;
  if (!/^\d{1,2}$/.test(number)) return null;
  return `${first}-${second}-${Number(number)}`;
}

export function isValidWorldCode(code: string): boolean {
  return normalizeWorldCode(code) === code;
}

/** Every world code has its own island shape. */
export function seedFromCode(code: string): number {
  return hashString(code);
}

/** Code for playing alone without the internet. */
export const SOLO_CODE = 'YKSIN';
