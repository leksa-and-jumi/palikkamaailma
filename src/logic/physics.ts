// Moves the player: walking, jumping, flying, swimming and bumping into blocks.

import { PLAYER, WORLD_HEIGHT, WORLD_SIZE } from '../config';

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
}

export interface BlockQuery {
  isSolid(x: number, y: number, z: number): boolean;
  isLiquid(x: number, y: number, z: number): boolean;
}

/** Small gap so the player never sticks inside a wall. */
const SKIN = 0.001;
const HALF = PLAYER.width / 2;
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
  };
}

function collides(world: BlockQuery, x: number, y: number, z: number): boolean {
  const x0 = Math.floor(x - HALF + SKIN);
  const x1 = Math.floor(x + HALF - SKIN);
  const y0 = Math.floor(y + SKIN);
  const y1 = Math.floor(y + PLAYER.height - SKIN);
  const z0 = Math.floor(z - HALF + SKIN);
  const z1 = Math.floor(z + HALF - SKIN);
  for (let by = y0; by <= y1; by++) {
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        if (world.isSolid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/** Is any part of the player box in one of these blocks? */
export function overlapsBlock(state: PlayerState, bx: number, by: number, bz: number): boolean {
  return (
    bx + 1 > state.x - HALF &&
    bx < state.x + HALF &&
    by + 1 > state.y &&
    by < state.y + PLAYER.height &&
    bz + 1 > state.z - HALF &&
    bz < state.z + HALF
  );
}

/** Moves along one axis, stopping at the first block in the way. */
function moveAxis(
  world: BlockQuery,
  s: PlayerState,
  axis: 'x' | 'y' | 'z',
  delta: number,
): boolean {
  if (delta === 0) return false;
  const start = s[axis];
  s[axis] = start + delta;
  if (!collides(world, s.x, s.y, s.z)) return false;

  // Slide back to touch the block exactly.
  if (axis === 'y') {
    s.y = delta > 0 ? Math.floor(s.y + PLAYER.height) - PLAYER.height - SKIN : Math.floor(s.y) + 1;
  } else {
    const edge =
      delta > 0
        ? Math.floor(s[axis] + HALF) - HALF - SKIN
        : Math.floor(s[axis] - HALF) + 1 + HALF + SKIN;
    s[axis] = edge;
  }
  if (collides(world, s.x, s.y, s.z)) s[axis] = start;
  return true;
}

function step(world: BlockQuery, s: PlayerState, input: MoveInput, dt: number): void {
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
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    s.vx = dx * speed * (s.inWater ? 0.6 : 1);
    s.vz = dz * speed * (s.inWater ? 0.6 : 1);
    if (s.inWater) {
      s.vy -= PLAYER.swimGravity * dt;
      if (input.jump) s.vy = PLAYER.swimUpSpeed;
      s.vy = Math.max(s.vy, -PLAYER.maxSwimFallSpeed);
    } else {
      if (input.jump && s.onGround) s.vy = PLAYER.jumpSpeed;
      s.vy = Math.max(s.vy - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
    }
  }

  moveAxis(world, s, 'x', s.vx * dt);
  moveAxis(world, s, 'z', s.vz * dt);
  const hitY = moveAxis(world, s, 'y', s.vy * dt);
  if (hitY) s.vy = 0;
  s.onGround = s.vy <= 0 && collides(world, s.x, s.y - GROUND_PROBE, s.z);
  if (s.onGround && s.flying) s.flying = false;

  // Stay on the island and below the sky.
  s.x = Math.min(WORLD_SIZE - HALF, Math.max(HALF, s.x));
  s.z = Math.min(WORLD_SIZE - HALF, Math.max(HALF, s.z));
  s.y = Math.min(WORLD_HEIGHT + 8, s.y);
}

/** Advances the player by dt seconds. */
export function stepPlayer(world: BlockQuery, s: PlayerState, input: MoveInput, dt: number): void {
  let left = Math.min(dt, 0.25);
  while (left > 0) {
    const part = Math.min(left, MAX_STEP);
    step(world, s, input, part);
    left -= part;
  }
}
