// Seeded random numbers and smooth 2D noise for the terrain.

/** A small, fast seeded random generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns any text into a 32-bit number (FNV-1a). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A random-looking but fixed number in [0, 1) for a grid point. */
export function hash2(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GRADIENTS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Classic 2D Perlin noise. Same seed and point give the same value, about -1…1. */
export function createNoise2D(seed: number): (x: number, z: number) => number {
  const random = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!;

  const dot = (hash: number, x: number, z: number): number => {
    const g = GRADIENTS[hash & 7]!;
    return g[0] * x + g[1] * z;
  };

  return (x: number, z: number): number => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const X = xi & 255;
    const Z = zi & 255;
    const aa = perm[perm[X]! + Z]!;
    const ab = perm[perm[X]! + Z + 1]!;
    const ba = perm[perm[X + 1]! + Z]!;
    const bb = perm[perm[X + 1]! + Z + 1]!;
    const u = fade(xf);
    const v = fade(zf);
    const top = lerp(dot(aa, xf, zf), dot(ba, xf - 1, zf), u);
    const bottom = lerp(dot(ab, xf, zf - 1), dot(bb, xf - 1, zf - 1), u);
    // Scale so the result uses most of -1…1.
    return lerp(top, bottom, v) * Math.SQRT2;
  };
}

/** Several layers of noise added together: big hills plus small bumps. */
export function fbm(
  noise: (x: number, z: number) => number,
  x: number,
  z: number,
  octaves: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

const GRADIENTS_3D: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

/** 3D Perlin noise (for caves), about -1…1. */
export function createNoise3D(seed: number): (x: number, y: number, z: number) => number {
  const random = mulberry32(seed);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!;

  const grad = (hash: number, x: number, y: number, z: number): number => {
    const g = GRADIENTS_3D[hash % 12]!;
    return g[0] * x + g[1] * y + g[2] * z;
  };

  return (x: number, y: number, z: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const a = perm[X]! + Y;
    const aa = perm[a]! + Z;
    const ab = perm[a + 1]! + Z;
    const b = perm[X + 1]! + Y;
    const ba = perm[b]! + Z;
    const bb = perm[b + 1]! + Z;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const x1 = lerp(grad(perm[aa]!, xf, yf, zf), grad(perm[ba]!, xf - 1, yf, zf), u);
    const x2 = lerp(grad(perm[ab]!, xf, yf - 1, zf), grad(perm[bb]!, xf - 1, yf - 1, zf), u);
    const x3 = lerp(
      grad(perm[aa + 1]!, xf, yf, zf - 1),
      grad(perm[ba + 1]!, xf - 1, yf, zf - 1),
      u,
    );
    const x4 = lerp(
      grad(perm[ab + 1]!, xf, yf - 1, zf - 1),
      grad(perm[bb + 1]!, xf - 1, yf - 1, zf - 1),
      u,
    );
    return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w);
  };
}

/** A fixed random number in [0, 1) for a 3D grid point. */
export function hash3(seed: number, x: number, y: number, z: number): number {
  return hash2(seed ^ Math.imul(y, 0x9e3779b1), x, z);
}
