// Moves the player: walking, jumping, flying, swimming and bumping into blocks.

import { NETHER, PLAYER, WORLD_HEIGHT, WORLD_LIMIT } from '../config';
import type { BlockBox } from './blocks';

export interface PlayerState {
  /** Feet position (centre of the bottom of the player box). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Looking direction in radians. yaw 0 looks towards -z. */
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
  inWater: boolean;
  /** Holding on to a ladder (no fall damage). */
  onLadder: boolean;
}

export interface MoveInput {
  /** -1 … 1, forward is positive. */
  forward: number;
  /** -1 … 1, right is positive. */
  right: number;
  jump: boolean;
  /** Fly down (shift). */
  down: boolean;
  sprint: boolean;
  /** Sneaking: hold still on a ladder. */
  sneak?: boolean;
}

export interface BlockQuery {
  isSolid(x: number, y: number, z: number): boolean;
  isLiquid(x: number, y: number, z: number): boolean;
  /** Boxes of a solid block that is not a whole cube (doors, fences, stairs). */
  boxes?(x: number, y: number, z: number): readonly BlockBox[] | null;
  climbable?(x: number, y: number, z: number): boolean;
}

/** Small gap so the player never sticks inside a wall. */
const SKIN = 0.001;
/** Size and speed of something that walks: the player, an animal, a monster. */
export interface Body {
  width: number;
  height: number;
  walkSpeed: number;
  sprintSpeed: number;
  jumpSpeed: number;
  /** Steps this high are walked up without jumping (stairs, slabs). */
  stepHeight?: number;
  /** Gravity multiplier (mods: below 1 floats like on the moon). */
  gravityScale?: number;
}

export const PLAYER_BODY: Body = {
  width: PLAYER.width,
  height: PLAYER.height,
  walkSpeed: PLAYER.walkSpeed,
  sprintSpeed: PLAYER.sprintSpeed,
  jumpSpeed: PLAYER.jumpSpeed,
  stepHeight: PLAYER.stepHeight,
};
/** Longest physics step; bigger frames are split so nothing tunnels through walls. */
const MAX_STEP = 1 / 60;
/** How far below the feet we look for ground. */
const GROUND_PROBE = 0.01;
/** How quickly flying slows down when you let go (per second). */
const FLY_DAMPING = 10;

export function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    flying: false,
    inWater: false,
    onLadder: false,
  };
}

type AABB = [number, number, number, number, number, number];

/** Every box (in world space) that can touch the given area. */
function gather(
  world: BlockQuery,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): AABB[] {
  const out: AABB[] = [];
  // One block lower too: fences stick up 1.5 blocks.
  for (let by = Math.floor(y0) - 1; by <= Math.floor(y1); by++) {
    for (let bz = Math.floor(z0); bz <= Math.floor(z1); bz++) {
      for (let bx = Math.floor(x0); bx <= Math.floor(x1); bx++) {
        if (!world.isSolid(bx, by, bz)) continue;
        const local = world.boxes?.(bx, by, bz) ?? null;
        if (!local) {
          if (by >= Math.floor(y0)) out.push([bx, by, bz, bx + 1, by + 1, bz + 1]);
          continue;
        }
        for (const b of local) {
          out.push([
            bx + b.from[0],
            by + b.from[1],
            bz + b.from[2],
            bx + b.to[0],
            by + b.to[1],
            bz + b.to[2],
          ]);
        }
      }
    }
  }
  return out;
}

function bodyBox(b: Body, x: number, y: number, z: number): AABB {
  const HALF = b.width / 2;
  return [x - HALF, y, z - HALF, x + HALF, y + b.height, z + HALF];
}

function overlaps(a: AABB, c: AABB): boolean {
  return (
    a[0] < c[3] - SKIN &&
    a[3] > c[0] + SKIN &&
    a[1] < c[4] - SKIN &&
    a[4] > c[1] + SKIN &&
    a[2] < c[5] - SKIN &&
    a[5] > c[2] + SKIN
  );
}

function collides(world: BlockQuery, b: Body, x: number, y: number, z: number): boolean {
  const box = bodyBox(b, x, y, z);
  return gather(world, box[0], box[1], box[2], box[3], box[4], box[5]).some((c) =>
    overlaps(box, c),
  );
}

/** Is any part of the player box in one of these blocks? */
export function overlapsBlock(
  state: PlayerState,
  bx: number,
  by: number,
  bz: number,
  b: Body = PLAYER_BODY,
): boolean {
  const HALF = b.width / 2;
  return (
    bx + 1 > state.x - HALF &&
    bx < state.x + HALF &&
    by + 1 > state.y &&
    by < state.y + b.height &&
    bz + 1 > state.z - HALF &&
    bz < state.z + HALF
  );
}

const AXIS = { x: 0, y: 1, z: 2 } as const;

/** Moves along one axis, stopping at the first box in the way. */
function moveAxis(
  world: BlockQuery,
  b: Body,
  s: PlayerState,
  axis: 'x' | 'y' | 'z',
  delta: number,
): boolean {
  if (delta === 0) return false;
  const a = AXIS[axis];
  const box = bodyBox(b, s.x, s.y, s.z);
  const area = [...box] as AABB;
  if (delta > 0) area[a + 3] = box[a + 3]! + delta;
  else area[a] = box[a]! + delta;
  let move = delta;
  for (const c of gather(world, ...area)) {
    // Only boxes beside us on the other two axes can be in the way.
    let beside = true;
    for (let o = 0; o < 3; o++) {
      if (o === a) continue;
      if (!(box[o]! < c[o + 3]! - SKIN && box[o + 3]! > c[o]! + SKIN)) beside = false;
    }
    if (!beside) continue;
    if (move > 0 && box[a + 3]! <= c[a]! + SKIN) {
      move = Math.min(move, c[a]! - box[a + 3]! - SKIN);
    } else if (move < 0 && box[a]! >= c[a + 3]! - SKIN) {
      move = Math.max(move, c[a + 3]! - box[a]! + SKIN);
    }
  }
  if (delta > 0) move = Math.max(0, move);
  else move = Math.min(0, move);
  s[axis] += move;
  return move !== delta;
}

