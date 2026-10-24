// The backpack screen (E). Creative: every item to pick from. Survival:
// your things and armor. Items move with the mouse like in Minecraft.

import type { GameMode } from '../config';
import { PLACEABLE_BLOCKS } from '../logic/blocks';
import {
  ARMOR_SLOTS,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  Inventory as EmptyInventory,
  clickSlot,
  stackLimit,
  type Inventory,
  type ItemStack,
  type Slot,
} from '../logic/inventory';
import { ITEMS, getItem, type ItemType } from '../logic/items';
import { fillSlot } from './slots';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

interface Category {
  id: string;
  label: string;
  items: () => number[];
}

const nonBlockItems = (test: (item: ItemType) => boolean) =>
  ITEMS.filter((i) => i.block === undefined && test(i)).map((i) => i.id);

const CATEGORIES: readonly Category[] = [
  { id: 'blocks', label: '🧱 Palikat', items: () => [...PLACEABLE_BLOCKS] },
  {
    id: 'tools',
    label: '⛏️ Työkalut',
    items: () =>
      nonBlockItems(
        (i) =>
          (!!i.tool && i.tool.kind !== 'sword') || (!!i.special && i.special.includes('bucket')),
      ),
  },
  {
    id: 'combat',
    label: '⚔️ Taistelu',
    items: () =>
      nonBlockItems(
        (i) =>
          i.tool?.kind === 'sword' || !!i.armor || i.special === 'bow' || i.special === 'arrow',
      ),
  },
  { id: 'food', label: '🍎 Ruoka', items: () => nonBlockItems((i) => !!i.food) },
  {
    id: 'materials',
    label: '💎 Tarvikkeet',
    items: () => nonBlockItems((i) => !i.tool && !i.armor && !i.food && !i.special),
  },
];

const ARMOR_HINTS = ['🪖', '👕', '👖', '👢'];

/** Extra slots shown in the screen (crafting grid, furnace…). */
export interface ExtraPanel {
  /** Draws the panel into the given element; `refresh` redraws everything. */
  render(el: HTMLElement, screen: InventoryScreen): void;
  /** Called when the screen closes, so items can be handed back. */
  close(screen: InventoryScreen): void;
  /** Crafting tables, furnaces and chests don't show the armor slots. */
  hideArmor?: boolean;
}

/** Made once (it listens to the keyboard); each game gives it its inventory. */
export class InventoryScreen {
  cursor: Slot = null;
  inventory: Inventory = new EmptyInventory();
  private mode: GameMode = 'survival';
  private category = 'blocks';
  private onClose: () => void = () => undefined;
  private extra: ExtraPanel | null = null;
  /** Drops items that don't fit back into the inventory. */
  private dropItem: (stack: ItemStack) => void = () => undefined;
  private readonly cursorEl = $('cursor-stack');

