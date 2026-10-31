// Living shapes for the mods' characters: bones with knobby joints, curved
// claws and ribs, lumpy spines, uneven smoke, a torn cloak and wavy strands.
// They are made from curves and then roughened with a little noise, so
// nothing looks like a perfect cylinder or ball. Each shape is made to the
// part's own size (width, height, depth).

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Noise ---------------------------------------------------------------------

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth noise, 0–1: the same for the same place, every time. */
function noise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(
      lerp(corner(0, 0, 0), corner(1, 0, 0), sx),
      lerp(corner(0, 1, 0), corner(1, 1, 0), sx),
      sy,
    ),
    lerp(
      lerp(corner(0, 0, 1), corner(1, 0, 1), sx),
      lerp(corner(0, 1, 1), corner(1, 1, 1), sx),
      sy,
    ),
    sz,
  );
}

/**
 * Pushes every point a little in or out (the same point always the same
 * way, so seams stay shut). `smooth` keeps the old normals: the outline is
 * lumpy but the light (and the smoke's glowing edge) stays soft.
 */
function roughen(
  g: THREE.BufferGeometry,
  amount: number,
  scale: number,
  seed: number,
  smooth = false,
): THREE.BufferGeometry {
  if (!smooth) g.computeVertexNormals();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      noise(x * scale + seed, y * scale, z * scale) * 0.7 +
      noise(x * scale * 2.7, y * scale * 2.7 + seed, z * scale * 2.7) * 0.3 -
      0.5;
    pos.setXYZ(
      i,
      x + nor.getX(i) * n * amount,
      y + nor.getY(i) * n * amount,
      z + nor.getZ(i) * n * amount,
    );
  }
  if (!smooth) g.computeVertexNormals();
  return g;
}

/** A tube along a curve whose thickness changes (`radius` at 0 → 1 along it). */
function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  radius: (t: number) => number,
  segments: number,
  sides: number,
): THREE.BufferGeometry {
  const tube = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const pos = tube.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius(t);
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      v.fromBufferAttribute(pos, k).sub(p).multiplyScalar(r).add(p);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  return tube;
}

/** A smooth outline (radius, height) turned round like on a lathe. */
function lathe(outline: [number, number][], sides: number, smooth = 40): THREE.BufferGeometry {
  const spline = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y)));
  const points = spline.getPoints(smooth).map((q) => new THREE.Vector2(Math.max(0, q.x), q.y));
  return new THREE.LatheGeometry(points, sides);
}

// --- The shapes ------------------------------------------------------------------

/** A long bone: a thin shaft that swells into two knobby joints at the ends. */
export function boneGeometry(w: number, h: number, d: number, seed: number): THREE.BufferGeometry {
  const outline: [number, number][] = [
    [0, -0.5],
    [0.62, -0.485],
    [0.98, -0.45],
    [0.92, -0.39],
    [0.62, -0.32],
    [0.48, -0.22],
    [0.42, -0.08],
    [0.4, 0.04],
    [0.44, 0.18],
    [0.52, 0.3],
    [0.85, 0.38],
    [1, 0.44],
    [0.7, 0.485],
    [0, 0.5],
  ];
  const g = lathe(outline, 14);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // The joints are wider than they are deep, and the shaft bends a little.
    const end = Math.max(0, (Math.abs(y) - 0.32) / 0.18);
    const x = pos.getX(i) * (1 + end * 0.25);
    const z = pos.getZ(i) * (1 - end * 0.15);
    pos.setXYZ(i, x + Math.sin((y + 0.5) * Math.PI) * 0.12, y, z);
  }
  g.scale(w / 2, h, d / 2);
  return roughen(g, Math.min(w, d) * 0.12, 9 / Math.max(h, 0.3), seed);
}

/** A curved hook, thick at its root and sharp at its tip (the tip curls forward, −z). */
export function clawGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, -h / 2, 0),
    new THREE.Vector3(0, h * 0.25, d * 0.2),
    new THREE.Vector3(0, h / 2, -Math.max(w, d) * 1.6),
  );
  return taperedTube(curve, (t) => (w / 2) * Math.pow(1 - t, 0.9) + 0.004, 14, 8);
}

/**
 * A pair of ribs: from the spine at the back (+z) they curve out round the
 * sides and down towards the front, leaving a gap in the middle.
 */
