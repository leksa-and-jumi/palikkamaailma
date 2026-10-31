// Draws the mods' own characters (only on this computer, never stored).
// They are built from boxes like the creatures, but they come alive: pixel
// faces blink, get angry and wince, mouths move while they talk, heads turn
// to look at you, legs and arms swing, capes wave, wings flap and spider
// legs scuttle. Parts that glow ignore the darkness, so eyes and lanterns
// shine at night.

import * as THREE from 'three';
import type {
  ActorAct,
  ActorPart,
  ActorSpec,
  ActorState,
  FaceMood,
  FaceSpec,
  PartMove,
} from '../mods/types';
import { shadowMesh } from './mobRenderer';

const SMOOTHING = 14;
const SNAP = 4;
/** How long an attack, a hurt or a spell shows (seconds). */
const ACT_TIME: Record<ActorAct, number> = { attack: 0.6, hurt: 0.5, cast: 1 };
/** Blinks come every few seconds and last a moment. */
const BLINK_EVERY: [number, number] = [2.2, 5];
const BLINK_TIME = 0.14;
/** A head turns at most this far from the body to look at you (radians). */
const HEAD_TURN = 1.1;
const HEAD_TILT = 0.45;
/** Faster than this (blocks per second) counts as walking. */
const WALK_MIN = 0.25;
const FACE_PIXEL = 16;

interface MovingPart {
  pivot: THREE.Group;
  part: ActorPart;
  move: PartMove;
}

interface Face {
  material: THREE.MeshLambertMaterial;
  glow: THREE.MeshBasicMaterial | null;
  textures: Map<FaceMood, { base: THREE.Texture; glow: THREE.Texture | null }>;
  mood: FaceMood;
}

interface Actor {
  group: THREE.Group;
  /** Everything but the shadow: it bobs, leans and floats. */
  body: THREE.Group;
  /** Where it should be (it glides there: updates from the host come 5 times a second). */
  target: THREE.Vector3;
  spec: ActorSpec;
  state: ActorState;
  label: THREE.Sprite | null;
  labelText: string;
  moving: MovingPart[];
  faces: Face[];
  /** Materials that flash red when it gets hurt. */
  tintable: THREE.MeshLambertMaterial[];
  flickers: { material: THREE.MeshBasicMaterial; color: THREE.Color }[];
  /** Walking: how far along the step, and how fast it goes now. */
  stride: number;
  speed: number;
  last: THREE.Vector3;
  act: ActorAct | null;
  actTime: number;
  blinkIn: number;
  age: number;
  /** A random start, so two characters never move in step. */
  seed: number;
}

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** One expression as two pictures: the face on the part, and what glows. */
function faceTextures(
  face: FaceSpec,
  rows: readonly string[],
  base: number,
): { base: THREE.Texture; glow: THREE.Texture | null } {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const draw = (glowing: boolean): THREE.Texture | null => {
    const canvas = document.createElement('canvas');
    canvas.width = w * FACE_PIXEL;
    canvas.height = h * FACE_PIXEL;
    const ctx = canvas.getContext('2d')!;
    if (!glowing) {
      ctx.fillStyle = hex(base);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // A little pixel noise, like the blocks.
      for (let i = 0; i < w * h; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        ctx.fillRect((i % w) * FACE_PIXEL, Math.floor(i / w) * FACE_PIXEL, FACE_PIXEL, FACE_PIXEL);
      }
    }
    let any = false;
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = face.colors[ch];
        if (!color) return;
        const shines = face.glow?.includes(ch) ?? false;
        if (shines !== glowing && !(glowing === false && shines)) return;
        ctx.fillStyle = color;
        ctx.fillRect(x * FACE_PIXEL, y * FACE_PIXEL, FACE_PIXEL, FACE_PIXEL);
        any ||= shines === glowing;
      });
    });
    if (glowing && !any) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  };
  return { base: draw(false)!, glow: draw(true) };
}

