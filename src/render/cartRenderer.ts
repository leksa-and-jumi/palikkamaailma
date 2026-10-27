// Draws minecarts: an iron box on four wheels, tilted on slopes.

import * as THREE from 'three';
import type { CartView } from '../play/carts';
import { shadowMesh } from './mobRenderer';

const IRON = new THREE.MeshLambertMaterial({ color: 0x9a9ea6 });
const INSIDE = new THREE.MeshLambertMaterial({ color: 0x55585e });
const WHEEL = new THREE.MeshLambertMaterial({ color: 0x2b2b2e });
const SMOOTHING = 12;

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A cart pointing along z (north–south); the group turns it. */
function buildCart(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.12;
  const W = 0.8;
  const L = 1.0;
  const H = 0.5;
  const T = 0.07;
  body.add(
    box(W, T, L, INSIDE, 0, T / 2, 0),
    box(T, H, L, IRON, -W / 2 + T / 2, H / 2, 0),
    box(T, H, L, IRON, W / 2 - T / 2, H / 2, 0),
    box(W, H, T, IRON, 0, H / 2, -L / 2 + T / 2),
    box(W, H, T, IRON, 0, H / 2, L / 2 - T / 2),
  );
  g.add(body);
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.32, 0.32]) g.add(box(0.12, 0.22, 0.22, WHEEL, x * 1.15, 0.11, z));
  }
  g.add(shadowMesh(1));
  g.rotation.order = 'YXZ';
  return g;
}

export class CartRenderer {
  private readonly models = new Map<string, THREE.Group>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(views: Iterable<CartView>, dt: number, myId: string): void {
    const seen = new Set<string>();
    const t = 1 - Math.exp(-SMOOTHING * dt);
    for (const v of views) {
      seen.add(v.id);
      let m = this.models.get(v.id);
      const target = new THREE.Vector3(v.x, v.y, v.z);
      if (!m) {
        m = buildCart();
        m.position.copy(target);
        this.scene.add(m);
        this.models.set(v.id, m);
      }
      // Our own ride follows exactly (the camera sits in it); others glide.
      if (v.rider === myId) m.position.copy(target);
      else m.position.lerp(target, t);
      const yaw = (-v.heading * Math.PI) / 2;
      let dy = yaw - m.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.rotation.y += dy * t;
      m.rotation.x += ((v.tilt * Math.PI) / 4 - m.rotation.x) * t;
    }
    for (const [id, m] of this.models) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.models.delete(id);
    }
  }

  clear(): void {
    this.sync([], 0, '');
  }
}
