// Messages between the game and the room server (Cloudflare Durable Object).
// Both sides use this file. Everything from the network is checked here, so
// a broken or nasty message can never put strange data into the world.

import { AVATAR_EMOJIS, CARTS, DAY, NET, NETHER } from '../config';
import type { RequestKind } from './commands';
import { getBlockType, isValidBlockId } from './blocks';
import { parseContainer, type Container } from './containers';
import { isFireworkKind } from './fireworks';
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
  /** In creative: monsters leave this player alone. */
  safe?: boolean;
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

/** A minecart: id, x, y, z, heading (0–3), speed, rider id ('' = nobody). */
export type CartNet = [string, number, number, number, number, number, string];

export type ClientMessage =
  | { t: 'hello'; avatar: string }
  | {
      t: 'move';
      p: [number, number, number];
      yaw: number;
      pitch: number;
      mobs?: MobNet[];
      /** In creative: monsters leave this player alone. */
      safe?: boolean;
      /** Minecarts this player is moving (not stored). */
      carts?: CartNet[];
    }
  | { t: 'set'; edits: Edit[] }
  | { t: 'chat'; text: string }
  /** You hit someone else's creature; its owner works out what happens. */
  | { t: 'hitMob'; id: string; damage: number; from: [number, number] }
  /** Your monster hurt another player (`kind` = which monster). */
  | { t: 'hurtPlayer'; id: string; damage: number; kind: MobKind }
  | { t: 'drop'; item: ItemStack; p: [number, number, number]; v: [number, number, number] }
  | { t: 'pickup'; id: string }
  /** Asks for the contents of a chest or furnace. */
  | { t: 'open'; p: [number, number, number] }
  /** New contents after the player moved items. */
  | { t: 'container'; p: [number, number, number]; data: Container }
  /** A rocket launched from the hand (not stored, just shown to the others). */
  | { t: 'firework'; p: [number, number, number]; kind: number; seed: number }
  /** /tpa or /kutsu: asks another player (only they hear it). */
  | { t: 'ask'; to: string; kind: RequestKind }
  /** The answer to a request; `p` is where you are (so they can come). */
  | { t: 'answer'; to: string; kind: RequestKind; yes: boolean; p?: [number, number, number] }
  /** Lying down in a bed (or getting up). `skip` = ms from now to the morning. */
  | { t: 'sleep'; on: boolean; skip: number }
  /** /aika: move the world's clock forward by `skip` ms. */
  | { t: 'time'; skip: number }
  /** A minecart was placed, got a rider or came to rest (the room stores it). */
  | { t: 'cart'; cart: CartNet }
  /** A minecart was broken. */
  | { t: 'cartGone'; id: string };

export type ServerMessage =
  | {
      t: 'welcome';
      you: string;
      players: PlayerInfo[];
      items: DroppedItem[];
      /** How far the world's clock has been moved (sleeping, /aika), ms. */
      timeOffset?: number;
      carts?: CartNet[];
    }
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
      safe?: boolean;
      carts?: CartNet[];
    }
  | { t: 'set'; edits: Edit[] }
  | { t: 'hitMob'; id: string; damage: number; from: [number, number]; by: string }
  | { t: 'hurtPlayer'; id: string; damage: number; kind: MobKind }
  | { t: 'chat'; id: string; avatar: string; text: string }
  | { t: 'item'; drop: DroppedItem }
  /** Someone picked an item up; only the player `by` gets it. */
  | { t: 'picked'; id: string; by: string }
  | { t: 'container'; p: [number, number, number]; data: Container }
  | { t: 'firework'; p: [number, number, number]; kind: number; seed: number }
  | { t: 'ask'; from: string; avatar: string; kind: RequestKind }
  | {
      t: 'answer';
      from: string;
      avatar: string;
      kind: RequestKind;
      yes: boolean;
      p?: [number, number, number];
    }
  /** The world's clock moved: everyone uses the new offset. */
  | { t: 'time'; offset: number; avatar?: string; slept?: boolean }
  | { t: 'cart'; cart: CartNet; by: string }
  | { t: 'cartGone'; id: string }
  /** How many are sleeping in beds now. */
  | { t: 'sleepers'; sleeping: number; total: number }
  | { t: 'full' };

