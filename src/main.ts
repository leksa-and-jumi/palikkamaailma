// Start menu: choose your animal and how to play, then make a world, join
// one with a code or play alone.

import './style.css';
import { AVATARS, DIFFICULTIES, GAME_MODES, type Difficulty, type GameMode } from './config';
import { Game, modeButtonText } from './game';
import { SOLO_CODE, normalizeWorldCode } from './logic/codes';
import {
  loadAvatar,
  loadSettings,
  loadWorlds,
  rememberWorld,
  saveAvatar,
  saveSettings,
  type WorldSettings,
} from './data/storage';
import { createWorld, findWorld, type WorldInfo } from './net/convex';
import { WorldRenderer } from './render/worldRenderer';
import { Hud } from './ui/hud';
import { InventoryScreen } from './ui/inventoryScreen';
import { ModsScreen } from './ui/modsScreen';
import { Panorama } from './render/panorama';
import { drawTitleLogo, randomSplash } from './ui/titleLogo';
import { renderTrophies } from './ui/trophyList';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const NEW_WORLD_EMOJIS = ['🏝️', '🌋', '🏔️', '🌲', '🌵', '🍄', '🌈', '⭐'];

const renderer = new WorldRenderer($('game'));
const hud = new Hud();
const inventoryScreen = new InventoryScreen();
let avatar = loadAvatar();
let settings: WorldSettings = loadSettings();
let game: Game | null = null;

const panorama = new Panorama(renderer);
drawTitleLogo($('title-logo') as HTMLCanvasElement);

/** Shows one page of the title screen (main, singleplayer, multiplayer…). */
function showPage(id: string): void {
  for (const page of document.querySelectorAll<HTMLElement>('.menu-page')) {
    page.hidden = page.id !== id;
  }
  if (id === 'page-trophies') renderTrophies($('trophy-list'));
}

document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page!));
});

function showMenu(message = '', isError = false, page = 'page-main'): void {
  game?.stop();
  game = null;
  inventoryScreen.close();
  for (const id of ['loading', 'pause', 'builder', 'death']) $(id).hidden = true;
  hud.show(false);
  $('menu').hidden = false;
  $('splash').textContent = randomSplash();
  panorama.start();
  const el = $('menu-message');
  el.textContent = message;
  el.classList.toggle('error', isError);
  renderAvatars();
  renderSettings();
  renderWorlds();
  // Problems come from joining a world, so show the multiplayer page with them.
  showPage(message && page === 'page-main' ? 'page-multi' : page);
}

