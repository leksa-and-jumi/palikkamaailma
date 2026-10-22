import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// No names or personal data anywhere: a world is a code and an emoji,
// a build is the words typed into the magic builder.
export default defineSchema({
  worlds: defineTable({
    code: v.string(),
    emoji: v.string(),
    createdAt: v.number(),
  }).index('by_code', ['code']),
  builds: defineTable({
    code: v.string(),
    prompt: v.string(),
    shapes: v.number(),
    source: v.union(v.literal('ai'), v.literal('blueprint')),
    createdAt: v.number(),
  }).index('by_code_time', ['code', 'createdAt']),
});
