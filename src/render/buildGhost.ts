// A see-through copy of a magic build that follows where you point, with a
// yellow box around it: everything inside the box is replaced when you place it.

import * as THREE from 'three';
import { buildBlocksMesh } from '../logic/mesher';
import { buildBounds, type BuildBlock } from '../logic/shapes';
import { createAtlasTexture } from './textures';
import { toGeometry } from './worldRenderer';

const GHOST_OPACITY = 0.55;
const GHOST_TINT = 0xd8ecff;
const BOX_COLOR = 0xffd54a;
const BOX_GROW = 0.02;

export class BuildGhost {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  private mesh: THREE.Mesh | null = null;
  private box: THREE.LineSegments | null = null;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.MeshBasicMaterial({
      map: createAtlasTexture(),
      vertexColors: true,
      color: GHOST_TINT,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
      alphaTest: 0.1,
    });
    this.group.visible = false;
    this.group.renderOrder = 2;
    scene.add(this.group);
  }

  /** `blocks` are relative to where the build goes (already turned). */
  setBuild(blocks: readonly BuildBlock[]): void {
    this.clear();
    const geometry = toGeometry(buildBlocksMesh(blocks).solid);
    if (geometry) {
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.mesh.renderOrder = 2;
      this.group.add(this.mesh);
    }
    const { min, max } = buildBounds(blocks);
    const size = [0, 1, 2].map((i) => max[i]! - min[i]! + 1 + BOX_GROW * 2) as [
      number,
      number,
      number,
    ];
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),
      new THREE.LineBasicMaterial({ color: BOX_COLOR }),
    );
    this.box.position.set(
      (min[0] + max[0] + 1) / 2,
      (min[1] + max[1] + 1) / 2,
      (min[2] + max[2] + 1) / 2,
    );
    this.group.add(this.box);
  }

  moveTo(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  clear(): void {
    this.hide();
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.box) {
      this.group.remove(this.box);
      this.box.geometry.dispose();
      (this.box.material as THREE.Material).dispose();
      this.box = null;
    }
  }
}
