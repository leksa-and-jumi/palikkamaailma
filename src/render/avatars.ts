// The other players: blocky animal figures with the animal's face on the head.

import * as THREE from 'three';
import { AVATARS, PLAYER } from '../config';
import { shadowMesh } from './mobRenderer';
import type { Gear, PlayerInfo } from '../logic/protocol';
import { getItem, type ArmorMaterial } from '../logic/items';
import { thirdPerson } from './heldItem';

/** Armor colours: the main colour and a darker edge. */
const ARMOR_COLORS: Record<ArmorMaterial, [number, number]> = {
  leather: [0x8b5a2b, 0x6b4220],
  iron: [0xdcdcdc, 0xa8a8a8],
  gold: [0xf6d045, 0xc99a1a],
  diamond: [0x56e8e0, 0x2aa8a8],
};

const FACE_PIXELS = 64;
/** How quickly a figure slides to its newest position (per second). */
const SMOOTHING = 12;
const WALK_SWING = 0.7;
const WALK_SPEED = 9;
const LABEL_HEIGHT = 0.55;
/** Guess ahead at most this long after an update (a bit over one update gap). */
const MAX_PREDICT_TIME = 0.3;
/** Updates further apart than this (s) mean the player had stopped. */
const MAX_PREDICT_GAP = 0.6;
/** Faster than this is a teleport, not walking (blocks per second). */
const MAX_PREDICT_SPEED = 20;

interface Figure {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  head: THREE.Mesh;
  /** Armor pieces and the held item (rebuilt when they change). */
  gear: THREE.Object3D[];
  gearKey: string;
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
  walk: number;
}

