// Runs the computer characters around this player. Each creature is
// simulated by one player (its owner, usually the one who spawned it); the
// others only see it through the owner's position messages. Animals spawn
// near players, wander, run away, follow food, make babies and drop food.

import { DIFFICULTIES, MOBS, MONSTERS, SEA_LEVEL, VILLAGES, type Difficulty } from '../config';
import { BEDROCK, GRASS, LAVA, SNOW, WATER, getBlockType, isSolid } from '../logic/blocks';
import { itemId } from '../logic/items';
import { createMob, think, type Mob, type Seen } from '../logic/mobBrain';
import {
  MOB_NAMES,
  MOB_TYPES,
  PERSONALITIES,
  PERSONALITY_TRAITS,
  mobType,
  rollDrops,
  type MobKind,
  type Personality,
} from '../logic/mobs';
import { stepPlayer, type Body } from '../logic/physics';
import { blockQuery } from '../logic/blockShapes';
import { MOB_FLAG, type MobNet } from '../logic/protocol';
import { hash2 } from '../logic/noise';
import { PROFESSIONS, type Profession } from '../logic/villages';
import type { Biome } from '../logic/terrain';
import type { VoxelWorld } from '../logic/world';
import type { MobView } from '../render/mobRenderer';
import type { ItemStack } from '../logic/inventory';

const SPAWN_TRIES = 6;

/** Villager ids tell which village and house they belong to: v-<x>-<z>-<house> (m = minus). */
export function villagerId(villageX: number, villageZ: number, house: number): string {
  const n = (v: number) => (v < 0 ? `m${-v}` : `${v}`);
  return `v-${n(villageX)}-${n(villageZ)}-${house}`;
}

/** The profession of a villager from its id (the same on every computer). */
export function villagerProfession(id: string): Profession {
  const house = Number(id.split('-').pop());
  return PROFESSIONS[(Number.isInteger(house) ? house : 0) % PROFESSIONS.length]!;
}
const GROUP_MIN = 2;
const GROUP_MAX = 4;
const MAX_DROP = 3;
const KNOCK_HOP = 5;
const BABY_BODY_SCALE = 0.55;
const EGG_MIN = 300;
const EGG_MAX = 600;

/** Which animals live where. */
const ANIMALS_BY_BIOME: Partial<Record<Biome, readonly MobKind[]>> = {
  plains: ['pig', 'cow', 'sheep', 'chicken'],
  forest: ['pig', 'chicken', 'cow'],
  taiga: ['sheep', 'cow'],
  snowy: ['sheep'],
};

interface RemoteMob {
  net: MobNet;
  owner: string;
  seen: number;
}

