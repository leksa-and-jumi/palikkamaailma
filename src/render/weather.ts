// Rain for mods' storms: streaks falling around the camera.

import * as THREE from 'three';

const DROPS = 900;
const AREA = 24;
const HEIGHT = 20;
const SPEED = 22;

export class Rain {
  private readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(DROPS * 6);
  private readonly offsets = new Float32Array(DROPS * 3);

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < DROPS; i++) {
      this.offsets[i * 3] = (Math.random() - 0.5) * AREA * 2;
      this.offsets[i * 3 + 1] = Math.random() * HEIGHT;
      this.offsets[i * 3 + 2] = (Math.random() - 0.5) * AREA * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.55 }),
    );
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  update(on: boolean, camera: THREE.Vector3, dt: number): void {
    this.lines.visible = on;
    if (!on) return;
    for (let i = 0; i < DROPS; i++) {
      let y = this.offsets[i * 3 + 1]! - SPEED * dt;
      if (y < 0) y += HEIGHT;
      this.offsets[i * 3 + 1] = y;
      const x = camera.x + this.offsets[i * 3]!;
      const z = camera.z + this.offsets[i * 3 + 2]!;
      const top = camera.y - HEIGHT / 2 + y;
      this.positions.set([x, top, z, x, top - 0.6, z], i * 6);
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
  }
}
