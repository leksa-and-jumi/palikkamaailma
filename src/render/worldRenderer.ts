// Draws the world with Three.js. Chunk meshes are built a few at a time so
// the game never freezes, nearest chunks first.

import * as THREE from 'three';
import { CHUNK_SIZE, RENDER } from '../config';
import { buildChunkMesh, type MeshData } from '../logic/mesher';
import { chunkKey, type VoxelWorld } from '../logic/world';
import { createAtlasTexture } from './textures';

interface ChunkMeshes {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

const HIGHLIGHT_GROW = 0.004;

function toGeometry(data: MeshData): THREE.BufferGeometry | null {
  if (data.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly solidMaterial: THREE.MeshBasicMaterial;
  private readonly waterMaterial: THREE.MeshBasicMaterial;
  private readonly chunks = new Map<string, ChunkMeshes>();
  private readonly highlight: THREE.LineSegments;
  private readonly fog: THREE.Fog;
  private world: VoxelWorld | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      RENDER.fov,
      window.innerWidth / window.innerHeight,
      0.05,
      RENDER.fogFar + CHUNK_SIZE,
    );
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color(RENDER.skyColor);
    this.fog = new THREE.Fog(RENDER.skyColor, RENDER.fogNear, RENDER.fogFar);
    this.scene.fog = this.fog;
    // Lights only shade the player figures; blocks have their light baked in.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.4, 1, 0.3);
    this.scene.add(sun);

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

    const box = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(1 + HIGHLIGHT_GROW * 2, 1 + HIGHLIGHT_GROW * 2, 1 + HIGHLIGHT_GROW * 2),
    );
    this.highlight = new THREE.LineSegments(
      box,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    window.addEventListener('resize', () => this.resize());
  }

  setWorld(world: VoxelWorld): void {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.world = world;
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setUnderwater(underwater: boolean): void {
    const color = underwater ? RENDER.underwaterColor : RENDER.skyColor;
    (this.scene.background as THREE.Color).setHex(color);
    this.fog.color.setHex(color);
    this.fog.near = underwater ? 1 : RENDER.fogNear;
    this.fog.far = underwater ? 16 : RENDER.fogFar;
  }

  showHighlight(x: number, y: number, z: number): void {
    this.highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.highlight.visible = true;
  }

  hideHighlight(): void {
    this.highlight.visible = false;
  }

  /**
   * Builds and removes chunk meshes around the player, spending at most
   * RENDER.meshBudgetMs per frame (but always at least one chunk).
   */
  updateChunks(playerX: number, playerZ: number): void {
    const world = this.world;
    if (!world) return;
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const distance = RENDER.viewDistance;
    const start = performance.now();
    let built = 0;
    const hasTime = () => built === 0 || performance.now() - start < RENDER.meshBudgetMs;

    // 1. Chunks the players changed: nearest first.
    for (const key of world.dirtyChunks) {
      if (!this.chunks.has(key)) world.dirtyChunks.delete(key);
    }
    const dirty = [...world.dirtyChunks]
      .map((key) => {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        return { key, cx, cz, d: Math.hypot(cx - pcx, cz - pcz) };
      })
      .sort((a, b) => a.d - b.d);
    for (const c of dirty) {
      if (!hasTime()) break;
      world.dirtyChunks.delete(c.key);
      this.buildChunk(c.cx, c.cz);
      built++;
    }

    // 2. New chunks that came into view.
    const missing: { cx: number; cz: number; d: number }[] = [];
    for (let cz = pcz - distance; cz <= pcz + distance; cz++) {
      for (let cx = pcx - distance; cx <= pcx + distance; cx++) {
        const d = Math.hypot(cx - pcx, cz - pcz);
        if (d > distance + 0.5 || this.chunks.has(chunkKey(cx, cz))) continue;
        missing.push({ cx, cz, d });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    for (const c of missing) {
      if (!hasTime()) break;
      this.buildChunk(c.cx, c.cz);
      built++;
    }

    // 3. Far away chunks are removed to save memory.
    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      if (Math.hypot(cx - pcx, cz - pcz) > distance + 2) this.removeChunk(key);
    }
    world.unloadFarChunks(pcx, pcz, RENDER.keepDistance);
  }

  /** How many chunks around the player still need a mesh (for the loading screen). */
  pendingChunks(playerX: number, playerZ: number, radius: number): number {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    let pending = 0;
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        if (!this.chunks.has(chunkKey(cx, cz))) pending++;
      }
    }
    return pending;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private buildChunk(cx: number, cz: number): void {
    if (!this.world) return;
    const key = chunkKey(cx, cz);
    this.removeChunk(key);
    const data = buildChunkMesh(this.world, cx, cz);
    const meshes: ChunkMeshes = { solid: null, water: null };
    const solid = toGeometry(data.solid);
    if (solid) {
      meshes.solid = new THREE.Mesh(solid, this.solidMaterial);
      meshes.solid.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      this.scene.add(meshes.solid);
    }
    const water = toGeometry(data.water);
    if (water) {
      meshes.water = new THREE.Mesh(water, this.waterMaterial);
      meshes.water.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      meshes.water.renderOrder = 1;
      this.scene.add(meshes.water);
    }
    this.chunks.set(key, meshes);
  }

  private removeChunk(key: string): void {
    const meshes = this.chunks.get(key);
    if (!meshes) return;
    for (const mesh of [meshes.solid, meshes.water]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.delete(key);
  }
}
