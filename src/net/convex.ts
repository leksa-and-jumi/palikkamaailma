// Convex: the list of real world codes and the magic builder (AI).
// Works without Convex too: then codes are not checked and the builder only
// knows the ready-made builds.

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { makeWorldCode, normalizeWorldCode } from '../logic/codes';
import { findBlueprint } from '../logic/blueprints';
import type { Shape } from '../logic/shapes';

const CONVEX_URL: string = import.meta.env.VITE_CONVEX_URL ?? '';
const client = CONVEX_URL ? new ConvexHttpClient(CONVEX_URL) : null;

export const hasConvex = client !== null;

export interface WorldInfo {
  code: string;
  emoji: string;
}

export async function createWorld(emoji: string): Promise<WorldInfo> {
  if (!client) return { code: makeWorldCode(), emoji };
  return client.mutation(api.worlds.create, { emoji });
}

/** The world for a typed code, or null if there is no such world. */
export async function findWorld(typed: string): Promise<WorldInfo | null> {
  const code = normalizeWorldCode(typed);
  if (!code) return null;
  if (!client) return { code, emoji: '🏝️' };
  return client.query(api.worlds.get, { code });
}

export type BuildAnswer =
  | { ok: true; shapes: Shape[]; source: 'ai' | 'blueprint' }
  | { ok: false; reason: 'bad-request' | 'no-world' | 'too-many' | 'failed' };

export async function askBuilder(code: string, prompt: string): Promise<BuildAnswer> {
  if (client) {
    try {
      return await client.action(api.builder.build, { code, prompt });
    } catch (error) {
      console.error('Builder failed', error);
    }
  }
  const blueprint = findBlueprint(prompt);
  return blueprint
    ? { ok: true, shapes: [...blueprint.shapes], source: 'blueprint' }
    : { ok: false, reason: 'failed' };
}
