import { v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { DIFFICULTIES, GAME_MODES, type Difficulty, type GameMode } from '../src/config';
import { makeWorldCode, normalizeWorldCode } from '../src/logic/codes';

function cleanMode(mode: string | undefined): GameMode {
  return mode && mode in GAME_MODES ? (mode as GameMode) : 'creative';
}

function cleanDifficulty(difficulty: string | undefined): Difficulty {
  return difficulty && difficulty in DIFFICULTIES ? (difficulty as Difficulty) : 'easy';
}

const WORLD_EMOJIS = ['🏝️', '🌋', '🏔️', '🌲', '🌵', '🍄', '🌈', '⭐'];
/** Worlds made in the whole game per hour, so nobody can fill the database. */
const MAX_NEW_WORLDS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;
const MAX_CODE_TRIES = 20;

/** Makes a new world and returns its code. */
export const create = mutation({
  args: { emoji: v.string(), mode: v.optional(v.string()), difficulty: v.optional(v.string()) },
  handler: async (ctx, { emoji, mode, difficulty }) => {
    const since = Date.now() - HOUR_MS;
    const recent = await ctx.db.query('worlds').order('desc').take(MAX_NEW_WORLDS_PER_HOUR);
    if (recent.length >= MAX_NEW_WORLDS_PER_HOUR && recent.every((w) => w.createdAt > since)) {
      throw new Error('Liian monta uutta maailmaa juuri nyt. Kokeile hetken päästä.');
    }
    const safeEmoji = WORLD_EMOJIS.includes(emoji) ? emoji : WORLD_EMOJIS[0]!;
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      const code = makeWorldCode();
      const taken = await ctx.db
        .query('worlds')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique();
      if (taken) continue;
      const settings = { mode: cleanMode(mode), difficulty: cleanDifficulty(difficulty) };
      await ctx.db.insert('worlds', { code, emoji: safeEmoji, ...settings, createdAt: Date.now() });
      return { code, emoji: safeEmoji, ...settings };
    }
    throw new Error('Uutta koodia ei löytynyt. Kokeile uudestaan.');
  },
});

/** Finds a world by the code the player typed, or null. */
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const clean = normalizeWorldCode(code);
    if (!clean) return null;
    const world = await ctx.db
      .query('worlds')
      .withIndex('by_code', (q) => q.eq('code', clean))
      .unique();
    return world
      ? {
          code: world.code,
          emoji: world.emoji,
          mode: cleanMode(world.mode),
          difficulty: cleanDifficulty(world.difficulty),
        }
      : null;
  },
});

export const exists = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const world = await ctx.db
      .query('worlds')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique();
    return world !== null;
  },
});
