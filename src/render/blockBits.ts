// Little things that make blocks feel alive: crumbs flying when a block
// breaks, and a chest lid that opens while you look inside.

import * as THREE from 'three';
import { type TileName } from '../logic/blocks';
import { tileTexture } from './textures';

const CRUMBS = 14;
const CRUMB_LIFE = 0.7;
const GRAVITY = 18;
const LID_OPEN = 1.25;
const LID_SPEED = 6;

interface Crumb {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface Lid {
  mesh: THREE.Mesh;
  /** 0 closed … 1 open. */
  open: number;
  closing: boolean;
}

export class BlockBits {
  private readonly crumbs: Crumb[] = [];
  private readonly crumbGeometry = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  private readonly materials = new Map<TileName, THREE.MeshLambertMaterial>();
  private readonly lids = new Map<string, Lid>();
  private readonly lidGeometry: THREE.BoxGeometry;

  constructor(private readonly scene: THREE.Scene) {
    // The lid turns around its back edge.
    this.lidGeometry = new THREE.BoxGeometry(14 / 16, 4 / 16, 14 / 16);
    this.lidGeometry.translate(0, 2 / 16, -7 / 16);
  }

  private material(tile: TileName): THREE.MeshLambertMaterial {
    let m = this.materials.get(tile);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map: tileTexture(tile), alphaTest: 0.5 });
      this.materials.set(tile, m);
    }
    return m;
  }

  /** Crumbs of the block's picture fly out of (x, y, z). */
  burst(x: number, y: number, z: number, tile: TileName): void {
    const material = this.material(tile);
    for (let i = 0; i < CRUMBS; i++) {
      const mesh = new THREE.Mesh(this.crumbGeometry, material);
      mesh.position.set(
        x + 0.2 + Math.random() * 0.6,
        y + 0.2 + Math.random() * 0.6,
        z + 0.2 + Math.random() * 0.6,
      );
      this.scene.add(mesh);
      this.crumbs.push({
        mesh,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life: CRUMB_LIFE * (0.6 + Math.random() * 0.4),
      });
    }
  }

  /**
   * The chest at (x, y, z) opens (true) or closes (false). The lid opens
   * towards the player at (px, pz), so its hinge is on the far side.
   */
  chest(x: number, y: number, z: number, open: boolean, px = x + 0.5, pz = z + 2): void {
    const key = `${x},${y},${z}`;
    let lid = this.lids.get(key);
    if (!lid && open) {
      const mesh = new THREE.Mesh(this.lidGeometry, this.material('chest_side'));
      const dx = px - (x + 0.5);
      const dz = pz - (z + 0.5);
      const [hx, hz] = Math.abs(dx) > Math.abs(dz) ? [-Math.sign(dx), 0] : [0, -Math.sign(dz)];
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = Math.atan2(hx, hz);
      mesh.position.set(x + 0.5 + (hx * 7) / 16, y + 10 / 16, z + 0.5 + (hz * 7) / 16);
      this.scene.add(mesh);
      lid = { mesh, open: 0, closing: false };
      this.lids.set(key, lid);
    }
    if (lid) lid.closing = !open;
  }

  /** Called every frame. `closed` is told when a lid has shut (to show the whole chest again). */
  update(dt: number, closed: (x: number, y: number, z: number) => void): void {
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const c = this.crumbs[i]!;
      c.life -= dt;
      c.vy -= GRAVITY * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.scale.setScalar(Math.max(0.2, c.life / CRUMB_LIFE));
      if (c.life > 0) continue;
      this.scene.remove(c.mesh);
      this.crumbs.splice(i, 1);
    }
    for (const [key, lid] of this.lids) {
      lid.open += (lid.closing ? -1 : 1) * LID_SPEED * dt * 0.5;
      lid.open = Math.min(1, lid.open);
      lid.mesh.rotation.x = lid.open * LID_OPEN;
      if (lid.open > 0) continue;
      this.scene.remove(lid.mesh);
      this.lids.delete(key);
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      closed(x, y, z);
    }
  }

  clear(): void {
    for (const c of this.crumbs) this.scene.remove(c.mesh);
    this.crumbs.length = 0;
    for (const lid of this.lids.values()) this.scene.remove(lid.mesh);
    this.lids.clear();
  }
}
