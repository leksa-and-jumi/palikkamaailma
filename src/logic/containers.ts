// Chests and furnaces. Their contents are kept on the room server (or this
// device when playing alone). A furnace keeps smelting while nobody looks:
// its state is advanced by the time that has passed.

import { CONTAINERS } from '../config';
import { CHEST, FURNACE } from './blocks';
import { getItem, itemId } from './items';
import { parseStack, stackLimit, type ItemStack, type Slot } from './inventory';
import { smeltResult } from './recipes';

export interface FurnaceState {
  kind: 'furnace';
  input: Slot;
  fuel: Slot;
  output: Slot;
  /** Seconds of fire left and how long the current fuel burns in total. */
  burnLeft: number;
  burnTotal: number;
  /** Seconds the current item has cooked. */
  cook: number;
  /** When this state was last advanced (ms since 1970). */
  updated: number;
}

export interface ChestState {
  kind: 'chest';
  slots: Slot[];
}

export type Container = FurnaceState | ChestState;

export function isContainerBlock(id: number): boolean {
  return id === CHEST || id === FURNACE;
}

export function emptyContainer(blockId: number, now: number): Container | null {
  if (blockId === CHEST) {
    return { kind: 'chest', slots: Array.from({ length: CONTAINERS.chestSize }, () => null) };
  }
  if (blockId === FURNACE) {
    return {
      kind: 'furnace',
      input: null,
      fuel: null,
      output: null,
      burnLeft: 0,
      burnTotal: 0,
      cook: 0,
      updated: now,
    };
  }
  return null;
}

/** Can the furnace cook its input right now (is there room for the result)? */
function canCook(f: FurnaceState): boolean {
  if (!f.input) return false;
  const result = smeltResult(f.input.id);
  if (result === undefined) return false;
  if (!f.output) return true;
  return f.output.id === result && f.output.count < stackLimit(result);
}

/** Runs the furnace forward to `now`. */
export function advanceFurnace(f: FurnaceState, now: number): void {
  let dt = Math.min(CONTAINERS.maxCatchUpSeconds, Math.max(0, (now - f.updated) / 1000));
  f.updated = now;
  while (dt > 0) {
    const cooking = canCook(f);
    if (f.burnLeft <= 0) {
      const fuelSeconds = f.fuel ? getItem(f.fuel.id)?.fuel : undefined;
      if (!cooking || !f.fuel || !fuelSeconds) {
        f.cook = 0;
        f.burnLeft = 0;
        return;
      }
      f.burnLeft = f.burnTotal = fuelSeconds;
      // A lava bucket leaves the empty bucket behind.
      if (getItem(f.fuel.id)?.key === 'lava_bucket') f.fuel = { id: itemId('bucket'), count: 1 };
      else f.fuel = f.fuel.count > 1 ? { ...f.fuel, count: f.fuel.count - 1 } : null;
    }
    const step = cooking
      ? Math.min(dt, f.burnLeft, CONTAINERS.cookSeconds - f.cook)
      : Math.min(dt, f.burnLeft);
    f.burnLeft -= step;
    dt -= step;
    if (!cooking) {
      f.cook = 0;
      continue;
    }
    f.cook += step;
    if (f.cook >= CONTAINERS.cookSeconds - 1e-9) {
      f.cook = 0;
      const result = smeltResult(f.input!.id)!;
      f.input = f.input!.count > 1 ? { ...f.input!, count: f.input!.count - 1 } : null;
      f.output = f.output ? { ...f.output, count: f.output.count + 1 } : { id: result, count: 1 };
    }
  }
}

/** Everything inside (dropped when the block is broken). */
export function containerItems(c: Container): ItemStack[] {
  const slots = c.kind === 'chest' ? c.slots : [c.input, c.fuel, c.output];
  return slots.filter((s): s is ItemStack => s !== null);
}

function num(v: unknown, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

/** Checks container data from the network or storage. */
export function parseContainer(v: unknown, now: number): Container | null {
  if (typeof v !== 'object' || v === null) return null;
  const c = v as Record<string, unknown>;
  if (c.kind === 'chest') {
    if (!Array.isArray(c.slots) || c.slots.length !== CONTAINERS.chestSize) return null;
    return { kind: 'chest', slots: c.slots.map((s) => (s === null ? null : parseStack(s))) };
  }
  if (c.kind === 'furnace') {
    const slot = (s: unknown) => (s === null || s === undefined ? null : parseStack(s));
    return {
      kind: 'furnace',
      input: slot(c.input),
      fuel: slot(c.fuel),
      output: slot(c.output),
      burnLeft: num(c.burnLeft, 0, 10_000),
      burnTotal: num(c.burnTotal, 0, 10_000),
      cook: num(c.cook, 0, CONTAINERS.cookSeconds),
      updated: num(c.updated, 0, now),
    };
  }
  return null;
}

export function positionKey(p: readonly [number, number, number]): string {
  return `${p[0]},${p[1]},${p[2]}`;
}
