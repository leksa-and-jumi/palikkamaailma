// The magic builder: a kid types what to build ("punainen linna"), the AI
// (OpenRouter) answers with simple shapes, and the game turns them into blocks.
// The AI never writes text that is shown to the kids: only shapes.

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import { BUILDER } from '../src/config';
import { findBlueprint } from '../src/logic/blueprints';
import { SYSTEM_PROMPT } from '../src/logic/builderPrompt';
import { SOLO_CODE, normalizeWorldCode } from '../src/logic/codes';
import { parseShapes, type Shape } from '../src/logic/shapes';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Opus thinks the build through before answering: much nicer builds than Haiku.
// Both can be changed without a deploy with the Convex env variables
// OPENROUTER_MODEL and OPENROUTER_EFFORT (low, medium, high).
const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
const DEFAULT_EFFORT = 'medium';
/** Thinking + the answer. A big detailed build is about 5 000–15 000 tokens. */
const MAX_TOKENS = 32_000;
/** Detailed builds take a minute or two; the answer is streamed so nothing times out. */
const TIMEOUT_MS = 300_000;

type BuildResult =
  | { ok: true; shapes: Shape[]; source: 'ai' | 'blueprint' }
  | { ok: false; reason: 'bad-request' | 'no-world' | 'too-many' | 'failed' };

/** Reads OpenRouter's server-sent events and joins the answer text. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      // ": OPENROUTER PROCESSING" comments keep the connection alive.
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return content;
      const event = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
        error?: unknown;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      if (event.error) throw new Error(`OpenRouter stream error: ${JSON.stringify(event.error)}`);
      content += event.choices?.[0]?.delta?.content ?? '';
      if (event.usage) console.warn('Builder usage', JSON.stringify(event.usage));
    }
  }
  return content;
}

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
        reasoning: { effort: process.env.OPENROUTER_EFFORT || DEFAULT_EFFORT, exclude: true },
        stream: true,
        usage: { include: true },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok || !response.body) {
      console.error('OpenRouter error', response.status, await response.text());
      return [];
    }
    const content = await readStream(response.body);
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
