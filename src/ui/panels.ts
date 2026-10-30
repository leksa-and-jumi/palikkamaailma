// The extra parts of the inventory screen: crafting grid (2 × 2 in the
// backpack, 3 × 3 on a crafting table), furnace and chest.

import { CONTAINERS } from '../config';
import { advanceFurnace, type ChestState, type FurnaceState } from '../logic/containers';
import { canStack, clickSlot, stackLimit, type ItemStack, type Slot } from '../logic/inventory';
import { getItem, itemId } from '../logic/items';
import { canAfford, makeTrade, type Trade } from '../logic/trades';
import {
  ENCHANTMENTS,
  applyBook,
  applyEnchant,
  enchantName,
  offersFor,
  stackName,
  type Offer,
} from '../logic/enchanting';
import { fillSlot } from './slots';
import { consumeIngredients, findRecipe, recipeResult } from '../logic/recipes';
import type { ExtraPanel, InventoryScreen } from './inventoryScreen';

/** Most items crafted by one shift-click (stops runaway loops). */
const MAX_SHIFT_CRAFT = 64;
const FURNACE_REFRESH_MS = 250;

function row(...children: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'panel-row';
  el.append(...children);
  return el;
}

function label(text: string, className = 'panel-arrow'): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

export class CraftingPanel implements ExtraPanel {
  readonly grid: Slot[];
  readonly hideArmor: boolean;

  constructor(private readonly width: 2 | 3) {
    this.grid = Array.from({ length: width * width }, () => null);
    this.hideArmor = width === 3;
  }

  private result(): Slot {
    const recipe = findRecipe(this.grid, this.width);
    return recipe ? recipeResult(recipe) : null;
  }

  render(el: HTMLElement, screen: InventoryScreen): void {
    const grid = document.createElement('div');
    grid.className = 'craft-grid';
    grid.style.gridTemplateColumns = `repeat(${this.width}, 48px)`;
    this.grid.forEach((stack, i) => {
      grid.append(
        screen.slotElement(stack, undefined, (button) => {
          const r = clickSlot(screen.cursor, this.grid[i] ?? null, button);
          screen.cursor = r.cursor;
          this.grid[i] = r.slot;
        }),
      );
    });
    const result = this.result();
    const resultEl = screen.slotElement(result, undefined, (_button, shift) =>
      this.take(screen, shift),
    );
    resultEl.classList.add('result');
    el.append(row(grid, label('➡️'), resultEl));
  }

  /** Clicking the result crafts once (shift: as many as possible into the backpack). */
  private take(screen: InventoryScreen, shift: boolean): void {
    for (let n = 0; n < (shift ? MAX_SHIFT_CRAFT : 1); n++) {
      const result = this.result();
      if (!result) return;
      if (shift) {
        if (!screen.inventory.hasRoomFor(result)) return;
        screen.inventory.add(result);
      } else {
        const cursor = screen.cursor;
        if (cursor) {
          if (!canStack(cursor, result) || cursor.count + result.count > stackLimit(result.id)) {
            return;
          }
          screen.cursor = { ...cursor, count: cursor.count + result.count };
        } else {
          screen.cursor = result;
        }
      }
      consumeIngredients(this.grid);
    }
  }

  close(screen: InventoryScreen): void {
    for (let i = 0; i < this.grid.length; i++) {
      screen.giveBack(this.grid[i] ?? null);
      this.grid[i] = null;
    }
  }
}

