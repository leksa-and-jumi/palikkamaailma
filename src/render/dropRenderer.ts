// Draws items lying on the ground as small bobbing pictures, and the cracks
// on a block while you are mining it.

import * as THREE from 'three';
import type { LiveDrop } from '../logic/drops';
import { mulberry32 } from '../logic/noise';
import { drawItemIcon } from './itemIcons';

const ICON_PIXELS = 32;
const DROP_SIZE = 0.35;
const BOB_HEIGHT = 0.08;
const BOB_SPEED = 3;
const CRACK_STAGES = 10;
const CRACK_PIXELS = 16;
const CRACK_GROW = 0.006;

export class DropRenderer {
  private readonly sprites = new Map<string, THREE.Sprite>();
  private readonly textures = new Map<number, THREE.Texture>();

  constructor(private readonly scene: THREE.Scene) {}

  private texture(itemId: number): THREE.Texture {
    let texture = this.textures.get(itemId);
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ICON_PIXELS;
      drawItemIcon(canvas, itemId);
      texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(itemId, texture);
    }
    return texture;
  }

  /** Makes the scene match the list of drops. */
  sync(drops: Iterable<LiveDrop>, time: number): void {
    const seen = new Set<string>();
    for (const d of drops) {
      seen.add(d.id);
      let sprite = this.sprites.get(d.id);
      if (!sprite) {
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.texture(d.item.id), alphaTest: 0.1 }),
        );
        sprite.scale.set(DROP_SIZE, DROP_SIZE, DROP_SIZE);
        this.scene.add(sprite);
        this.sprites.set(d.id, sprite);
      }
      const bob = d.resting ? Math.sin(time * BOB_SPEED + d.p[0]) * BOB_HEIGHT + BOB_HEIGHT : 0;
      sprite.position.set(d.p[0], d.p[1] + bob + DROP_SIZE / 4, d.p[2]);
    }
    for (const [id, sprite] of this.sprites) {
      if (seen.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(id);
    }
  }

  clear(): void {
    this.sync([], 0);
  }
}

/** Cracks drawn over the block you are breaking. */
export class CrackOverlay {
  private readonly mesh: THREE.Mesh;
  private readonly stages: THREE.Texture[];
  private readonly material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.stages = Array.from({ length: CRACK_STAGES }, (_, i) => crackTexture(i));
    this.material = new THREE.MeshBasicMaterial({
      map: this.stages[0]!,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const size = 1 + CRACK_GROW * 2;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.material);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** progress 0…1, or null to hide. */
  show(x: number, y: number, z: number, progress: number | null): void {
    if (progress === null || progress <= 0) {
      this.mesh.visible = false;
      return;
    }
    const stage = Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
    this.material.map = this.stages[stage]!;
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.mesh.visible = true;
  }
}

/** More and more crack lines for each stage. */
function crackTexture(stage: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CRACK_PIXELS;
  const ctx = canvas.getContext('2d')!;
  const random = mulberry32(1234);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const lines = 2 + stage * 2;
  for (let i = 0; i < lines; i++) {
    let x = Math.floor(random() * CRACK_PIXELS);
    let y = Math.floor(random() * CRACK_PIXELS);
    const length = 3 + Math.floor(random() * (3 + stage));
    for (let j = 0; j < length; j++) {
      ctx.fillRect(x, y, 1, 1);
      x = (x + (random() < 0.5 ? 1 : -1) + CRACK_PIXELS) % CRACK_PIXELS;
      y = (y + (random() < 0.6 ? 1 : 0)) % CRACK_PIXELS;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}
