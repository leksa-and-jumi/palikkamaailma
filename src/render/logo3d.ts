// The title "PALIKKAMAAILMA" as real 3D cobblestone blocks (like Minecraft's
// logo, but alive): the blocks fall into place one by one and build the
// name, now and then a few crack and tumble out and fly back, and clicking
// the logo knocks a block loose.

import * as THREE from 'three';
import { tileTexture } from './textures';

const TEXT = 'PALIKKAMAAILMA';
/** 7 rows high; "#" is a block. */
const GLYPHS: Record<string, readonly string[]> = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};
const GAP = 1;
const DEPTH = 1.6;
/** Building: the first block lands after this, then one after another. */
const BUILD_START = 0.25;
const BUILD_STEP = 0.012;
const FALL_TIME = 0.45;
const FALL_HEIGHT = 9;
/** Seconds between little crumbles, and how long a loose block stays out. */
const CRUMBLE_EVERY: [number, number] = [5, 10];
const LOOSE_TIME = 1.6;
const RETURN_TIME = 0.5;

interface Block {
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  /** When it lands while building (seconds from the start). */
  landAt: number;
  state: 'waiting' | 'falling' | 'home' | 'loose' | 'returning';
  timer: number;
  from: THREE.Vector3;
  fromRot: THREE.Euler;
  shake: number;
}

