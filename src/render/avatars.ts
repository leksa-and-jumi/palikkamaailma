// The other players: Minecraft-style figures in their animal costumes
// (src/render/playerModel.ts), with the animal's name above the head.
// Their position comes 5 times a second; in between they glide and their
// movement is guessed, so walking looks smooth.

import * as THREE from 'three';
import { AVATARS, PLAYER } from '../config';
import { shadowMesh } from './mobRenderer';
import type { Gear, PlayerAct, PlayerInfo, PlayerPoseName } from '../logic/protocol';
import { PlayerModel } from './playerModel';

/** How quickly a figure slides to its newest position (per second). */
const SMOOTHING = 12;
const LABEL_HEIGHT = 0.55;
/** Guess ahead at most this long after an update (a bit over one update gap). */
const MAX_PREDICT_TIME = 0.3;
/** Updates further apart than this (s) mean the player had stopped. */
const MAX_PREDICT_GAP = 0.6;
/** Faster than this is a teleport, not walking (blocks per second). */
const MAX_PREDICT_SPEED = 20;

interface Figure {
  group: THREE.Group;
  model: PlayerModel;
  target: THREE.Vector3;
  /** Speed worked out from the last two updates, to guess where they are now. */
  velocity: THREE.Vector3;
  lastUpdate: number;
  /** Seconds predicted since the last update. */
  predicted: number;
  /** In creative (monsters leave them alone). */
  safe: boolean;
  lastReported?: THREE.Vector3;
  targetYaw: number;
  targetPitch: number;
  pose: PlayerPoseName | undefined;
  /** Smoothed speeds for the animation. */
  speed: number;
  vy: number;
}

/** The animal's name on a little dark tag. */
function nameTag(avatar: string): THREE.Sprite {
  const name = AVATARS.find((a) => a.emoji === avatar)?.name ?? '';
  const text = name.charAt(0).toUpperCase() + name.slice(1);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 34px "Pixelify Sans", system-ui, sans-serif';
  const width = Math.min(240, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(128 - width / 2, 8, width, 48, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(1.2, 0.3, 1);
  return sprite;
}

export class OtherPlayers {
  private readonly figures = new Map<string, Figure>();

  constructor(private readonly scene: THREE.Scene) {}

  get count(): number {
    return this.figures.size;
  }

  /** Where the other players are (for creatures that follow or avoid them). */
  positions(): {
    id: string;
    x: number;
    y: number;
    z: number;
    safe: boolean;
    yaw: number;
    pitch: number;
    vx: number;
    vz: number;
  }[] {
    return [...this.figures.entries()].map(([id, f]) => ({
      id,
      x: f.group.position.x,
      y: f.group.position.y,
      z: f.group.position.z,
      safe: f.safe,
      yaw: f.targetYaw,
      pitch: f.targetPitch,
      vx: f.velocity.x,
      vz: f.velocity.z,
    }));
  }

  add(player: PlayerInfo): void {
    this.remove(player.id);
    const group = new THREE.Group();
    const model = new PlayerModel(player.avatar);
    const label = nameTag(player.avatar);
    label.position.y = PLAYER.height + LABEL_HEIGHT;
    group.add(model.group, label, shadowMesh(PLAYER.width));
    group.position.set(...player.p);
    this.scene.add(group);
    this.figures.set(player.id, {
      group,
      model,
      target: new THREE.Vector3(...player.p),
      velocity: new THREE.Vector3(),
      lastUpdate: performance.now(),
      predicted: 0,
      safe: player.safe ?? false,
      targetYaw: player.yaw,
      targetPitch: player.pitch,
      pose: player.pose,
      speed: 0,
      vy: 0,
    });
    if (player.gear) model.setGear(player.gear);
  }

  /** Puts their armor on them and the item in their right hand. */
  setGear(id: string, gear: Gear): void {
    this.figures.get(id)?.model.setGear(gear);
  }

  /** Crouching or flying (sent when it changes). */
  setPose(id: string, pose: PlayerPoseName | undefined): void {
    const f = this.figures.get(id);
    if (f) f.pose = pose;
  }

  /** They swung their arm or got hurt. */
  act(id: string, act: PlayerAct): void {
    const f = this.figures.get(id);
    if (!f) return;
    if (act === 'hurt') f.model.hurt();
    else f.model.swing();
  }

  /** They said something: the mouth moves. */
  talk(id: string, text: string): void {
    this.figures.get(id)?.model.talk(Math.min(4, 0.6 + text.length * 0.06));
  }

  move(id: string, p: [number, number, number], yaw: number, pitch: number, safe = false): void {
    const figure = this.figures.get(id);
    if (!figure) return;
    figure.safe = safe;
    const now = performance.now();
    const seconds = Math.max(0.05, (now - figure.lastUpdate) / 1000);
    const next = new THREE.Vector3(...p);
    // Only trust the speed if updates come regularly (not after standing still).
    if (seconds < MAX_PREDICT_GAP) {
      figure.velocity
        .copy(next)
        .sub(figure.lastReported ?? next)
        .divideScalar(seconds);
      figure.velocity.clampLength(0, MAX_PREDICT_SPEED);
      // Never guess up or down: a guessed jump left figures floating in the air.
      figure.velocity.y = 0;
    } else {
      figure.velocity.set(0, 0, 0);
    }
    figure.lastReported = next.clone();
    figure.lastUpdate = now;
    figure.predicted = 0;
    figure.target.copy(next);
    figure.targetYaw = yaw;
    figure.targetPitch = pitch;
  }

  remove(id: string): void {
    const figure = this.figures.get(id);
    if (!figure) return;
    this.scene.remove(figure.group);
    figure.model.dispose();
    figure.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.figures.delete(id);
  }

  clear(): void {
    for (const id of [...this.figures.keys()]) this.remove(id);
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-SMOOTHING * dt);
    const ease = 1 - Math.exp(-8 * dt);
    for (const f of this.figures.values()) {
      // Keep moving the way they were going until the next update arrives.
      if (f.predicted < MAX_PREDICT_TIME) {
        f.target.addScaledVector(f.velocity, dt);
        f.predicted += dt;
      }
      const before = f.group.position.clone();
      f.group.position.lerp(f.target, t);
      const moved = f.group.position.clone().sub(before);
      const speed = dt > 0 ? Math.hypot(moved.x, moved.z) / dt : 0;
      const vy = dt > 0 ? moved.y / dt : 0;
      f.speed += (speed - f.speed) * ease;
      f.vy += (vy - f.vy) * ease;
      const fly = f.pose === 'fly';
      f.model.update(dt, {
        lookYaw: f.targetYaw,
        pitch: f.targetPitch,
        speed: f.speed,
        vy: f.vy,
        onGround: !fly && Math.abs(f.vy) < 1.2,
        sneak: f.pose === 'sneak',
        fly,
      });
    }
  }
}
