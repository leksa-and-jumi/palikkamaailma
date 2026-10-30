// Arrows from your bow (like Minecraft): hold the right mouse button to draw,
// let go to shoot. A fully drawn bow shoots far and hits hard. Arrows fly in
// an arc, stick in blocks for a while and hit creatures and mod characters.
// They are only on your computer; the hit goes over the network like a sword hit.

import * as THREE from 'three';

/** Seconds to draw the bow fully. */
export const BOW_DRAW_TIME = 1;
const SPEED = 42;
const GRAVITY = 18;
const STUCK_TIME = 20;
const MAX_FLIGHT = 6;
/** Damage of a fully drawn bow (Minecraft: up to 9–10). */
const FULL_DAMAGE = 9;
const STEP = 0.25;

type Vec = [number, number, number];

interface Arrow {
  mesh: THREE.Group;
  p: Vec;
  v: Vec;
  damage: number;
  age: number;
  stuck: boolean;
}

/** Something an arrow can hit: a box and what happens then. */
export interface ArrowTarget {
  id: string;
  min: Vec;
  max: Vec;
}

export interface ArrowWorld {
  solid(x: number, y: number, z: number): boolean;
  targets(): Iterable<ArrowTarget>;
  hit(target: ArrowTarget, damage: number, from: Vec): void;
}

/** How hard a bow drawn this long shoots (0 = too little to shoot). */
export function bowPower(drawn: number): number {
  const t = Math.min(1, drawn / BOW_DRAW_TIME);
  // Like Minecraft: the power grows faster at first.
  const power = (t * t + t * 2) / 3;
  return power < 0.1 ? 0 : power;
}

/** Where a box is first hit along p → p + d (0–1 of the way), or null. */
export function segmentHit(p: Vec, d: Vec, min: Vec, max: Vec): number | null {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (p[i]! < min[i]! || p[i]! > max[i]!) return null;
      continue;
    }
    let a = (min[i]! - p[i]!) / d[i]!;
    let b = (max[i]! - p[i]!) / d[i]!;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

function arrowMesh(): THREE.Group {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a3a }),
  );
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xb8b8c0 }),
  );
  tip.position.z = -0.32;
  const feather = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.02, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
  );
  feather.position.z = 0.26;
  group.add(shaft, tip, feather);
  return group;
}

export class Arrows {
  private readonly arrows: Arrow[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  shoot(from: Vec, direction: Vec, power: number, bonus = 0): void {
    const mesh = arrowMesh();
    this.scene.add(mesh);
    const speed = SPEED * power;
    this.arrows.push({
      mesh,
      p: [...from],
      v: [direction[0] * speed, direction[1] * speed, direction[2] * speed],
      damage: Math.max(1, Math.round(FULL_DAMAGE * power + bonus)),
      age: 0,
      stuck: false,
    });
  }

  update(dt: number, world: ArrowWorld): void {
    for (const a of [...this.arrows]) {
      a.age += dt;
      if (a.stuck) {
        if (a.age > STUCK_TIME) this.remove(a);
        continue;
      }
      if (a.age > MAX_FLIGHT) {
        this.remove(a);
        continue;
      }
      a.v[1] -= GRAVITY * dt;
      const d: Vec = [a.v[0] * dt, a.v[1] * dt, a.v[2] * dt];
      // Creatures and characters first (the nearest one on the way).
      let best: { target: ArrowTarget; t: number } | null = null;
      for (const target of world.targets()) {
        const t = segmentHit(a.p, d, target.min, target.max);
        if (t !== null && (!best || t < best.t)) best = { target, t };
      }
      // Blocks, in small steps along the way.
      const length = Math.hypot(...d);
      const steps = Math.max(1, Math.ceil(length / STEP));
      let wall = -1;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (best && t > best.t) break;
        if (world.solid(a.p[0] + d[0] * t, a.p[1] + d[1] * t, a.p[2] + d[2] * t)) {
          wall = (i - 1) / steps;
          break;
        }
      }
      if (best && (wall < 0 || best.t <= wall)) {
        world.hit(best.target, a.damage, a.p);
        this.remove(a);
        continue;
      }
      if (wall >= 0) {
        a.p = [a.p[0] + d[0] * wall, a.p[1] + d[1] * wall, a.p[2] + d[2] * wall];
        a.stuck = true;
        a.age = 0;
      } else {
        a.p = [a.p[0] + d[0], a.p[1] + d[1], a.p[2] + d[2]];
      }
      a.mesh.position.set(...a.p);
      a.mesh.lookAt(a.p[0] - a.v[0], a.p[1] - a.v[1], a.p[2] - a.v[2]);
    }
  }

  private remove(a: Arrow): void {
    this.scene.remove(a.mesh);
    a.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.arrows.splice(this.arrows.indexOf(a), 1);
  }

  clear(): void {
    for (const a of [...this.arrows]) this.remove(a);
  }
}