function step(world: BlockQuery, b: Body, s: PlayerState, input: MoveInput, dt: number): void {
  const feetInWater = world.isLiquid(Math.floor(s.x), Math.floor(s.y + 0.1), Math.floor(s.z));
  const bodyInWater = world.isLiquid(Math.floor(s.x), Math.floor(s.y + 1), Math.floor(s.z));
  s.inWater = feetInWater || bodyInWater;

  // Walking direction from yaw.
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  let dx = -sin * input.forward + cos * input.right;
  let dz = -cos * input.forward - sin * input.right;
  const length = Math.hypot(dx, dz);
  if (length > 1) {
    dx /= length;
    dz /= length;
  }

  if (s.flying) {
    const speed = PLAYER.flySpeed * (input.sprint ? 1.6 : 1);
    s.vx = dx * speed;
    s.vz = dz * speed;
    const vertical = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
    s.vy = vertical !== 0 ? vertical * speed * 0.7 : s.vy * Math.max(0, 1 - FLY_DAMPING * dt);
  } else {
    const speed = input.sprint ? b.sprintSpeed : b.walkSpeed;
    s.vx = dx * speed * (s.inWater ? 0.6 : 1);
    s.vz = dz * speed * (s.inWater ? 0.6 : 1);
    if (s.inWater) {
      s.vy -= PLAYER.swimGravity * dt;
      if (input.jump) s.vy = PLAYER.swimUpSpeed;
      s.vy = Math.max(s.vy, -PLAYER.maxSwimFallSpeed);
    } else {
      if (input.jump && s.onGround) s.vy = b.jumpSpeed;
      s.vy = Math.max(s.vy - PLAYER.gravity * (b.gravityScale ?? 1) * dt, -PLAYER.maxFallSpeed);
    }
  }

  // Ladders: walk forward or jump to climb, sneak to hold on.
  const fx = Math.floor(s.x);
  const fz = Math.floor(s.z);
  s.onLadder =
    !s.flying &&
    !!world.climbable &&
    (world.climbable(fx, Math.floor(s.y + 0.1), fz) ||
      world.climbable(fx, Math.floor(s.y + 1), fz));
  if (s.onLadder && !s.inWater) {
    if (input.jump || input.forward > 0) s.vy = PLAYER.climbSpeed;
    else if (input.sneak) s.vy = 0;
    else s.vy = Math.max(s.vy, -PLAYER.climbSpeed);
  }

  const sx = s.x;
  const sy = s.y;
  const sz = s.z;
  const hitX = moveAxis(world, b, s, 'x', s.vx * dt);
  const hitZ = moveAxis(world, b, s, 'z', s.vz * dt);
  const stepUp = b.stepHeight ?? 0;
  if ((hitX || hitZ) && stepUp > 0 && s.onGround && !s.flying) {
    // Walk up stairs and slabs without jumping (like Minecraft).
    const [ax, ay, az] = [s.x, s.y, s.z];
    [s.x, s.y, s.z] = [sx, sy, sz];
    moveAxis(world, b, s, 'y', stepUp);
    const raised = s.y - sy;
    moveAxis(world, b, s, 'x', s.vx * dt);
    moveAxis(world, b, s, 'z', s.vz * dt);
    moveAxis(world, b, s, 'y', -raised);
    const far = (s.x - sx) ** 2 + (s.z - sz) ** 2;
    const near = (ax - sx) ** 2 + (az - sz) ** 2;
    if (far <= near + 1e-9) [s.x, s.y, s.z] = [ax, ay, az];
  }
  const hitY = moveAxis(world, b, s, 'y', s.vy * dt);
  if (hitY) s.vy = 0;
  s.onGround = s.vy <= 0 && collides(world, b, s.x, s.y - GROUND_PROBE, s.z);
  if (s.onGround && s.flying) s.flying = false;

  // Stay inside the world (or the Nether) and below the sky.
  if (Math.abs(s.x - NETHER.offset) < NETHER.halfSize + 64) {
    const edge = NETHER.halfSize - 1;
    s.x = Math.min(NETHER.offset + edge, Math.max(NETHER.offset - edge, s.x));
    s.z = Math.min(edge, Math.max(-edge, s.z));
  } else {
    const edge = WORLD_LIMIT - 1;
    s.x = Math.min(edge, Math.max(-edge, s.x));
    s.z = Math.min(edge, Math.max(-edge, s.z));
  }
  s.y = Math.min(WORLD_HEIGHT + 8, s.y);
}

/** Advances the player by dt seconds. */
export function stepPlayer(
  world: BlockQuery,
  s: PlayerState,
  input: MoveInput,
  dt: number,
  body: Body = PLAYER_BODY,
): void {
  let left = Math.min(dt, 0.25);
  while (left > 0) {
    const part = Math.min(left, MAX_STEP);
    step(world, body, s, input, part);
    left -= part;
  }
}
