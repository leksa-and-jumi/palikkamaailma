// Chat commands like in Minecraft, in Finnish (English works too):
// /tpa kettu asks to go to the fox, /kutsu kettu asks the fox to come to you,
// and the other player answers yes or no.

import { AVATARS } from '../config';

export type RequestKind = 'tpa' | 'invite';

export type Command =
  | { kind: 'help' }
  | { kind: RequestKind; target: string }
  | { kind: 'accept' }
  | { kind: 'deny' }
  | { kind: 'home' }
  | { kind: 'sethome' }
  | { kind: 'spawn' }
  | { kind: 'players' }
  | { kind: 'where' }
  | { kind: 'time'; value: 'day' | 'night' | null }
  | { kind: 'mode'; value: 'creative' | 'survival' | null }
  | { kind: 'mods' }
  | { kind: 'unknown'; name: string };

interface CommandInfo {
  names: readonly string[];
  /** Shown in /apua and in the hint under the chat box. */
  help: string;
  make(args: string): Command;
}

export const COMMAND_LIST: readonly CommandInfo[] = [
  {
    names: ['apua', 'help', 'ohje'],
    help: '/apua – kaikki komennot',
    make: () => ({ kind: 'help' }),
  },
  {
    names: ['tpa', 'mene'],
    help: '/tpa kettu – pyydä päästä kaverin luo',
    make: (target) => ({ kind: 'tpa', target }),
  },
  {
    names: ['kutsu', 'tpahere'],
    help: '/kutsu kettu – kutsu kaveri luoksesi',
    make: (target) => ({ kind: 'invite', target }),
  },
  {
    names: ['hyväksy', 'kyllä', 'joo', 'tpaccept'],
    help: '/hyväksy – sano kyllä pyyntöön (tai Y)',
    make: () => ({ kind: 'accept' }),
  },
  {
    names: ['hylkää', 'ei', 'tpdeny'],
    help: '/hylkää – sano ei pyyntöön (tai X)',
    make: () => ({ kind: 'deny' }),
  },
  { names: ['koti', 'home'], help: '/koti – mene kotiin', make: () => ({ kind: 'home' }) },
  {
    names: ['asetakoti', 'sethome'],
    help: '/asetakoti – tämä paikka on kotisi',
    make: () => ({ kind: 'sethome' }),
  },
  {
    names: ['alku', 'spawn'],
    help: '/alku – takaisin maailman alkuun',
    make: () => ({ kind: 'spawn' }),
  },
  {
    names: ['pelaajat', 'list'],
    help: '/pelaajat – ketkä ovat maailmassa',
    make: () => ({ kind: 'players' }),
  },
  {
    names: ['sijainti', 'missä'],
    help: '/sijainti – missä olet (koordinaatit)',
    make: () => ({ kind: 'where' }),
  },
  {
    names: ['aika', 'time'],
    help: '/aika päivä tai /aika yö – vaihda aikaa',
    make: (args) => {
      const word = args.split(' ').pop() ?? '';
      const value = ['päivä', 'day', 'aamu'].includes(word)
        ? 'day'
        : ['yö', 'night', 'ilta'].includes(word)
          ? 'night'
          : null;
      return { kind: 'time', value };
    },
  },
  {
    names: ['modit', 'mods'],
    help: '/modit – mitkä modit ovat päällä (vaihda taukovalikosta)',
    make: () => ({ kind: 'mods' }),
  },
  {
    names: ['tila', 'gamemode'],
    help: '/tila luova tai /tila selviytyjä – vaihda pelitilaa',
    make: (args) => {
      const value = /^(luova|nikkaroija|creative|1)/.test(args)
        ? 'creative'
        : /^(selviytyjä|survival|0)/.test(args)
          ? 'survival'
          : null;
      return { kind: 'mode', value };
    },
  },
];

const BY_NAME = new Map(COMMAND_LIST.flatMap((c) => c.names.map((n) => [n, c] as const)));

/** Reads a chat line. Null when it is ordinary chat (does not start with /). */
export function parseCommand(text: string): Command | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const [name = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const info = BY_NAME.get(name.toLowerCase());
  if (!info) return { kind: 'unknown', name };
  return info.make(rest.join(' ').toLowerCase());
}

/** Commands that start like what is typed (for the hint under the chat box). */
export function commandHints(text: string): string[] {
  if (!text.startsWith('/')) return [];
  const typed = text.slice(1).split(/\s+/)[0]!.toLowerCase();
  return COMMAND_LIST.filter((c) => c.names.some((n) => n.startsWith(typed))).map((c) => c.help);
}

/** The animal's name ("kettu") for an avatar emoji. */
export function animalName(emoji: string): string {
  return AVATARS.find((a) => a.emoji === emoji)?.name ?? emoji;
}

export interface Someone {
  id: string;
  avatar: string;
}

/**
 * Who `target` means: an animal name or emoji, with a number when two have
 * the same animal ("kettu 2"). With only one other player the name can be left out.
 */
export function findPlayer(
  target: string,
  players: readonly Someone[],
): { found: Someone } | { error: 'nobody' | 'who' | 'many' | 'missing' } {
  if (players.length === 0) return { error: 'nobody' };
  const words = target.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return players.length === 1 ? { found: players[0]! } : { error: 'who' };
  const number = Number(words[words.length - 1]);
  const name = (Number.isInteger(number) ? words.slice(0, -1) : words).join(' ');
  const matches = players.filter(
    (p) => p.avatar === name || (name.length >= 2 && animalName(p.avatar).startsWith(name)),
  );
  if (matches.length === 0) return { error: 'missing' };
  if (Number.isInteger(number)) {
    const pick = matches[number - 1];
    return pick ? { found: pick } : { error: 'missing' };
  }
  return matches.length === 1 ? { found: matches[0]! } : { error: 'many' };
}
