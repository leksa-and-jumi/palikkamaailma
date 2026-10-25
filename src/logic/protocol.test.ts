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
});
