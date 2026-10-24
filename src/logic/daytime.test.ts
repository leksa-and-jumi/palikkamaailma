import { describe, expect, it } from 'vitest';
import { DAY } from '../config';
import { dayLabel, daylight, isNight, timeOfDay } from './daytime';

describe('day and night', () => {
  it('goes round once per day length', () => {
    const a = timeOfDay(0, 0);
    const b = timeOfDay(DAY.length * 1000, 0);
    expect(a).toBeCloseTo(b);
    expect(timeOfDay((DAY.length * 1000) / 4, 0)).toBeCloseTo(0.25);
  });

  it('is the same for everyone in a world, different between worlds', () => {
    expect(timeOfDay(123456, 7)).toBe(timeOfDay(123456, 7));
    expect(timeOfDay(123456, 7)).not.toBe(timeOfDay(123456, 600));
  });

  it('is bright at noon and dark at midnight', () => {
    expect(daylight(0.25)).toBe(1);
    expect(daylight(0.75)).toBe(0);
    expect(isNight(0.75)).toBe(true);
    expect(isNight(0.25)).toBe(false);
    expect(dayLabel(0.25)).toBe('☀️ Päivä');
    expect(dayLabel(0.75)).toBe('🌙 Yö');
  });
});