function emojiTexture(emoji: string, background: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_PIXELS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, FACE_PIXELS, FACE_PIXELS);
  ctx.font = `${FACE_PIXELS * 0.8}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, FACE_PIXELS / 2, FACE_PIXELS / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function colorFor(emoji: string): number {
  return AVATARS.find((a) => a.emoji === emoji)?.color ?? 0xffffff;
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  return mesh;
}

/** A limb that swings from its top end. */
function limb(w: number, h: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, w);
  geometry.translate(0, -h / 2, 0);
  return new THREE.Mesh(geometry, material);
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
    const color = colorFor(player.avatar);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const body = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color).multiplyScalar(0.7),
    });
    const plain = new THREE.MeshLambertMaterial({ color });
    const face = new THREE.MeshLambertMaterial({ map: emojiTexture(player.avatar, hex) });

    const group = new THREE.Group();
    const legHeight = 0.7;
    const torsoHeight = 0.65;
    const headSize = 0.5;

    const leftLeg = limb(0.22, legHeight, dark);
    const rightLeg = limb(0.22, legHeight, dark);
    leftLeg.position.set(-0.13, legHeight, 0);
    rightLeg.position.set(0.13, legHeight, 0);

    const torso = box(0.5, torsoHeight, 0.28, body);
    torso.position.y = legHeight + torsoHeight / 2;

    const leftArm = limb(0.18, 0.62, body);
    const rightArm = limb(0.18, 0.62, body);
    leftArm.position.set(-0.34, legHeight + torsoHeight, 0);
    rightArm.position.set(0.34, legHeight + torsoHeight, 0);

    // Box faces: +x, -x, +y, -y, +z, -z. The figure looks towards -z.
    const head = box(headSize, headSize, headSize, [plain, plain, plain, plain, plain, face]);
    head.position.y = legHeight + torsoHeight + headSize / 2;

    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: emojiTexture(player.avatar, 'rgba(0,0,0,0)'),
        depthTest: false,
      }),
    );
    label.scale.set(0.5, 0.5, 0.5);
    label.position.y = PLAYER.height + LABEL_HEIGHT;

    group.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, label, shadowMesh(PLAYER.width));
    group.position.set(...player.p);
    group.rotation.y = player.yaw;
    this.scene.add(group);

    this.figures.set(player.id, {
      group,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      head,
      gear: [],
      gearKey: '',
      target: new THREE.Vector3(...player.p),
      velocity: new THREE.Vector3(),
      lastUpdate: performance.now(),
      predicted: 0,
      safe: player.safe ?? false,
      targetYaw: player.yaw,
      targetPitch: player.pitch,
      walk: 0,
    });
    if (player.gear) this.setGear(player.id, player.gear);
  }

  /** Puts their armor on them and the item in their right hand. */
  setGear(id: string, gear: Gear): void {
    const f = this.figures.get(id);
    if (!f || gear.join() === f.gearKey) return;
    f.gearKey = gear.join();
    for (const part of f.gear) {
      part.removeFromParent();
      part.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of materials) (m as THREE.Material).dispose();
        }
      });
    }
    f.gear = [];
    const add = (parent: THREE.Object3D, part: THREE.Object3D) => {
      parent.add(part);
      f.gear.push(part);
    };
    const piece = (
      material: ArmorMaterial,
      size: [number, number, number],
      pos: [number, number, number],
      trim = false,
    ) => {
      const [main, edge] = ARMOR_COLORS[material];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshLambertMaterial({ color: trim ? edge : main }),
      );
      mesh.position.set(...pos);
      return mesh;
    };
    const materialOf = (itemId: number) => (itemId ? getItem(itemId)?.armor?.material : undefined);
    const [helmet, chest, legs, boots] = gear.slice(0, 4).map(materialOf);
    if (helmet) {
      // An open face, so the animal still shows.
      add(f.head, piece(helmet, [0.58, 0.14, 0.58], [0, 0.22, 0]));
      add(f.head, piece(helmet, [0.58, 0.44, 0.06], [0, 0, 0.27], true));
      add(f.head, piece(helmet, [0.06, 0.44, 0.58], [-0.28, 0, 0], true));
      add(f.head, piece(helmet, [0.06, 0.44, 0.58], [0.28, 0, 0], true));
      add(f.head, piece(helmet, [0.58, 0.07, 0.06], [0, 0.18, -0.27]));
    }
    if (chest) {
      add(f.group, piece(chest, [0.56, 0.6, 0.34], [0, 0.7 + 0.34, 0]));
      add(f.group, piece(chest, [0.12, 0.5, 0.36], [0, 0.7 + 0.34, 0], true));
      add(f.leftArm, piece(chest, [0.23, 0.28, 0.23], [0, -0.12, 0]));
      add(f.rightArm, piece(chest, [0.23, 0.28, 0.23], [0, -0.12, 0]));
    }
    if (legs) {
      add(f.group, piece(legs, [0.54, 0.12, 0.32], [0, 0.74, 0], true));
      add(f.leftLeg, piece(legs, [0.26, 0.48, 0.26], [0, -0.24, 0]));
      add(f.rightLeg, piece(legs, [0.26, 0.48, 0.26], [0, -0.24, 0]));
    }
    if (boots) {
      add(f.leftLeg, piece(boots, [0.27, 0.2, 0.29], [0, -0.6, -0.02]));
      add(f.rightLeg, piece(boots, [0.27, 0.2, 0.29], [0, -0.6, -0.02]));
    }
    const item = gear[4] ? thirdPerson(gear[4]) : null;
    if (item) {
      item.position.y = -0.6;
      add(f.rightArm, item);
    }
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
    for (const f of this.figures.values()) {
      // Keep moving the way they were going until the next update arrives.
      if (f.predicted < MAX_PREDICT_TIME) {
        f.target.addScaledVector(f.velocity, dt);
        f.predicted += dt;
      }
      const before = f.group.position.clone();
      f.group.position.lerp(f.target, t);
      // Turn the short way round.
      let dy = f.targetYaw - f.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.group.rotation.y += dy * t;
      f.head.rotation.x = f.targetPitch;

      const speed = Math.hypot(f.group.position.x - before.x, f.group.position.z - before.z) / dt;
      f.walk += dt * WALK_SPEED * Math.min(1, speed / PLAYER.walkSpeed);
      const swing = Math.sin(f.walk) * WALK_SWING * Math.min(1, speed / 2);
      f.leftLeg.rotation.x = swing;
      f.rightLeg.rotation.x = -swing;
      f.leftArm.rotation.x = -swing;
      f.rightArm.rotation.x = swing;
    }
  }
}
