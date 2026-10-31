// A player as a Minecraft-style blocky figure that feels alive: the head
// turns to where they look and the body follows lazily, arms and legs swing
// when walking (more when running), they crouch, jump and fly, swing their
// arm when hitting, blink, talk, wince when hurt and smile. Tails wag and
// long ears sway. Armor is painted in detail (plates, rivets, shine) and
// sits over the costume; the held item is in the right hand.

import * as THREE from 'three';
import { PLAYER } from '../config';
import { getItem, type ArmorMaterial } from '../logic/items';
import type { Gear } from '../logic/protocol';
import { thirdPerson } from './heldItem';
import {
  Atlas,
  BODY,
  SIDES,
  fabric,
  makeSkin,
  type Expression,
  type Rect,
  type Size,
  type Skin,
} from './skins';

/** World units per Minecraft pixel (a player is 32 pixels high). */
export const PX = PLAYER.height / 32;

const BLINK_EVERY: [number, number] = [2.5, 6];
const BLINK_TIME = 0.14;
const SWING_TIME = 0.32;
const HURT_TIME = 0.45;
const HEAD_TURN = 1.2;
/** The body turns after the head when the head has turned this far. */
const BODY_LAG = 0.75;

/** How the figure is moving right now (from its owner). */
export interface PlayerPose {
  /** Where they look (radians, 0 = -z). */
  lookYaw: number;
  pitch: number;
  /** Horizontal speed (blocks per second). */
  speed: number;
  /** Up/down speed. */
  vy: number;
  onGround: boolean;
  sneak?: boolean;
  fly?: boolean;
  /** Keeps the body facing this way (a preview); only the head turns. */
  bodyYaw?: number;
}

interface Pivot {
  group: THREE.Group;
  /** Its rest position (for bobbing). */
  rest: THREE.Vector3;
}

// --- Armor ---------------------------------------------------------------------

const ARMOR: Record<ArmorMaterial, { base: number; dark: number; light: number; accent: number }> =
  {
    leather: { base: 0x8b5a2b, dark: 0x5e3a1a, light: 0xb07a40, accent: 0xe0b878 },
    iron: { base: 0xd4d6da, dark: 0x8e9298, light: 0xffffff, accent: 0x6a6e74 },
    gold: { base: 0xf2c63a, dark: 0xc08a14, light: 0xfff2a0, accent: 0xa86c08 },
    diamond: { base: 0x4fe0d8, dark: 0x22a0a0, light: 0xd8fffc, accent: 0x167070 },
  };

/** Armor boxes, in Minecraft pixels. */
const ARMOR_BOXES: Readonly<Record<string, Size>> = {
  helmet: [8, 8, 8],
  chest: [8, 12, 4],
  shoulder: [4, 6, 4],
  belt: [8, 3, 4],
  legging: [4, 8, 4],
  boot: [4, 4, 4],
};

const armorCache = new Map<ArmorMaterial, { atlas: Atlas; material: THREE.MeshLambertMaterial }>();

function css(c: number, k = 1): string {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * k) | 0;
  const b = Math.min(255, (c & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
}

/** A metal (or leather) plate: shine on top, shadow below, rivets in the corners. */
function plate(ctx: CanvasRenderingContext2D, r: Rect, m: ArmorMaterial, rivets = true): void {
  const c = ARMOR[m];
  fabric(ctx, r, c.base, { noise: m === 'leather' ? 0.08 : 0.04, edge: 0.78, seed: 21 });
  ctx.fillStyle = css(c.light);
  ctx.fillRect(r.x + 1, r.y, r.w - 2, 1);
  ctx.fillStyle = css(c.dark);
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  if (rivets && r.w >= 6 && r.h >= 6 && m !== 'leather') {
    ctx.fillStyle = css(c.accent);
    for (const [x, y] of [
      [1, 1],
      [r.w - 2, 1],
      [1, r.h - 2],
      [r.w - 2, r.h - 2],
    ] as const) {
      ctx.fillRect(r.x + x, r.y + y, 1, 1);
    }
  }
  if (m === 'leather') {
    // Stitches along the edges.
    ctx.fillStyle = css(c.accent);
    for (let x = 1; x < r.w - 1; x += 2) ctx.fillRect(r.x + x, r.y + 1, 1, 1);
  }
  if (m === 'diamond' || m === 'gold') {
    // A few sparkles.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < Math.max(1, (r.w * r.h) / 40); i++) {
      const x = (i * 7 + r.x * 3) % Math.max(1, r.w - 2);
      const y = (i * 5 + r.y * 2) % Math.max(1, r.h - 2);
      ctx.fillRect(r.x + 1 + x, r.y + 1 + y, 1, 1);
    }
  }
}

