// The trophy cabinet: every trophy, gold when won, grey when still to win.

import { loadTrophies } from '../data/storage';
import { allTrophies } from '../mods/registry';

export function renderTrophies(el: HTMLElement): void {
  const won = loadTrophies();
  const list = allTrophies();
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Pokaaleja ei vielä ole. Modit tuovat niitä!';
    el.replaceChildren(empty);
    return;
  }
  el.replaceChildren(
    ...list.map(({ mod, trophy }) => {
      const card = document.createElement('div');
      const has = !!won[trophy.id];
      card.className = `trophy${has ? ' won' : ''}`;
      const emoji = document.createElement('div');
      emoji.className = 'trophy-emoji';
      emoji.textContent = has ? trophy.emoji : '🔒';
      const name = document.createElement('strong');
      name.textContent = trophy.name;
      const about = document.createElement('small');
      about.textContent = has ? trophy.description : `${mod.emoji} ${mod.name}`;
      card.append(emoji, name, about);
      return card;
    }),
  );
}
