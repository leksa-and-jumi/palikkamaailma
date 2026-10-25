// Start menu: choose your animal and how to play, then make a world, join
// one with a code or play alone.

import './style.css';
import { AVATAR_EMOJIS, DIFFICULTIES, GAME_MODES, type Difficulty, type GameMode } from './config';
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

function showMenu(message = '', isError = false): void {
  game?.stop();
  game = null;
  inventoryScreen.close();
  for (const id of ['loading', 'pause', 'builder', 'death']) $(id).hidden = true;
  $('menu').hidden = false;
  const el = $('menu-message');
  el.textContent = message;
  el.classList.toggle('error', isError);
  renderAvatars();
  renderSettings();
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
  choiceButtons($('mode-choice'), GAME_MODES, settings.mode, (mode: GameMode) => update({ mode }));
  choiceButtons($('difficulty-choice'), DIFFICULTIES, settings.difficulty, (d: Difficulty) =>
    update({ difficulty: d }),
  );
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
$('to-menu').addEventListener('click', () => showMenu());
$('switch-mode').addEventListener('click', () => {
  game?.toggleMode();
  updateModeButton();
});

showMenu();

// Lets automated tests drive the game in development (pointer lock is not available there).
if (import.meta.env.DEV) Object.assign(window, { __game: () => game });