function armorFor(m: ArmorMaterial): { atlas: Atlas; material: THREE.MeshLambertMaterial } {
  let made = armorCache.get(m);
  if (made) return made;
  const atlas = new Atlas(128);
  for (const [name, size] of Object.entries(ARMOR_BOXES)) atlas.add(name, size);
  const ctx = atlas.finish();
  const c = ARMOR[m];
  for (const [name] of Object.entries(ARMOR_BOXES)) {
    const reg = atlas.regions.get(name)!;
    for (const side of SIDES) plate(ctx, reg[side], m, name !== 'boot');
  }
  // Helmet: an opening for the face, a brow ridge and cheek guards.
  const front = atlas.regions.get('helmet')!.front;
  ctx.clearRect(front.x + 3, front.y + 6, front.w - 6, front.h - 6);
  ctx.fillStyle = css(c.dark);
  ctx.fillRect(front.x + 2, front.y + 5, front.w - 4, 1);
  ctx.fillStyle = css(c.light);
  ctx.fillRect(front.x + 7, front.y + 1, 2, 4);
  ctx.clearRect(
    atlas.regions.get('helmet')!.bottom.x,
    atlas.regions.get('helmet')!.bottom.y,
    16,
    16,
  );
  // Chestplate: a ridge down the middle and two plates.
  const chest = atlas.regions.get('chest')!.front;
  ctx.fillStyle = css(c.dark);
  ctx.fillRect(chest.x + 7, chest.y + 2, 2, chest.h - 4);
  ctx.fillRect(chest.x + 2, chest.y + 11, chest.w - 4, 1);
  ctx.fillStyle = css(c.light);
  ctx.fillRect(chest.x + 3, chest.y + 3, 3, 1);
  ctx.fillRect(chest.x + 10, chest.y + 3, 3, 1);
  // Boots: a darker sole.
  for (const side of SIDES) {
    const r = atlas.regions.get('boot')![side];
    if (side === 'top') {
      ctx.clearRect(r.x, r.y, r.w, r.h);
      continue;
    }
    ctx.fillStyle = css(c.dark, 0.8);
    ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  }
  // Belt: a buckle.
  const belt = atlas.regions.get('belt')!.front;
  ctx.fillStyle = css(c.accent);
  ctx.fillRect(belt.x + 6, belt.y + 1, 4, 4);
  ctx.fillStyle = css(c.light);
  ctx.fillRect(belt.x + 7, belt.y + 2, 2, 2);
  const texture = new THREE.CanvasTexture(atlas.canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });
  made = { atlas, material };
  armorCache.set(m, made);
  return made;
}

// --- The model ---------------------------------------------------------------------

export class PlayerModel {
  /** Put this in the scene; its position is the feet. */
  readonly group = new THREE.Group();
  private readonly skin: Skin;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly hips = new THREE.Group();
  private readonly head: Pivot;
  private readonly body: Pivot;
  private readonly armR: Pivot;
  private readonly armL: Pivot;
  private readonly legR: Pivot;
  private readonly legL: Pivot;
  private readonly wagging: { group: THREE.Group; tilt: THREE.Euler; i: number }[] = [];
  private gearParts: THREE.Object3D[] = [];
  /** Costume parts a helmet covers (the lion's mane). */
  private readonly underHelmet: THREE.Object3D[] = [];
  private gearKey = '';
  private holding = false;
  private bodyYaw: number | null = null;
  private headYaw = 0;
  private walk = 0;
  private time = Math.random() * 10;
  private blinkIn = 2;
  private swingTime = SWING_TIME;
  private hurtTime = HURT_TIME;
  private talkLeft = 0;
  private waveLeft = 0;
  private happyLeft = 0;
  private sneakAmount = 0;
  private flyAmount = 0;
  private airAmount = 0;

