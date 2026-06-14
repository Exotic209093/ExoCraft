/**
 * xpOrbs.js — Wave F2: Minecraft-style XP orbs.
 *
 * Manages a pool of experience orbs that:
 *  - fall under gravity and settle on solid ground
 *  - bob and pulse as pure functions of a monotonic time value (deterministic)
 *  - fly toward the player magnetically when within ~5 blocks
 *  - are collected on contact, returning their XP value to the caller
 *  - merge when orbs of the same value are nearby on the ground
 *  - despawn after 300 s; cap at 200 orbs
 *
 * Public API:
 *   spawnXp(amount, x, y, z)       — split amount into MC denomination orbs
 *   update(dt, playerPos, world, worldTimeMs) → totalXpCollected (integer)
 *   serialize() → plain-object array
 *   restore(data)
 *   clear()
 *   getState() → { count, entries }
 *   .group — THREE.Group to add to the scene
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GRAVITY        = 14.0;   // blocks / s²
const PICKUP_DELAY_S = 0.5;    // seconds before orb is collectible
const MAGNET_RADIUS  = 5.0;    // Minecraft: ~5 blocks magnet range
const COLLECT_RADIUS = 0.7;    // contact radius for pickup
const MERGE_RADIUS   = 0.9;    // merge nearby same-value orbs on ground
const DESPAWN_S      = 300;    // seconds
const MAX_ORBS       = 200;

const BOB_AMPLITUDE  = 0.10;   // blocks
const BOB_PERIOD_S   = 1.2;    // seconds per full bob cycle
const PULSE_PERIOD_S = 0.9;    // scale pulse period

const ORB_BASE_RADIUS = 0.14;  // visual sphere radius

// Passable block ids — same set as itemEntities.js
const PASSABLE = new Set([0, 15, 21, 23, 24, 25]);

function isPassable(bt) {
  return bt === 0 || PASSABLE.has(bt);
}

// ---------------------------------------------------------------------------
// Minecraft XP denomination set (largest-first for greedy splitting)
// ---------------------------------------------------------------------------
const XP_DENOMINATIONS = [73, 37, 17, 7, 3, 1];

/** Split `amount` of XP into the fewest orbs using MC denomination set. */
function splitXp(amount) {
  const orbs = [];
  let remaining = Math.max(0, Math.floor(amount));
  for (const denom of XP_DENOMINATIONS) {
    while (remaining >= denom) {
      orbs.push(denom);
      remaining -= denom;
    }
  }
  return orbs;
}

// ---------------------------------------------------------------------------
// Deterministic seeded scatter (NEVER uses Math.random in entity sim)
// ---------------------------------------------------------------------------
let _orbSpawnCounter = 0;