/** Where a part turns: limbs from the top, heads from the bottom, wings from the body. */
function pivotOf(part: ActorPart): [number, number, number] {
  if (part.pivot) return part.pivot;
  const [sx, sy] = part.size;
  const [x, y, z] = part.pos;
  switch (part.move) {
    case 'head':
      return [x, y - sy / 2, z];
    case 'wingL':
    case 'crawlL':
      return [x + sx / 2, y, z];
    case 'wingR':
    case 'crawlR':
      return [x - sx / 2, y, z];
    case 'spin':
    case 'pulse':
      return [x, y, z];
    default:
      return [x, y + sy / 2, z];
  }
}

/** 0 → 1 → 0 over an act: quick out, slower back. */
function actCurve(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
}

export class ModActors {
  private readonly actors = new Map<string, Actor>();
  private time = 0;
  private talkLeft = 0;

  constructor(private readonly scene: THREE.Scene) {}

  private build(
    spec: ActorSpec,
  ): Pick<Actor, 'body' | 'moving' | 'faces' | 'tintable' | 'flickers'> {
    const body = new THREE.Group();
    const moving: MovingPart[] = [];
    const faces: Face[] = [];
    const tintable: THREE.MeshLambertMaterial[] = [];
    const flickers: Actor['flickers'] = [];
    // Heads come first, so parts on a head (a crown, a jaw) can ride along.
    const heads: { part: ActorPart; pivot: THREE.Group }[] = [];
    const ordered = [...spec.parts].sort(
      (a, b) => (b.move === 'head' ? 1 : 0) - (a.move === 'head' ? 1 : 0),
    );
    for (const part of ordered) {
      const see = part.alpha !== undefined && part.alpha < 1;
      let mesh: THREE.Mesh;
      const geometry = shapeGeometry(part);
      if (part.shader === 'smoke') {
        mesh = new THREE.Mesh(geometry, smokeMaterial(part));
      } else if (part.glow) {
        const material = new THREE.MeshBasicMaterial({
          color: part.color,
          transparent: see,
          opacity: part.alpha ?? 1,
        });
        if (part.flicker) flickers.push({ material, color: new THREE.Color(part.color) });
        mesh = new THREE.Mesh(geometry, material);
      } else {
        const material = new THREE.MeshLambertMaterial({
          color: part.color,
          transparent: see,
          opacity: part.alpha ?? 1,
          depthWrite: !see,
        });
        tintable.push(material);
        if (part.face) {
          // The front (-z) side gets the face picture.
          const front = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: see,
            opacity: part.alpha ?? 1,
            depthWrite: !see,
          });
          tintable.push(front);
          mesh = new THREE.Mesh(geometry, [
            material,
            material,
            material,
            material,
            material,
            front,
          ]);
          const textures: Face['textures'] = new Map();
          for (const [mood, rows] of Object.entries(part.face.rows)) {
            if (rows) textures.set(mood as FaceMood, faceTextures(part.face, rows, part.color));
          }
          const normal = textures.get('normal')!;
          front.map = normal.base;
          let glow: THREE.MeshBasicMaterial | null = null;
          if ([...textures.values()].some((t) => t.glow)) {
            glow = new THREE.MeshBasicMaterial({
              map: normal.glow,
              transparent: true,
              depthWrite: false,
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(part.size[0], part.size[1]), glow);
            plane.rotation.y = Math.PI;
            plane.position.z = -part.size[2] / 2 - 0.004;
            mesh.add(plane);
          }
          faces.push({ material: front, glow, textures, mood: 'normal' });
        } else {
          mesh = new THREE.Mesh(geometry, material);
        }
      }
      if (part.tilt) mesh.rotation.set(part.tilt[0], 0, part.tilt[1]);
      // A part on a head moves with the head.
      const head = part.move === 'head' ? undefined : heads.find((h) => onTop(part, h.part));
      const parent = head?.pivot ?? body;
      const origin = head ? pivotOf(head.part) : ([0, 0, 0] as const);
      if (part.move) {
        const pivot = new THREE.Group();
        // Turn first, then nod (a head looking sideways still nods its own way).
        pivot.rotation.order = 'YXZ';
        const [px, py, pz] = pivotOf(part);
        pivot.position.set(px - origin[0], py - origin[1], pz - origin[2]);
        mesh.position.set(part.pos[0] - px, part.pos[1] - py, part.pos[2] - pz);
        pivot.add(mesh);
        parent.add(pivot);
        moving.push({ pivot, part, move: part.move });
        if (part.move === 'head') heads.push({ part, pivot });
      } else {
        mesh.position.set(
          part.pos[0] - origin[0],
          part.pos[1] - origin[1],
          part.pos[2] - origin[2],
        );
        parent.add(mesh);
      }
    }
    return { body, moving, faces, tintable, flickers };
  }

  set(id: string, spec: ActorSpec, state: ActorState): void {
    let a = this.actors.get(id);
    if (!a || a.spec !== spec) {
      if (a) this.remove(id);
      const group = new THREE.Group();
      const built = this.build(spec);
      group.add(built.body);
      group.add(shadowMesh(spec.width));
      this.scene.add(group);
      a = {
        group,
        ...built,
        target: new THREE.Vector3(state.x, state.y, state.z),
        spec,
        state,
        label: null,
        labelText: '',
        stride: 0,
        speed: 0,
        last: new THREE.Vector3(state.x, state.y, state.z),
        act: null,
        actTime: 0,
        blinkIn: 1 + Math.random() * 3,
        age: 0,
        seed: Math.random() * 100,
      };
      group.position.copy(a.target);
      this.actors.set(id, a);
    }
    a.state = state;
    a.target.set(state.x, state.y, state.z);
    // Far jumps (appearing somewhere else) happen at once.
    if (a.group.position.distanceTo(a.target) > SNAP) {
      a.group.position.copy(a.target);
      a.last.copy(a.target);
    }
    a.group.rotation.order = 'YXZ';
    a.group.rotation.y = state.yaw;
    a.group.rotation.x = state.pitch ?? 0;
    a.group.visible = state.visible ?? true;
    a.group.scale.setScalar(state.scale ?? 1);
    const text = state.label ?? '';
    if (text !== a.labelText) {
      if (a.label) a.group.remove(a.label);
      a.label = text ? labelSprite(text) : null;
      if (a.label) {
        a.label.position.y = spec.height + 0.5;
        a.group.add(a.label);
      }
      a.labelText = text;
    }
  }

  /** A character attacks, winces or casts a spell. */
  animate(id: string, act: ActorAct): void {
    const a = this.actors.get(id);
    if (!a) return;
    a.act = act;
    a.actTime = 0;
  }

  /** The characters that speak move their mouths for this long. */
  talk(seconds: number): void {
    this.talkLeft = Math.max(this.talkLeft, seconds);
  }

  /** Every frame: characters glide to where they should be and move. `eye` is where you look from. */
  update(dt: number, ex = 0, ey = 0, ez = 0): void {
    this.time += dt;
    for (const m of liveShaders) m.uniforms.uTime!.value = this.time;
    this.talkLeft = Math.max(0, this.talkLeft - dt);
    const t = 1 - Math.exp(-SMOOTHING * dt);
    for (const a of this.actors.values()) {
      a.group.position.lerp(a.target, t);
      if (!a.group.visible) continue;
      this.animateOne(a, dt, ex, ey, ez);
    }
  }

  private animateOne(a: Actor, dt: number, ex: number, ey: number, ez: number): void {
    const motion = a.spec.motion ?? {};
    const now = this.time + a.seed;
    a.age += dt;

    // How fast it walks, from how far it moved.
    const moved = Math.hypot(a.group.position.x - a.last.x, a.group.position.z - a.last.z);
    a.last.copy(a.group.position);
    const speed = dt > 0 ? moved / dt : 0;
    a.speed += (speed - a.speed) * Math.min(1, dt * 8);
    const walking = Math.min(1, Math.max(0, (a.speed - WALK_MIN) / 2));
    a.stride +=
      dt *
      (motion.gait ?? 1.6) *
      Math.PI *
      (0.4 + Math.min(a.speed, 6) / 3) *
      (walking > 0 ? 1 : 0);
    let step = Math.sin(a.stride);
    if (motion.jerky) step = Math.sign(step) * Math.min(1, Math.abs(step) * 2.2);
    const swing = (motion.swing ?? 0.7) * walking;

    if (a.act) {
      a.actTime += dt;
      if (a.actTime > ACT_TIME[a.act]) a.act = null;
    }
    const actT = a.act ? a.actTime / ACT_TIME[a.act] : 0;
    const attack = a.act === 'attack' ? actCurve(actT) : 0;
    const hurt = a.act === 'hurt' ? actCurve(actT) : 0;
    const cast = a.act === 'cast' ? Math.sin(Math.min(1, actT) * Math.PI) : 0;
    const talking = a.spec.speaker === true && this.talkLeft > 0;
    const mouth = talking ? Math.max(0, Math.sin(now * 17)) : 0;

    // The whole body: breathes, bobs with steps, floats, leans into attacks.
    const body = a.body;
    const float = motion.float ?? 0;
    const bounce = motion.bounce ? Math.abs(Math.sin(now * 5)) * 0.35 : 0;
    body.position.y =
      float + (float ? Math.sin(now * 1.7) * 0.15 : 0) + Math.abs(step) * 0.06 * walking + bounce;
    const breathe = 1 + Math.sin(now * 2.1) * 0.012;
    body.scale.set(1, breathe, 1);
    if (motion.bounce) {
      // Squashes when it lands.
      const squash = 1 - Math.max(0, 0.12 - bounce) * 1.5;
      body.scale.set(2 - squash, squash, 2 - squash);
    }
    body.rotation.x = -attack * 0.25 + hurt * 0.3 + (float ? Math.sin(now * 1.1) * 0.04 : 0);
    body.rotation.z = Math.sin(now * 0.9) * (float ? 0.05 : 0.012);

    // Where you are, seen from the character (for heads that look at you).
    const local = new THREE.Vector3(ex, ey, ez);
    a.group.worldToLocal(local);

    for (const m of a.moving) {
      const p = m.pivot;
      const phase = m.part.phase ?? 0;
      switch (m.move) {
        case 'legA':
          p.rotation.x = step * swing;
          break;
        case 'legB':
          p.rotation.x = -step * swing;
          break;
        case 'armA':
          p.rotation.x = -step * swing * 0.8 + Math.sin(now * 1.3) * 0.05 + cast * 2.4;
          p.rotation.z = -Math.abs(Math.sin(now * 1.3)) * 0.06 - cast * 0.4;
          break;
        case 'armB':
          p.rotation.x =
            step * swing * 0.8 + Math.sin(now * 1.3 + 1) * 0.05 + attack * 2.6 + cast * 2.4;
          p.rotation.z = Math.abs(Math.sin(now * 1.3)) * 0.06 + cast * 0.4;
          break;
        case 'attack':
          p.rotation.x = attack * 2.2 + step * swing * 0.5;
          break;
        case 'head': {
          // Looks at you (it is creepier that way), and nods while it talks.
          const dx = local.x - p.position.x;
          const dz = local.z - p.position.z;
          const dy = local.y - (p.position.y + 0.3);
          const yaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, Math.atan2(-dx, -dz)));
          const tilt = Math.max(
            -HEAD_TILT,
            Math.min(HEAD_TILT, Math.atan2(dy, Math.hypot(dx, dz))),
          );
          p.rotation.y += (yaw - p.rotation.y) * Math.min(1, dt * 4);
          const nod = talking ? Math.sin(now * 9) * 0.06 : 0;
          p.rotation.x += (tilt + nod - hurt * 0.4 - p.rotation.x) * Math.min(1, dt * 4);
          p.rotation.z = Math.sin(now * 0.7) * 0.03;
          break;
        }
        case 'sway':
          // Trails behind (+z) when it walks.
          p.rotation.x = Math.sin(now * 1.8 + phase) * 0.08 - walking * 0.35 - attack * 0.3;
          p.rotation.z = Math.sin(now * 1.3 + phase) * 0.05;
          break;
        case 'wingL':
        case 'wingR': {
          const speedUp = attack > 0 || cast > 0 ? 3 : 1;
          // Folded back behind the shoulders, spreading out when it attacks.
          const flap =
            Math.sin(now * 3 * speedUp + phase) * (0.25 + attack * 0.3) + 0.75 - attack * 0.6;
          p.rotation.y = m.move === 'wingL' ? flap : -flap;
          break;
        }
        case 'jaw':
          p.rotation.x = -(mouth * 0.45 + attack * 0.4);
          break;
        case 'spin':
          p.rotation.y += dt * (2 + walking * 4);
          break;
        case 'pulse': {
          const s = 1 + Math.sin(now * 2.6 + phase) * 0.05 + attack * 0.08;
          p.scale.set(s, s, s);
          break;
        }
        case 'blink': {
          // Mostly open, then shut for a moment (phase spreads them out).
          const open = Math.min(1, Math.max(0.04, Math.sin(now * 0.9 + phase) * 3 + 2.2));
          p.scale.set(1 + (1 - open) * 0.2, open, 1);
          break;
        }
        case 'crawlL':
        case 'crawlR': {
          const go = walking > 0 ? 1 : 0.15;
          const lift = Math.sin(a.stride * 2 + phase + now * (1 - go)) * 0.35 * go;
          const reach = Math.cos(a.stride * 2 + phase) * 0.3 * go;
          // Legs reach down to the ground; a lifted leg points less down.
          p.rotation.z = (m.move === 'crawlL' ? 1 : -1) * (0.45 - lift - attack * 0.6);
          p.rotation.y = reach;
          break;
        }
      }
    }

    // Faces: blink now and then, angry when attacking, wince when hurt.
    a.blinkIn -= dt;
    if (a.blinkIn < -BLINK_TIME) {
      a.blinkIn = BLINK_EVERY[0] + Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0]);
    }
    for (const face of a.faces) {
      const wanted: FaceMood =
        hurt > 0 && face.textures.has('hurt')
          ? 'hurt'
          : (attack > 0 || cast > 0) && face.textures.has('angry')
            ? 'angry'
            : mouth > 0.5 && face.textures.has('talk')
              ? 'talk'
              : a.blinkIn < 0 && face.textures.has('blink')
                ? 'blink'
                : 'normal';
      if (wanted === face.mood) continue;
      face.mood = wanted;
      const tex = face.textures.get(wanted)!;
      face.material.map = tex.base;
      face.material.needsUpdate = true;
      if (face.glow) {
        face.glow.map = tex.glow;
        face.glow.visible = tex.glow !== null;
        face.glow.needsUpdate = true;
      }
    }

    // Red when hurt; candle flames flicker.
    const red = hurt > 0 ? 0.5 * hurt : 0;
    for (const mat of a.tintable) mat.emissive.setRGB(red, 0, 0);
    for (const f of a.flickers) {
      const k = 0.75 + Math.sin(now * 13) * 0.1 + Math.sin(now * 29) * 0.08 + Math.random() * 0.07;
      f.material.color.copy(f.color).multiplyScalar(k);
    }
  }

  remove(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.group);
    const textures = new Set<THREE.Texture>();
    for (const face of a.faces) {
      for (const t of face.textures.values()) {
        textures.add(t.base);
        if (t.glow) textures.add(t.glow);
      }
    }
    a.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of new Set(materials)) {
          if (m instanceof THREE.ShaderMaterial) liveShaders.delete(m);
          (m as THREE.Material).dispose();
        }
      }
    });
    for (const t of textures) t.dispose();
    this.actors.delete(id);
  }

  /** Removes every character whose id starts with this (a mod turned off). */
  removeAll(prefix = ''): void {
    for (const id of [...this.actors.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  /** Every visible character as a box (for arrows). */
  boxes(): { id: string; min: [number, number, number]; max: [number, number, number] }[] {
    const out: ReturnType<ModActors['boxes']> = [];
    for (const [id, a] of this.actors) {
      if (a.state.visible === false) continue;
      const s = a.state.scale ?? 1;
      const half = (a.spec.width * s) / 2;
      const lift = (a.spec.motion?.float ?? 0) * s;
      out.push({
        id,
        min: [a.group.position.x - half, a.group.position.y + lift, a.group.position.z - half],
        max: [
          a.group.position.x + half,
          a.group.position.y + lift + a.spec.height * s,
          a.group.position.z + half,
        ],
      });
    }
    return out;
  }

  /** The visible character the ray hits first within `reach`. */
  pick(
    origin: readonly [number, number, number],
    dir: readonly [number, number, number],
    reach: number,
  ): { id: string; distance: number } | null {
    let best: { id: string; distance: number } | null = null;
    for (const [id, a] of this.actors) {
      if (a.state.visible === false) continue;
      const s = a.state.scale ?? 1;
      const half = (a.spec.width * s) / 2;
      const lift = (a.spec.motion?.float ?? 0) * s;
      const min = [a.state.x - half, a.state.y + lift, a.state.z - half];
      const max = [a.state.x + half, a.state.y + lift + a.spec.height * s, a.state.z + half];
      let t0 = 0;
      let t1 = reach;
      let hit = true;
      for (let i = 0; i < 3 && hit; i++) {
        const d = dir[i]!;
        const o = origin[i]!;
        if (Math.abs(d) < 1e-9) {
          if (o < min[i]! || o > max[i]!) hit = false;
          continue;
        }
        let near = (min[i]! - o) / d;
        let far = (max[i]! - o) / d;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1) hit = false;
      }
      if (hit && (!best || t0 < best.distance)) best = { id, distance: t0 };
    }
    return best;
  }
}

/** Does this part sit on (or in) that head? Crowns, hats, jaws and hair do. */
function onTop(part: ActorPart, head: ActorPart): boolean {
  const [hx, hy, hz] = head.pos;
  const [sx, sy, sz] = head.size;
  const [x, y, z] = part.pos;
  return (
    Math.abs(x - hx) <= sx / 2 + 0.05 &&
    Math.abs(z - hz) <= sz / 2 + 0.1 &&
    y >= hy - sy / 2 - 0.12 &&
    y <= hy + sy / 2 + 0.5
  );
}

/** A part's shape, made `size` big each way (boxes keep their sharp edges). */
function shapeGeometry(part: ActorPart): THREE.BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 28, 20).scale(w, h, d);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 6).scale(w, h, d);
    case 'rib':
      // A curved bone: half a ring, bent round the body.
      return new THREE.TorusGeometry(0.5, 0.06, 8, 24, Math.PI)
        .rotateX(-Math.PI / 2)
        .scale(w, h / 0.12, d);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 24, 10, part.shader === 'smoke').scale(w, h, d);
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