  constructor(avatar: string) {
    this.skin = makeSkin(avatar);
    this.material = new THREE.MeshLambertMaterial({ map: this.skin.texture });
    const box = (name: string, size: Size) =>
      new THREE.Mesh(this.skin.atlas.geometry(name, size, PX), this.material);
    const pivot = (parent: THREE.Object3D, at: [number, number, number]): Pivot => {
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      group.position.set(at[0] * PX, at[1] * PX, at[2] * PX);
      parent.add(group);
      return { group, rest: group.position.clone() };
    };
    this.group.add(this.hips);
    // Legs hang from the hips; the upper body turns at the hips too (crouching).
    this.legR = pivot(this.hips, [2, 12, 0]);
    this.legL = pivot(this.hips, [-2, 12, 0]);
    this.body = pivot(this.hips, [0, 12, 0]);
    this.head = pivot(this.body.group, [0, 12, 0]);
    this.armR = pivot(this.body.group, [6, 10, 0]);
    this.armL = pivot(this.body.group, [-6, 10, 0]);
    const place = (
      mesh: THREE.Object3D,
      p: Pivot,
      centre: [number, number, number],
      origin: [number, number, number],
    ) => {
      mesh.position.set(
        (centre[0] - origin[0]) * PX,
        (centre[1] - origin[1]) * PX,
        (centre[2] - origin[2]) * PX,
      );
      p.group.add(mesh);
    };
    place(box('legR', BODY.legR!), this.legR, [2, 6, 0], [2, 12, 0]);
    place(box('legL', BODY.legL!), this.legL, [-2, 6, 0], [-2, 12, 0]);
    place(box('body', BODY.body!), this.body, [0, 18, 0], [0, 12, 0]);
    place(box('head', BODY.head!), this.head, [0, 28, 0], [0, 24, 0]);
    place(box('armR', BODY.armR!), this.armR, [6, 18, 0], [6, 22, 0]);
    place(box('armL', BODY.armL!), this.armL, [-6, 18, 0], [-6, 22, 0]);
    // Costume extras: ears and hood bits on the head, tails on the body.
    this.skin.extras.forEach((e, i) => {
      const mesh = box(e.name, e.size);
      if (e.name.startsWith('mane')) this.underHelmet.push(mesh);
      const on = e.on === 'head' ? this.head : this.body;
      const origin: [number, number, number] = e.on === 'head' ? [0, 24, 0] : [0, 12, 0];
      if (e.wag || e.tilt) {
        // Tails turn from where they join the body, ears from their base.
        const joint: [number, number, number] =
          e.on === 'body'
            ? [e.pos[0], e.pos[1], e.pos[2] - e.size[2] / 2]
            : [e.pos[0], e.pos[1] - e.size[1] / 2, e.pos[2]];
        const g = new THREE.Group();
        g.position.set(
          (joint[0] - origin[0]) * PX,
          (joint[1] - origin[1]) * PX,
          (joint[2] - origin[2]) * PX,
        );
        const tilt = new THREE.Euler(...(e.tilt ?? [0, 0, 0]));
        g.rotation.copy(tilt);
        mesh.position.set(
          (e.pos[0] - joint[0]) * PX,
          (e.pos[1] - joint[1]) * PX,
          (e.pos[2] - joint[2]) * PX,
        );
        g.add(mesh);
        on.group.add(g);
        if (e.wag) this.wagging.push({ group: g, tilt, i });
      } else {
        place(mesh, on, e.pos, origin);
      }
    });
  }

