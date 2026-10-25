// TNT explosions like Minecraft: rays go out from the middle in every
// direction and lose strength in tough blocks. Stone stops the blast a bit,
// water and obsidian stop it almost completely, bedrock never breaks.
// Other TNT nearby is lit, so long rows of TNT go off one after another.
//
// The same place always explodes the same way (the dice come from the
// position), so every player's computer gets the same hole.

import { fallingWith } from './blockShapes';
import { AIR, TNT, TNT_LIT, getBlockType } from './blocks';
import { blockRules } from './mining';
import { mulberry32 } from './noise';
import type { Edit } from './world';

/** Minecraft "blast resistance" where it is not the same as hardness. */
const RESISTANCE: Record<string, number> = {
  stone: 6,
  cobblestone: 6,
  brick: 6,
  gold_block: 6,
  diamond_block: 6,
  iron_block: 6,
  emerald_block: 6,
  redstone_block: 6,
  coal_block: 6,
  water: 100,
  lava: 100,
  obsidian: 1200,
  enchanting_table: 1200,
  planks: 3,
  snow: 0.2,
  tnt: 0,
  tnt_lit: 0,
};

/** Rays per cube side (Minecraft: 16 × 16). */
const GRID = 16;
const STEP = 0.3;
const STEP_LOSS = 0.225;

export function blastResistance(id: number): number {
  const block = getBlockType(id);
  if (block.id === AIR) return 0;
  if (!block.breakable) return Infinity;
  return RESISTANCE[block.key] ?? blockRules(id).hardness;
}

export interface Blast {
  /** Blocks that change: broken ones become air, TNT becomes lit TNT. */
  edits: Edit[];
  /** TNT lit by this blast (it goes off soon). */
  lit: [number, number, number][];
}

/** Which blocks an explosion at (x, y, z) breaks. */
export function explode(
  getBlock: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  power: number,
): Blast {
  const random = mulberry32(
    Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791),
  );
  const hit = new Map<string, Edit>();
  const cx = x + 0.5;
  const cy = y + 0.5;
  const cz = z + 0.5;
  const last = GRID - 1;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      for (let k = 0; k < GRID; k++) {
        // Only the outside of the cube: that gives every direction once.
        if (i !== 0 && i !== last && j !== 0 && j !== last && k !== 0 && k !== last) continue;
        let dx = (i / last) * 2 - 1;
        let dy = (j / last) * 2 - 1;
        let dz = (k / last) * 2 - 1;
        const length = Math.hypot(dx, dy, dz);
        dx = (dx / length) * STEP;
        dy = (dy / length) * STEP;
        dz = (dz / length) * STEP;
        let strength = power * (0.7 + random() * 0.6);
        let px = cx;
        let py = cy;
        let pz = cz;
        while (strength > 0) {
          const bx = Math.floor(px);
          const by = Math.floor(py);
          const bz = Math.floor(pz);
          const id = getBlock(bx, by, bz);
          if (id !== AIR) {
            strength -= (blastResistance(id) + 0.3) * STEP;
            if (strength > 0) {
              const k = `${bx},${by},${bz}`;
              if (!hit.has(k) && id !== TNT_LIT) {
                hit.set(k, [bx, by, bz, id === TNT ? TNT_LIT : AIR]);
              }
            }
          }
          px += dx;
          py += dy;
          pz += dz;
          strength -= STEP_LOSS;
        }
      }
    }
  }
  // The exploding TNT itself is gone.
  hit.set(`${x},${y},${z}`, [x, y, z, AIR]);
  // Dust, torches and doors whose block broke fall off too.
  const removed = [...hit.values()]
    .filter((e) => e[3] === AIR)
    .map((e): [number, number, number] => [e[0], e[1], e[2]]);
  for (const [bx, by, bz] of fallingWith(getBlock, removed)) {
    const k = `${bx},${by},${bz}`;
    if (!hit.has(k)) hit.set(k, [bx, by, bz, AIR]);
  }
  const edits = [...hit.values()];
  const lit = edits
    .filter((e) => e[3] === TNT_LIT)
    .map((e): [number, number, number] => [e[0], e[1], e[2]]);
  return { edits, lit };
}

/**
 * How much a blast hurts someone this far from the middle (Minecraft's
 * formula), and how strongly it throws them (0–1).
 */
export function blastHit(distance: number, power: number): { damage: number; push: number } {
  const reach = power * 2;
  if (distance >= reach) return { damage: 0, push: 0 };
  const impact = 1 - distance / reach;
  return { damage: Math.floor(((impact * impact + impact) / 2) * 7 * reach + 1), push: impact };
}
