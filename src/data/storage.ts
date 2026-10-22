// Things remembered on this device only (localStorage).

import { AVATAR_EMOJIS, STORAGE } from '../config';
import type { Edit } from '../logic/world';

export interface SavedWorld {
  code: string;
  emoji: string;
}

const MAX_SAVED_WORLDS = 8;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works.
  }
}

export function loadAvatar(): string {
  const saved = read<string>(STORAGE.avatar, '');
  return AVATAR_EMOJIS.includes(saved) ? saved : AVATAR_EMOJIS[0]!;
}

export function saveAvatar(emoji: string): void {
  write(STORAGE.avatar, emoji);
}

export function loadWorlds(): SavedWorld[] {
  const list = read<SavedWorld[]>(STORAGE.worlds, []);
  return Array.isArray(list) ? list.filter((w) => typeof w?.code === 'string') : [];
}

/** Remembers a world at the top of "Omat maailmat". */
export function rememberWorld(world: SavedWorld): void {
  const others = loadWorlds().filter((w) => w.code !== world.code);
  write(STORAGE.worlds, [world, ...others].slice(0, MAX_SAVED_WORLDS));
}

export function loadLocalEdits(code: string): Edit[] {
  const edits = read<Edit[]>(`${STORAGE.soloEdits}.${code}`, []);
  return Array.isArray(edits) ? edits : [];
}

export function saveLocalEdits(code: string, edits: Iterable<Edit>): void {
  write(`${STORAGE.soloEdits}.${code}`, [...edits]);
}