const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export class Logo3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(22, 4.8, 1, 400);
  private readonly mesh: THREE.InstancedMesh;
  private readonly blocks: Block[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly crumbs: THREE.Mesh[] = [];
  private running = false;
  private time = 0;
  private last = 0;
  private nextCrumble = CRUMBLE_EVERY[0];
  private readonly width: number;
  private fitted = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lay out the letters, centred.
    const cells: [number, number][] = [];
    let x = 0;
    for (const ch of TEXT) {
      const glyph = GLYPHS[ch]!;
      glyph.forEach((row, y) => {
        [...row].forEach((c, dx) => {
          if (c === '#') cells.push([x + dx, 6 - y]);
        });
      });
      x += glyph[0]!.length + GAP;
    }
    this.width = x - GAP;
    const texture = tileTexture('cobble');
    const side = new THREE.MeshLambertMaterial({ map: texture });
    // A hair smaller than a block, so every block shows its own edges.
    const geometry = new THREE.BoxGeometry(0.94, 0.94, DEPTH);
    this.mesh = new THREE.InstancedMesh(geometry, side, cells.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
    // The build goes left to right, with a little randomness.
    cells.forEach(([cx, cy]) => {
      const home = new THREE.Vector3(cx - this.width / 2 + 0.5, cy - 3, 0);
      this.blocks.push({
        home,
        pos: home.clone().add(new THREE.Vector3(0, FALL_HEIGHT, 0)),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        rot: new THREE.Euler(),
        landAt: BUILD_START + (cx + (6 - cy) * 0.6) * BUILD_STEP * 4 + Math.random() * 0.12,
        state: 'waiting',
        timer: 0,
        from: new THREE.Vector3(),
        fromRot: new THREE.Euler(),
        shake: 0,
      });
    });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a7a, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-0.5, 1, 0.9);
    this.scene.add(sun);
    canvas.addEventListener('pointerdown', (e) => this.poke(e));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(() => this.frame());
  }

  stop(): void {
    this.running = false;
  }

  /** Builds it again from nothing (each time the title screen opens). */
  rebuild(): void {
    this.time = 0;
    for (const b of this.blocks) {
      b.state = 'waiting';
      b.pos.copy(b.home).y += FALL_HEIGHT;
      b.rot.set(0, 0, 0);
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    // Placed the first time and whenever the size changes.
    if (this.fitted !== `${w}x${h}`) {
      this.fitted = `${w}x${h}`;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // Far enough that the whole name fits, with a little room to tumble.
      const fit =
        (this.width + 6) /
        2 /
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) /
        this.camera.aspect;
      this.camera.position.set(0, -4, fit);
      this.camera.lookAt(0, 0.2, 0);
      this.camera.updateProjectionMatrix();
    }
  }

  private frame(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.resize();

    this.nextCrumble -= dt;
    if (this.nextCrumble <= 0 && this.blocks.every((b) => b.state !== 'waiting')) {
      this.nextCrumble = CRUMBLE_EVERY[0] + Math.random() * (CRUMBLE_EVERY[1] - CRUMBLE_EVERY[0]);
      this.crumble();
    }

    this.blocks.forEach((b, i) => {
      this.step(b, dt);
      const wobble = b.state === 'home' ? Math.sin(this.time * 1.3 + b.home.x * 0.15) * 0.04 : 0;
      this.dummy.position.copy(b.pos);
      this.dummy.position.y += wobble;
      if (b.shake > 0) {
        this.dummy.position.x += (Math.random() - 0.5) * 0.12;
        this.dummy.position.y += (Math.random() - 0.5) * 0.12;
      }
      this.dummy.rotation.copy(b.rot);
      this.dummy.scale.setScalar(b.state === 'waiting' ? 0 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    // The whole name sways gently.
    this.mesh.rotation.y = Math.sin(this.time * 0.5) * 0.08;
    this.mesh.rotation.x = Math.sin(this.time * 0.37) * 0.03;
    this.updateCrumbs(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private step(b: Block, dt: number): void {
    switch (b.state) {
      case 'waiting':
        if (this.time >= b.landAt - FALL_TIME) b.state = 'falling';
        break;
      case 'falling': {
        const t = Math.min(1, (this.time - (b.landAt - FALL_TIME)) / FALL_TIME);
        b.pos.copy(b.home);
        b.pos.y += FALL_HEIGHT * (1 - t * t);
        if (t >= 1) {
          b.state = 'home';
          b.pos.copy(b.home);
          this.dust(b.home, 2);
        }
        break;
      }
      case 'home':
        b.shake = Math.max(0, b.shake - dt);
        if (b.shake === 0 && b.timer > 0) {
          // The crack finished: out it pops.
          b.timer = 0;
          this.knockOut(b);
        }
        break;
      case 'loose':
        b.timer += dt;
        b.vel.y -= 30 * dt;
        b.pos.addScaledVector(b.vel, dt);
        b.rot.x += b.spin.x * dt;
        b.rot.y += b.spin.y * dt;
        b.rot.z += b.spin.z * dt;
        if (b.timer > LOOSE_TIME) {
          b.state = 'returning';
          b.timer = 0;
          b.from.copy(b.pos);
          b.fromRot.copy(b.rot);
        }
        break;
      case 'returning': {
        b.timer += dt;
        const t = Math.min(1, b.timer / RETURN_TIME);
        const k = easeOutBack(t);
        b.pos.lerpVectors(b.from, b.home, k);
        b.rot.set(b.fromRot.x * (1 - t), b.fromRot.y * (1 - t), b.fromRot.z * (1 - t));
        if (t >= 1) {
          b.state = 'home';
          b.pos.copy(b.home);
          b.rot.set(0, 0, 0);
          this.dust(b.home, 1);
        }
        break;
      }
    }
  }

  /** A few neighbouring blocks crack, shake and tumble out. */
  private crumble(): void {
    const home = this.blocks.filter((b) => b.state === 'home');
    const first = home[Math.floor(Math.random() * home.length)];
    if (!first) return;
    const near = home
      .filter((b) => b.home.distanceTo(first.home) < 1.6)
      .slice(0, 2 + Math.floor(Math.random() * 3));
    for (const b of near) {
      b.shake = 0.35;
      b.timer = 1;
    }
  }

  private knockOut(b: Block): void {
    b.state = 'loose';
    b.timer = 0;
    b.vel.set((Math.random() - 0.5) * 6, 4 + Math.random() * 5, 3 + Math.random() * 5);
    b.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    this.dust(b.home, 5);
  }

  /** Clicking the logo knocks out the block you clicked. */
  private poke(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    const hit = ray.intersectObject(this.mesh)[0];
    const b = hit?.instanceId !== undefined ? this.blocks[hit.instanceId] : undefined;
    if (b?.state === 'home') this.knockOut(b);
  }

  /** Little stone crumbs that fall away. */
  private dust(at: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const crumb = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshLambertMaterial({
          color: Math.random() < 0.5 ? 0x8a8a8a : 0x6a6a6a,
          transparent: true,
        }),
      );
      crumb.position.copy(at).add(new THREE.Vector3(Math.random() - 0.5, -0.4, 0.8));
      crumb.userData = {
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, Math.random() * 3),
        life: 0.8,
      };
      this.mesh.add(crumb);
      this.crumbs.push(crumb);
    }
  }

  private updateCrumbs(dt: number): void {
    for (const c of [...this.crumbs]) {
      const data = c.userData as { vel: THREE.Vector3; life: number };
      data.life -= dt;
      data.vel.y -= 20 * dt;
      c.position.addScaledVector(data.vel, dt);
      (c.material as THREE.MeshLambertMaterial).opacity = Math.max(0, data.life / 0.8);
      if (data.life <= 0) {
        this.mesh.remove(c);
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
        this.crumbs.splice(this.crumbs.indexOf(c), 1);
      }
    }
  }
}
