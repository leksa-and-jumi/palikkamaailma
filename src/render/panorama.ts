// The turning world behind the title screen (Minecraft has one too): a
// world of its own, seen from above while the camera slowly goes round.

import { seedFromCode } from '../logic/codes';
import { findSpawn } from '../logic/spawn';
import { VoxelWorld } from '../logic/world';
import type { WorldRenderer } from './worldRenderer';

/** A nice place: the same every time. */
const PANORAMA_CODE = 'KALA-PUU-11';
const HEIGHT = 16;
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
      this.centre = findSpawn(this.world);
    }
    this.renderer.setWorld(this.world);
    this.renderer.nether = false;
    this.last = performance.now();
    requestAnimationFrame(() => this.frame());
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
    cam.rotation.set(-0.2, this.angle, 0);
    this.renderer.time = TIME_OF_DAY;
    this.renderer.clock = Date.now();
    this.renderer.render();
  }
}
