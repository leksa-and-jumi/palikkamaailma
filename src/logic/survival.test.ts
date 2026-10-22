import { describe, expect, it } from 'vitest';
import { SURVIVAL } from '../config';
import {
  damageAfterArmor,
  eat,
  fallDamage,
  freshVitals,
  hurt,
  isDead,
  tickVitals,
  type TickInput,
} from './survival';

const calm: TickInput = {
  dt: 0.1,
  difficulty: 'normal',
  underwater: false,
  inLava: false,
  armorPoints: 0,
};

function run(v: ReturnType<typeof freshVitals>, input: Partial<TickInput>, seconds: number) {
  let damage = 0;
  for (let t = 0; t < seconds; t += 0.1) damage += tickVitals(v, { ...calm, ...input });
  return damage;
}

describe('survival', () => {
  it('falling hurts after 3 blocks', () => {
    expect(fallDamage(3)).toBe(0);
    expect(fallDamage(4)).toBe(1);
    expect(fallDamage(10.5)).toBe(8);
  });

  it('armor blocks damage', () => {
    expect(damageAfterArmor(10, 0)).toBe(10);
    expect(damageAfterArmor(10, 20)).toBeCloseTo(2);
  });

  it('heals when well fed', () => {
    const v = freshVitals();
    hurt(v, 6);
    run(v, {}, 9);
    expect(v.health).toBeGreaterThan(14);
  });

  it('gets hungry from exhaustion and can eat', () => {
    const v = freshVitals();
    v.saturation = 0;
    v.exhaustion = 8.5;
    tickVitals(v, calm);
    expect(v.hunger).toBe(SURVIVAL.maxHunger - 2);
    expect(eat(v, 8, 12.8)).toBe(true);
    expect(v.hunger).toBe(SURVIVAL.maxHunger);
    expect(eat(v, 8, 12.8)).toBe(false);
  });

  it('drowns after running out of air', () => {
    const v = freshVitals();
    expect(run(v, { underwater: true }, SURVIVAL.maxAir - 1)).toBe(0);
    expect(run(v, { underwater: true }, 5)).toBeGreaterThan(0);
  });

  it('lava hurts fast', () => {
    const v = freshVitals();
    run(v, { inLava: true }, 3);
    expect(isDead(v)).toBe(true);
  });

  it('peaceful has no hunger', () => {
    const v = freshVitals();
    v.exhaustion = 100;
    tickVitals(v, { ...calm, difficulty: 'peaceful' });
    expect(v.hunger).toBe(SURVIVAL.maxHunger);
  });

  it('starving stops at 10 health on easy', () => {
    const v = freshVitals();
    v.hunger = 0;
    v.saturation = 0;
    run(v, { difficulty: 'easy' }, 120);
    expect(v.health).toBe(10);
  });
});