// --- Living smoke ---------------------------------------------------------------

/** Smoke materials whose time moves on every frame. */
const liveShaders = new Set<THREE.ShaderMaterial>();

const SMOKE_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vec3 p = position;
    // The surface ripples and breathes.
    float w = sin(p.y * 3.1 + uTime * 2.0 + p.x * 2.3) * 0.07
            + sin(p.y * 7.3 - uTime * 3.4 + p.z * 3.1) * 0.035
            + sin(uTime * 1.3 + p.x * 5.0) * 0.02;
    p += normal * w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * mv;
  }
`;

const SMOKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  void main() {
    // Smoke drifting upwards inside it.
    vec3 q = vPos * 2.2 + vec3(0.0, -uTime * 0.7, uTime * 0.15);
    float n = noise(q) * 0.6 + noise(q * 2.3) * 0.3 + noise(q * 5.1) * 0.1;
    // Edges glow; seen straight on it is thin and dark.
    float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    vec3 col = mix(uColor, uRim, edge * 0.85) + uRim * pow(n, 5.0) * 0.6;
    // Dense in the middle, thin and ragged at the edges.
    float alpha = uOpacity * (0.72 + 0.25 * n) * (1.0 - edge * 0.35);
    if (n < 0.34 && edge > 0.45) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

function smokeMaterial(part: ActorPart): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(part.color) },
      uRim: { value: new THREE.Color(part.rim ?? 0x8a0a0a) },
      uOpacity: { value: part.alpha ?? 0.9 },
    },
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  liveShaders.add(m);
  return m;
}
