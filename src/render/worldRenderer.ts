// Draws the world with Three.js. Chunk meshes are built a few at a time so
// the game never freezes, nearest chunks first.

import * as THREE from 'three';
import { CHUNK_SIZE, DAY, LIGHT, NETHER, RENDER } from '../config';
import { daylight } from '../logic/daytime';
import type { HeldItem } from './heldItem';
import type { BlockBox } from '../logic/blocks';
import { buildChunkMesh, type MeshData } from '../logic/mesher';
import { chunkKey, type VoxelWorld } from '../logic/world';
import { Sky } from './sky';
import { Rain } from './weather';
import type { Atmosphere } from '../mods/types';
import { createAtlasTexture } from './textures';

interface ChunkMeshes {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

const HIGHLIGHT_GROW = 0.004;
const NETHER_FOG = new THREE.Color(NETHER.fogColor);
const NETHER_GLOW = new THREE.Color(1, 0.55, 0.45).multiplyScalar(NETHER.minBrightness);
const DAY_MIN = new THREE.Color().setScalar(LIGHT.minBrightness);

/**
 * Block colours carry r = shade, g = sunlight, b = torch light (see mesher).
 * This turns them into brightness with the current daylight.
 */
function addDaylight(
  material: THREE.Material,
  uniforms: {
    uDaylight: { value: number };
    uTorch: { value: number };
    uMinLight: { value: THREE.Color };
  },
): void {
  const v3 = (c: readonly number[]) => `vec3(${c.map((n) => n.toFixed(3)).join(', ')})`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader =
      `uniform float uDaylight;\nuniform float uTorch;\nuniform vec3 uMinLight;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `float skyLight = vColor.g * mix(${DAY.nightSky.toFixed(3)}, 1.0, uDaylight);
      float skyBright = pow(${LIGHT.skyCurve.toFixed(3)}, 15.0 * (1.0 - skyLight));
      float torchBright = vColor.b > 0.0 ? pow(${LIGHT.torchCurve.toFixed(3)}, 15.0 * (1.0 - vColor.b)) * uTorch : 0.0;
      // Moonlight is blue, torch light is warm (like Minecraft).
      vec3 skyColor = mix(${v3(LIGHT.moonColor)}, vec3(1.0), uDaylight);
      vec3 light = max(skyColor * skyBright, ${v3(LIGHT.torchColor)} * torchBright);
      light = max(light, uMinLight);
      diffuseColor.rgb *= vColor.r * light;`,
      );
  };
}

export function toGeometry(data: MeshData): THREE.BufferGeometry | null {
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
  private readonly lightUniforms = {
    uDaylight: { value: 1 },
    uTorch: { value: 1 },
    uMinLight: { value: new THREE.Color().setScalar(LIGHT.minBrightness) },
  };
  /** In the Nether: red fog, no sky, a dim red glow everywhere. */
  nether = false;
  /** A mod's fog, darkness and rain (null = normal). */
  atmosphere: Atmosphere | null = null;
  private readonly rain: Rain;
  private lastSky = performance.now();
  private readonly sky: Sky;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private underwater = false;
  /** Current time of day (0…1), set every frame by the game. */
  time = 0.25;
  /** The shared clock (ms) and day number, for clouds and the moon. */
  clock = 0;
  day = 0;

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
      RENDER.cameraFar,
    );
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color(RENDER.skyColor);
    this.fog = new THREE.Fog(RENDER.skyColor, RENDER.fogNear, RENDER.fogFar);
    this.scene.fog = this.fog;
    // Lights only shade the player figures and animals; blocks have their light baked in.
    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x777788, 2.2);
    this.scene.add(this.hemisphere);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.sunLight);
    this.sky = new Sky(this.scene);
    this.rain = new Rain(this.scene);

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
    addDaylight(this.solidMaterial, this.lightUniforms);
    addDaylight(this.waterMaterial, this.lightUniforms);

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
    this.held?.resize(this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setUnderwater(underwater: boolean): void {
    this.underwater = underwater;
    this.fog.near = underwater ? 1 : RENDER.fogNear;
    this.fog.far = underwater ? 16 : RENDER.fogFar;
  }

  /** Sky colour, sun, moon and light for the current time of day. */
  private updateSky(): void {
    const light = daylight(this.time);
    this.lightUniforms.uDaylight.value = light;
    // Torches flicker a little (two waves, so it never looks like a loop).
    const t = performance.now() / 1000;
    this.lightUniforms.uTorch.value =
      1 - LIGHT.flicker * (0.5 + 0.3 * Math.sin(t * 7.3) + 0.2 * Math.sin(t * 17.9));
    this.sky.update(this.camera, this.time, this.clock, this.day);
    const color = this.underwater
      ? new THREE.Color(RENDER.underwaterColor).multiplyScalar(0.3 + 0.7 * light)
      : this.nether
        ? NETHER_FOG
        : this.sky.horizon;
    (this.scene.background as THREE.Color).copy(color);
    this.fog.color.copy(color);
    if (!this.underwater) {
      this.fog.near = this.nether ? NETHER.fogNear : RENDER.fogNear;
      this.fog.far = this.nether ? NETHER.fogFar : RENDER.fogFar;
    }
    this.lightUniforms.uMinLight.value.copy(this.nether ? NETHER_GLOW : DAY_MIN);
    this.sky.setVisible(!this.underwater && !this.nether, !this.nether);

    // A mod's mood: its own fog colour hides the sky, darkness dims the sun.
    const a = this.atmosphere;
    if (a && !this.underwater) {
      if (a.fogColor !== undefined) {
        (this.scene.background as THREE.Color).setHex(a.fogColor);
        this.fog.color.setHex(a.fogColor);
        this.sky.setVisible(false, false);
      }
      if (a.fogNear !== undefined) this.fog.near = a.fogNear;
      if (a.fogFar !== undefined) this.fog.far = a.fogFar;
      if (a.darkness) this.lightUniforms.uDaylight.value *= 1 - a.darkness;
    }
    const t2 = performance.now();
    this.rain.update(!!a?.rain, this.camera.position, Math.min(0.1, (t2 - this.lastSky) / 1000));
    this.lastSky = t2;
    this.hemisphere.intensity = 0.5 + 1.7 * light;
    this.sunLight.intensity = 1.2 * light;
    this.sunLight.position.copy(this.sky.sunDir);
  }

  /** Frames the block you look at; `box` fits it around a door, slab or torch. */
  showHighlight(x: number, y: number, z: number, box: BlockBox | null = null): void {
    const from = box?.from ?? [0, 0, 0];
    const to = box?.to ?? [1, 1, 1];
    this.highlight.position.set(
      x + (from[0] + to[0]) / 2,
      y + (from[1] + to[1]) / 2,
      z + (from[2] + to[2]) / 2,
    );
    this.highlight.scale.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
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
    this.updateSky();
    this.renderer.render(this.scene, this.camera);
    // What you hold is drawn last, on top of everything (it never sinks into walls).
    if (this.held) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.held.scene, this.held.camera);
      this.renderer.autoClear = true;
    }
  }

  /** The item in your hand, while you play (null on the title screen). */
  held: HeldItem | null = null;
  /** How bright it is around you now (0–1), for what you hold. */
  get brightness(): number {
    return this.lightUniforms.uDaylight.value;
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
