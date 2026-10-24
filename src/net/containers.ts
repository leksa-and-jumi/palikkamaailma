// Gets and saves chest and furnace contents: from the room server in
// multiplayer, from this device when playing alone.

import { STORAGE } from '../config';
import {
  advanceFurnace,
  containerItems,
  emptyContainer,
  parseContainer,
  positionKey,
  type Container,
} from '../logic/containers';
import type { ItemStack } from '../logic/inventory';
import type { RoomClient } from './room';

type Pos = [number, number, number];

const OPEN_TIMEOUT_MS = 4000;

export class ContainerService {
  private readonly waiting = new Map<string, (data: Container) => void>();
  private readonly local = new Map<string, Container>();
  /** Called when someone else changed a container. */
  onUpdate: (p: Pos, data: Container) => void = () => undefined;

  constructor(
    private readonly room: RoomClient | null,
    private readonly code: string,
  ) {
    if (!room) this.loadLocal();
  }

  /** The contents of the chest or furnace at p (blockId tells which). */
  open(p: Pos, blockId: number): Promise<Container | null> {
    const key = positionKey(p);
    if (!this.room) {
      let data = this.local.get(key) ?? emptyContainer(blockId, Date.now());
      if (!data) return Promise.resolve(null);
      if (data.kind === 'furnace') advanceFurnace(data, Date.now());
      this.local.set(key, data);
      data = structuredClone(data);
      return Promise.resolve(data);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(key);
        resolve(null);
      }, OPEN_TIMEOUT_MS);
      this.waiting.set(key, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.room!.send({ t: 'open', p });
    });
  }

  save(p: Pos, data: Container): void {
    if (this.room) {
      this.room.send({ t: 'container', p, data });
      return;
    }
    this.local.set(positionKey(p), structuredClone(data));
    this.saveLocal();
  }

  /** A container message from the room server. */
  receive(p: Pos, data: Container): void {
    const key = positionKey(p);
    const waiter = this.waiting.get(key);
    if (waiter) {
      this.waiting.delete(key);
      waiter(data);
    } else {
      this.onUpdate(p, data);
    }
  }

  /** Alone: the block was broken, so take out everything inside. */
  removeLocal(p: Pos): ItemStack[] {
    const key = positionKey(p);
    const data = this.local.get(key);
    if (!data) return [];
    this.local.delete(key);
    this.saveLocal();
    if (data.kind === 'furnace') advanceFurnace(data, Date.now());
    return containerItems(data);
  }

  private storageKey(): string {
    return `${STORAGE.containers}.${this.code}`;
  }

  private loadLocal(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      for (const [key, value] of Object.entries(saved)) {
        const data = parseContainer(value, Date.now());
        if (data) this.local.set(key, data);
      }
    } catch {
      // Nothing saved yet.
    }
  }

  private saveLocal(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(Object.fromEntries(this.local)));
    } catch {
      // Storage full or blocked.
    }
  }
}
