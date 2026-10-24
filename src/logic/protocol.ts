// Messages between the game and the room server (Cloudflare Durable Object).
// Both sides use this file. Everything from the network is checked here, so
// a broken or nasty message can never put strange data into the world.

import { AVATAR_EMOJIS, NET, WORLD_LIMIT } from '../config';
import { getBlockType, isValidBlockId } from './blocks';
import { parseContainer, type Container } from './containers';
import { MOB_KINDS, MOB_NAMES, PERSONALITIES, type MobKind } from './mobs';
import { parseStack, type ItemStack } from './inventory';
import type { Edit } from './world';
import { isInsideWorld } from './world';

export interface PlayerInfo {
  id: string;
  avatar: string;
  /** Feet position. */
  p: [number, number, number];
  yaw: number;
  pitch: number;
}

/** An item lying on the ground. */
export interface DroppedItem {
  id: string;
  item: ItemStack;
  /** Where it was dropped and how fast it flew. */
  p: [number, number, number];
  v: [number, number, number];
  /** When it was dropped (ms since 1970). */
  time: number;
}

/**
 * A creature, sent with its owner's position: id, kind, x, y, z, yaw,
 * health, flags (1 = baby, 2 = just hurt, 4 = creeper fuse lit),
 * personality number, name number.
 */
export type MobNet = [
  string,
  MobKind,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const MOB_FLAG = { baby: 1, hurt: 2, fuse: 4 } as const;

export type ClientMessage =
  | { t: 'hello'; avatar: string }
  | { t: 'move'; p: [number, number, number]; yaw: number; pitch: number; mobs?: MobNet[] }
  | { t: 'set'; edits: Edit[] }
  | { t: 'chat'; text: string }
  /** You hit someone else's creature; its owner works out what happens. */
  | { t: 'hitMob'; id: string; damage: number; from: [number, number] }
  | { t: 'drop'; item: ItemStack; p: [number, number, number]; v: [number, number, number] }
  | { t: 'pickup'; id: string }
  /** Asks for the contents of a chest or furnace. */
  | { t: 'open'; p: [number, number, number] }
  /** New contents after the player moved items. */
  | { t: 'container'; p: [number, number, number]; data: Container };

export type ServerMessage =
  | { t: 'welcome'; you: string; players: PlayerInfo[]; items: DroppedItem[] }
  /** Changed blocks, sent in pages after welcome. `done` is true on the last page. */
  | { t: 'edits'; edits: Edit[]; done: boolean }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: string }
  | {
      t: 'move';
      id: string;
      p: [number, number, number];
      yaw: number;
      pitch: number;
      mobs?: MobNet[];
    }
  | { t: 'set'; edits: Edit[] }
  | { t: 'hitMob'; id: string; damage: number; from: [number, number]; by: string }
  | { t: 'chat'; id: string; avatar: string; text: string }
  | { t: 'item'; drop: DroppedItem }
  /** Someone picked an item up; only the player `by` gets it. */
  | { t: 'picked'; id: string; by: string }
  | { t: 'container'; p: [number, number, number]; data: Container }
  | { t: 'full' };

const POSITION_LIMIT = WORLD_LIMIT + 100;
const MAX_DROP_SPEED = 20;

function isFiniteNumber(v: unknown, limit = POSITION_LIMIT): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
}

function parseVec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  if (!v.every((n) => isFiniteNumber(n))) return null;
  return [v[0] as number, v[1] as number, v[2] as number];
}

/** A whole-number block position inside the world. */
export function parseBlockPos(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isInteger(n))) return null;
  const [x, y, z] = v as [number, number, number];
  return isInsideWorld(x, y, z) ? [x, y, z] : null;
}

/** A block edit is valid if it is inside the world and the block exists. */
export function parseEdit(v: unknown): Edit | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [x, y, z, id] = v as unknown[];
  if (![x, y, z].every((n) => typeof n === 'number' && Number.isInteger(n))) return null;
  if (!isValidBlockId(id)) return null;
  if (!isInsideWorld(x as number, y as number, z as number)) return null;
  // Nobody may place bedrock: it could never be removed.
  if (!getBlockType(id).breakable) return null;
  return [x as number, y as number, z as number, id];
}