function seededFloat(seed) {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function popVelocity(seed) {
  const angle = seededFloat(seed) * Math.PI * 2;
  const hSpeed = 0.6 + seededFloat(seed + 1) * 1.4; // 0.6–2.0 blocks/s
  return {
    vx: Math.cos(angle) * hSpeed,
    vy: 2.5 + seededFloat(seed + 2) * 2.0,           // 2.5–4.5 up
    vz: Math.sin(angle) * hSpeed,
  };
}

// ---------------------------------------------------------------------------
// Visual: emissive sphere with green/yellow hue, size proportional to value
// ---------------------------------------------------------------------------

/** Map XP value to a visual scale multiplier (larger orbs = more xp). */
function orbScale(value) {
  if (value >= 37) return 1.5;
  if (value >= 17) return 1.25;
  if (value >= 7)  return 1.05;
  return 1.0;
}

function buildOrbMesh(value) {
  const radius = ORB_BASE_RADIUS * orbScale(value);
  const geo = new THREE.SphereGeometry(radius, 6, 4);
  // Green-yellow gradient: larger orbs are more yellow
  const hue = value >= 17 ? 0.17 : (value >= 7 ? 0.22 : 0.28); // HSL hue: 0.17=yellow, 0.28=green
  const color = new THREE.Color().setHSL(hue, 1.0, 0.55);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.6,
    roughness: 0.3,
    metalness: 0.0,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = false;
  mesh.receiveShadow = false;
  mesh.userData.isXpOrb = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// XpOrbManager
// ---------------------------------------------------------------------------
export class XpOrbManager {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "xpOrbs";
    /** @type {Array<XpOrb>} */
    this._orbs = [];
  }

  // -------------------------------------------------------------------------
  // Spawn
  // -------------------------------------------------------------------------

  /**
   * Split `amount` into denomination orbs, spawning each near (x, y, z).
   * Each orb gets deterministic scatter so multiple calls produce consistent results.
   */
  spawnXp(amount, x, y, z) {
    const denominations = splitXp(amount);
    for (const value of denominations) {
      this._spawnOrb(value, x, y, z);
    }
  }

  _spawnOrb(value, x, y, z) {
    const seed = ++_orbSpawnCounter;
    const pop = popVelocity(seed);
    const mesh = buildOrbMesh(value);
    this.group.add(mesh);

    const orb = {
      id:           seed,
      value,
      pos:          new THREE.Vector3(x, y, z),
      vel:          new THREE.Vector3(pop.vx, pop.vy, pop.vz),
      ageS:         0,
      pickupDelayS: PICKUP_DELAY_S,
      onGround:     false,
      mesh,
    };
    this._orbs.push(orb);
    this._enforceCap();
    return orb;
  }

  // -------------------------------------------------------------------------
  // Update — returns total XP collected this tick
  // -------------------------------------------------------------------------

  update(dtSeconds, playerPos, world, worldTimeMs) {
    if (dtSeconds <= 0 || this._orbs.length === 0) return 0;

    let totalXpCollected = 0;
    const toRemove = [];

    // Phase 1 — physics + pickup
    for (const orb of this._orbs) {
      orb.ageS += dtSeconds;

      if (orb.ageS >= DESPAWN_S) {
        toRemove.push(orb);
        continue;
      }

      const { pos, vel } = orb;

      // Gravity
      if (!orb.onGround) {
        vel.y -= GRAVITY * dtSeconds;
      }

      // Magnetic attraction
      const dx = playerPos.x - pos.x;
      const dy = playerPos.y - pos.y;
      const dz = playerPos.z - pos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (orb.ageS >= orb.pickupDelayS) {
        if (distSq <= COLLECT_RADIUS * COLLECT_RADIUS) {
          totalXpCollected += orb.value;
          toRemove.push(orb);
          continue;
        }
        if (distSq <= MAGNET_RADIUS * MAGNET_RADIUS) {
          const dist = Math.sqrt(distSq) + 0.001;
          const accel = 18.0 / (dist + 0.5);
          vel.x += (dx / dist) * accel * dtSeconds;
          vel.y += (dy / dist) * accel * dtSeconds;
          vel.z += (dz / dist) * accel * dtSeconds;
        }
      }

      // Clamp velocity
      const maxSpeed = 20;
      const speedSq = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
      if (speedSq > maxSpeed * maxSpeed) {
        const s = maxSpeed / Math.sqrt(speedSq);
        vel.x *= s; vel.y *= s; vel.z *= s;
      }

      const nx = pos.x + vel.x * dtSeconds;
      const ny = pos.y + vel.y * dtSeconds;
      const nz = pos.z + vel.z * dtSeconds;

      // Ground collision (Y axis)
      const bx = Math.floor(nx);
      const bz = Math.floor(nz);
      const floorY = Math.floor(ny);
      const blockBelow = world.get(bx, floorY, bz);
      const blockAbove = world.get(bx, floorY + 1, bz);

      if (!isPassable(blockBelow) && ny < floorY + 1) {
        pos.y = floorY + 1.0;
        vel.y = 0;
        vel.x *= 0.55;
        vel.z *= 0.55;
        orb.onGround = Math.abs(vel.x) < 0.05 && Math.abs(vel.z) < 0.05;
        if (orb.onGround) { vel.x = 0; vel.z = 0; }
      } else if (!isPassable(blockAbove) && ny > floorY + 1) {
        pos.y = floorY + 1.0 - 0.001;
        vel.y = 0;
      } else {
        pos.y = ny;
        orb.onGround = false;
      }

      // Horizontal
      const bxNew = Math.floor(nx);
      const bzNew = Math.floor(nz);
      if (isPassable(world.get(bxNew, Math.floor(pos.y), bz))) {
        pos.x = nx;
      } else {
        vel.x = 0;
      }
      if (isPassable(world.get(bxNew, Math.floor(pos.y), bzNew))) {
        pos.z = nz;
      } else {
        vel.z = 0;
      }

      // Bob + pulse (pure function of worldTimeMs)
      const t = worldTimeMs / 1000;
      const bob = Math.sin((t + orb.id * 0.41) / BOB_PERIOD_S * Math.PI * 2) * BOB_AMPLITUDE;
      const pulse = 1.0 + 0.12 * Math.sin((t + orb.id * 0.73) / PULSE_PERIOD_S * Math.PI * 2);

      orb.mesh.position.set(pos.x, pos.y + bob + ORB_BASE_RADIUS, pos.z);
      const sc = orbScale(orb.value) * pulse;
      orb.mesh.scale.set(sc, sc, sc);
    }

    // Phase 2 — merge nearby same-value ground orbs
    const removeSet0 = new Set(toRemove);
    const active = this._orbs.filter((o) => !removeSet0.has(o));
    const mergedAway = new Set();
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (mergedAway.has(a) || !a.onGround) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (mergedAway.has(b) || !b.onGround || b.value !== a.value) continue;
        const ddx = a.pos.x - b.pos.x;
        const ddz = a.pos.z - b.pos.z;
        if (ddx * ddx + ddz * ddz <= MERGE_RADIUS * MERGE_RADIUS) {
          a.value += b.value;
          mergedAway.add(b);
          toRemove.push(b);
        }
      }
    }

    // Phase 3 — remove dead orbs
    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove);
      for (const orb of removeSet) {
        this.group.remove(orb.mesh);
        if (orb.mesh.geometry) orb.mesh.geometry.dispose();
        if (orb.mesh.material) {
          const mats = Array.isArray(orb.mesh.material) ? orb.mesh.material : [orb.mesh.material];
          for (const m of mats) m.dispose();
        }
      }
      this._orbs = this._orbs.filter((o) => !removeSet.has(o));
    }

    return totalXpCollected;
  }

  // -------------------------------------------------------------------------
  // Cap
  // -------------------------------------------------------------------------
  _enforceCap() {
    if (this._orbs.length <= MAX_ORBS) return;
    const excess = this._orbs.splice(0, this._orbs.length - MAX_ORBS);
    for (const orb of excess) {
      this.group.remove(orb.mesh);
      if (orb.mesh.geometry) orb.mesh.geometry.dispose();
      if (orb.mesh.material) {
        const mats = Array.isArray(orb.mesh.material) ? orb.mesh.material : [orb.mesh.material];
        for (const m of mats) m.dispose();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Serialize / restore / clear
  // -------------------------------------------------------------------------

  serialize() {
    return this._orbs.map((o) => ({
      value:        o.value,
      x:            o.pos.x,
      y:            o.pos.y,
      z:            o.pos.z,
      vx:           o.vel.x,
      vy:           o.vel.y,
      vz:           o.vel.z,
      ageS:         o.ageS,
      pickupDelayS: o.pickupDelayS,
    }));
  }

  restore(data) {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const raw of data) {
      if (!raw || !Number.isFinite(raw.value) || raw.value <= 0) continue;
      const remaining = DESPAWN_S - (raw.ageS ?? 0);
      if (remaining <= 0) continue;
      const orb = this._spawnOrb(raw.value, raw.x ?? 0, raw.y ?? 0, raw.z ?? 0);
      if (orb) {
        orb.vel.set(raw.vx ?? 0, raw.vy ?? 0, raw.vz ?? 0);
        orb.ageS = raw.ageS ?? 0;
        orb.pickupDelayS = raw.pickupDelayS ?? PICKUP_DELAY_S;
      }
    }
  }

  clear() {
    for (const orb of this._orbs) {
      this.group.remove(orb.mesh);
      if (orb.mesh.geometry) orb.mesh.geometry.dispose();
      if (orb.mesh.material) {
        const mats = Array.isArray(orb.mesh.material) ? orb.mesh.material : [orb.mesh.material];
        for (const m of mats) m.dispose();
      }
    }
    this._orbs = [];
  }

  // -------------------------------------------------------------------------
  // Debug / hooks
  // -------------------------------------------------------------------------

  getState() {
    return {
      count:   this._orbs.length,
      entries: this._orbs.slice(0, 20).map((o) => ({
        value: o.value,
        x:     Number(o.pos.x.toFixed(3)),
        y:     Number(o.pos.y.toFixed(3)),
        z:     Number(o.pos.z.toFixed(3)),
        ageMs: Math.floor(o.ageS * 1000),
      })),
    };
  }
}
