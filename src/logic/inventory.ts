// The player's inventory: 36 slots (the first 9 are the hotbar) and 4 armor
// slots. Clicking works like Minecraft: left click picks up or puts down the
// whole stack, right click takes half or puts down one.

import { getItem, isValidItemId, maxDurability, type ArmorSlot } from './items';

export interface ItemStack {
  id: number;
  count: number;
  /** Uses spent (tools and armor). */
  damage?: number;
  /** Enchantment key → level. */
  enchants?: Record<string, number>;
}

export type Slot = ItemStack | null;

export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'chest', 'legs', 'feet'];

const MAX_ENCHANTS = 8;
const MAX_ENCHANT_LEVEL = 10;

export function stackLimit(id: number): number {
  return getItem(id)?.stack ?? 64;
}

/** Two stacks can merge if they are the same plain item. */
export function canStack(a: ItemStack, b: ItemStack): boolean {
  return (
    a.id === b.id && stackLimit(a.id) > 1 && !a.damage && !b.damage && !a.enchants && !b.enchants
  );
}

/** Checks a stack that came from storage or the network. */
export function parseStack(v: unknown): ItemStack | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!isValidItemId(s.id)) return null;
  const limit = stackLimit(s.id);
  if (typeof s.count !== 'number' || !Number.isInteger(s.count) || s.count < 1 || s.count > limit) {
    return null;
  }
  const stack: ItemStack = { id: s.id, count: s.count };
  const durability = maxDurability(getItem(s.id)!);
  if (s.damage !== undefined) {
    if (typeof s.damage !== 'number' || !Number.isInteger(s.damage) || s.damage < 0) return null;
    if (durability !== undefined && s.damage >= durability) return null;
    if (s.damage > 0) stack.damage = s.damage;
  }
  if (s.enchants !== undefined) {
    if (typeof s.enchants !== 'object' || s.enchants === null) return null;
    const entries = Object.entries(s.enchants as Record<string, unknown>);
    if (entries.length > MAX_ENCHANTS) return null;
    const enchants: Record<string, number> = {};
    for (const [key, level] of entries) {
      if (!/^[a-z_]{1,32}$/.test(key)) return null;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1) return null;
      if (level > MAX_ENCHANT_LEVEL) return null;
      enchants[key] = level;
    }
    if (entries.length > 0) stack.enchants = enchants;
  }
  return stack;
}

export interface ClickResult {
  cursor: Slot;
  slot: Slot;
}

/** What happens when you click an inventory slot while holding `cursor`. */
export function clickSlot(cursor: Slot, slot: Slot, button: 'left' | 'right'): ClickResult {
  if (button === 'left') {
    if (!cursor) return { cursor: slot, slot: null };
    if (!slot) return { cursor: null, slot: cursor };
    if (canStack(cursor, slot)) {
      const room = stackLimit(slot.id) - slot.count;
      const moved = Math.min(room, cursor.count);
      const left = cursor.count - moved;
      return {
        cursor: left > 0 ? { ...cursor, count: left } : null,
        slot: { ...slot, count: slot.count + moved },
      };
    }
    return { cursor: slot, slot: cursor };
  }

  // Right click.
  if (!cursor) {
    if (!slot) return { cursor: null, slot: null };
    const half = Math.ceil(slot.count / 2);
    const rest = slot.count - half;
    return { cursor: { ...slot, count: half }, slot: rest > 0 ? { ...slot, count: rest } : null };
  }
  if (!slot) {
    const rest = cursor.count - 1;
    return { cursor: rest > 0 ? { ...cursor, count: rest } : null, slot: { ...cursor, count: 1 } };
  }
  if (canStack(cursor, slot) && slot.count < stackLimit(slot.id)) {
    const rest = cursor.count - 1;
    return {
      cursor: rest > 0 ? { ...cursor, count: rest } : null,
      slot: { ...slot, count: slot.count + 1 },
    };
  }
  return { cursor: slot, slot: cursor };
}

export class Inventory {
  slots: Slot[] = Array.from({ length: INVENTORY_SIZE }, () => null);
  armor: Slot[] = [null, null, null, null];
  /** Called whenever something changes (to redraw the hotbar). */
  onChange: () => void = () => undefined;

