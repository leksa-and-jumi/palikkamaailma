// All minecarts in the world. A rolling cart is moved by one player (its
// rider, or whoever pushed it) and travels in their position messages; when
// it stops it is sent to the room once, which remembers where it stands.

import { CARTS } from '../config';
import type { Facing } from '../logic/blocks';
import { cartY, placeCart, stepCart, type CartState, type CartWorld } from '../logic/minecart';
import type { CartNet } from '../logic/protocol';
import { railShape } from '../logic/rails';

export interface Cart {
  id: string;
  state: CartState;
  y: number;
  /** Who moves it (null = it stands still). */
  owner: string | null;
  rider: string | null;
  /** Seconds it has stood still while we move it. */
  still: number;
}

export interface CartView {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: Facing;
  /** Tilted on a slope: +1 nose up, -1 nose down, 0 flat. */
  tilt: number;
  rider: string | null;
}

export interface CartEvents {
  /** Tell the room (and save): placed, ridden, left or stopped. */
  save(cart: CartNet): void;
  gone(id: string): void;
}

/** The cart's box for clicking: half width and height. */
const HALF = 0.45;
const HEIGHT = 0.7;

export class CartManager {
  readonly carts = new Map<string, Cart>();
  myId = 'me';
  private counter = 0;

  constructor(private readonly events: CartEvents) {}

  /** The cart you sit in, if any. */
  get riding(): Cart | null {
    for (const c of this.carts.values()) if (c.rider === this.myId) return c;
    return null;
  }

  toNet(c: Cart): CartNet {
    const r = (v: number) => Math.round(v * 100) / 100;
    return [
      c.id,
      r(c.state.x),
      r(c.y),
      r(c.state.z),
      c.state.heading,
      r(c.state.speed),
      c.rider ?? '',
    ];
  }

  /** A cart from the room (welcome, someone placed or stopped it). */
  receive(net: CartNet, world: CartWorld, by: string | null): void {
    const [id, x, y, z, heading, speed, rider] = net;
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    // The rail is at the wheels' height, or one lower on the high half of a slope.
    const cy = railShape(world.getBlock(fx, Math.floor(y), fz)) ? Math.floor(y) : Math.floor(y) - 1;
    const state: CartState = { cell: [fx, cy, fz], x, z, heading: heading as Facing, speed };
    const moving = speed > 0 || rider !== '';
    this.carts.set(id, {
      id,
      state,
      y,
      owner: moving ? by : null,
      rider: rider || null,
      still: 0,
    });
  }

  /** Carts in another player's position message (they move them). */
  receiveMoving(owner: string, list: readonly CartNet[], world: CartWorld): void {
    for (const net of list) {
      const known = this.carts.get(net[0]);
      // We are moving it ourselves: the smaller id wins (like creatures).
      if (known?.owner === this.myId && this.myId < owner) continue;
      this.receive(net, world, owner);
      const cart = this.carts.get(net[0])!;
      cart.owner = owner;
    }
  }

  remove(id: string): void {
    this.carts.delete(id);
  }

  /** A player left: their rolling carts stand still where they were. */
  forgetOwner(owner: string): void {
    for (const c of this.carts.values()) {
      if (c.owner === owner) c.owner = null;
      if (c.rider === owner) c.rider = null;
    }
  }