/** Positions go up to the far side of the Nether band. */
const POSITION_LIMIT = NETHER.offset + NETHER.halfSize + 100;
const MAX_CARTS_PER_MOVE = 8;
const REQUEST_KINDS: readonly RequestKind[] = ['tpa', 'invite'];
/** A clock jump is never more than a whole day. */
const MAX_SKIP = DAY.length * 1000;

function isSkip(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_SKIP;
}
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
  // Lit lamps and powered dust are only a look made by the circuit.
  if (getBlockType(id).shownOnly) return null;
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

export function parseCart(v: unknown): CartNet | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [id, x, y, z, heading, speed, rider] = v as unknown[];
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (![x, y, z].every((n) => isFiniteNumber(n))) return null;
  if (typeof heading !== 'number' || ![0, 1, 2, 3].includes(heading)) return null;
  if (!isFiniteNumber(speed, CARTS.maxSpeed + 1) || (speed as number) < 0) return null;
  if (typeof rider !== 'string' || (rider !== '' && !ID_PATTERN.test(rider))) return null;
  return v as CartNet;
}

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
      const move: ClientMessage = { t: 'move', p, yaw: msg.yaw, pitch: msg.pitch };
      if (msg.safe === true) move.safe = true;
      if (Array.isArray(msg.carts) && msg.carts.length <= MAX_CARTS_PER_MOVE) {
        move.carts = msg.carts.map(parseCart).filter((c): c is CartNet => c !== null);
      }
      if (msg.mobs === undefined) return move;
      if (!Array.isArray(msg.mobs) || msg.mobs.length > NET.maxMobsPerMove) return null;
      move.mobs = msg.mobs.map(parseMob).filter((m): m is MobNet => m !== null);
      return move;
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
    case 'hurtPlayer':
      if (typeof msg.id !== 'string' || !ID_PATTERN.test(msg.id)) return null;
      if (!isFiniteNumber(msg.damage, MAX_HIT_DAMAGE) || msg.damage <= 0) return null;
      if (typeof msg.kind !== 'string' || !MOB_KINDS.includes(msg.kind as MobKind)) return null;
      return { t: 'hurtPlayer', id: msg.id, damage: msg.damage, kind: msg.kind as MobKind };
    case 'pickup':
      return typeof msg.id === 'string' && /^[a-z0-9-]{1,40}$/.test(msg.id)
        ? { t: 'pickup', id: msg.id }
        : null;
    case 'firework': {
      const p = parseVec3(msg.p);
      const seed = msg.seed;
      if (!p || !isFireworkKind(msg.kind)) return null;
      if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        return null;
      }
      return { t: 'firework', p, kind: msg.kind, seed };
    }
    case 'ask':
      if (typeof msg.to !== 'string' || !ID_PATTERN.test(msg.to)) return null;
      if (!REQUEST_KINDS.includes(msg.kind as RequestKind)) return null;
      return { t: 'ask', to: msg.to, kind: msg.kind as RequestKind };
    case 'answer': {
      if (typeof msg.to !== 'string' || !ID_PATTERN.test(msg.to)) return null;
      if (!REQUEST_KINDS.includes(msg.kind as RequestKind) || typeof msg.yes !== 'boolean') {
        return null;
      }
      const p = msg.p === undefined ? undefined : parseVec3(msg.p);
      if (p === null) return null;
      const answer = {
        t: 'answer',
        to: msg.to,
        kind: msg.kind as RequestKind,
        yes: msg.yes,
      } as const;
      return p ? { ...answer, p } : answer;
    }
    case 'sleep':
      if (typeof msg.on !== 'boolean' || !isSkip(msg.skip)) return null;
      return { t: 'sleep', on: msg.on, skip: msg.skip };
    case 'time':
      return isSkip(msg.skip) ? { t: 'time', skip: msg.skip } : null;
    case 'cart': {
      const cart = parseCart(msg.cart);
      return cart ? { t: 'cart', cart } : null;
    }
    case 'cartGone':
      return typeof msg.id === 'string' && ID_PATTERN.test(msg.id)
        ? { t: 'cartGone', id: msg.id }
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
