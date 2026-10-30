// What you hold, drawn at the bottom right like in Minecraft: a little
// block, a tool or weapon cut out of its pixel picture, or your bare arm.
// It sways while you walk and swings when you hit, dig or place.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getBlockType } from '../logic/blocks';
import { getItem } from '../logic/items';
import { drawItemIcon, itemSpriteCanvas } from './itemIcons';
import { tileTexture } from './textures';

const SWING_TIME = 0.28;
const SWAP_TIME = 0.18;
const ARM_COLOR = 0xc89a72;

export class HeldItem {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  private readonly hand = new THREE.Group();
  private readonly hemisphere = new THREE.HemisphereLight(0xffffff, 0x666677, 2);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  private readonly cache = new Map<number, THREE.Object3D>();
  private shown: THREE.Object3D | null = null;
  private itemId: number | null | undefined = undefined;
  private swingTime = SWING_TIME;
  private swapTime = 0;
  private walk = 0;
  private bowPull = 0;

  constructor() {
    this.scene.add(this.hemisphere, this.sun, this.hand);
    this.sun.position.set(-0.3, 1, 0.6);
    this.camera.position.set(0, 0, 0);
  }

  /** A swing of the arm (hitting, digging, placing). */
  swing(): void {
    if (this.swingTime >= SWING_TIME * 0.6) this.swingTime = 0;
  }

  /**
   * Every frame: what you hold (null = empty hand), how fast you walk,
   * how bright it is (0–1) and how far a bow is pulled (0–1).
   */
  update(dt: number, itemId: number | null, speed: number, light: number, pull = 0): void {
    if (itemId !== this.itemId) {
      this.swapTime = this.itemId === undefined ? 0 : SWAP_TIME;
      this.itemId = itemId;
      if (this.shown) this.hand.remove(this.shown);
      this.shown = this.model(itemId);
      this.hand.add(this.shown);
    }
    this.swingTime = Math.min(SWING_TIME, this.swingTime + dt);
    this.swapTime = Math.max(0, this.swapTime - dt);
    this.walk += dt * Math.min(speed, 6) * 1.6;
    this.bowPull += (pull - this.bowPull) * Math.min(1, dt * 10);
    const k = Math.max(0.25, Math.min(1, light));
    this.hemisphere.intensity = 2 * k;
    this.sun.intensity = 1 * k;

    // Rest place: bottom right, a little tilted.
    const moving = Math.min(1, speed / 4);
    const bobX = Math.sin(this.walk) * 0.025 * moving;
    const bobY = -Math.abs(Math.cos(this.walk)) * 0.025 * moving;
    const t = this.swingTime / SWING_TIME;
    const swing = Math.sin(t * Math.PI);
    const swap = this.swapTime / SWAP_TIME;
    this.hand.position.set(
      0.3 + bobX - swing * 0.2 - this.bowPull * 0.25,
      -0.3 + bobY + swing * 0.08 - swap * 0.4,
      -0.62 - swing * 0.1,
    );
    this.hand.rotation.set(
      -swing * 1.1 + this.bowPull * 0.2,
      0.35 + swing * 0.5 - this.bowPull * 0.5,
      swing * 0.35,
    );
  }

  /** Called when the window changes shape. */
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private model(itemId: number | null): THREE.Object3D {
    const key = itemId ?? -1;
    let model = this.cache.get(key);
    if (model) return model;
    model = itemId === null ? arm() : (blockModel(itemId) ?? spriteModel(itemId) ?? arm());
    this.cache.set(key, model);
    return model;
  }
}

/** Your bare arm. */
function arm(): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.55),
    new THREE.MeshLambertMaterial({ color: ARM_COLOR }),
  );
  mesh.position.set(0.05, -0.05, 0.12);
  mesh.rotation.set(0.25, 0, 0);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** A small block with its real pictures on each side. */
function blockModel(itemId: number): THREE.Object3D | null {
  const block = getItem(itemId)?.block;
  if (block === undefined) return null;
  const type = getBlockType(block);
  if (type.shape !== 'cube') return null;
  const side = (name: typeof type.tiles.side) =>
    new THREE.MeshLambertMaterial({
      map: tileTexture(name),
      transparent: type.transparent,
      alphaTest: 0.5,
    });
  const t = type.tiles;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), [
    side(t.side),
    side(t.side),
    side(t.top),
    side(t.bottom),
    side(t.front ?? t.side),
    side(t.side),
  ]);
  mesh.rotation.set(0.1, 0.75, 0);
  mesh.position.set(-0.02, 0.02, 0);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** A tool, weapon or item: its pixel picture made into a thin 3D shape. */
function spriteModel(itemId: number): THREE.Object3D | null {
  const canvas = itemSpriteCanvas(itemId) ?? drawnIcon(itemId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const size = 0.3 / Math.max(width, height);
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3]! < 128) continue;
      const box = new THREE.BoxGeometry(size, size, size);
      box.translate((x - width / 2 + 0.5) * size, (height / 2 - y - 0.5) * size, 0);
      color.setRGB(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255, THREE.SRGBColorSpace);
      const colors = new Float32Array(box.attributes.position!.count * 3);
      for (let v = 0; v < colors.length; v += 3) {
        colors[v] = color.r;
        colors[v + 1] = color.g;
        colors[v + 2] = color.b;
      }
      box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(box);
    }
  }
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  // Held like a sword: the handle in your hand, the tip up and forward.
  mesh.rotation.set(0, 2.3, 0.1);
  mesh.position.set(-0.02, 0.1, 0);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Items without a sprite of their own (blocks that are not cubes): their icon. */
function drawnIcon(itemId: number): HTMLCanvasElement | null {
  if (!getItem(itemId)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  drawItemIcon(canvas, itemId);
  return canvas;
}