function renderAvatars(): void {
  $('avatar-now').textContent = avatar;
  $('avatars').replaceChildren(
    ...AVATARS.map(({ emoji, name }) => {
      const button = document.createElement('button');
      button.innerHTML = `${emoji}<small>${name}</small>`;
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

function choiceButtons<T extends string>(
  el: HTMLElement,
  options: Record<T, { emoji: string; name: string }>,
  selected: T,
  onPick: (value: T) => void,
): void {
  el.replaceChildren(
    ...(Object.keys(options) as T[]).map((key) => {
      const button = document.createElement('button');
      button.textContent = `${options[key].emoji} ${options[key].name}`;
      button.className = key === selected ? 'selected' : '';
      button.addEventListener('click', () => onPick(key));
      return button;
    }),
  );
}

/** Game mode and difficulty for new worlds and playing alone. */
function renderSettings(): void {
  const update = (next: Partial<WorldSettings>) => {
    settings = { ...settings, ...next };
    saveSettings(settings);
    renderSettings();
  };
  // The same choices on the singleplayer and the multiplayer page.
  for (const [mode, difficulty] of [
    ['mode-choice', 'difficulty-choice'],
    ['multi-mode-choice', 'multi-difficulty-choice'],
  ] as const) {
    choiceButtons($(mode), GAME_MODES, settings.mode, (m: GameMode) => update({ mode: m }));
    choiceButtons($(difficulty), DIFFICULTIES, settings.difficulty, (d: Difficulty) =>
      update({ difficulty: d }),
    );
  }
}

function renderWorlds(): void {
  const worlds = loadWorlds();
  $('my-worlds-box').hidden = worlds.length === 0;
  $('my-worlds').replaceChildren(
    ...worlds.map((w) => {
      const button = document.createElement('button');
      const mode = w.mode ? GAME_MODES[w.mode].emoji : '';
      button.textContent = `${w.emoji} ${w.code} ${mode}`;
      button.addEventListener('click', () => void join(w.code));
      return button;
    }),
  );
}

function start(world: WorldInfo, solo: boolean): void {
  panorama.stop();
  $('menu').hidden = true;
  $('loading').hidden = false;
  $('loading-text').textContent = 'Rakennetaan maailmaa…';
  if (!solo) rememberWorld(world);
  game = new Game({ ...world, avatar, solo }, renderer, hud, inventoryScreen, {
    onReady: () => {
      $('loading').hidden = true;
      hud.show(true);
      $('pause').hidden = false;
      updateModeButton();
    },
    onPause: (paused: boolean) => {
      if (paused && $('pause').hidden) pauseShownAt = performance.now();
      $('pause').hidden = !paused;
      updateModeButton();
      if (paused && game) $('village-hint').textContent = game.villageHint();
    },
  });
}

function updateModeButton(): void {
  if (game) $('switch-mode').textContent = modeButtonText(game.mode);
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
    start(await createWorld(emoji, settings.mode, settings.difficulty), false);
  } catch {
    showMenu('📡 Uutta maailmaa ei saatu tehtyä. Kokeile hetken päästä.', true);
  } finally {
    setBusy(false);
  }
});

$('solo').addEventListener('click', () =>
  start(
    { code: SOLO_CODE, emoji: '🏝️', mode: settings.mode, difficulty: settings.difficulty },
    true,
  ),
);

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  void join(($('join-code') as HTMLInputElement).value);
});

$('resume').addEventListener('click', () => game?.resume());
// Clicking beside a window or pressing Esc closes it (no need to find the button).
$('pause').addEventListener('click', (e) => {
  if (e.target !== $('pause') || !game) return;
  $('pause').hidden = true;
  game.resume();
});
let pauseShownAt = 0;
document.addEventListener('keydown', (e) => {
  // The Esc that opened the pause menu must not close it again.
  const fresh = performance.now() - pauseShownAt < 400;
  // The mods window closes first with its own Esc.
  if (e.code === 'Escape' && !$('trophies-screen').hidden) {
    e.preventDefault();
    $('trophies-screen').hidden = true;
    return;
  }
  if (e.code === 'Escape' && !$('pause').hidden && game && !fresh && !modsScreen.isOpen) {
    e.preventDefault();
    $('pause').hidden = true;
    game.resume();
  }
});
$('inventory').addEventListener('mousedown', (e) => {
  if (e.target === $('inventory')) inventoryScreen.close();
});
$('to-menu').addEventListener('click', () => showMenu());
const modsScreen = new ModsScreen();
$('open-trophies').addEventListener('click', () => {
  renderTrophies($('trophy-list-game'));
  $('trophies-screen').hidden = false;
});
const closeTrophies = () => ($('trophies-screen').hidden = true);
$('trophies-close').addEventListener('click', closeTrophies);
$('trophies-screen').addEventListener('mousedown', (e) => {
  if (e.target === $('trophies-screen')) closeTrophies();
});
$('open-help').addEventListener('click', () => ($('help').hidden = !$('help').hidden));
$('open-mods').addEventListener('click', () => {
  if (game) modsScreen.open(game.mods, (id) => game?.toggleMod(id));
});
$('switch-mode').addEventListener('click', () => {
  game?.toggleMode();
  updateModeButton();
});

showMenu();

// Lets automated tests drive the game in development (pointer lock is not available there).
if (import.meta.env.DEV) Object.assign(window, { __game: () => game });
