// The magic builder: a kid types what to build ("punainen linna"), the AI
// (OpenRouter) answers with simple shapes, and the game turns them into blocks.
// The AI never writes text that is shown to the kids: only shapes.

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import { BUILDER } from '../src/config';
import { BLOCKS } from '../src/logic/blocks';
import { findBlueprint } from '../src/logic/blueprints';
import { SOLO_CODE, normalizeWorldCode } from '../src/logic/codes';
import { SHAPE_KINDS, parseShapes, type Shape } from '../src/logic/shapes';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
const MAX_TOKENS = 3000;
const TIMEOUT_MS = 25_000;

const BLOCK_KEYS = [...BLOCKS.filter((b) => b.placeable).map((b) => b.key), 'air'];

const SYSTEM_PROMPT = `You design builds for a friendly block-building game played by children (7 and 10 years old).
The child describes a build, often in Finnish. Answer ONLY with JSON: {"shapes": [...]}.

Coordinates: x = right, y = up, z = away from the player. y = 0 is the ground level.
Keep the whole build inside x -16…16, y 0…30, z 0…30. Each shape at most ${BUILDER.maxShapeSize} blocks along any axis.
Use at most ${BUILDER.maxShapes} shapes. Later shapes overwrite earlier ones; use block "air" to cut doors and windows.

Shapes:
- {"shape":"box","block":B,"from":[x,y,z],"to":[x,y,z]}  filled box (corners inclusive)
- {"shape":"walls","block":B,"from":[x,y,z],"to":[x,y,z]}  only the four side walls (no floor, no roof)
- {"shape":"sphere","block":B,"center":[x,y,z],"radius":R,"hollow":true|false}
- {"shape":"cylinder","block":B,"center":[x,y,z],"radius":R,"height":H}  upright, starts at center y
- {"shape":"pyramid","block":B,"center":[x,y,z],"radius":R}  stepped, base at center y

Blocks B: ${BLOCK_KEYS.join(', ')}.

Make builds that look good: floors, walls, roofs, doors, windows, details and nice colours.
Everything must be kind and child-friendly. If the request is violent, scary, rude or not suitable for children,
build a cheerful flower garden instead.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    shapes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shape: { type: 'string', enum: [...SHAPE_KINDS] },
          block: { type: 'string', enum: BLOCK_KEYS },
          from: { type: 'array', items: { type: 'integer' } },
          to: { type: 'array', items: { type: 'integer' } },
          center: { type: 'array', items: { type: 'integer' } },
          radius: { type: 'integer' },
          height: { type: 'integer' },
          hollow: { type: 'boolean' },
        },
        required: ['shape', 'block'],
      },
    },
  },
  required: ['shapes'],
};

type BuildResult =
  | { ok: true; shapes: Shape[]; source: 'ai' | 'blueprint' }
  | { ok: false; reason: 'bad-request' | 'no-world' | 'too-many' | 'failed' };

async function askAi(prompt: string, apiKey: string): Promise<Shape[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leksa-and-jumi.github.io/palikkamaailma/',
        'X-Title': 'Palikkamaailma',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'build', strict: false, schema: RESPONSE_SCHEMA },
        },
      }),
    });
    if (!response.ok) {
      console.error('OpenRouter error', response.status, await response.text());
      return [];
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    // Some models wrap JSON in ```; take the outermost object.
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    return parseShapes(JSON.parse(json));
  } catch (error) {
    console.error('OpenRouter request failed', error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const build = action({
  args: { code: v.string(), prompt: v.string() },
  handler: async (ctx, args): Promise<BuildResult> => {
    const prompt = args.prompt.trim().slice(0, BUILDER.maxPromptLength);
    // Players alone on their own device share one "YKSIN" rate limit.
    const code = args.code === SOLO_CODE ? SOLO_CODE : normalizeWorldCode(args.code);
    if (!prompt || !code) return { ok: false, reason: 'bad-request' };

    if (code !== SOLO_CODE) {
      const exists = await ctx.runQuery(internal.worlds.exists, { code });
      if (!exists) return { ok: false, reason: 'no-world' };
    }
    const recent = await ctx.runQuery(internal.builder.recentBuilds, { code });
    if (recent >= BUILDER.rateLimit) return { ok: false, reason: 'too-many' };

    const apiKey = process.env.OPENROUTER_API_KEY;
    let shapes: Shape[] = apiKey ? await askAi(prompt, apiKey) : [];
    let source: 'ai' | 'blueprint' = 'ai';
    if (shapes.length === 0) {
      const blueprint = findBlueprint(prompt);
      if (!blueprint) return { ok: false, reason: 'failed' };
      shapes = [...blueprint.shapes];
      source = 'blueprint';
    }
    await ctx.runMutation(internal.builder.record, {
      code,
      prompt,
      shapes: shapes.length,
      source,
    });
    return { ok: true, shapes, source };
  },
});

export const recentBuilds = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const since = Date.now() - BUILDER.rateWindowMs;
    const builds = await ctx.db
      .query('builds')
      .withIndex('by_code_time', (q) => q.eq('code', code).gt('createdAt', since))
      .take(BUILDER.rateLimit);
    return builds.length;
  },
});

export const record = internalMutation({
  args: {
    code: v.string(),
    prompt: v.string(),
    shapes: v.number(),
    source: v.union(v.literal('ai'), v.literal('blueprint')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('builds', { ...args, createdAt: Date.now() });
  },
});
