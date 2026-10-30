// Draws the mods' own characters (only on this computer, never stored).
// They are built from boxes like the creatures; parts that glow ignore the
// darkness, so eyes and lanterns shine at night.

import * as THREE from 'three';
import type { ActorSpec, ActorState } from '../mods/types';
import { shadowMesh } from './mobRenderer';

const SMOOTHING = 14;
const SNAP = 4;

interface Actor {
  group: THREE.Group;
  /** Where it should be (it glides there: updates from the host come 5 times a second). */
  target: THREE.Vector3;
  spec: ActorSpec;
  state: ActorState;
  label: THREE.Sprite | null;
  labelText: string;
}

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

export class ModActors {
  private readonly actors = new Map<string, Actor>();

  constructor(private readonly scene: THREE.Scene) {}

  set(id: string, spec: ActorSpec, state: ActorState): void {
    let a = this.actors.get(id);
    if (!a || a.spec !== spec) {
      if (a) this.remove(id);
      const group = new THREE.Group();
      for (const part of spec.parts) {
        const material = part.glow
          ? new THREE.MeshBasicMaterial({ color: part.color })
          : new THREE.MeshLambertMaterial({ color: part.color });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), material);
        mesh.position.set(...part.pos);
        group.add(mesh);
      }
      group.add(shadowMesh(spec.width));
      this.scene.add(group);
      a = {
        group,
        target: new THREE.Vector3(state.x, state.y, state.z),
        spec,
        state,
        label: null,
        labelText: '',
      };
      group.position.copy(a.target);
      this.actors.set(id, a);
    }
    a.state = state;
    a.target.set(state.x, state.y, state.z);
    // Far jumps (appearing somewhere else) happen at once.
    if (a.group.position.distanceTo(a.target) > SNAP) a.group.position.copy(a.target);
    a.group.rotation.y = state.yaw;
    a.group.visible = state.visible ?? true;
    a.group.scale.setScalar(state.scale ?? 1);
    const text = state.label ?? '';
    if (text !== a.labelText) {
      if (a.label) a.group.remove(a.label);
      a.label = text ? labelSprite(text) : null;
      if (a.label) {
        a.label.position.y = spec.height + 0.5;
        a.group.add(a.label);
      }
      a.labelText = text;
    }
  }

  /** Every frame: characters glide to where they should be. */
  update(dt: number): void {
    const t = 1 - Math.exp(-SMOOTHING * dt);
    for (const a of this.actors.values()) a.group.position.lerp(a.target, t);
  }

  remove(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.group);
    a.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.actors.delete(id);
  }

  /** Removes every character whose id starts with this (a mod turned off). */
  removeAll(prefix = ''): void {
    for (const id of [...this.actors.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  /** The visible character the ray hits first within `reach`. */
  pick(
    origin: readonly [number, number, number],
    dir: readonly [number, number, number],
    reach: number,
  ): { id: string; distance: number } | null {
    let best: { id: string; distance: number } | null = null;
    for (const [id, a] of this.actors) {
      if (a.state.visible === false) continue;
      const s = a.state.scale ?? 1;
      const half = (a.spec.width * s) / 2;
      const min = [a.state.x - half, a.state.y, a.state.z - half];
      const max = [a.state.x + half, a.state.y + a.spec.height * s, a.state.z + half];
      let t0 = 0;
      let t1 = reach;
      let hit = true;
      for (let i = 0; i < 3 && hit; i++) {
        const d = dir[i]!;
        const o = origin[i]!;
        if (Math.abs(d) < 1e-9) {
          if (o < min[i]! || o > max[i]!) hit = false;
          continue;
        }
        let near = (min[i]! - o) / d;
        let far = (max[i]! - o) / d;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1) hit = false;
      }
      if (hit && (!best || t0 < best.distance)) best = { id, distance: t0 };
    }
    return best;
  }
}
