// The other players: blocky animal figures with the animal's face on the head.

import * as THREE from 'three';
import { AVATARS, PLAYER } from '../config';
import type { PlayerInfo } from '../logic/protocol';

const FACE_PIXELS = 64;
/** How quickly a figure slides to its newest position (per second). */
const SMOOTHING = 12;
const WALK_SWING = 0.7;
const WALK_SPEED = 9;
const LABEL_HEIGHT = 0.55;

interface Figure {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  head: THREE.Mesh;
  target: THREE.Vector3;
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

    group.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, label);
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
      target: new THREE.Vector3(...player.p),
      targetYaw: player.yaw,
      targetPitch: player.pitch,
      walk: 0,
    });
  }

  move(id: string, p: [number, number, number], yaw: number, pitch: number): void {
    const figure = this.figures.get(id);
    if (!figure) return;
    figure.target.set(...p);
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
