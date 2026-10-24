// What a computer character wants to do right now. Pure rules: given where
// the players are, the brain picks a goal and turns it into movement.

import { MOBS } from '../config';
import { mobType, PERSONALITY_TRAITS, type MobKind, type Personality } from './mobs';
import { createPlayer, type MoveInput, type PlayerState } from './physics';

export type MobMode = 'idle' | 'wander' | 'flee' | 'follow' | 'chase' | 'fuse';

export interface Mob {
  id: string;
  kind: MobKind;
  personality: Personality;
  name: string;
  body: PlayerState;
  health: number;
  baby: boolean;
  /** Seconds until a baby grows up. */
  grow: number;
  mode: MobMode;
  /** Where it is going (x, z). */
  goal: [number, number] | null;
  /** Seconds left in the current mode. */
  timer: number;
  /** Seconds since it was last hurt (Infinity = never). */
  hurt: number;
  /** Who hurt it last (to run away from, or to chase). */
  hurtFrom: [number, number] | null;
  /** Seconds of "love" after being fed (two in love make a baby). */
  love: number;
  /** Seconds until it can attack (monsters) or lay an egg (chickens) again. */
  cooldown: number;
  /** Creeper fuse, seconds lit. */
  fuse: number;
  /** Set by the mover when walking is blocked, so the brain jumps. */
  blocked: boolean;
}

export interface Seen {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Item key in the player's hand. */
  holding?: string;
}

export interface Thought {
  input: MoveInput;
  /** Direction to face (radians). */
  yaw: number;
  /** Something the mob does this tick. */
  action?: 'attack' | 'shoot' | 'explode';
  /** The player it attacks or shoots at. */
  targetId?: string;
}

const STILL: MoveInput = { forward: 0, right: 0, jump: false, down: false, sprint: false };

export function createMob(
  id: string,
  kind: MobKind,
  x: number,
  y: number,
  z: number,
  personality: Personality,
  name: string,
  baby = false,
): Mob {
  return {
    id,
    kind,
    personality,
    name,
    body: createPlayer(x, y, z),
    health: mobType(kind).health,
    baby,
    grow: baby ? MOBS.growSeconds : 0,
    mode: 'idle',
    goal: null,
    timer: 0,
    hurt: Infinity,
    hurtFrom: null,
    love: 0,
    cooldown: MOBS.eggSeconds,
    fuse: 0,
    blocked: false,
  };
}

/** Facing angle towards a point (the game's yaw: 0 looks towards -z). */
export function yawTowards(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function nearest(m: Mob, players: readonly Seen[]): { p: Seen; d: number } | null {
  let best: { p: Seen; d: number } | null = null;
  for (const p of players) {
    const d = Math.hypot(p.x - m.body.x, p.z - m.body.z);
    if (!best || d < best.d) best = { p, d };
  }
  return best;
}

function walkTo(m: Mob, x: number, z: number, sprint: boolean, stopAt = 0.6): Thought {
  const d = Math.hypot(x - m.body.x, z - m.body.z);
  const yaw = yawTowards(m.body.x, m.body.z, x, z);
  if (d < stopAt) return { input: STILL, yaw: m.body.yaw };
  return { input: { ...STILL, forward: 1, sprint, jump: m.blocked }, yaw };
}

/**
 * Decides what to do. `random` gives 0…1. Animals rest, wander, follow food,
 * run away when hurt and come say hello depending on their personality.
 */
export function think(m: Mob, players: readonly Seen[], dt: number, random: () => number): Thought {
  const type = mobType(m.kind);
  const traits = PERSONALITY_TRAITS[m.personality];
  m.timer -= dt;
  m.hurt += dt;
  m.love = Math.max(0, m.love - dt);
  const close = nearest(m, players);

  // Hurt animals run away from whoever hit them.
  if (!type.hostile && m.hurt < MOBS.fleeSeconds && m.hurtFrom) {
    m.mode = 'flee';
    const [hx, hz] = m.hurtFrom;
    const away = yawTowards(hx, hz, m.body.x, m.body.z);
    return { input: { ...STILL, forward: 1, sprint: true, jump: m.blocked }, yaw: away };
  }

  // Food in a player's hand: come and follow (like wheat in Minecraft).
  if (!type.hostile && type.food && close && close.d < MOBS.followDistance) {
    if (close.p.holding === type.food) {
      m.mode = 'follow';
      return walkTo(m, close.p.x, close.p.z, false, MOBS.followStop);
    }
  }

  // Personality: shy ones keep away, curious and friendly ones come closer.
  if (!type.hostile && close && close.d < MOBS.noticeDistance) {
    if (traits.approach < 0 && close.d < -traits.approach) {
      m.mode = 'flee';
      const away = yawTowards(close.p.x, close.p.z, m.body.x, m.body.z);
      return { input: { ...STILL, forward: 1, jump: m.blocked }, yaw: away };
    }
    if (traits.approach > 0 && close.d > traits.approach + 1 && random() < 0.3 * dt) {
      m.mode = 'wander';
      m.goal = [close.p.x, close.p.z];
      m.timer = 4;
    }
  }

  if (m.timer <= 0) {
    // Time for something new: rest or wander somewhere nearby.
    if (random() < traits.rest * 4) {
      m.mode = 'idle';
      m.goal = null;
      m.timer = 2 + random() * 5;
    } else {
      m.mode = 'wander';
      const angle = random() * Math.PI * 2;
      const distance = 3 + random() * MOBS.wanderDistance;
      m.goal = [m.body.x + Math.cos(angle) * distance, m.body.z + Math.sin(angle) * distance];
      m.timer = 4 + random() * 6;
    }
  }

  if (m.mode === 'wander' && m.goal) {
    const t = walkTo(m, m.goal[0], m.goal[1], false);
    if (t.input.forward === 0) m.timer = 0;
    // Playful ones hop around.
    if (random() < traits.hop * dt) t.input = { ...t.input, jump: true };
    return t;
  }
  // Idle: maybe look at the nearest player.
  const yaw =
    close && close.d < 6 ? yawTowards(m.body.x, m.body.z, close.p.x, close.p.z) : m.body.yaw;
  return { input: { ...STILL, jump: random() < traits.hop * dt * 0.5 }, yaw };
}
