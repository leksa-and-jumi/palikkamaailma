// The turning world behind the title screen (Minecraft has one too): a
// world of its own, seen from above while the camera slowly goes round.

import { seedFromCode } from '../logic/codes';
import { SEA_LEVEL } from '../config';
import { findSpawn } from '../logic/spawn';
import { VoxelWorld } from '../logic/world';
import type { WorldRenderer } from './worldRenderer';

/** A nice place: the same every time. */
const PANORAMA_CODE = 'KETTU-SUO-2';
const HEIGHT = 9;
/** How far around the camera the ground must stay below it, and where to look for a place. */
const CLEAR = 30;
const SEARCH = 320;
const TURN_SPEED = 0.03;
/** Golden morning light. */
const TIME_OF_DAY = 0.07;

export class Panorama {
  private running = false;
  private angle = 0;
  private world: VoxelWorld | null = null;
  private centre: [number, number, number] = [0, 0, 0];
  private last = 0;

  constructor(private readonly renderer: WorldRenderer) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    if (!this.world) {
      this.world = new VoxelWorld(seedFromCode(PANORAMA_CODE));
      this.centre = this.findView(this.world);

    }
    this.renderer.setWorld(this.world);
    this.renderer.nether = false;
    this.last = performance.now();
    requestAnimationFrame(() => this.frame());
  }

  /**
   * A pretty place for the camera: gentle land by some water, with no
   * mountain right next to it (looked for around the world's start).
   */
  private findView(world: VoxelWorld): [number, number, number] {
    const [x0, , z0] = findSpawn(world);
    let best: [number, number, number] = [x0, SEA_LEVEL + 8, z0];
    let bestScore = Infinity;
    for (let gx = -SEARCH; gx <= SEARCH; gx += 32) {
      for (let gz = -SEARCH; gz <= SEARCH; gz += 32) {
        let max = 0;
        let water = 0;
        let n = 0;
        for (let dx = -CLEAR; dx <= CLEAR; dx += 6) {
          for (let dz = -CLEAR; dz <= CLEAR; dz += 6) {
            const h = world.terrain.heightAt(x0 + gx + dx, z0 + gz + dz);
            max = Math.max(max, h);
            if (h < SEA_LEVEL) water++;
            n++;
          }
        }
        // Low and flat is good, about a third of water is best.
        const score = max - SEA_LEVEL + Math.abs(water / n - 0.35) * 40;
        if (score < bestScore) {
          bestScore = score;
          best = [x0 + gx, Math.max(max, SEA_LEVEL), z0 + gz];
        }
      }
    }
    return best;
  }

  stop(): void {
    this.running = false;
  }

  private frame(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.angle += dt * TURN_SPEED;
    const [x, y, z] = this.centre;
    this.renderer.updateChunks(x, z);
    const cam = this.renderer.camera;
    cam.position.set(x, y + HEIGHT, z);
    cam.rotation.set(-0.18, this.angle, 0);
    this.renderer.time = TIME_OF_DAY;
    this.renderer.clock = Date.now();
    this.renderer.render();
  }
}
