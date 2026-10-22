import { describe, expect, it } from 'vitest';
import { NET, WORLD_SIZE } from '../config';
import { BEDROCK, GOLD } from './blocks';
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
    expect(parseEdit([1, 2, 3, GOLD])).toEqual([1, 2, 3, GOLD]);
    expect(parseEdit([WORLD_SIZE, 2, 3, GOLD])).toBeNull();
    expect(parseEdit([1, 2, 3, 999])).toBeNull();
    expect(parseEdit([1.5, 2, 3, GOLD])).toBeNull();
    expect(parseEdit([1, 2, 3, BEDROCK])).toBeNull();
    expect(parseEdits([[1, 2, 3, GOLD], 'nonsense'])).toEqual([[1, 2, 3, GOLD]]);
  });

  it('refuses too many edits at once', () => {
    const many = Array.from({ length: NET.maxEditsPerMessage + 1 }, () => [1, 2, 3, GOLD]);
    expect(parseEdits(many)).toBeNull();
  });

  it('ignores broken messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: 'hi' }))).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
  });
});