export function parseEdits(v: unknown): Edit[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > NET.maxEditsPerMessage) return null;
  const edits: Edit[] = [];
  for (const item of v) {
    const edit = parseEdit(item);
    if (edit) edits.push(edit);
  }
  return edits.length > 0 ? edits : null;
}

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_MOB_HEALTH = 100;
const MAX_HIT_DAMAGE = 50;

export function parseMob(v: unknown): MobNet | null {
  if (!Array.isArray(v) || v.length !== 10) return null;
  const [id, kind, x, y, z, yaw, health, flags, personality, name] = v as unknown[];
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof kind !== 'string' || !MOB_KINDS.includes(kind as MobKind)) return null;
  if (![x, y, z].every((n) => isFiniteNumber(n)) || !isFiniteNumber(yaw, 1000)) return null;
  if (!isFiniteNumber(health, MAX_MOB_HEALTH)) return null;
  const ints = [flags, personality, name];
  if (!ints.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) return null;
  if ((personality as number) >= PERSONALITIES.length || (name as number) >= MOB_NAMES.length) {
    return null;
  }
  return v as MobNet;
}

/** Cleans a chat message: no control characters, trimmed, not too long. */
export function cleanChatText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const text = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return null;
  return [...text].slice(0, NET.maxChatLength).join('');
}

/** Reads a message from a player. Returns null if it is not valid. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 200_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;

  switch (msg.t) {
    case 'hello':
      return typeof msg.avatar === 'string' && AVATAR_EMOJIS.includes(msg.avatar)
        ? { t: 'hello', avatar: msg.avatar }
        : null;
    case 'move': {
      const p = parseVec3(msg.p);
      if (!p || !isFiniteNumber(msg.yaw, 1000) || !isFiniteNumber(msg.pitch, 10)) return null;
      if (msg.mobs === undefined) return { t: 'move', p, yaw: msg.yaw, pitch: msg.pitch };
      if (!Array.isArray(msg.mobs) || msg.mobs.length > NET.maxMobsPerMove) return null;
      const mobs = msg.mobs.map(parseMob).filter((m): m is MobNet => m !== null);
      return { t: 'move', p, yaw: msg.yaw, pitch: msg.pitch, mobs };
    }
    case 'set': {
      const edits = parseEdits(msg.edits);
      return edits ? { t: 'set', edits } : null;
    }
    case 'chat': {
      const text = cleanChatText(msg.text);
      return text ? { t: 'chat', text } : null;
    }
    case 'drop': {
      const item = parseStack(msg.item);
      const p = parseVec3(msg.p);
      const vel = parseVec3(msg.v);
      if (!item || !p || !vel || vel.some((n) => Math.abs(n) > MAX_DROP_SPEED)) return null;
      return { t: 'drop', item, p, v: vel };
    }
    case 'open': {
      const p = parseBlockPos(msg.p);
      return p ? { t: 'open', p } : null;
    }
    case 'container': {
      const p = parseBlockPos(msg.p);
      const data = parseContainer(msg.data, Date.now());
      return p && data ? { t: 'container', p, data } : null;
    }
    case 'hitMob': {
      const from = Array.isArray(msg.from) && msg.from.length === 2 ? msg.from : null;
      if (typeof msg.id !== 'string' || !ID_PATTERN.test(msg.id)) return null;
      if (!isFiniteNumber(msg.damage, MAX_HIT_DAMAGE) || msg.damage <= 0) return null;
      if (!from || !from.every((n) => isFiniteNumber(n))) return null;
      return { t: 'hitMob', id: msg.id, damage: msg.damage, from: from as [number, number] };
    }
    case 'pickup':
      return typeof msg.id === 'string' && /^[a-z0-9-]{1,40}$/.test(msg.id)
        ? { t: 'pickup', id: msg.id }
        : null;
    default:
      return null;
  }
}

/** Reads a message from the server. The game trusts its own server a bit more. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw) as ServerMessage;
    return typeof data === 'object' && data !== null && typeof data.t === 'string' ? data : null;
  } catch {
    return null;
  }
}