/** An arrow flying from a skeleton. */
export interface Arrow {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

const ARROW_LIFETIME = 4;
const ARROW_HIT_RADIUS = 0.6;
const SPIDER_CLIMB = 3;
const MONSTER_WEIGHTS: readonly [MobKind, number][] = [
  ['zombie', 35],
  ['skeleton', 25],
  ['creeper', 20],
  ['spider', 20],
];
/** Why you got hurt, for the death screen. */
export const HURT_REASONS: Partial<Record<MobKind, string>> = {
  zombie: 'Zombi sai sinut kiinni.',
  spider: 'Hämähäkki puri.',
  skeleton: 'Luurangon nuoli osui.',
  creeper: 'Creeper räjähti vieressä!',
};

export interface MobEvents {
  /** Something falls on the ground (meat, feathers, eggs). */
  drop(stack: ItemStack, p: [number, number, number]): void;
  /** You defeated a creature: experience points. */
  xp(amount: number): void;
  /** Hit someone else's creature: tell its owner. */
  sendHit(id: string, damage: number, from: [number, number]): void;
  /** Short message on screen. */
  toast(text: string): void;
  /** A monster hurts a player (you or someone else). `kind` says which monster. */
  hurtPlayer(playerId: string, damage: number, kind: MobKind): void;
  /** A creeper exploded here: smoke and a bang, and on hard broken blocks. */
  blast(x: number, y: number, z: number, breakBlocks: boolean): void;
}

export interface MobContext {
  world: VoxelWorld;
  me: Seen;
  /** Other players in the world. */
  others: readonly Seen[];
  dt: number;
  difficulty: Difficulty;
  /** Bright daytime: monsters burn, spiders are calm, none spawn on the surface. */
  day: boolean;
}

function bodyFor(m: Mob): Body {
  const body = MOB_TYPES[m.kind].body;
  return m.baby
    ? { ...body, width: body.width * BABY_BODY_SCALE, height: body.height * BABY_BODY_SCALE }
    : body;
}

/** A remote creature with no news for this long is put on the ground. */
const STALE_MS = 700;
/** …if the ground is at most this many blocks below. */
const STALE_DROP = 6;

export class MobManager {
  readonly owned = new Map<string, Mob>();
  private readonly remote = new Map<string, RemoteMob>();
  private spawnTimer = 0;
  readonly arrows: Arrow[] = [];
  private arrowCounter = 0;
  private counter = 0;
  /** Your id in the room ('me' when alone); new creatures are named after it. */
  myId = 'me';
  /** The world from the last update (to put quiet remote creatures on the ground). */
  private world: VoxelWorld | null = null;

  constructor(
    private readonly events: MobEvents,
    private readonly random: () => number = Math.random,
  ) {}

  private newId(): string {
    this.counter++;
    return `${this.myId}-${this.counter}-${Math.floor(this.random() * 1e6).toString(36)}`;
  }

  /** Makes a creature here (spawning, babies, villagers). `fixed` gives a known id, name and personality. */
  spawn(
    kind: MobKind,
    x: number,
    y: number,
    z: number,
    baby = false,
    fixed?: { id: string; personality: Personality; name: string },
  ): Mob {
    const type = mobType(kind);
    const personality =
      fixed?.personality ??
      type.personalities[Math.floor(this.random() * type.personalities.length)]!;
    const name = fixed?.name ?? MOB_NAMES[Math.floor(this.random() * MOB_NAMES.length)]!;
    const mob = createMob(fixed?.id ?? this.newId(), kind, x, y, z, personality, name, baby);
    mob.body.yaw = this.random() * Math.PI * 2;
    // Chickens use the cooldown as their egg timer; monsters can attack at once.
    mob.cooldown = kind === 'chicken' ? EGG_MIN + this.random() * (EGG_MAX - EGG_MIN) : 0;
    this.owned.set(mob.id, mob);
    return mob;
  }

  update(ctx: MobContext): void {
    const { dt } = ctx;
    this.world = ctx.world;
    const everyone = [ctx.me, ...ctx.others];
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = MOBS.spawnInterval;
      if (this.isSpawner(ctx)) {
        this.trySpawnAnimals(ctx);
        this.trySpawnMonsters(ctx);
        this.spawnVillagers(ctx);
      }
    }

    for (const m of this.owned.values()) {
      const distance = Math.hypot(m.body.x - ctx.me.x, m.body.z - ctx.me.z);
      const hostile = MOB_TYPES[m.kind].hostile;
      if (
        distance > MOBS.despawnDistance ||
        m.body.y < -10 ||
        (hostile && ctx.difficulty === 'peaceful')
      ) {
        this.owned.delete(m.id);
        continue;
      }
      this.step(m, everyone, ctx);
      if (!this.owned.has(m.id)) continue;
      this.burn(m, ctx);
      this.grow(m, dt);
      this.layEggs(m);
    }
    this.breed();
    this.flyArrows(ctx);

    const now = performance.now();
    for (const [id, r] of this.remote) {
      if (now - r.seen > MOBS.remoteTimeout * 1000) this.remote.delete(id);
    }
  }

