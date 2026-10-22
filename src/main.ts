// Start menu: choose your animal, then make a world, join one with a code or play alone.

import './style.css';
import { AVATAR_EMOJIS } from './config';
import { Game } from './game';
import { SOLO_CODE, normalizeWorldCode } from './logic/codes';
import { loadAvatar, loadWorlds, rememberWorld, saveAvatar } from './data/storage';
import { createWorld, findWorld, type WorldInfo } from './net/convex';
import { WorldRenderer } from './render/worldRenderer';
import { Hud } from './ui/hud';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const NEW_WORLD_EMOJIS = ['🏝️', '🌋', '🏔️', '🌲', '🌵', '🍄', '🌈', '⭐'];

const renderer = new WorldRenderer($('game'));
const hud = new Hud();
let avatar = loadAvatar();
let game: Game | null = null;

function showMenu(message = '', isError = false): void {
  game?.stop();
  game = null;
  for (const id of ['loading', 'pause', 'picker', 'builder']) $(id).hidden = true;
  $('menu').hidden = false;
  const el = $('menu-message');
  el.textContent = message;
  el.classList.toggle('error', isError);
  renderAvatars();
  renderWorlds();
}

function renderAvatars(): void {
  $('avatars').replaceChildren(
    ...AVATAR_EMOJIS.map((emoji) => {
      const button = document.createElement('button');
      button.textContent = emoji;
      button.className = emoji === avatar ? 'selected' : '';
      button.addEventListener('click', () => {
        avatar = emoji;
        saveAvatar(emoji);
        renderAvatars();
      });
      return button;
    }),
  );
}

function renderWorlds(): void {
  const worlds = loadWorlds();
  $('my-worlds-box').hidden = worlds.length === 0;
  $('my-worlds').replaceChildren(
    ...worlds.map((w) => {
      const button = document.createElement('button');
      button.textContent = `${w.emoji} ${w.code}`;
      button.addEventListener('click', () => void join(w.code));
      return button;
    }),
  );
}

function start(world: WorldInfo, solo: boolean): void {
  $('menu').hidden = true;
  $('loading').hidden = false;
  $('loading-text').textContent = 'Rakennetaan saarta…';
  if (!solo) rememberWorld(world);
  game = new Game({ code: world.code, emoji: world.emoji, avatar, solo }, renderer, hud, {
    onReady: () => {
      $('loading').hidden = true;
      hud.show(true);
      $('pause').hidden = false;
    },
    onPause: (paused) => {
      $('pause').hidden = !paused;
    },
  });
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('#menu button').forEach((b) => (b.disabled = busy));
}

async function join(typed: string): Promise<void> {
  const code = normalizeWorldCode(typed);
  if (!code) {
    showMenu('🤔 Koodi on kaksi sanaa ja numero, esim. KALA-PUU-42.', true);
    return;
  }
  setBusy(true);
  try {
    const world = await findWorld(code);
    if (!world) {
      showMenu(`❓ Maailmaa ${code} ei löytynyt. Tarkista koodi!`, true);
      return;
    }
    start(world, false);
  } catch {
    showMenu('📡 Yhteys ei toimi juuri nyt. Kokeile hetken päästä.', true);
  } finally {
    setBusy(false);
  }
}

$('new-world').addEventListener('click', async () => {
  setBusy(true);
  try {
    const emoji = NEW_WORLD_EMOJIS[Math.floor(Math.random() * NEW_WORLD_EMOJIS.length)]!;
    start(await createWorld(emoji), false);
  } catch {
    showMenu('📡 Uutta maailmaa ei saatu tehtyä. Kokeile hetken päästä.', true);
  } finally {
    setBusy(false);
  }
});

$('solo').addEventListener('click', () => start({ code: SOLO_CODE, emoji: '🏝️' }, true));

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void join(($('join-code') as HTMLInputElement).value);
});

$('resume').addEventListener('click', () => game?.resume());
$('to-menu').addEventListener('click', () => showMenu());

showMenu();

// Lets automated tests drive the game in development (pointer lock is not available there).
if (import.meta.env.DEV) Object.assign(window, { __game: () => game });
