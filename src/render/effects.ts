// Fireworks, explosion smoke and blinking lit TNT. Sparks are points with
// their own colour, size and fade, drawn with one small shader.

import * as THREE from 'three';
import { FIREWORKS } from '../config';
import { burst, flightTime } from '../logic/fireworks';
import { mulberry32 } from '../logic/noise';

interface Rocket {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  left: number;
  kind: number;
  seed: number;
}

const GRAVITY = 4;
const SPARK_DRAG = 1.6;
const SMOKE_DRAG = 2.2;
const TRAIL_PER_SECOND = 60;
/** Spark sizes in blocks. */
const SPARK_SIZE = 0.9;
const TRAIL_SIZE = 0.35;
/** Lit TNT blinks white this many times a second. */
const BLINK_SPEED = 4;
const PRIMED_GROW = 0.02;

const VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float scale;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vColor + (1.0 - d * 2.0) * 0.12, vAlpha * edge);
  }
`;

export class Effects {
  private readonly count = FIREWORKS.maxSparks;
  private readonly position = new Float32Array(this.count * 3);
  private readonly color = new Float32Array(this.count * 3);
  private readonly alpha = new Float32Array(this.count);
  private readonly size = new Float32Array(this.count);
  private readonly velocity = new Float32Array(this.count * 3);
  private readonly life = new Float32Array(this.count);
  private readonly maxLife = new Float32Array(this.count);
  private readonly baseSize = new Float32Array(this.count);
  /** 0 = firework spark (falls, twinkles), 1 = smoke (rises, grows). */
  private readonly smoke = new Uint8Array(this.count);
  private used = 0;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly rockets: Rocket[] = [];
  private readonly primed = new Map<string, THREE.Mesh>();
  private readonly primedMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private readonly primedBox = new THREE.BoxGeometry(
    1 + PRIMED_GROW * 2,
    1 + PRIMED_GROW * 2,
    1 + PRIMED_GROW * 2,
  );
  private readonly random = mulberry32(Date.now());
  private readonly tmp = new THREE.Color();
  /** Where the camera is, so pictures in the sky face it. */
  viewer: (() => [number, number]) | null = null;
  /** Called when a rocket bursts (for the bang sound). */
  onBurst: ((x: number, y: number, z: number) => void) | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { scale: { value: window.innerHeight / 2 } },
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    points.renderOrder = 2;
    scene.add(points);
    window.addEventListener('resize', () => {
      this.material.uniforms.scale!.value = window.innerHeight / 2;
    });
  }

  /** A rocket flies up from here and bursts. */
  launch(x: number, y: number, z: number, kind: number, seed: number): void {
    const r = mulberry32(seed ^ 0x9e3779b9);
    this.rockets.push({
      x,
      y,
      z,
      vx: (r() - 0.5) * 1.2,
      vz: (r() - 0.5) * 1.2,
      left: flightTime(seed),
      kind,
      seed,
    });
  }

  /** One little spark that floats up and fades (mods use it). */
  sparkle(x: number, y: number, z: number, color: number): void {
    const r = this.random;
    this.spark(
      x,
      y,
      z,
      (r() - 0.5) * 0.6,
      0.6 + r() * 0.6,
      (r() - 0.5) * 0.6,
      color,
      0.9,
      0.5,
      false,
    );
  }

  /** Smoke and fire where TNT went off. */
  explosion(x: number, y: number, z: number): void {
    const r = this.random;
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const up = r();
      const speed = 2 + r() * 5;
      const grey = 0.35 + r() * 0.4;
      this.spark(
        x + (r() - 0.5) * 2,
        y + (r() - 0.5) * 2,
        z + (r() - 0.5) * 2,
        Math.cos(a) * speed,
        up * speed,
        Math.sin(a) * speed,
        i < 25 ? 0xff9a2e : Math.round(grey * 255) * 0x010101,
        1.2 + r() * 1.4,
        i < 25 ? 1.1 : 2.4,
        true,
      );
    }
  }

  /** Shows lit TNT blinking: positions as "x,y,z". */
  setPrimed(keys: Iterable<string>, time: number): void {
    const seen = new Set<string>();
    for (const k of keys) {
      seen.add(k);
      let mesh = this.primed.get(k);
      if (!mesh) {
        const [x, y, z] = k.split(',').map(Number) as [number, number, number];
        mesh = new THREE.Mesh(this.primedBox, this.primedMaterial);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.scene.add(mesh);
        this.primed.set(k, mesh);
      }
    }
    for (const [k, mesh] of this.primed) {
      if (seen.has(k)) continue;
      this.scene.remove(mesh);
      this.primed.delete(k);
    }
    this.primedMaterial.opacity = Math.sin(time * BLINK_SPEED * Math.PI * 2) > 0 ? 0.55 : 0;
  }

  update(dt: number): void {
    const r = this.random;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i]!;
      rocket.x += rocket.vx * dt;
      rocket.y += FIREWORKS.speed * dt;
      rocket.z += rocket.vz * dt;
      rocket.left -= dt;
      // A short sparkly tail.
      const trail = Math.max(1, Math.round(TRAIL_PER_SECOND * dt));
      for (let n = 0; n < trail; n++) {
        this.spark(
          rocket.x,
          rocket.y - r() * 0.4,
          rocket.z,
          (r() - 0.5) * 0.6,
          -1 - r(),
          (r() - 0.5) * 0.6,
          r() < 0.5 ? 0xffd27a : 0xffffff,
          0.4 + r() * 0.3,
          TRAIL_SIZE,
          false,
        );
      }
      if (rocket.left > 0) continue;
      this.rockets.splice(i, 1);
      this.onBurst?.(rocket.x, rocket.y, rocket.z);
      const eye = this.viewer?.();
      const facing = eye ? Math.atan2(eye[0] - rocket.x, eye[1] - rocket.z) : undefined;
      for (const s of burst(rocket.kind, rocket.seed, facing)) {
        this.spark(
          rocket.x,
          rocket.y,
          rocket.z,
          s.v[0],
          s.v[1],
          s.v[2],
          s.color,
          FIREWORKS.sparkLifetime * (0.75 + r() * 0.5),
          SPARK_SIZE,
          false,
        );
      }
    }

    // Move the sparks; dead ones swap with the last one so the list stays short.
    let i = 0;
    while (i < this.used) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.remove(i);
        continue;
      }
      const isSmoke = this.smoke[i] === 1;
      const drag = Math.exp(-(isSmoke ? SMOKE_DRAG : SPARK_DRAG) * dt);
      const j = i * 3;
      this.velocity[j]! *= drag;
      this.velocity[j + 1]! = this.velocity[j + 1]! * drag + (isSmoke ? 0.6 : -GRAVITY) * dt;
      this.velocity[j + 2]! *= drag;
      this.position[j]! += this.velocity[j]! * dt;
      this.position[j + 1]! += this.velocity[j + 1]! * dt;
      this.position[j + 2]! += this.velocity[j + 2]! * dt;
      const t = this.life[i]! / this.maxLife[i]!;
      if (isSmoke) {
        this.alpha[i] = t * 0.8;
        this.size[i] = this.baseSize[i]! * (1.6 - t * 0.6);
      } else {
        // Sparks twinkle when they are about to go out.
        const twinkle = t < 0.35 ? (r() < 0.5 ? 0.2 : 1) : 1;
        this.alpha[i] = Math.min(1, t * 2.5) * twinkle;
        this.size[i] = this.baseSize[i]!;
      }
      i++;
    }
    this.geometry.setDrawRange(0, this.used);
    for (const name of ['position', 'color', 'alpha', 'size']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    this.used = 0;
    this.rockets.length = 0;
    this.setPrimed([], 0);
    this.geometry.setDrawRange(0, 0);
  }

  private spark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    life: number,
    size: number,
    smoke: boolean,
  ): void {
    if (this.used >= this.count) return;
    const i = this.used++;
    const j = i * 3;
    this.position.set([x, y, z], j);
    this.velocity.set([vx, vy, vz], j);
    // The shader writes colours as they are, so no colour space change here.
    this.tmp.setHex(color, THREE.LinearSRGBColorSpace);
    this.color.set([this.tmp.r, this.tmp.g, this.tmp.b], j);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.smoke[i] = smoke ? 1 : 0;
  }

  private remove(i: number): void {
    const last = --this.used;
    if (i === last) return;
    const [a, b] = [i * 3, last * 3];
    this.position.copyWithin(a, b, b + 3);
    this.velocity.copyWithin(a, b, b + 3);
    this.color.copyWithin(a, b, b + 3);
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.baseSize[i] = this.baseSize[last]!;
    this.size[i] = this.size[last]!;
    this.alpha[i] = this.alpha[last]!;
    this.smoke[i] = this.smoke[last]!;
  }
}
