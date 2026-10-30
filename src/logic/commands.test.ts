import { describe, expect, it } from 'vitest';
import { animalName, commandHints, findPlayer, parseCommand } from './commands';

describe('chat commands', () => {
  it('leaves ordinary chat alone', () => {
    expect(parseCommand('moi kaikki')).toBeNull();
  });

  it('reads Finnish and English commands', () => {
    expect(parseCommand('/tpa kettu')).toEqual({ kind: 'tpa', target: 'kettu' });
    expect(parseCommand('/kutsu Karhu 2')).toEqual({ kind: 'invite', target: 'karhu 2' });
    expect(parseCommand('/tpaccept')).toEqual({ kind: 'accept' });
    expect(parseCommand('/HYLKÄÄ')).toEqual({ kind: 'deny' });
    expect(parseCommand('/aika yö')).toEqual({ kind: 'time', value: 'night' });
    expect(parseCommand('/time set day')).toEqual({ kind: 'time', value: 'day' });
    expect(parseCommand('/tila luova')).toEqual({ kind: 'mode', value: 'creative' });
    expect(parseCommand('/lennä nyt')).toEqual({ kind: 'unknown', name: 'lennä', args: 'nyt' });
  });

  it('hints commands while typing', () => {
    expect(commandHints('/ko')).toEqual(['/koti – mene kotiin']);
    expect(commandHints('/').length).toBeGreaterThan(5);
    expect(commandHints('moi')).toEqual([]);
  });

  it('finds the player by animal name, emoji or number', () => {
    const players = [
      { id: 'a', avatar: '🦊' },
      { id: 'b', avatar: '🐻' },
      { id: 'c', avatar: '🦊' },
    ];
    expect(animalName('🦊')).toBe('kettu');
    expect(findPlayer('karhu', players)).toEqual({ found: players[1] });
    expect(findPlayer('🐻', players)).toEqual({ found: players[1] });
    expect(findPlayer('kettu', players)).toEqual({ error: 'many' });
    expect(findPlayer('kettu 2', players)).toEqual({ found: players[2] });
    expect(findPlayer('dino', players)).toEqual({ error: 'missing' });
    expect(findPlayer('', players)).toEqual({ error: 'who' });
    expect(findPlayer('', [players[0]!])).toEqual({ found: players[0] });
    expect(findPlayer('kettu', [])).toEqual({ error: 'nobody' });
  });
});
