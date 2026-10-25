import { describe, expect, it, vi } from 'vitest';
import { itemId } from '../logic/items';
import { mulberry32 } from '../logic/noise';
import { MobManager, type MobEvents } from './mobManager';

function setup() {
  const events: MobEvents = {
    drop: vi.fn(),
    xp: vi.fn(),
    sendHit: vi.fn(),
    toast: vi.fn(),
    hurtPlayer: vi.fn(),
    blast: vi.fn(),
  };
  const mobs = new MobManager(events, mulberry32(5));
  return { events, mobs };
}

describe('mob manager', () => {
  it('a cow defeated by you drops beef and gives experience', () => {
    const { events, mobs } = setup();
    const cow = mobs.spawn('cow', 0, 50, 0);
    mobs.hit(cow.id, 6, [0, -3]);
    expect(mobs.owned.has(cow.id)).toBe(true);
    mobs.hit(cow.id, 6, [0, -3]);
    expect(mobs.owned.has(cow.id)).toBe(false);
    const dropped = (events.drop as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].id);
    expect(dropped).toContain(itemId('beef'));
    expect(events.xp).toHaveBeenCalledWith(2);
  });

  it('finds the creature you are looking at', () => {
    const { mobs } = setup();
    const pig = mobs.spawn('pig', 0.5, 50, -3);
    expect(mobs.pick([0.5, 50.5, 0], [0, 0, -1], 5)?.id).toBe(pig.id);
    expect(mobs.pick([0.5, 50.5, 0], [0, 0, 1], 5)).toBeNull();
    expect(mobs.pick([0.5, 50.5, 0], [0, 0, -1], 2)).toBeNull();
  });

  it("asks the owner when you hit someone else's creature", () => {
    const { events, mobs } = setup();
    mobs.myId = 'b';
    mobs.receive('a', [['a-1-x', 'pig', 0, 50, 0, 0, 10, 0, 0, 0]]);
    mobs.hit('a-1-x', 4, [1, 1]);
    expect(events.sendHit).toHaveBeenCalledWith('a-1-x', 4, [1, 1]);
  });

  it('the smaller player id owns a creature both have', () => {
    const { mobs } = setup();
    mobs.myId = 'm';
    const sheep = mobs.spawn('sheep', 0, 50, 0);
    mobs.receive('z', [[sheep.id, 'sheep', 0, 50, 0, 0, 8, 0, 0, 0]]);
    expect(mobs.owned.has(sheep.id)).toBe(true);
    mobs.receive('a', [[sheep.id, 'sheep', 0, 50, 0, 0, 8, 0, 0, 0]]);
    expect(mobs.owned.has(sheep.id)).toBe(false);
  });

  it('only sends creatures that other players can see', () => {
    const { mobs } = setup();
    mobs.spawn('chicken', 0, 50, 0);
    expect(mobs.netList([])).toEqual([]);
    expect(mobs.netList([{ id: 'x', x: 500, y: 50, z: 0 }])).toEqual([]);
    expect(mobs.netList([{ id: 'x', x: 10, y: 50, z: 0 }])).toHaveLength(1);
  });

  it('two fed animals make a baby', () => {
    const { mobs } = setup();
    const a = mobs.spawn('pig', 0, 50, 0);
    const b = mobs.spawn('pig', 1, 50, 0);
    a.baby = b.baby = false;
    expect(mobs.feed(a.id, 'apple')).toBe(true);
    expect(mobs.feed(b.id, 'wheat')).toBe(false);
    expect(mobs.feed(b.id, 'apple')).toBe(true);
    (mobs as unknown as { breed(): void }).breed();
    expect([...mobs.owned.values()].filter((m) => m.baby)).toHaveLength(1);
  });
});

describe('monsters', () => {
  it('a new zombie can attack straight away', () => {
    const { mobs } = setup();
    expect(mobs.spawn('zombie', 0, 50, 0).cooldown).toBe(0);
    expect(mobs.spawn('chicken', 0, 50, 0).cooldown).toBeGreaterThan(0);
  });
});
