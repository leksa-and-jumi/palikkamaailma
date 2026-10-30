// What a block sounds like when you break it, place it or walk on it.

import { getBlockType } from '../logic/blocks';

export type Material = 'stone' | 'wood' | 'grass' | 'sand' | 'gravel' | 'glass' | 'wool' | 'metal';

const RULES: readonly [RegExp, Material][] = [
  [/glass|ice|lamp|pane/, 'glass'],
  [/^(red|blue|yellow|green|white|black|pink|orange|purple)$|wool|carpet|bed|cactus/, 'wool'],
  [/sand|snow|soul/, 'sand'],
  [/gravel|clay/, 'gravel'],
  [
    /grass|dirt|leaves|farmland|flower|sapling|mushroom|hay|poppy|dandelion|bush|cane|wheat|pumpkin|melon|vine/,
    'grass',
  ],
  [
    /log|plank|wood|oak|birch|spruce|door|chest|table|fence|ladder|bookshelf|sign|trapdoor|gate|torch|lever|button/,
    'wood',
  ],
  [/iron|gold_block|diamond_block|emerald_block|rail|anvil|hopper|piston/, 'metal'],
];

const cache = new Map<number, Material>();

export function materialOf(block: number): Material {
  let m = cache.get(block);
  if (!m) {
    const key = getBlockType(block).key;
    m = RULES.find(([re]) => re.test(key))?.[1] ?? 'stone';
    cache.set(block, m);
  }
  return m;
}
