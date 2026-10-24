import { describe, expect, it } from 'vitest';
import { blockIdFromKey } from './blocks';
import { BLOCK_KEYS, EXAMPLE_BUILD, SYSTEM_PROMPT } from './builderPrompt';
import { expandShapes, parseShapes } from './shapes';

describe('builder prompt', () => {
  it('only talks about blocks that exist', () => {
    const named = [...SYSTEM_PROMPT.matchAll(/^- ([a-z_]+)[:,]/gm)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(20);
    for (const key of named) if (key !== 'also') expect(blockIdFromKey(key), key).toBeDefined();
    expect(BLOCK_KEYS).toContain('air');
  });

  it('has an example that turns into a real build', () => {
    const shapes = parseShapes(EXAMPLE_BUILD);
    expect(shapes.length).toBe(EXAMPLE_BUILD.shapes.length);
    expect(expandShapes(shapes).length).toBeGreaterThan(200);
  });

  it('reads layer palettes sent as a list', () => {
    const [shape] = parseShapes([
      {
        shape: 'layers',
        origin: [0, 0, 0],
        palette: [{ char: 'a', block: 'gold' }],
        layers: [['a']],
      },
    ]);
    expect(shape).toMatchObject({ palette: { a: 'gold_block' } });
  });
});
