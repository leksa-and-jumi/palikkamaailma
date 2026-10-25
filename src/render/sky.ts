// The sky like in Minecraft: a colour gradient that glows red at sunrise and
// sunset, a square sun, a moon with phases, twinkling stars at night and
// blocky clouds drifting slowly (the same for everyone, from the clock).

import * as THREE from 'three';
import { DAY, SKY } from '../config';
import { mulberry32 } from '../logic/noise';
import { daylight, moonPhase, sunHeight, sunsetGlow } from '../logic/daytime';

/** A pixel square (sun) or moon picture with a soft glow around it. */
function discTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const SUN_TEXTURE = () =>
  discTexture((ctx) => {
    ctx.fillStyle = 'rgba(255,230,120,0.25)';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(255,240,150,0.5)';
    ctx.fillRect(3, 3, 26, 26);
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(7, 7, 18, 18);
  });

/** Phase 0 is a full moon; the dark part grows and shrinks over 8 days. */
function moonTexture(phase: number): THREE.Texture {
  return discTexture((ctx) => {
    ctx.fillStyle = 'rgba(200,210,255,0.15)';
    ctx.fillRect(0, 0, 32, 32);
    const rnd = mulberry32(7);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        // How far into the moon (0 = left edge, 1 = right edge).
        const u = (x - 8) / 16;
        const lit =
          phase === 0
            ? true
            : phase === 4
              ? false
              : phase < 4
                ? u > phase / 4
                : u < (phase - 4) / 4;
        const crater = rnd() < 0.12;
        const c = crater ? 200 : 232;
        // The dark part is almost see-through, like in Minecraft.
        ctx.fillStyle = lit ? `rgb(${c},${c + 4},${c + 16})` : 'rgba(40,44,70,0.3)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

function sprite(texture: THREE.Texture, size: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false, transparent: true }),
  );
  s.scale.set(size, size, size);
  s.renderOrder = -1;
  return s;
}

/** The cloud picture: one pixel is SKY.cloudBlock blocks. */
function cloudTexture(): THREE.Texture {
  const size = SKY.cloudPixels;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(1234);
  // Random rounded blobs (wrapping round the edges, so the picture repeats).
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < SKY.cloudBlobs; i++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const rx = 1.5 + rnd() * 4.5;
    const ry = 1 + rnd() * 2.5;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Sharp up close; smoothed far away so the clouds don't flicker into stripes.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Clouds fade out towards the edge of the cloud layer. */
function edgeFade(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 8, 32, 32, 32);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class Sky {
  /** Colour at the horizon (the fog uses it so far land melts into the sky). */
  readonly horizon = new THREE.Color();
  private readonly dome: THREE.Mesh;
  private readonly domeUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color(DAY.sunsetColor) },
    uGlowAmount: { value: 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
  private readonly stars: THREE.Points;
  private readonly sun = sprite(SUN_TEXTURE(), SKY.sunSize);
  private readonly moon: THREE.Sprite;
  private readonly moonTextures = Array.from({ length: 8 }, (_, i) => moonTexture(i));
  private readonly clouds: THREE.Mesh;
  private readonly cloudMap = cloudTexture();
  private readonly dayColor = new THREE.Color(DAY.dayColor);
  private readonly nightColor = new THREE.Color(DAY.nightColor);
  private readonly horizonDay = new THREE.Color(SKY.horizonDay);
  private readonly horizonNight = new THREE.Color(SKY.horizonNight);
  private readonly sunset = new THREE.Color(DAY.sunsetColor);
  /** Where the sun is (unit vector), for lighting the figures. */
  readonly sunDir = new THREE.Vector3(1, 0, 0);

  constructor(scene: THREE.Scene) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY.radius, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.domeUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow;
          uniform float uGlowAmount; uniform vec3 uSunDir; varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = mix(uHorizon, uTop, smoothstep(-0.05, 0.45, h));
            float toSun = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))));
            float band = 1.0 - smoothstep(0.0, 0.35, abs(h - 0.05));
            c = mix(c, uGlow, uGlowAmount * band * pow(toSun, 3.0));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -3;
    this.dome.frustumCulled = false;

    // Stars: random points on the sky, they turn with the night.
    const rnd = mulberry32(99);
    const positions: number[] = [];
    for (let i = 0; i < SKY.stars; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      positions.push(r * Math.cos(a), u, r * Math.sin(a));
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        positions.map((v) => v * (SKY.radius - 2)),
        3,
      ),
    );
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
      }),
    );
    this.stars.renderOrder = -2;
    this.stars.frustumCulled = false;

    this.moon = sprite(this.moonTextures[0]!, SKY.moonSize);

    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(SKY.cloudSpan, SKY.cloudSpan),
      new THREE.MeshBasicMaterial({
        map: this.cloudMap,
        alphaMap: edgeFade(),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    const repeat = SKY.cloudSpan / (SKY.cloudPixels * SKY.cloudBlock);
    this.cloudMap.repeat.set(repeat, repeat);

    scene.add(this.dome, this.stars, this.sun, this.moon, this.clouds);
  }

  /**
   * Moves everything to the camera and colours it for the time of day.
   * `time` is 0…1 (0 = sunrise), `nowMs` the shared clock, `day` the day number.
   */
  update(camera: THREE.Camera, time: number, nowMs: number, day: number): void {
    const light = daylight(time);
    const glow = sunsetGlow(time);
    const cam = camera.position;

    this.domeUniforms.uTop.value.copy(this.nightColor).lerp(this.dayColor, light);
    this.horizon
      .copy(this.horizonNight)
      .lerp(this.horizonDay, light)
      .lerp(this.sunset, glow * 0.5);
    this.domeUniforms.uHorizon.value.copy(this.horizon);
    this.domeUniforms.uGlowAmount.value = glow;

    // The sun goes round from east (+x) over the top to west; the moon is opposite.
    const angle = time * Math.PI * 2;
    this.sunDir.set(Math.cos(angle), sunHeight(time), SKY.tilt).normalize();
    this.domeUniforms.uSunDir.value.copy(this.sunDir);
    this.dome.position.copy(cam);
    this.sun.position.copy(cam).addScaledVector(this.sunDir, SKY.radius - 10);
    this.moon.position.copy(cam).addScaledVector(this.sunDir, -(SKY.radius - 10));
    (this.moon.material as THREE.SpriteMaterial).map = this.moonTextures[moonPhase(day)]!;

    this.stars.position.copy(cam);
    this.stars.rotation.set(0, 0, angle);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - light * 1.6);

    // Clouds drift east; everyone sees the same clouds because it comes from the clock.
    const tile = SKY.cloudPixels * SKY.cloudBlock;
    // Kept small (the picture repeats), or the graphics card loses precision.
    const drift = ((nowMs / 1000) * SKY.cloudSpeed) % tile;
    this.clouds.position.set(cam.x, SKY.cloudHeight, cam.z);
    this.cloudMap.offset.set(((cam.x + drift) / tile) % 1, (-cam.z / tile) % 1);
    const material = this.clouds.material as THREE.MeshBasicMaterial;
    material.color.setScalar(0.1 + 0.9 * light).lerp(this.sunset, glow * 0.35);
  }

  setVisible(visible: boolean): void {
    this.clouds.visible = visible;
    this.stars.visible = visible;
  }
}
