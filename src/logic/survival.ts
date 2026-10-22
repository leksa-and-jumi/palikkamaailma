// Health, hunger, air and damage for survival mode. Pure rules, so they
// can be tested: the game calls these every frame.

import { DIFFICULTIES, SURVIVAL, type Difficulty } from '../config';

export interface Vitals {
  /** 0–20 (each heart is 2). */
  health: number;
  /** 0–20 (each drumstick is 2). */
  hunger: number;
  saturation: number;
  exhaustion: number;
  /** Seconds of breath left under water. */
  air: number;
  /** Timers (seconds) for slow effects. */
  regenTimer: number;
  starveTimer: number;
  hurtTimer: number;
  drownTimer: number;
}

export function freshVitals(): Vitals {
  return {
    health: SURVIVAL.maxHealth,
    hunger: SURVIVAL.maxHunger,
    saturation: SURVIVAL.startSaturation,
    exhaustion: 0,
    air: SURVIVAL.maxAir,
    regenTimer: 0,
    starveTimer: 0,
    hurtTimer: 0,
    drownTimer: 0,
  };
}

/** Damage after armor (each armor point blocks 4 %, up to 20 points). */
export function damageAfterArmor(damage: number, armorPoints: number): number {
  return damage * (1 - Math.min(20, armorPoints) / 25);
}

/** Fall damage for falling this many blocks (the first 3 are free). */
export function fallDamage(blocks: number): number {
  return Math.max(0, Math.ceil(blocks - SURVIVAL.safeFall));
}

/** Hurts the player. Returns the damage actually taken. */
export function hurt(v: Vitals, damage: number, armorPoints = 0): number {
  if (damage <= 0 || v.health <= 0) return 0;
  const taken = damageAfterArmor(damage, armorPoints);
  v.health = Math.max(0, v.health - taken);
  v.exhaustion += SURVIVAL.exhaustion.hurt;
  return taken;
}

export function heal(v: Vitals, amount: number): void {
  v.health = Math.min(SURVIVAL.maxHealth, v.health + amount);
}

/** Eats food. Returns false when full (can't eat). */
export function eat(v: Vitals, hunger: number, saturation: number): boolean {
  if (v.hunger >= SURVIVAL.maxHunger) return false;
  v.hunger = Math.min(SURVIVAL.maxHunger, v.hunger + hunger);
  v.saturation = Math.min(v.hunger, v.saturation + saturation);
  return true;
}

export function addExhaustion(v: Vitals, amount: number): void {
  v.exhaustion += amount;
}

export interface TickInput {
  dt: number;
  difficulty: Difficulty;
  /** Head is under water. */
  underwater: boolean;
  inLava: boolean;
  armorPoints: number;
}

/** Advances hunger, healing, drowning and lava. Returns damage taken this tick. */
export function tickVitals(v: Vitals, input: TickInput): number {
  const rules = DIFFICULTIES[input.difficulty];
  const { dt } = input;
  let damage = 0;

  // Hunger: exhaustion eats saturation first, then the hunger bar.
  if (rules.hunger) {
    while (v.exhaustion >= SURVIVAL.exhaustionPerPoint) {
      v.exhaustion -= SURVIVAL.exhaustionPerPoint;
      if (v.saturation > 0) v.saturation = Math.max(0, v.saturation - 1);
      else v.hunger = Math.max(0, v.hunger - 1);
    }
  } else {
    v.exhaustion = 0;
    v.hunger = SURVIVAL.maxHunger;
  }

  // Healing when well fed (fast in peaceful).
  v.regenTimer += dt;
  const regenEvery = rules.hunger ? SURVIVAL.regenInterval : SURVIVAL.peacefulRegenInterval;
  if (v.regenTimer >= regenEvery) {
    v.regenTimer = 0;
    if (v.health < SURVIVAL.maxHealth && v.hunger >= SURVIVAL.regenHunger) {
      heal(v, 1);
      if (rules.hunger) v.exhaustion += SURVIVAL.exhaustion.regen;
    }
  }

  // Starving: hurts slowly, but only down to the difficulty's limit.
  if (v.hunger === 0) {
    v.starveTimer += dt;
    if (v.starveTimer >= SURVIVAL.starveInterval) {
      v.starveTimer = 0;
      if (v.health > rules.starveDownTo) damage += hurt(v, 1);
    }
  } else {
    v.starveTimer = 0;
  }

  // Breath under water.
  if (input.underwater) {
    v.air = Math.max(0, v.air - dt);
    if (v.air === 0) {
      v.drownTimer += dt;
      if (v.drownTimer >= 1) {
        v.drownTimer = 0;
        damage += hurt(v, SURVIVAL.drownDamage);
      }
    }
  } else {
    v.air = Math.min(SURVIVAL.maxAir, v.air + dt * SURVIVAL.airRefillSpeed);
    v.drownTimer = 0;
  }

  // Lava burns.
  if (input.inLava) {
    v.hurtTimer += dt;
    if (v.hurtTimer >= SURVIVAL.lavaInterval) {
      v.hurtTimer = 0;
      damage += hurt(v, SURVIVAL.lavaDamage, input.armorPoints);
    }
  } else {
    v.hurtTimer = SURVIVAL.lavaInterval;
  }
  return damage;
}

export function isDead(v: Vitals): boolean {
  return v.health <= 0;
}

/** Checks saved vitals; returns fresh ones if broken. */
export function loadVitals(data: unknown): Vitals {
  const fresh = freshVitals();
  if (typeof data !== 'object' || data === null) return fresh;
  const d = data as Partial<Vitals>;
  const num = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return {
    ...fresh,
    health: num(d.health, 1, SURVIVAL.maxHealth, fresh.health),
    hunger: num(d.hunger, 0, SURVIVAL.maxHunger, fresh.hunger),
    saturation: num(d.saturation, 0, SURVIVAL.maxHunger, fresh.saturation),
    air: num(d.air, 0, SURVIVAL.maxAir, fresh.air),
  };
}