  /** Armor and the item in the right hand. */
  setGear(gear: Gear | null): void {
    const key = gear?.join() ?? '';
    if (key === this.gearKey) return;
    this.gearKey = key;
    for (const part of this.gearParts) {
      part.removeFromParent();
      part.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.gearParts = [];
    for (const part of this.underHelmet) part.visible = true;
    if (!gear) return;
    const materialOf = (id: number) => (id ? getItem(id)?.armor?.material : undefined);
    const add = (
      p: Pivot,
      name: string,
      centre: [number, number, number],
      origin: [number, number, number],
      m: ArmorMaterial,
      inflate: number,
    ) => {
      const { atlas, material } = armorFor(m);
      const mesh = new THREE.Mesh(atlas.geometry(name, ARMOR_BOXES[name]!, PX, inflate), material);
      mesh.position.set(
        (centre[0] - origin[0]) * PX,
        (centre[1] - origin[1]) * PX,
        (centre[2] - origin[2]) * PX,
      );
      p.group.add(mesh);
      this.gearParts.push(mesh);
    };
    const [helmet, chest, legs, boots] = gear.slice(0, 4).map(materialOf);
    for (const part of this.underHelmet) part.visible = !helmet;
    if (helmet) add(this.head, 'helmet', [0, 28, 0], [0, 24, 0], helmet, 1.1);
    if (chest) {
      add(this.body, 'chest', [0, 18, 0], [0, 12, 0], chest, 1);
      add(this.armR, 'shoulder', [6, 21, 0], [6, 22, 0], chest, 1.1);
      add(this.armL, 'shoulder', [-6, 21, 0], [-6, 22, 0], chest, 1.1);
    }
    if (legs) {
      add(this.body, 'belt', [0, 13.5, 0], [0, 12, 0], legs, 1.2);
      add(this.legR, 'legging', [2, 7.5, 0], [2, 12, 0], legs, 0.8);
      add(this.legL, 'legging', [-2, 7.5, 0], [-2, 12, 0], legs, 0.8);
    }
    if (boots) {
      add(this.legR, 'boot', [2, 2, -0.2], [2, 12, 0], boots, 1);
      add(this.legL, 'boot', [-2, 2, -0.2], [-2, 12, 0], boots, 1);
    }
    const item = gear[4] ? thirdPerson(gear[4]) : null;
    this.holding = !!item;
    if (item) {
      item.position.y = -10.5 * PX;
      this.armR.group.add(item);
      this.gearParts.push(item);
    }
  }

  /** The right arm swings (hitting, digging, placing). */
  swing(): void {
    if (this.swingTime >= SWING_TIME * 0.5) this.swingTime = 0;
  }

  hurt(): void {
    this.hurtTime = 0;
  }

  /** The mouth moves for this long (they said something in the chat). */
  talk(seconds: number): void {
    this.talkLeft = Math.max(this.talkLeft, seconds);
  }

  /** Waves hello and smiles. */
  wave(seconds = 1.6): void {
    this.waveLeft = seconds;
    this.happyLeft = seconds + 0.6;
  }

  update(dt: number, pose: PlayerPose): void {
    this.time += dt;
    const t = this.time;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);

    // The head looks where they look; the body follows when the head turns far or when walking.
    if (pose.bodyYaw !== undefined) this.bodyYaw = pose.bodyYaw;
    if (this.bodyYaw === null) this.bodyYaw = pose.lookYaw;
    let diff = Math.atan2(
      Math.sin(pose.lookYaw - this.bodyYaw),
      Math.cos(pose.lookYaw - this.bodyYaw),
    );
    const walking = Math.min(1, pose.speed / 3);
    if (pose.bodyYaw === undefined && (Math.abs(diff) > BODY_LAG || walking > 0.2)) {
      const follow = walking > 0.2 ? 8 : 3;
      this.bodyYaw += diff * k(follow);
      diff = Math.atan2(
        Math.sin(pose.lookYaw - this.bodyYaw),
        Math.cos(pose.lookYaw - this.bodyYaw),
      );
    }
    this.group.rotation.y = this.bodyYaw;
    this.headYaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, diff));

    // Smooth pose changes.
    this.sneakAmount += ((pose.sneak ? 1 : 0) - this.sneakAmount) * k(12);
    this.flyAmount += ((pose.fly && !pose.onGround ? 1 : 0) - this.flyAmount) * k(6);
    const inAir = !pose.onGround && !pose.fly;
    this.airAmount += ((inAir ? 1 : 0) - this.airAmount) * k(10);

    // Walking: faster and wider steps when running.
    const running = Math.min(1, Math.max(0, (pose.speed - 5) / 2));
    this.walk += dt * pose.speed * (2.2 - running * 0.5) * (1 - this.flyAmount);
    const step = Math.sin(this.walk);
    const swingAmount =
      (0.15 + walking * 0.75 + running * 0.35) *
      Math.min(1, pose.speed / 1.5) *
      (1 - this.flyAmount);
    const sneak = this.sneakAmount;

    // Hips go down when crouching; a little bob with every step; floating while flying.
    this.hips.position.y =
      -sneak * 2.5 * PX -
      Math.abs(Math.cos(this.walk)) * 0.6 * PX * walking +
      Math.sin(t * 2) * 0.8 * PX * this.flyAmount;
    this.body.group.rotation.x = -sneak * 0.5 - running * 0.12;
    this.body.group.rotation.y = 0;
    // Breathing.
    this.body.group.scale.set(1, 1 + Math.sin(t * 2.2) * 0.008, 1 + Math.sin(t * 2.2) * 0.012);

    // Legs.
    const air = this.airAmount;
    this.legR.group.rotation.x = step * swingAmount + air * 0.35 + this.flyAmount * 0.12;
    this.legL.group.rotation.x = -step * swingAmount - air * 0.2 + this.flyAmount * 0.18;
    this.legR.group.rotation.z = air * 0.06;
    this.legL.group.rotation.z = -air * 0.06;
    this.legR.group.position.z = this.legR.rest.z + sneak * 2 * PX;
    this.legL.group.position.z = this.legL.rest.z + sneak * 2 * PX;

    // Arms: swing with the legs, sway a little when standing (like Minecraft).
    const idleX = Math.sin(t * 1.1) * 0.05;
    const idleZ = (Math.cos(t * 0.9) * 0.5 + 0.5) * 0.06;
    let rx = -step * swingAmount * 0.9 + idleX + (this.holding ? 0.25 : 0) + air * 0.2;
    let ry = 0;
    let rz = idleZ + air * 0.35 + this.flyAmount * 0.15;
    // Swing: up and across, the body twisting along.
    if (this.swingTime < SWING_TIME) {
      this.swingTime += dt;
      const s = Math.sin(Math.min(1, this.swingTime / SWING_TIME) * Math.PI);
      rx += s * 1.9;
      ry -= s * 0.5;
      this.body.group.rotation.y = -s * 0.25;
    }
    // Waving hello.
    if (this.waveLeft > 0) {
      this.waveLeft -= dt;
      const up = Math.min(1, this.waveLeft * 4, 0.999);
      rx = rx * (1 - up) + up * 0.15;
      rz = rz * (1 - up) + up * (2.6 + Math.sin(t * 12) * 0.35);
    }
    this.armR.group.rotation.set(rx, ry, rz);
    this.armL.group.rotation.set(
      step * swingAmount * 0.9 - idleX + air * 0.2,
      0,
      -idleZ - air * 0.35 - this.flyAmount * 0.15,
    );

    // Head: look, nod while talking, jerk back when hurt.
    const hurt = this.hurtTime < HURT_TIME ? 1 - this.hurtTime / HURT_TIME : 0;
    this.hurtTime += dt;
    this.talkLeft = Math.max(0, this.talkLeft - dt);
    this.happyLeft = Math.max(0, this.happyLeft - dt);
    const nod = this.talkLeft > 0 ? Math.sin(t * 9) * 0.06 : 0;
    this.head.group.rotation.y += (this.headYaw - this.head.group.rotation.y) * k(14);
    this.head.group.rotation.x +=
      (pose.pitch * 0.9 + nod + hurt * 0.35 + sneak * 0.45 - this.head.group.rotation.x) * k(14);
    this.head.group.rotation.z = Math.sin(t * 0.7) * 0.02;

    // Tails wag (faster when walking), long ears and tentacles sway.
    for (const w of this.wagging) {
      w.group.rotation.set(
        w.tilt.x + Math.sin(t * 2.4 + w.i) * 0.08 - walking * 0.15,
        w.tilt.y + Math.sin(t * (3 + walking * 5) + w.i) * (0.25 + walking * 0.2),
        w.tilt.z + Math.sin(t * 1.7 + w.i * 1.3) * 0.06,
      );
    }

    // Face.
    this.blinkIn -= dt;
    if (this.blinkIn < -BLINK_TIME) {
      this.blinkIn = BLINK_EVERY[0] + Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0]);
    }
    const mood: Expression =
      hurt > 0
        ? 'hurt'
        : this.talkLeft > 0
          ? Math.sin(t * 16) > 0
            ? 'talk'
            : 'normal'
          : this.happyLeft > 0
            ? 'happy'
            : this.blinkIn < 0
              ? 'blink'
              : 'normal';
    this.skin.setExpression(mood);
    // A red flash when hurt (armor too).
    this.material.emissive.setRGB(hurt * 0.6, 0, 0);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.material.dispose();
    this.skin.texture.dispose();
  }
}

/** Gear as numbers from an inventory: helmet, chest, legs, boots, hand. */
export function gearOf(
  armor: readonly ({ id: number } | null)[],
  held: { id: number } | null,
): Gear {
  const id = (s: { id: number } | null | undefined) => s?.id ?? 0;
  return [id(armor[0]), id(armor[1]), id(armor[2]), id(armor[3]), id(held)];
}
