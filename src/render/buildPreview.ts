// The magic builder's preview: the finished build on a little grass island
// that you can turn around (drag), zoom (wheel) and cut open layer by layer
// to look inside, before putting it into the world.

import * as THREE from 'three';
import { RENDER } from '../config';
import { GRASS } from '../logic/blocks';
import { buildBlocksMesh } from '../logic/mesher';
import { buildBounds, type BuildBlock } from '../logic/shapes';
import { createAtlasTexture } from './textures';
import { toGeometry } from './worldRenderer';

/** Grass around the build, in blocks. */
const ISLAND_MARGIN = 2;
const SPIN_SPEED = 0.25;
const DRAG_SPEED = 0.008;
const MIN_PITCH = 0.05;
const MAX_PITCH = 1.45;

export class BuildPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private readonly solidMaterial: THREE.MeshBasicMaterial;
  private readonly waterMaterial: THREE.MeshBasicMaterial;
  private meshes: THREE.Mesh[] = [];
  private blocks: readonly BuildBlock[] = [];
  private readonly target = new THREE.Vector3();
  private yaw = 0.6;
  private pitch = 0.5;
  private distance = 30;
  private spinning = true;
  private running = false;
  private lastFrame = 0;
  private drag: { x: number; y: number } | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(RENDER.skyColor);
    const atlas = createAtlasTexture();
    this.solidMaterial = new THREE.MeshBasicMaterial({
      map: atlas,
      vertexColors: true,
      alphaTest: 0.5,
    });
    this.waterMaterial = new THREE.MeshBasicMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      this.spinning = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.yaw -= (e.clientX - this.drag.x) * DRAG_SPEED;
      this.pitch += (e.clientY - this.drag.y) * DRAG_SPEED;
      this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => (this.drag = null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance *= e.deltaY > 0 ? 1.1 : 1 / 1.1;
        this.distance = Math.min(150, Math.max(4, this.distance));
      },
      { passive: false },
    );
  }

  /** Shows a new build from the front-right, slowly turning. */
  show(blocks: readonly BuildBlock[]): void {
    this.blocks = blocks;
    const { min, max } = buildBounds(blocks);
    this.target.set(
      (min[0] + max[0] + 1) / 2,
      (min[1] + max[1] + 1) / 2,
      (min[2] + max[2] + 1) / 2,
    );
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 1;
    this.distance = size * 1.7 + 6;
    this.yaw = 0.6;
    this.pitch = 0.5;
    this.spinning = true;
    this.setCut(max[1]);
    this.start();
  }

  /** Hides everything above height `y`, so you can look inside. */
  setCut(y: number): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes = [];
    if (this.blocks.length === 0) return;
    const { min, max } = buildBounds(this.blocks);
    const visible = this.blocks.filter((b) => b[1] <= y);
    const used = new Set(visible.filter((b) => b[1] === -1).map(([x, , z]) => `${x},${z}`));
    for (let z = min[2] - ISLAND_MARGIN; z <= max[2] + ISLAND_MARGIN; z++) {
      for (let x = min[0] - ISLAND_MARGIN; x <= max[0] + ISLAND_MARGIN; x++) {
        if (!used.has(`${x},${z}`)) visible.push([x, -1, z, GRASS]);
      }
    }
    const data = buildBlocksMesh(visible);
    for (const [part, material] of [
      [data.solid, this.solidMaterial],
      [data.water, this.waterMaterial],
    ] as const) {
      const geometry = toGeometry(part);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material);
      if (material === this.waterMaterial) mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(() => this.frame());
  }

  stop(): void {
    this.running = false;
  }

  private frame(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.spinning) this.yaw += dt * SPIN_SPEED;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const canvas = this.renderer.domElement;
    if (canvas.width !== Math.floor(width * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height);
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z - Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }
}
