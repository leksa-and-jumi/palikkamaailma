// Day and night. The time comes from the clock and the world seed, so every
// player in the world sees the same time without any network messages.

import { DAY } from '../config';

/** 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
export function timeOfDay(nowMs: number, seed: number): number {
  const offset = (seed % DAY.length) / DAY.length;
  return (nowMs / 1000 / DAY.length + offset) % 1;
}

/** Height of the sun: 1 at noon, -1 at midnight. */
export function sunHeight(t: number): number {
  return Math.sin(t * Math.PI * 2);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const v = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return v * v * (3 - 2 * v);
}

/** 1 in daytime, 0 at night, smooth at sunrise and sunset. */
export function daylight(t: number): number {
  return smoothstep(-0.15, 0.2, sunHeight(t));
}

/** Night is when monsters come out. */
export function isNight(t: number): boolean {
  return sunHeight(t) < -0.05;
}

/** How red the sky is (sunrise and sunset), 0…1. */
export function sunsetGlow(t: number): number {
  const h = sunHeight(t);
  return Math.max(0, 1 - Math.abs(h) / 0.25) * 0.8;
}

/** Clock text for the HUD, e.g. "🌙 Yö". */
export function dayLabel(t: number): string {
  const h = sunHeight(t);
  if (h > 0.25) return '☀️ Päivä';
  if (h > -0.05) return t < 0.25 || t > 0.75 ? '🌅 Aamu' : '🌇 Ilta';
  return '🌙 Yö';
}
