// Things remembered on this device only (localStorage).

import { AVATAR_EMOJIS, DIFFICULTIES, STORAGE, type Difficulty, type GameMode } from '../config';
import type { Edit } from '../logic/world';

export interface SavedWorld {
  code: string;
  emoji: string;
  mode?: GameMode;
  difficulty?: Difficulty;
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

/** What this device remembers about you in one world. */
export interface SavedPlayer {
  inventory?: unknown;
  vitals?: unknown;
  position?: [number, number, number];
  yaw?: number;
  mode?: string;
}

export function loadPlayer(code: string): SavedPlayer {
  const saved = read<SavedPlayer>(`${STORAGE.player}.${code}`, {});
  return typeof saved === 'object' && saved !== null ? saved : {};
}

export function savePlayer(code: string, player: SavedPlayer): void {
  write(`${STORAGE.player}.${code}`, player);
}

export interface WorldSettings {
  mode: GameMode;
  difficulty: Difficulty;
}

const DEFAULT_SETTINGS: WorldSettings = { mode: 'survival', difficulty: 'easy' };

/** The game mode and difficulty last chosen in the menu. */
export function loadSettings(): WorldSettings {
  const saved = read<Partial<WorldSettings>>(STORAGE.soloSettings, {});
  return {
    mode:
      saved.mode === 'creative' || saved.mode === 'survival' ? saved.mode : DEFAULT_SETTINGS.mode,
    difficulty:
      saved.difficulty && saved.difficulty in DIFFICULTIES
        ? saved.difficulty
        : DEFAULT_SETTINGS.difficulty,
  };
}

export function saveSettings(settings: WorldSettings): void {
  write(STORAGE.soloSettings, settings);
}
