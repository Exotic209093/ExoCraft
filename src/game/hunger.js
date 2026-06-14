/**
 * hunger.js — Pure hunger/saturation functions for Wave 7 survival loop.
 *
 * All functions are stateless: they take state values and return new values
 * or deltas. Mutation happens in main.js which owns the state singleton.
 *
 * Tuning (Minecraft-ish):
 *   maxHunger     = 20   (10 visible shanks, 2 half-shanks each)
 *   drainRate     = 0.02 /s at rest
 *   sprintBonus   = 0.04 /s extra while sprinting on ground
 *   jumpCost      = 0.10  per jump (one-shot)
 *   regenThreshold= 18   (hunger >= 18 and health < max → +0.5 hp/s)
 *   regenRate     = 0.5  hp/s
 *   starveDamage  = 1.0  hp per starveInterval at hunger == 0
 *   starveInterval= 4 s
 */

export const MAX_HUNGER = 20;
export const MAX_SATURATION = 20;

// Drain per second at rest.
const DRAIN_RATE_BASE = 0.02;
// Extra drain per second while sprinting on the ground.
const DRAIN_RATE_SPRINT = 0.04;

// Passive regen: hunger must be at or above this value.
const REGEN_HUNGER_THRESHOLD = 18;
// HP restored per second when well-fed.
export const REGEN_RATE_HP_PER_SEC = 0.5;

// Starvation: deals 1 damage every this many seconds when hunger == 0.
const STARVE_INTERVAL_SEC = 4.0;

/**
 * Compute how much hunger to drain this tick.
 * @param {number} dtSeconds
 * @param {boolean} isSprinting - true when sprinting on ground
 * @returns {number} drain amount (positive = lose hunger)
 */
export function calcHungerDrain(dtSeconds, isSprinting) {
  const rate = DRAIN_RATE_BASE + (isSprinting ? DRAIN_RATE_SPRINT : 0);
  return rate * dtSeconds;
}

/**
 * One-time hunger cost of a jump.
 */
export const JUMP_HUNGER_COST = 0.1;

/**
 * Apply food to hunger/saturation. Returns the updated { hunger, saturation }.
 * Won't exceed maxHunger / MAX_SATURATION.
 * @param {number} hunger
 * @param {number} saturation
 * @param {{hunger: number, saturation: number}} foodDef
 */
export function applyFood(hunger, saturation, foodDef) {
  const newHunger = Math.min(MAX_HUNGER, hunger + foodDef.hunger);
  const newSaturation = Math.min(newHunger, Math.min(MAX_SATURATION, saturation + foodDef.saturation));
  return { hunger: newHunger, saturation: newSaturation };
}

/**
 * Advance hunger system for one tick.
 * Drains hunger (saturation absorbs drain first), applies regen or starvation.
 *
 * Returns an object with:
 *   hunger      — new hunger value
 *   saturation  — new saturation value
 *   starveAccumSec — updated starvation accumulator (seconds since last starve tick)
 *   regenHp     — HP to add this tick (may be 0)
 *   starveHp    — HP to subtract this tick (may be 0)
 *
 * @param {{
 *   hunger: number,
 *   saturation: number,
 *   starveAccumSec: number,
 *   health: number,
 *   maxHealth: number,
 *   dtSeconds: number,
 *   isSprinting: boolean,
 * }} params
 */
export function tickHunger({ hunger, saturation, starveAccumSec, health, maxHealth, dtSeconds, isSprinting }) {
  let drain = calcHungerDrain(dtSeconds, isSprinting);

  // Saturation absorbs drain before hunger decreases.
  let newSaturation = saturation;
  if (newSaturation > 0) {
    const absorbed = Math.min(newSaturation, drain);
    newSaturation = Math.max(0, newSaturation - absorbed);
    drain -= absorbed;
  }

  let newHunger = Math.max(0, hunger - drain);

  let regenHp = 0;
  let starveHp = 0;
  let newStarveAccum = starveAccumSec;

  if (newHunger >= REGEN_HUNGER_THRESHOLD && health < maxHealth) {
    // Well-fed regen.
    regenHp = REGEN_RATE_HP_PER_SEC * dtSeconds;
  } else if (newHunger <= 0) {
    // Starvation ticks.
    newStarveAccum += dtSeconds;
    if (newStarveAccum >= STARVE_INTERVAL_SEC) {
      newStarveAccum -= STARVE_INTERVAL_SEC;
      starveHp = 1;
    }
  } else {
    // Mid-hunger: reset starvation accumulator so timing is fresh when hunger drops again.
    newStarveAccum = 0;
  }

  return {
    hunger: newHunger,
    saturation: newSaturation,
    starveAccumSec: newStarveAccum,
    regenHp,
    starveHp,
  };
}