  /** Only one player spawns animals in an area (the one with the smallest id), so they don't double. */
  private isSpawner(ctx: MobContext): boolean {
    return !ctx.others.some(
      (o) => o.id < ctx.me.id && Math.hypot(o.x - ctx.me.x, o.z - ctx.me.z) < MOBS.spawnMax * 1.5,
    );
  }

  private animalCount(): number {
    let n = 0;
    for (const m of this.owned.values())
      if (!MOB_TYPES[m.kind].hostile && m.kind !== 'villager') n++;
    for (const r of this.remote.values()) {
      if (!MOB_TYPES[r.net[1]].hostile && r.net[1] !== 'villager') n++;
    }
    return n;
  }

  private trySpawnAnimals(ctx: MobContext): void {
    if (this.animalCount() >= MOBS.maxAnimals) return;
    const { world } = ctx;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = MOBS.spawnMin + this.random() * (MOBS.spawnMax - MOBS.spawnMin);
      const x = Math.floor(ctx.me.x + Math.cos(angle) * distance);
      const z = Math.floor(ctx.me.z + Math.sin(angle) * distance);
      const kinds = ANIMALS_BY_BIOME[world.terrain.biomeAt(x, z)];
      if (!kinds) continue;
      const y = this.groundAt(world, x, z);
      if (y === null) continue;
      const kind = kinds[Math.floor(this.random() * kinds.length)]!;
      const count = GROUP_MIN + Math.floor(this.random() * (GROUP_MAX - GROUP_MIN + 1));
      for (let k = 0; k < count; k++) {
        const gx = x + Math.floor(this.random() * 5) - 2;
        const gz = z + Math.floor(this.random() * 5) - 2;
        const gy = this.groundAt(world, gx, gz);
        if (gy !== null) this.spawn(kind, gx + 0.5, gy, gz + 0.5, this.random() < 0.2);
      }
      return;
    }
  }

  /** Feet height on grass or snow with room above, or null. */
  private groundAt(world: VoxelWorld, x: number, z: number): number | null {
    const top = world.surfaceY(x, z);
    if (top < SEA_LEVEL) return null;
    const ground = world.getBlock(x, top, z);
    if (ground !== GRASS && ground !== SNOW) return null;
    if (isSolid(world.getBlock(x, top + 1, z)) || isSolid(world.getBlock(x, top + 2, z))) {
      return null;
    }
    return top + 1;
  }

  private step(m: Mob, players: readonly Seen[], ctx: MobContext): void {
    const { world, dt } = ctx;
    const thought = think(m, players, dt, this.random, { day: ctx.day });
    m.body.yaw = thought.yaw;
    if (thought.action) this.act(m, thought.action, thought.targetId, players, ctx);
    if (!this.owned.has(m.id)) return;
    const input = { ...thought.input };
    if (input.forward > 0 && this.dangerAhead(m, world)) {
      // Don't walk off cliffs or into water and lava: stop and think again.
      input.forward = 0;
      m.goal = null;
      m.timer = 0;
    }
    const before = [m.body.x, m.body.z];
    // Personality changes speed: lazy ones amble, playful ones scamper.
    const traits = PERSONALITY_TRAITS[m.personality];
    const base = bodyFor(m);
    const body = {
      ...base,
      walkSpeed: base.walkSpeed * traits.speed,
      sprintSpeed: base.sprintSpeed * traits.speed,
    };
    stepPlayer(
      blockQuery((x, y, z) => world.getBlock(x, y, z)),
      m.body,
      input,
      dt,
      body,
    );
    const moved = Math.hypot(m.body.x - before[0]!, m.body.z - before[1]!);
    m.blocked = input.forward > 0 && moved < body.walkSpeed * dt * 0.3;
    // Spiders climb straight up walls.
    if (m.kind === 'spider' && m.blocked && m.mode === 'chase') m.body.vy = SPIDER_CLIMB;
  }

  // --- Villagers -----------------------------------------------------------

  /** Every house in a nearby village has its own villager, always the same one. */
  private spawnVillagers(ctx: MobContext): void {
    for (const v of ctx.world.terrain.villagesAround(ctx.me.x, ctx.me.z)) {
      if (Math.hypot(v.x - ctx.me.x, v.z - ctx.me.z) > VILLAGES.spawnDistance) continue;
      v.houses.forEach((house, i) => {
        const id = villagerId(v.x, v.z, i);
        if (this.owned.has(id) || this.remote.has(id)) return;
        const seed = ctx.world.seed;
        const type = MOB_TYPES.villager;
        const personality =
          type.personalities[
            Math.floor(hash2(seed + 31, v.x + i, v.z) * type.personalities.length)
          ]!;
        const name = MOB_NAMES[Math.floor(hash2(seed + 32, v.x, v.z + i) * MOB_NAMES.length)]!;
        // Start just outside the front door.
        const mob = this.spawn('villager', house.x + 0.5, house.y + 1, house.z + 0.5, false, {
          id,
          personality,
          name,
        });
        mob.home = [v.x + 0.5, v.z + 0.5];
      });
    }
  }

  // --- Monsters -----------------------------------------------------------

  private monsterCount(): number {
    let n = 0;
    for (const m of this.owned.values()) if (MOB_TYPES[m.kind].hostile) n++;
    return n;
  }

  /** Monsters appear in the dark: at night on the surface, any time in caves, never near torches. */
  private trySpawnMonsters(ctx: MobContext): void {
    if (this.monsterCount() >= MONSTERS.max[ctx.difficulty]) return;
    // The Nether has its own creatures (not the overworld's).
    if (ctx.world.terrain.biomeAt(Math.floor(ctx.me.x), Math.floor(ctx.me.z)) === 'nether') return;
    const { world } = ctx;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = MONSTERS.spawnMin + this.random() * (MONSTERS.spawnMax - MONSTERS.spawnMin);
      const x = Math.floor(ctx.me.x + Math.cos(angle) * distance);
      const z = Math.floor(ctx.me.z + Math.sin(angle) * distance);
      const y = this.darkSpot(world, x, z, Math.floor(ctx.me.y), ctx.day);
      if (y === null) continue;
      let pick = this.random() * MONSTER_WEIGHTS.reduce((n, [, w]) => n + w, 0);
      let kind: MobKind = 'zombie';
      for (const [k, w] of MONSTER_WEIGHTS) {
        pick -= w;
        if (pick <= 0) {
          kind = k;
          break;
        }
      }
      this.spawn(kind, x + 0.5, y, z + 0.5);
      return;
    }
  }

  /** Feet height of a dark place with room to stand in this column, or null. */
  private darkSpot(
    world: VoxelWorld,
    x: number,
    z: number,
    nearY: number,
    day: boolean,
  ): number | null {
    const surface = world.surfaceY(x, z);
    const candidates: number[] = [];
    // On the surface at night...
    if (!day && surface > SEA_LEVEL - 1) candidates.push(surface + 1);
    // ...and in caves near the player's height at any time.
    for (let y = nearY + 8; y >= Math.max(2, nearY - 16); y--) {
      if (y < surface - 2) candidates.push(y);
    }
    for (const y of candidates) {
      const floor = world.getBlock(x, y - 1, z);
      if (!isSolid(floor) || floor === BEDROCK) continue;
      if (world.getBlock(x, y, z) !== 0 || world.getBlock(x, y + 1, z) !== 0) continue;
      if (this.nearLight(world, x, y, z)) continue;
      return y;
    }
    return null;
  }

  /** Is there a torch, lamp or lava close by? */
  private nearLight(world: VoxelWorld, x: number, y: number, z: number): boolean {
    const r = MONSTERS.torchSafe;
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (getBlockType(world.getBlock(x + dx, y + dy, z + dz)).light > 0) return true;
        }
      }
    }
    return false;
  }

  /** Zombies and skeletons catch fire in sunshine. */
  private burn(m: Mob, ctx: MobContext): void {
    if (!MOB_TYPES[m.kind].burnsInDay || !ctx.day) return;
    if (ctx.world.surfaceY(Math.floor(m.body.x), Math.floor(m.body.z)) > m.body.y + 1) return;
    m.health -= MONSTERS.burnDamage * ctx.dt;
    if (m.health <= 0) this.applyHit(m, 0, [m.body.x, m.body.z], false);
  }

  private damage(base: number, ctx: MobContext): number {
    return base * DIFFICULTIES[ctx.difficulty].monsterDamage;
  }

  private act(
    m: Mob,
    action: 'attack' | 'shoot' | 'explode',
    targetId: string | undefined,
    players: readonly Seen[],
    ctx: MobContext,
  ): void {
    if (action === 'attack' && targetId) {
      this.events.hurtPlayer(targetId, this.damage(MOB_TYPES[m.kind].attack, ctx), m.kind);
      return;
    }
    if (action === 'shoot' && targetId) {
      const t = players.find((p) => p.id === targetId);
      if (!t) return;
      const sx = m.body.x;
      const sy = m.body.y + 1.5;
      const sz = m.body.z;
      const dx = t.x - sx;
      const dz = t.z - sz;
      const flat = Math.hypot(dx, dz);
      const time = flat / MONSTERS.arrowSpeed;
      // Aim a little up so gravity brings the arrow down on target.
      const vy = (t.y + 1.2 - sy) / time + (MONSTERS.arrowGravity * time) / 2;
      this.arrows.push({
        id: ++this.arrowCounter,
        x: sx,
        y: sy,
        z: sz,
        vx: (dx / flat) * MONSTERS.arrowSpeed,
        vy,
        vz: (dz / flat) * MONSTERS.arrowSpeed,
        age: 0,
      });
      return;
    }
    if (action === 'explode') {
      this.owned.delete(m.id);
      for (const p of players) {
        if (p.safe) continue;
        const d = Math.hypot(p.x - m.body.x, p.y - m.body.y, p.z - m.body.z);
        if (d > MONSTERS.blastRadius) continue;
        const damage = this.damage(MONSTERS.blastDamage, ctx) * (1 - d / MONSTERS.blastRadius);
        this.events.hurtPlayer(p.id, damage, m.kind);
      }
      // Only on hard do explosions break blocks, so the kids' builds stay safe.
      this.events.blast(m.body.x, m.body.y + 0.5, m.body.z, ctx.difficulty === 'hard');
      this.events.toast('💥 Creeper räjähti!');
    }
  }

  private flyArrows(ctx: MobContext): void {
    const { world, dt } = ctx;
    const players = [ctx.me, ...ctx.others];
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.age += dt;
      a.vy -= MONSTERS.arrowGravity * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
      let gone =
        a.age > ARROW_LIFETIME ||
        isSolid(world.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)));
      for (const p of players) {
        if (gone || p.safe) continue;
        const d = Math.hypot(a.x - p.x, (a.y - p.y - 0.9) * 0.6, a.z - p.z);
        if (d < ARROW_HIT_RADIUS) {
          this.events.hurtPlayer(p.id, this.damage(MONSTERS.arrowDamage, ctx), 'skeleton');
          gone = true;
        }
      }
      if (gone) this.arrows.splice(i, 1);
    }
  }

  /** Is the next step a big drop, water or lava? */
  private dangerAhead(m: Mob, world: VoxelWorld): boolean {
    const ax = Math.floor(m.body.x - Math.sin(m.body.yaw) * 0.9);
    const az = Math.floor(m.body.z - Math.cos(m.body.yaw) * 0.9);
    const y = Math.floor(m.body.y);
    const here = world.getBlock(ax, y, az);
    if (here === LAVA || here === WATER) return true;
    for (let dy = 1; dy <= 3; dy++) {
      const below = world.getBlock(ax, y - dy, az);
      if (below === LAVA || below === WATER) return true;
      if (isSolid(below)) return false;
    }
    return true;
  }

  private grow(m: Mob, dt: number): void {
    if (!m.baby) return;
    m.grow -= dt;
    if (m.grow <= 0) m.baby = false;
  }

  private layEggs(m: Mob): void {
    // The brain counts the cooldown down.
    if (m.kind !== 'chicken' || m.baby || m.cooldown > 0) return;
    m.cooldown = EGG_MIN + this.random() * (EGG_MAX - EGG_MIN);
    this.events.drop({ id: itemId('egg'), count: 1 }, [m.body.x, m.body.y + 0.3, m.body.z]);
  }

  /** Two fed animals of the same kind near each other make a baby. */
  private breed(): void {
    const inLove = [...this.owned.values()].filter((m) => m.love > 0 && !m.baby);
    for (let i = 0; i < inLove.length; i++) {
      for (let j = i + 1; j < inLove.length; j++) {
        const a = inLove[i]!;
        const b = inLove[j]!;
        if (a.kind !== b.kind || a.love <= 0 || b.love <= 0) continue;
        const d = Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z);
        if (d > MOBS.breedDistance) continue;
        a.love = b.love = 0;
        const x = (a.body.x + b.body.x) / 2;
        const z = (a.body.z + b.body.z) / 2;
        this.spawn(a.kind, x, Math.max(a.body.y, b.body.y), z, true);
        this.events.toast(`💕 ${MOB_TYPES[a.kind].emoji} Uusi vauva!`);
      }
    }
  }

  // --- Hitting and feeding ------------------------------------------------

  /** You hit a creature. Returns true if it was there. */
  hit(id: string, damage: number, from: [number, number]): boolean {
    const own = this.owned.get(id);
    if (own) {
      this.applyHit(own, damage, from, true);
      return true;
    }
    const r = this.remote.get(id);
    if (!r) return false;
    this.events.sendHit(id, damage, from);
    // Guess the result so the experience comes right away.
    if (r.net[6] - damage <= 0) {
      this.events.xp(MOB_TYPES[r.net[1]].xp);
      this.remote.delete(id);
    }
    return true;
  }

  /** Someone else hit one of your creatures. */
  receiveHit(id: string, damage: number, from: [number, number]): void {
    const m = this.owned.get(id);
    if (m) this.applyHit(m, damage, from, false);
  }

  private applyHit(m: Mob, damage: number, from: [number, number], byMe: boolean): void {
    m.health -= damage;
    m.hurt = 0;
    m.hurtFrom = from;
    m.body.vy = KNOCK_HOP;
    if (m.health > 0) return;
    this.owned.delete(m.id);
    for (const d of rollDrops(m.kind, this.random)) {
      for (let left = d.count; left > 0; left -= MAX_DROP) {
        this.events.drop({ id: itemId(d.key), count: Math.min(MAX_DROP, left) }, [
          m.body.x,
          m.body.y + 0.5,
          m.body.z,
        ]);
      }
    }
    if (byMe) this.events.xp(MOB_TYPES[m.kind].xp);
  }

  /** Right click with food: the animal falls in love (two make a baby). */
  feed(id: string, food: string): boolean {
    const m = this.owned.get(id);
    if (!m || m.baby || MOB_TYPES[m.kind].food !== food || m.love > 0) return false;
    m.love = MOBS.loveSeconds;
    this.events.toast(`💕 ${m.name} tykkää!`);
    return true;
  }

  /** Is this one of yours or someone else's? */
  kindOf(id: string): MobKind | undefined {
    return this.owned.get(id)?.kind ?? this.remote.get(id)?.net[1];
  }

  // --- Network ------------------------------------------------------------

  /** Creatures from another player's position message. */
  receive(owner: string, list: readonly MobNet[]): void {
    const now = performance.now();
    for (const net of list) {
      // Two players may think they own the same creature: the smaller id wins.
      const mine = this.owned.get(net[0]);
      if (mine) {
        if (owner < this.myId) this.owned.delete(net[0]);
        else continue;
      }
      this.remote.set(net[0], { net, owner, seen: now });
    }
  }

  /** A player left: their creatures go with them. */
  forgetOwner(owner: string): void {
    for (const [id, r] of this.remote) if (r.owner === owner) this.remote.delete(id);
  }

  /** Your creatures that other players are close enough to see. */
  netList(others: readonly Seen[]): MobNet[] {
    if (others.length === 0) return [];
    const list: MobNet[] = [];
    const round = (v: number) => Math.round(v * 100) / 100;
    for (const m of this.owned.values()) {
      const near = others.some(
        (o) => Math.hypot(o.x - m.body.x, o.z - m.body.z) < MOBS.syncDistance,
      );
      if (!near) continue;
      const flags =
        (m.baby ? MOB_FLAG.baby : 0) |
        (m.hurt < 0.3 ? MOB_FLAG.hurt : 0) |
        (m.fuse > 0 ? MOB_FLAG.fuse : 0);
      list.push([
        m.id,
        m.kind,
        round(m.body.x),
        round(m.body.y),
        round(m.body.z),
        round(m.body.yaw),
        Math.max(0, Math.round(m.health * 10) / 10),
        flags,
        PERSONALITIES.indexOf(m.personality),
        Math.max(0, MOB_NAMES.indexOf(m.name)),
      ]);
      if (list.length >= MOBS.maxSync) break;
    }
    return list;
  }

  // --- Drawing and aiming -------------------------------------------------

  *views(): IterableIterator<MobView> {
    for (const m of this.owned.values()) {
      yield {
        id: m.id,
        kind: m.kind,
        x: m.body.x,
        y: m.body.y,
        z: m.body.z,
        yaw: m.body.yaw,
        health: m.health,
        baby: m.baby,
        hurt: m.hurt < 0.05,
        fuse: m.fuse > 0,
        name: m.name,
        personality: m.personality,
        remote: false,
      };
    }
    const now = performance.now();
    for (const { net, seen } of this.remote.values()) {
      // No news for a while (it walked away from us): stand it on the ground.
      const y = now - seen > STALE_MS ? this.groundBelow(net[2], net[3], net[4]) : net[3];
      yield {
        id: net[0],
        kind: net[1],
        x: net[2],
        y,
        z: net[4],
        yaw: net[5],
        health: net[6],
        baby: (net[7] & MOB_FLAG.baby) !== 0,
        hurt: (net[7] & MOB_FLAG.hurt) !== 0,
        fuse: (net[7] & MOB_FLAG.fuse) !== 0,
        name: MOB_NAMES[net[9]] ?? '',
        personality: PERSONALITIES[net[8]] ?? 'friendly',
        remote: true,
      };
    }
  }

  /** Feet height on the first solid block at or below y (a few blocks down at most). */
  private groundBelow(x: number, y: number, z: number): number {
    const world = this.world;
    if (!world) return y;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (let by = Math.floor(y); by > Math.floor(y) - STALE_DROP; by--) {
      if (isSolid(world.getBlock(bx, by - 1, bz))) return Math.min(y, by);
    }
    return y;
  }

  /** The creature the ray hits first within `reach`, with the distance. */
  pick(
    origin: [number, number, number],
    dir: [number, number, number],
    reach: number,
  ): { id: string; distance: number } | null {
    let best: { id: string; distance: number } | null = null;
    for (const v of this.views()) {
      const body = MOB_TYPES[v.kind].body;
      const scale = v.baby ? BABY_BODY_SCALE : 1;
      const half = (body.width * scale) / 2;
      const min = [v.x - half, v.y, v.z - half];
      const max = [v.x + half, v.y + body.height * scale, v.z + half];
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
      if (hit && (!best || t0 < best.distance)) best = { id: v.id, distance: t0 };
    }
    return best;
  }

  clear(): void {
    this.owned.clear();
    this.remote.clear();
  }
}