  /** Adds items; returns how many did not fit. Fills stacks, then the hotbar, then the rest. */
  add(stack: ItemStack): number {
    let left = stack.count;
    const limit = stackLimit(stack.id);
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      const slot = this.slots[i];
      if (slot && canStack(slot, stack) && slot.count < limit) {
        const moved = Math.min(limit - slot.count, left);
        slot.count += moved;
        left -= moved;
      }
    }
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(limit, left);
      this.slots[i] = { ...stack, count: moved };
      left -= moved;
    }
    if (left !== stack.count) this.onChange();
    return left;
  }

  /** Can this whole stack fit? */
  hasRoomFor(stack: ItemStack): boolean {
    let room = 0;
    const limit = stackLimit(stack.id);
    for (const slot of this.slots) {
      if (!slot) room += limit;
      else if (canStack(slot, stack)) room += limit - slot.count;
      if (room >= stack.count) return true;
    }
    return false;
  }

  count(id: number): number {
    return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }

  /** Takes `count` items of this id from anywhere. Returns false (and takes nothing) if short. */
  removeItems(id: number, count: number): boolean {
    if (this.count(id) < count) return false;
    let left = count;
    for (let i = INVENTORY_SIZE - 1; i >= 0 && left > 0; i--) {
      const slot = this.slots[i];
      if (slot?.id !== id) continue;
      const taken = Math.min(slot.count, left);
      slot.count -= taken;
      left -= taken;
      if (slot.count === 0) this.slots[i] = null;
    }
    this.onChange();
    return true;
  }

  /** Takes one item from a slot (placing a block, eating). */
  takeOne(index: number): ItemStack | null {
    const slot = this.slots[index];
    if (!slot) return null;
    slot.count--;
    if (slot.count <= 0) this.slots[index] = null;
    this.onChange();
    return { ...slot, count: 1 };
  }

  /** Wears a tool or armor piece by `amount`; it breaks at its durability. Returns true if it broke. */
  wear(list: 'slots' | 'armor', index: number, amount = 1): boolean {
    const slot = this[list][index];
    if (!slot) return false;
    const item = getItem(slot.id);
    const max = item ? maxDurability(item) : undefined;
    if (max === undefined) return false;
    slot.damage = (slot.damage ?? 0) + amount;
    const broke = slot.damage >= max;
    if (broke) this[list][index] = null;
    this.onChange();
    return broke;
  }

  /**
   * Puts on the armor piece in this backpack slot (like right-clicking it in
   * Minecraft). What was worn there before goes back into the same slot.
   */
  equip(index: number): boolean {
    const stack = this.slots[index];
    const armor = stack ? getItem(stack.id)?.armor : undefined;
    if (!stack || !armor) return false;
    const i = ARMOR_SLOTS.indexOf(armor.slot);
    this.slots[index] = this.armor[i] ?? null;
    this.armor[i] = stack;
    this.onChange();
    return true;
  }

  /** Takes an armor piece off into the backpack (false if the backpack is full). */
  unequip(i: number): boolean {
    const stack = this.armor[i];
    if (!stack || !this.hasRoomFor(stack)) return false;
    this.armor[i] = null;
    this.add(stack);
    this.onChange();
    return true;
  }

  /** Total armor points worn. */
  armorPoints(): number {
    return this.armor.reduce((n, s) => n + (s ? (getItem(s.id)?.armor?.points ?? 0) : 0), 0);
  }

  clear(): void {
    this.slots = this.slots.map(() => null);
    this.armor = this.armor.map(() => null);
    this.onChange();
  }

  toJSON(): { slots: Slot[]; armor: Slot[] } {
    return { slots: this.slots, armor: this.armor };
  }

  load(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { slots?: unknown; armor?: unknown };
    if (Array.isArray(d.slots)) {
      this.slots = Array.from({ length: INVENTORY_SIZE }, (_, i) =>
        parseStack(d.slots![i as never]),
      );
    }
    if (Array.isArray(d.armor)) {
      this.armor = ARMOR_SLOTS.map((slot, i) => {
        const stack = parseStack((d.armor as unknown[])[i]);
        return stack && getItem(stack.id)?.armor?.slot === slot ? stack : null;
      });
    }
    this.onChange();
  }
}