  /** Puts a new cart on the rail here. */
  place(world: CartWorld, x: number, y: number, z: number): Cart | null {
    const state = placeCart(world.getBlock, x, y, z);
    if (!state || this.carts.size >= CARTS.maxPerRoom) return null;
    this.counter++;
    const id = `c-${this.myId}-${this.counter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const cart: Cart = {
      id,
      state,
      y: cartY(state, world.getBlock),
      owner: null,
      rider: null,
      still: 0,
    };
    this.carts.set(id, cart);
    this.events.save(this.toNet(cart));
    return cart;
  }

  ride(cart: Cart): void {
    const old = this.riding;
    if (old) this.leave();
    cart.rider = this.myId;
    cart.owner = this.myId;
    cart.still = 0;
    this.events.save(this.toNet(cart));
  }

  /** Gets out. Returns where to stand. */
  leave(): [number, number, number] | null {
    const cart = this.riding;
    if (!cart) return null;
    cart.rider = null;
    this.events.save(this.toNet(cart));
    return [cart.state.x, cart.y + 1, cart.state.z];
  }

  /** Breaks a cart (the item drops where it was). */
  breakCart(cart: Cart): void {
    this.carts.delete(cart.id);
    this.events.gone(cart.id);
  }

  /**
   * Moves the carts we move. `me` is where we are and how we walk (we push
   * carts we walk into); `forward` is the rider pressing forward with a look direction.
   */
  update(
    world: CartWorld,
    dt: number,
    me: { x: number; y: number; z: number; vx: number; vz: number },
    forward: { dx: number; dz: number } | null,
  ): void {
    const walking = Math.hypot(me.vx, me.vz);
    for (const c of this.carts.values()) {
      let push: { dx: number; dz: number; accel: number } | null = null;
      // Walking into a cart nobody rides pushes it.
      const near = Math.hypot(c.state.x - me.x, c.state.z - me.z) < CARTS.pushReach;
      if (!c.rider && walking > 0.5 && near && Math.abs(c.y - me.y) < 1) {
        if (c.owner === null) c.owner = this.myId;
        if (c.owner === this.myId) {
          push = { dx: me.vx / walking, dz: me.vz / walking, accel: CARTS.pushAccel };
        }
      }
      if (c.owner !== this.myId) continue;
      this.fixCell(c, world);
      if (c.rider === this.myId && forward) push = { ...forward, accel: CARTS.rideAccel };
      stepCart(c.state, world, dt, push);
      c.y = cartY(c.state, world.getBlock);
      // Standing still: save it and let it be.
      if (c.state.speed === 0 && !c.rider) {
        c.still += dt;
        if (c.still >= CARTS.restSeconds) {
          c.owner = null;
          this.events.save(this.toNet(c));
        }
      } else c.still = 0;
    }
  }

  /** Carts we move, for our position message. */
  netList(): CartNet[] {
    const list: CartNet[] = [];
    for (const c of this.carts.values()) if (c.owner === this.myId) list.push(this.toNet(c));
    return list.slice(0, 8);
  }

  /**
   * The rail under a cart from the room may not have arrived yet when the
   * cart does, so its rail block is looked up again when needed.
   */
  private fixCell(c: Cart, world: CartWorld): void {
    if (railShape(world.getBlock(...c.state.cell))) return;
    const fx = Math.floor(c.state.x);
    const fz = Math.floor(c.state.z);
    for (const y of [Math.floor(c.y), Math.floor(c.y) - 1]) {
      if (!railShape(world.getBlock(fx, y, fz))) continue;
      c.state.cell = [fx, y, fz];
      return;
    }
  }

  *views(world: CartWorld): IterableIterator<CartView> {
    for (const c of this.carts.values()) {
      this.fixCell(c, world);
      const shape = railShape(world.getBlock(...c.state.cell));
      const tilt =
        shape?.up === undefined
          ? 0
          : shape.up === c.state.heading
            ? 1
            : shape.up % 2 === c.state.heading % 2
              ? -1
              : 0;
      yield {
        id: c.id,
        x: c.state.x,
        y: c.y,
        z: c.state.z,
        heading: c.state.heading,
        tilt,
        rider: c.rider,
      };
    }
  }

  /** The cart the ray hits first within `reach`. */
  pick(
    origin: readonly [number, number, number],
    dir: readonly [number, number, number],
    reach: number,
  ): { cart: Cart; distance: number } | null {
    let best: { cart: Cart; distance: number } | null = null;
    for (const c of this.carts.values()) {
      if (c.rider === this.myId) continue;
      const min = [c.state.x - HALF, c.y, c.state.z - HALF];
      const max = [c.state.x + HALF, c.y + HEIGHT, c.state.z + HALF];
      let t0 = 0;
      let t1 = reach;
      let hit = true;
      for (let a = 0; a < 3 && hit; a++) {
        const d = dir[a]!;
        const o = origin[a]!;
        if (Math.abs(d) < 1e-9) {
          if (o < min[a]! || o > max[a]!) hit = false;
          continue;
        }
        let near = (min[a]! - o) / d;
        let far = (max[a]! - o) / d;
        if (near > far) [near, far] = [far, near];
        t0 = Math.max(t0, near);
        t1 = Math.min(t1, far);
        if (t0 > t1) hit = false;
      }
      if (hit && (!best || t0 < best.distance)) best = { cart: c, distance: t0 };
    }
    return best;
  }

  /** Everything as a list (alone, saved on this device). */
  all(): CartNet[] {
    return [...this.carts.values()].map((c) => this.toNet(c));
  }
}
