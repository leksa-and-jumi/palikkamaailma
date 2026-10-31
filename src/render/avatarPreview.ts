// A character floating on its own little stage (the character page and
// the backpack): it bobs gently, turns slowly, looks at the mouse, can be
// spun by dragging, and waves when you click it.

import * as THREE from 'three';
import type { Gear } from '../logic/protocol';
import { PlayerModel } from './playerModel';

const TURN_SPEED = 0.35;
const DRAG_TURN = 0.012;

export class AvatarPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly stage = new THREE.Group();
  private model: PlayerModel | null = null;
  private avatar = '';
  private gear: Gear | null = null;
  private running = false;
  private last = 0;
  private time = 0;
  private spin = 0.5;
  private spinSpeed = TURN_SPEED;
  private dragging: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private size = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
    key.position.set(1.5, 3, 2.5);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.1);
    rim.position.set(-2, 1.5, -2.5);
    this.scene.add(key, rim, this.stage);
    // A soft glowing disc under the feet.
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const g = glow.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(glow),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.18;
    this.scene.add(shadow);

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.lookX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.lookY = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (this.dragging !== null) {
        this.spin += (e.clientX - this.dragging) * DRAG_TURN;
        this.dragging = e.clientX;
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = e.clientX;
      this.spinSpeed = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      const moved = this.dragging !== null && Math.abs(e.clientX - this.dragging) < 2;
      this.dragging = null;
      this.spinSpeed = TURN_SPEED;
      if (moved) this.model?.wave();
    });
    canvas.addEventListener('pointerleave', () => {
      this.lookX = 0;
      this.lookY = 0;
    });
  }

  /** Which character to show (it waves when it changes). */
  setAvatar(avatar: string, wave = true): void {
    if (avatar === this.avatar) return;
    this.avatar = avatar;
    this.model?.dispose();
    this.model = new PlayerModel(avatar);
    this.model.setGear(this.gear);
    this.stage.add(this.model.group);
    if (wave) this.model.wave();
  }

  setGear(gear: Gear | null): void {
    this.gear = gear;
    this.model?.setGear(gear);
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

  private frame(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.size !== `${w}x${h}`) {
      this.size = `${w}x${h}`;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.position.set(0, 1.05, 4.3);
      this.camera.lookAt(0, 0.85, 0);
      this.camera.updateProjectionMatrix();
    }
    this.spin += dt * this.spinSpeed * (Math.sin(this.time * 0.25) > -0.3 ? 1 : -1) * 0.6;
    this.stage.rotation.y = Math.sin(this.spin) * 0.7;
    // Floats up and down gently.
    this.stage.position.y = Math.sin(this.time * 1.6) * 0.06;
    if (this.model) {
      // It faces the camera (+z); the head turns to look at the mouse.
      this.model.update(dt, {
        bodyYaw: Math.PI,
        lookYaw: Math.PI - this.lookX * 0.9 - this.stage.rotation.y,
        pitch: -this.lookY * 0.5,
        speed: 0,
        vy: 0,
        onGround: true,
      });
    }
    this.renderer.render(this.scene, this.camera);
  }
}
