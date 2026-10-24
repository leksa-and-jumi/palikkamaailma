import { describe, expect, it } from 'vitest';
import { MOBS } from '../config';
import { createMob, think, yawTowards, type Seen } from './mobBrain';
import { mulberry32 } from './noise';
import { rollDrops } from './mobs';

const random = mulberry32(1);
const player = (x: number, z: number, holding?: string): Seen => ({
  id: 'p',
  x,
  y: 50,
  z,
  holding,
});

describe('mob brain', () => {
  it('faces the right way', () => {
    expect(yawTowards(0, 0, 0, -10)).toBeCloseTo(0);
    expect(yawTowards(0, 0, 10, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('runs away from whoever hurt it', () => {
    const cow = createMob('a', 'cow', 0, 50, 0, 'lazy', 'Nöpö');
    cow.hurt = 0;
    cow.hurtFrom = [0, -5];
    const t = think(cow, [player(0, -5)], 0.1, random);
    expect(cow.mode).toBe('flee');
    expect(t.input.forward).toBe(1);
    expect(t.input.sprint).toBe(true);
    // Away from (0, -5) means towards +z: yaw π.
    expect(Math.abs(t.yaw)).toBeCloseTo(Math.PI);
  });

  it('follows a player holding its food', () => {
    const sheep = createMob('b', 'sheep', 0, 50, 0, 'grumpy', 'Pipsa');
    const t = think(sheep, [player(5, 0, 'wheat')], 0.1, random);
    expect(sheep.mode).toBe('follow');
    expect(t.input.forward).toBe(1);
  });

  it('shy animals keep away', () => {
    const pig = createMob('c', 'pig', 0, 50, 0, 'shy', 'Topi');
    think(pig, [player(2, 0)], 0.1, random);
    expect(pig.mode).toBe('flee');
  });

  it('wanders around by itself', () => {
    const chicken = createMob('d', 'chicken', 0, 50, 0, 'playful', 'Tipu');
    const modes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      think(chicken, [], 0.5, random);
      modes.add(chicken.mode);
    }
    expect(modes.has('wander')).toBe(true);
  });

  it('babies grow up later', () => {
    expect(createMob('e', 'pig', 0, 0, 0, 'lazy', 'X', true).grow).toBe(MOBS.growSeconds);
  });

  it('drops Minecraft items', () => {
    const drops = rollDrops('cow', () => 0.99);
    expect(drops.map((d) => d.key)).toEqual(['beef', 'leather']);
    expect(rollDrops('cow', () => 0).map((d) => d.key)).toEqual(['beef']);
  });
});