  constructor() {
    document.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX}px`;
      this.cursorEl.style.top = `${e.clientY}px`;
    });
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'KeyE' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    $('inventory').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen(): boolean {
    return !$('inventory').hidden;
  }

  open(
    inventory: Inventory,
    dropItem: (stack: ItemStack) => void,
    mode: GameMode,
    onClose: () => void,
    extra: ExtraPanel | null = null,
    title = '🎒 Reppu',
  ): void {
    this.inventory = inventory;
    this.dropItem = dropItem;
    this.mode = mode;
    this.onClose = onClose;
    this.extra = extra;
    $('inventory-title').textContent = title;
    $('inventory').hidden = false;
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.extra?.close(this);
    this.extra = null;
    this.giveBack(this.cursor);
    this.cursor = null;
    $('inventory').hidden = true;
    this.cursorEl.hidden = true;
    this.inventory.onChange();
    this.onClose();
  }

  /** Puts a stack back in the inventory, dropping whatever does not fit. */
  giveBack(stack: Slot): void {
    if (!stack) return;
    const left = this.inventory.add(stack);
    if (left > 0) this.dropItem({ ...stack, count: left });
  }

  /** Redraws all slots. */
  refresh(): void {
    const creative = this.mode === 'creative';
    $('creative-tabs').hidden = !creative;
    $('creative-grid').hidden = !creative;
    $('armor-slots').hidden = creative || !!this.extra?.hideArmor;
    if (creative) this.renderCatalog();

    const armor = $('armor-slots');
    armor.replaceChildren(
      ...ARMOR_SLOTS.map((slotName, i) =>
        this.slotElement(this.inventory.armor[i] ?? null, ARMOR_HINTS[i], (button) => {
          const cursor = this.cursor;
          if (cursor && getItem(cursor.id)?.armor?.slot !== slotName) return;
          const result = clickSlot(cursor, this.inventory.armor[i] ?? null, button);
          this.cursor = result.cursor;
          this.inventory.armor[i] = result.slot;
        }),
      ),
    );

    const extraEl = $('crafting-area');
    extraEl.replaceChildren();
    extraEl.hidden = !this.extra;
    this.extra?.render(extraEl, this);

    const main = $('inventory-main');
    main.replaceChildren(
      ...Array.from({ length: INVENTORY_SIZE - HOTBAR_SIZE }, (_, k) =>
        this.inventorySlot(HOTBAR_SIZE + k),
      ),
    );
    const hotbar = $('inventory-hotbar');
    hotbar.replaceChildren(...Array.from({ length: HOTBAR_SIZE }, (_, k) => this.inventorySlot(k)));

    this.cursorEl.hidden = !this.cursor;
    if (this.cursor) fillSlot(this.cursorEl, this.cursor);
  }

  /** A clickable slot element. */
  slotElement(
    stack: Slot,
    placeholder: string | undefined,
    onClick: (button: 'left' | 'right', shift: boolean) => void,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'slot';
    fillSlot(el, stack, placeholder);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onClick(e.button === 2 ? 'right' : 'left', e.shiftKey);
      this.refresh();
    });
    return el;
  }

  private inventorySlot(index: number): HTMLElement {
    return this.slotElement(this.inventory.slots[index] ?? null, undefined, (button, shift) => {
      const slot = this.inventory.slots[index] ?? null;
      if (shift && slot) {
        // Shift-click moves the stack between the hotbar and the backpack.
        this.inventory.slots[index] = null;
        const range = index < HOTBAR_SIZE ? [HOTBAR_SIZE, INVENTORY_SIZE] : [0, HOTBAR_SIZE];
        let left = slot.count;
        for (let i = range[0]!; i < range[1]! && left > 0; i++) {
          const other = this.inventory.slots[i];
          if (!other) {
            this.inventory.slots[i] = { ...slot, count: left };
            left = 0;
          }
        }
        if (left > 0) this.inventory.slots[index] = { ...slot, count: left };
        return;
      }
      const result = clickSlot(this.cursor, slot, button);
      this.cursor = result.cursor;
      this.inventory.slots[index] = result.slot;
    });
  }

  private renderCatalog(): void {
    $('creative-tabs').replaceChildren(
      ...CATEGORIES.map((c) => {
        const button = document.createElement('button');
        button.textContent = c.label;
        button.className = c.id === this.category ? 'selected' : '';
        button.addEventListener('click', () => {
          this.category = c.id;
          this.refresh();
        });
        return button;
      }),
    );
    const category = CATEGORIES.find((c) => c.id === this.category) ?? CATEGORIES[0]!;
    $('creative-grid').replaceChildren(
      ...category.items().map((id) =>
        this.slotElement({ id, count: 1 }, undefined, (button, shift) => {
          // Holding something and clicking the catalog throws it away.
          if (this.cursor) {
            this.cursor = null;
            return;
          }
          const count = button === 'right' ? 1 : stackLimit(id);
          if (shift) this.inventory.add({ id, count });
          else this.cursor = { id, count };
        }),
      ),
    );
  }
}
