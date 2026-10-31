import { describe, expect, it } from 'vitest';
import { NET, WORLD_HEIGHT, WORLD_LIMIT } from '../config';
import { BEDROCK, GOLD_BLOCK, LEVER_ON, REDSTONE_LAMP_ON } from './blocks';
import { parseClientMessage, parseEdit, parseEdits } from './protocol';

describe('protocol', () => {
  it('accepts a hello with a known animal', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', avatar: '🦊' }))).toEqual({
      t: 'hello',
      avatar: '🦊',
    });
  });

  it('refuses names or other text as avatar', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', avatar: 'Julius' }))).toBeNull();
  });

  it('checks moves', () => {
    expect(
      parseClientMessage(JSON.stringify({ t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0 })),
    ).not.toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'move', p: [1, 2], yaw: 0, pitch: 0 })),
    ).toBeNull();
    expect(parseClientMessage('{"t":"move","p":[1,2,"x"],"yaw":0,"pitch":0}')).toBeNull();
  });

  it('drops edits outside the world or with bad blocks', () => {
    expect(parseEdit([1, 2, 3, GOLD_BLOCK])).toEqual([1, 2, 3, GOLD_BLOCK]);
    expect(parseEdit([WORLD_LIMIT, 2, 3, GOLD_BLOCK])).toBeNull();
    expect(parseEdit([-5, WORLD_HEIGHT, 3, GOLD_BLOCK])).toBeNull();
    expect(parseEdit([-5, 2, -3000, GOLD_BLOCK])).toEqual([-5, 2, -3000, GOLD_BLOCK]);
    expect(parseEdit([1, 2, 3, 999])).toBeNull();
    expect(parseEdit([1.5, 2, 3, GOLD_BLOCK])).toBeNull();
    expect(parseEdit([1, 2, 3, BEDROCK])).toBeNull();
    expect(parseEdits([[1, 2, 3, GOLD_BLOCK], 'nonsense'])).toEqual([[1, 2, 3, GOLD_BLOCK]]);
  });

  it('refuses too many edits at once', () => {
    const many = Array.from({ length: NET.maxEditsPerMessage + 1 }, () => [1, 2, 3, GOLD_BLOCK]);
    expect(parseEdits(many)).toBeNull();
  });

  it('cleans chat messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: '  moi\n kaikki  ' }))).toEqual({
      t: 'chat',
      text: 'moi kaikki',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: '   ' }))).toBeNull();
    const long = parseClientMessage(JSON.stringify({ t: 'chat', text: 'a'.repeat(500) }));
    expect(long).toEqual({ t: 'chat', text: 'a'.repeat(NET.maxChatLength) });
  });

  it('ignores broken messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'shout', text: 'hi' }))).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
  });

  it('refuses redstone looks but accepts switches', () => {
    expect(parseEdit([1, 50, 1, REDSTONE_LAMP_ON])).toBeNull();
    expect(parseEdit([1, 50, 1, LEVER_ON])).toEqual([1, 50, 1, LEVER_ON]);
  });

  it('checks rockets', () => {
    const rocket = { t: 'firework', p: [1, 50, 2], kind: 2, seed: 12345 };
    expect(parseClientMessage(JSON.stringify(rocket))).toEqual(rocket);
    expect(parseClientMessage(JSON.stringify({ ...rocket, kind: 99 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...rocket, seed: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...rocket, p: [1, 2] }))).toBeNull();
  });

  it('checks teleport requests and answers', () => {
    const ask = { t: 'ask', to: 'abc123', kind: 'tpa' };
    expect(parseClientMessage(JSON.stringify(ask))).toEqual(ask);
    expect(parseClientMessage(JSON.stringify({ ...ask, kind: 'steal' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ask, to: 'NOT OK!' }))).toBeNull();
    const yes = { t: 'answer', to: 'abc123', kind: 'invite', yes: true, p: [1, 60, 2] };
    expect(parseClientMessage(JSON.stringify(yes))).toEqual(yes);
    expect(parseClientMessage(JSON.stringify({ ...yes, p: [1, 2] }))).toBeNull();
    const no = { t: 'answer', to: 'abc123', kind: 'tpa', yes: false };
    expect(parseClientMessage(JSON.stringify(no))).toEqual(no);
  });

  it('allows clock jumps of at most a day', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'time', skip: 60_000 }))).toEqual({
      t: 'time',
      skip: 60_000,
    });
    expect(parseClientMessage(JSON.stringify({ t: 'time', skip: -5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'time', skip: 1e12 }))).toBeNull();
    const sleep = { t: 'sleep', on: true, skip: 1000 };
    expect(parseClientMessage(JSON.stringify(sleep))).toEqual(sleep);
    expect(parseClientMessage(JSON.stringify({ ...sleep, on: 'yes' }))).toBeNull();
  });

  it('checks minecarts', () => {
    const cart = ['c-abc-1-x', 1.5, 60, 2.5, 1, 3.2, ''];
    expect(parseClientMessage(JSON.stringify({ t: 'cart', cart }))).toEqual({ t: 'cart', cart });
    expect(
      parseClientMessage(JSON.stringify({ t: 'cart', cart: [...cart.slice(0, 4), 7, 0, ''] })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'cart', cart: [...cart.slice(0, 5), 99, ''] })),
    ).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'cartGone', id: 'c-abc-1-x' }))).toEqual({
      t: 'cartGone',
      id: 'c-abc-1-x',
    });
    const move = { t: 'move', p: [1, 60, 2], yaw: 0, pitch: 0, carts: [cart] };
    expect(parseClientMessage(JSON.stringify(move))).toEqual(move);
  });

  it('checks the list of mods', () => {
    const msg = { t: 'mods', enabled: ['moon-jump', 'future-mod'] };
    expect(parseClientMessage(JSON.stringify(msg))).toEqual(msg);
    expect(parseClientMessage(JSON.stringify({ t: 'mods', enabled: ['Bad Id!'] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'mods', enabled: 'moon-jump' }))).toBeNull();
  });

  it('lets gear (armor and the held item) ride along with a move', () => {
    const move = parseClientMessage(
      JSON.stringify({ t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, gear: [300, 301, 0, 0, 320] }),
    );
    expect(move).toMatchObject({ gear: [300, 301, 0, 0, 320] });
    const bad = parseClientMessage(
      JSON.stringify({ t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, gear: [1, 2, 'x', 0, 0] }),
    );
    expect(bad && 'gear' in bad).toBe(false);
  });

  it('passes poses and arm swings, nothing else', () => {
    const move = parseClientMessage(
      JSON.stringify({ t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, pose: 'fly', act: 'swing' }),
    );
    expect(move).toMatchObject({ pose: 'fly', act: 'swing' });
    const odd = parseClientMessage(
      JSON.stringify({ t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, pose: 'dance', act: 'boom' }),
    );
    expect(odd && ('pose' in odd || 'act' in odd)).toBe(false);
  });

  it('lets a shared mod take and give back things, with nothing extra', () => {
    const strip = parseClientMessage(
      JSON.stringify({ t: 'modCall', to: 'p1', mod: '', call: 'strip', items: [1, 2] }),
    );
    expect(strip).toEqual({ t: 'modCall', to: 'p1', mod: '', call: 'strip' });
    expect(
      parseClientMessage(JSON.stringify({ t: 'modCall', to: 'p1', mod: '', call: 'unstrip' })),
    ).toEqual({ t: 'modCall', to: 'p1', mod: '', call: 'unstrip' });
    expect(
      parseClientMessage(JSON.stringify({ t: 'modCall', to: 'p1', mod: '', call: 'steal' })),
    ).toBeNull();
  });
});