export function ribGeometry(w: number, h: number, d: number, seed: number): THREE.BufferGeometry {
  const sides = [1, -1].map((s) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * w * 0.04, h * 0.3, d * 0.42),
      new THREE.Vector3(s * w * 0.34, h * 0.2, d * 0.34),
      new THREE.Vector3(s * w * 0.5, 0, 0),
      new THREE.Vector3(s * w * 0.36, -w * 0.08, -d * 0.36),
      new THREE.Vector3(s * w * 0.12, -w * 0.16, -d * 0.5),
    ]);
    return taperedTube(curve, (t) => (h / 2) * (1 - t * 0.45), 24, 7);
  });
  return roughen(mergeGeometries(sides)!, h * 0.25, 6, seed);
}

/** A piece of spine: a round body, a spike out of the back and two little wings. */
export function vertebraGeometry(
  w: number,
  h: number,
  d: number,
  seed: number,
): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(w * 0.36, w * 0.42, h * 0.75, 12, 2);
  const spike = new THREE.ConeGeometry(w * 0.16, d * 0.9, 8)
    .rotateX(Math.PI / 2 + 0.5)
    .translate(0, -h * 0.15, d * 0.45);
  const wings = new THREE.CylinderGeometry(w * 0.07, w * 0.1, w * 1.3, 6)
    .rotateZ(Math.PI / 2)
    .translate(0, h * 0.05, d * 0.12);
  const g = mergeGeometries([body, spike, wings])!;
  return roughen(g, w * 0.06, 8, seed);
}

/** A lumpy, uneven ball (thick smoke, a heart). */
export function blobGeometry(w: number, h: number, d: number, seed: number): THREE.BufferGeometry {
  // One shared point per corner, so the lumps never tear apart, with soft normals.
  const ball = new THREE.IcosahedronGeometry(0.5, 4);
  ball.deleteAttribute('uv');
  ball.deleteAttribute('normal');
  const g = mergeVertices(ball);
  g.computeVertexNormals();
  roughen(g, 0.22, 2.2, seed, true);
  return g.scale(w, h, d);
}

/** A cloak hanging from narrow shoulders, wide at the bottom, its hem torn into rags. */
export function cloakGeometry(w: number, h: number, d: number, seed: number): THREE.BufferGeometry {
  const g = lathe(
    [
      [0, 0.5],
      [0.2, 0.48],
      [0.34, 0.4],
      [0.38, 0.2],
      [0.42, -0.05],
      [0.47, -0.3],
      [0.53, -0.5],
    ],
    36,
    32,
  );
  // The light stays soft: it keeps the smooth cloak's normals while it is torn.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // Rags of different lengths hang off the hem.
    const low = Math.max(0, (-0.15 - y) / 0.35);
    const rag = Math.pow(noise(Math.cos(a) * 4 + seed, Math.sin(a) * 4, 0), 2.2);
    const out = 1 + (noise(x * 6 + seed, y * 5, z * 6) - 0.5) * 0.18;
    pos.setXYZ(i, x * out, y - low * rag * 0.3, z * out);
  }
  // Scaling keeps the normals pointing the right way.
  return g.scale(w, h, d);
}

/** A wavy strand that thins to a point: it points up (+y) like a cone. */
export function tendrilGeometry(
  w: number,
  h: number,
  d: number,
  seed: number,
): THREE.BufferGeometry {
  const wave = (k: number) => (noise(seed + k * 3, seed * 0.5, k) - 0.5) * 2;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -h / 2, 0),
    new THREE.Vector3(wave(1) * h * 0.08, -h / 6, wave(2) * d * 0.5),
    new THREE.Vector3(wave(3) * h * 0.12, h / 6, wave(4) * d * 0.6),
    new THREE.Vector3(wave(5) * h * 0.16, h / 2, wave(6) * d * 0.7),
  ]);
  return taperedTube(curve, (t) => (Math.max(w, d) / 2) * Math.pow(1 - t, 1.3) + 0.006, 20, 8);
}

// --- Bone ------------------------------------------------------------------------

let bone: THREE.Texture | null = null;

/** Old bone: specks, darker stains and thin cracks (shared by every bony part). */
export function boneTexture(): THREE.Texture {
  if (bone) return bone;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const g = 200 + Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${g},${g - 8},${g - 24},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // Brownish stains.
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 22;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, 'rgba(110,84,52,0.35)');
    stain.addColorStop(1, 'rgba(110,84,52,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Thin cracks.
  ctx.strokeStyle = 'rgba(60,44,30,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.5) * 18;
      y += Math.random() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  bone = new THREE.CanvasTexture(canvas);
  bone.colorSpace = THREE.SRGBColorSpace;
  bone.wrapS = bone.wrapT = THREE.RepeatWrapping;
  return bone;
}