export class FurnacePanel implements ExtraPanel {
  readonly hideArmor = true;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public state: FurnaceState,
    private readonly save: (state: FurnaceState) => void,
  ) {}

  render(el: HTMLElement, screen: InventoryScreen): void {
    advanceFurnace(this.state, Date.now());
    const f = this.state;
    const slot = (key: 'input' | 'fuel', hint: string) =>
      screen.slotElement(f[key], hint, (button) => {
        if (key === 'fuel' && screen.cursor && !getItem(screen.cursor.id)?.fuel) return;
        const r = clickSlot(screen.cursor, f[key], button);
        screen.cursor = r.cursor;
        f[key] = r.slot;
        this.changed();
      });
    // The output can only be taken (into the hand or, with shift, the backpack).
    const output = screen.slotElement(f.output, '', (_button, shift) => {
      const out = f.output;
      if (!out) return;
      if (shift) {
        const left = screen.inventory.add(out);
        f.output = left > 0 ? { ...out, count: left } : null;
      } else if (!screen.cursor) {
        screen.cursor = out;
        f.output = null;
      } else if (
        canStack(screen.cursor, out) &&
        screen.cursor.count + out.count <= stackLimit(out.id)
      ) {
        screen.cursor = { ...screen.cursor, count: screen.cursor.count + out.count };
        f.output = null;
      }
      this.changed();
    });

    const burning = f.burnLeft > 0;
    const flame = label(burning ? '🔥' : '▫️', 'panel-flame');
    flame.title = burning ? `Palaa vielä ${Math.ceil(f.burnLeft)} s` : 'Laita polttoainetta';
    const progress = document.createElement('div');
    progress.className = 'panel-progress';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round((f.cook / CONTAINERS.cookSeconds) * 100)}%`;
    progress.append(fill);

    const left = document.createElement('div');
    left.className = 'panel-column';
    left.append(slot('input', '🥩'), flame, slot('fuel', '🪵'));
    el.append(row(left, progress, output));

    // Keep the fire and arrow moving while the window is open.
    if (!this.timer) this.timer = setInterval(() => screen.refresh(), FURNACE_REFRESH_MS);
  }

  private changed(): void {
    advanceFurnace(this.state, Date.now());
    this.save(this.state);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export class ChestPanel implements ExtraPanel {
  readonly hideArmor = true;

  constructor(
    public state: ChestState,
    private readonly save: (state: ChestState) => void,
  ) {}

  render(el: HTMLElement, screen: InventoryScreen): void {
    const grid = document.createElement('div');
    grid.className = 'slot-grid';
    this.state.slots.forEach((stack, i) => {
      grid.append(
        screen.slotElement(stack, undefined, (button, shift) => {
          const slots = this.state.slots;
          if (shift && slots[i]) {
            const left = screen.inventory.add(slots[i]!);
            slots[i] = left > 0 ? { ...slots[i]!, count: left } : null;
          } else {
            const r = clickSlot(screen.cursor, slots[i] ?? null, button);
            screen.cursor = r.cursor;
            slots[i] = r.slot;
          }
          this.save(this.state);
        }),
      );
    });
    el.append(grid);
  }

  close(): void {
    // Chest contents stay in the chest.
  }
}

/** A villager's shop: what they say and what they trade. */
export class TradePanel implements ExtraPanel {
  readonly hideArmor = true;
  readonly hideCatalog = true;

  constructor(
    private readonly title: string,
    private speech: string,
    private readonly trades: readonly Trade[],
    private readonly onTraded: (got: ItemStack) => string,
  ) {}

  render(el: HTMLElement, screen: InventoryScreen): void {
    const head = document.createElement('div');
    head.className = 'villager-title';
    head.textContent = this.title;
    const bubble = document.createElement('div');
    bubble.className = 'speech';
    bubble.textContent = this.speech;
    const list = document.createElement('div');
    list.className = 'trades';
    for (const trade of this.trades) {
      const rowEl = document.createElement('div');
      rowEl.className = 'trade-row';
      for (const g of trade.give) rowEl.append(tradeSlot({ id: itemId(g.key), count: g.count }));
      rowEl.append(label('➡️'));
      rowEl.append(tradeSlot({ id: itemId(trade.get.key), count: trade.get.count }));
      const button = document.createElement('button');
      button.textContent = 'Vaihda';
      button.disabled = !canAfford(screen.inventory, trade);
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const got = makeTrade(screen.inventory, trade);
        if (!got) return;
        this.speech = this.onTraded(got);
        screen.giveBack(got);
        screen.refresh();
      });
      rowEl.append(button);
      list.append(rowEl);
    }
    el.append(head, bubble, list);
  }

  close(): void {
    // Nothing is left in a shop.
  }
}

function tradeSlot(stack: ItemStack): HTMLElement {
  const el = document.createElement('div');
  el.className = 'slot';
  fillSlot(el, stack);
  return el;
}

/** What the enchanting table needs from the game: your levels, and paying them. */
export interface EnchantingPlayer {
  level(): number;
  pay(levels: number): void;
  /** Creative: enchanting is free. */
  free: boolean;
  enchanted(): void;
}

/**
 * The enchanting table (like Minecraft): put a tool, weapon or armor piece on
 * the left and lapis lazuli on the right, then pick one of three enchantments.
 * They cost 1–3 experience levels and as much lapis. An enchanted book on the
 * right puts its enchantment on the item for free.
 */
export class EnchantPanel implements ExtraPanel {
  readonly hideArmor = true;
  private item: Slot = null;
  private extra: Slot = null;
  private seed = Math.floor(Math.random() * 1e9);

  constructor(private readonly player: EnchantingPlayer) {}

  render(el: HTMLElement, screen: InventoryScreen): void {
    const LAPIS = itemId('lapis_lazuli');
    const BOOK = itemId('enchanted_book');
    const itemEl = screen.slotElement(this.item, '⚔️', (button) => {
      const r = clickSlot(screen.cursor, this.item, button);
      if (r.slot && r.slot.count > 1) return;
      screen.cursor = r.cursor;
      this.item = r.slot;
    });
    const extraEl = screen.slotElement(this.extra, '🔷', (button) => {
      const c = screen.cursor;
      if (c && c.id !== LAPIS && c.id !== BOOK) return;
      const r = clickSlot(c, this.extra, button);
      screen.cursor = r.cursor;
      this.extra = r.slot;
    });
    const help = label(
      'Laita vasemmalle työkalu, ase tai haarniska ja oikealle lasuuria (tai lumottu kirja).',
      'enchant-help',
    );
    const list = document.createElement('div');
    list.className = 'enchant-offers';
    const level = this.player.level();
    const item = this.item;
    if (item && this.extra?.id === BOOK) {
      const done = applyBook(item, this.extra);
      list.append(
        this.button(
          done
            ? `📖 Siirrä kirjan lumous: ${stackName(done).replace(/^[^(]*/, '')}`
            : '📖 Kirjan lumous ei sovi tähän',
          !done,
          () => {
            this.item = done;
            this.extra = null;
          },
          screen,
        ),
      );
    } else if (item) {
      const offers = offersFor(item, this.seed);
      if (offers.length === 0) list.append(label('Tätä ei voi lumota.', 'enchant-help'));
      const lapis = this.extra?.id === LAPIS ? this.extra.count : 0;
      for (const o of offers) {
        const info = ENCHANTMENTS[o.enchant];
        const can = this.player.free || (level >= o.cost && lapis >= o.cost);
        this.appendOffer(list, o, info.help, can, screen);
      }
    }
    const levelEl = label(`✨ Tasosi: ${level}`, 'enchant-level');
    el.append(row(itemEl, extraEl), help, list, levelEl);
  }

  private appendOffer(
    list: HTMLElement,
    o: Offer,
    help: string,
    can: boolean,
    screen: InventoryScreen,
  ): void {
    const cost = this.player.free
      ? ''
      : ` · ${o.cost} ${o.cost === 1 ? 'taso' : 'tasoa'} + ${o.cost} 🔷`;
    list.append(
      this.button(
        `${enchantName(o.enchant, o.level)} – ${help}${cost}`,
        !can,
        () => {
          this.item = applyEnchant(this.item!, o.enchant, o.level);
          if (!this.player.free) {
            this.player.pay(o.cost);
            const left = (this.extra?.count ?? 0) - o.cost;
            this.extra = left > 0 && this.extra ? { ...this.extra, count: left } : null;
          }
          this.seed++;
        },
        screen,
      ),
    );
  }

  private button(text: string, disabled: boolean, onClick: () => void, screen: InventoryScreen) {
    const button = document.createElement('button');
    button.className = 'enchant-offer';
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (button.disabled) return;
      onClick();
      this.player.enchanted();
      screen.refresh();
    });
    return button;
  }

  close(screen: InventoryScreen): void {
    screen.giveBack(this.item);
    screen.giveBack(this.extra);
    this.item = null;
    this.extra = null;
  }
}
