// The extra parts of the inventory screen: crafting grid (2 × 2 in the
// backpack, 3 × 3 on a crafting table), furnace and chest.

import { CONTAINERS } from '../config';
import { advanceFurnace, type ChestState, type FurnaceState } from '../logic/containers';
import { canStack, clickSlot, stackLimit, type ItemStack, type Slot } from '../logic/inventory';
import { getItem, itemId } from '../logic/items';
import { canAfford, makeTrade, type Trade } from '../logic/trades';
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
