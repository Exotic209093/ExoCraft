/**
 * Wave 9 — Distinct hostile mob type registry.
 *
 * Each entry in MOB_TYPES defines:
 *   - createMesh()        THREE.Group (body parts combined; userData.mobId set by caller)
 *   - maxHealth           HP when spawned
 *   - contactDamage       damage dealt per melee contact tick
 *   - drops               array of { itemId, minCount, maxCount, chance }
 *   - speed               { wander, chase } — override config defaults
 *   - ai                  optional hook string ('zombie'|'skeleton'|'creeper'|'spider')
 *   - spawnWeight         relative weight for random selection at night
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Shared geometry helpers (kept cheap: low-poly boxes only)
// ---------------------------------------------------------------------------

function box(w, h, d, color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity }),
  );
}

// Build a group from body-part meshes.  Each part is { mesh, dx, dy, dz }.
function buildGroup(parts) {
  const group = new THREE.Group();
  for (const { mesh, dx, dy, dz } of parts) {
    mesh.position.set(dx, dy, dz);
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Mesh factories
// ---------------------------------------------------------------------------

function createZombieMesh() {
  // Minecraft zombie: tall humanoid, rotting green skin
  const body    = box(0.56, 0.72, 0.30, 0x4a7a3c);       // torso
  const head    = box(0.50, 0.50, 0.50, 0x55883e);        // head
  const legL    = box(0.22, 0.52, 0.26, 0x3d6432);
  const legR    = box(0.22, 0.52, 0.26, 0x3d6432);
  const armL    = box(0.20, 0.60, 0.22, 0x4a7a3c);
  const armR    = box(0.20, 0.60, 0.22, 0x4a7a3c);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.36, dz: 0 },
    { mesh: head,  dx:  0,     dy:  0.97, dz: 0 },
    { mesh: legL,  dx: -0.17,  dy: -0.26, dz: 0 },
    { mesh: legR,  dx:  0.17,  dy: -0.26, dz: 0 },
    { mesh: armL,  dx: -0.38,  dy:  0.30, dz: 0 },
    { mesh: armR,  dx:  0.38,  dy:  0.30, dz: 0 },
  ]);
}

function createSkeletonMesh() {
  // Skeleton: thin white humanoid; arms raised (holding bow pose)
  const body    = box(0.42, 0.64, 0.22, 0xe8e8d8);
  const head    = box(0.44, 0.44, 0.44, 0xf0f0e0);
  const legL    = box(0.16, 0.52, 0.16, 0xdcdccc);
  const legR    = box(0.16, 0.52, 0.16, 0xdcdccc);
  const armL    = box(0.14, 0.54, 0.14, 0xe0e0d0);
  const armR    = box(0.14, 0.54, 0.14, 0xe0e0d0);
  // bow — a thin horizontal bar
  const bow     = box(0.06, 0.44, 0.06, 0x8b5e20);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.32, dz: 0 },
    { mesh: head,  dx:  0,     dy:  0.86, dz: 0 },
    { mesh: legL,  dx: -0.13,  dy: -0.26, dz: 0 },
    { mesh: legR,  dx:  0.13,  dy: -0.26, dz: 0 },
    { mesh: armL,  dx: -0.28,  dy:  0.26, dz: 0 },
    { mesh: armR,  dx:  0.28,  dy:  0.26, dz: 0 },
    { mesh: bow,   dx:  0.36,  dy:  0.26, dz: 0.10 },
  ]);
}

function createCreeperMesh() {
  // Creeper: green body + 4 stubby legs, no arms, square head
  // Distinct silhouette: wide square torso + big head
  const body    = box(0.60, 0.64, 0.40, 0x3d9e3a, 0x0a1f09, 0.1);
  const head    = box(0.64, 0.64, 0.64, 0x4ab041, 0x0a1f09, 0.1);
  const legFL   = box(0.24, 0.38, 0.24, 0x328230);
  const legFR   = box(0.24, 0.38, 0.24, 0x328230);
  const legBL   = box(0.24, 0.38, 0.24, 0x328230);
  const legBR   = box(0.24, 0.38, 0.24, 0x328230);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.32, dz:  0    },
    { mesh: head,  dx:  0,     dy:  0.96, dz:  0    },
    { mesh: legFL, dx: -0.18,  dy: -0.19, dz:  0.12 },
    { mesh: legFR, dx:  0.18,  dy: -0.19, dz:  0.12 },
    { mesh: legBL, dx: -0.18,  dy: -0.19, dz: -0.12 },
    { mesh: legBR, dx:  0.18,  dy: -0.19, dz: -0.12 },
  ]);
}

function createSpiderMesh() {
  // Spider: very wide, very low, dark body + 8 legs (4 each side)
  const body    = box(0.90, 0.40, 0.52, 0x282828);
  const head    = box(0.44, 0.36, 0.44, 0x1e1e1e);
  // Eyes — red emissive
  const eyeL    = box(0.12, 0.10, 0.06, 0xcc0000, 0x880000, 0.9);
  const eyeR    = box(0.12, 0.10, 0.06, 0xcc0000, 0x880000, 0.9);
  // legs — thin flat boxes
  const leg = (dx, dz) => ({ mesh: box(0.48, 0.06, 0.08, 0x3a3a3a), dx, dy: 0.04, dz });
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.20, dz:  0     },
    { mesh: head,  dx:  0,     dy:  0.20, dz:  0.44  },
    { mesh: eyeL,  dx: -0.11,  dy:  0.22, dz:  0.67  },
    { mesh: eyeR,  dx:  0.11,  dy:  0.22, dz:  0.67  },
    leg(-0.62,  0.18),
    leg(-0.62,  0.06),
    leg(-0.62, -0.06),
    leg(-0.62, -0.18),
    leg( 0.62,  0.18),
    leg( 0.62,  0.06),
    leg( 0.62, -0.06),
    leg( 0.62, -0.18),
  ]);
}

// ---------------------------------------------------------------------------
// Arrow mesh (tiny travelling projectile from skeleton)
// ---------------------------------------------------------------------------
export function createArrowMesh() {
  const shaft = box(0.04, 0.04, 0.40, 0x8b5e20);
  const tip   = box(0.06, 0.06, 0.08, 0xd0c8b4);
  tip.position.set(0, 0, 0.24);
  const group = new THREE.Group();
  group.add(shaft);
  group.add(tip);
  return group;
}

// ---------------------------------------------------------------------------
// Type registry
// ---------------------------------------------------------------------------

export const MOB_TYPES = {
  zombie: {
    createMesh: createZombieMesh,
    maxHealth: 10,
    contactDamage: 2,
    speed: { wander: 1.4, chase: 2.4 },
    ai: "zombie",
    spawnWeight: 4,
    drops: [
      { itemId: "bone_shard", minCount: 0, maxCount: 2, chance: 0.8 },
    ],
  },
  skeleton: {
    createMesh: createSkeletonMesh,
    maxHealth: 8,
    contactDamage: 0,  // skeleton does ranged damage only
    speed: { wander: 1.2, chase: 1.6 },
    ai: "skeleton",
    spawnWeight: 3,
    drops: [
      { itemId: "bone_shard", minCount: 1, maxCount: 3, chance: 1.0 },
    ],
  },
  creeper: {
    createMesh: createCreeperMesh,
    maxHealth: 10,
    contactDamage: 0,  // damage comes from explosion
    speed: { wander: 1.3, chase: 2.2 },
    ai: "creeper",
    spawnWeight: 2,
    drops: [],         // drops nothing (block crater is the punishment)
  },
  spider: {
    createMesh: createSpiderMesh,
    maxHealth: 6,
    contactDamage: 2,
    speed: { wander: 2.0, chase: 3.6 },
    ai: "spider",
    spawnWeight: 3,
    drops: [
      { itemId: "bone_shard", minCount: 0, maxCount: 1, chance: 0.5 },
    ],
  },
};

// Ordered list for weighted random selection.
const TYPE_ENTRIES = Object.entries(MOB_TYPES);
const TOTAL_WEIGHT = TYPE_ENTRIES.reduce((sum, [, def]) => sum + def.spawnWeight, 0);

/** Pick a random mob type id based on spawnWeight. */
export function pickRandomMobType() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [typeId, def] of TYPE_ENTRIES) {
    r -= def.spawnWeight;
    if (r <= 0) return typeId;
  }
  return TYPE_ENTRIES[0][0];
}

/** Return the definition for a type id; falls back to zombie for unknown saves. */
export function getMobTypeDef(typeId) {
  return MOB_TYPES[typeId] || MOB_TYPES.zombie;
}

/**
 * Roll drops for a mob type. Returns array of { itemId, count }.
 */
export function rollMobDrops(typeId) {
  const def = getMobTypeDef(typeId);
  const results = [];
  for (const drop of def.drops) {
    if (Math.random() > drop.chance) continue;
    const count = drop.minCount + Math.floor(Math.random() * (drop.maxCount - drop.minCount + 1));
    if (count > 0) results.push({ itemId: drop.itemId, count });
  }
  return results;
}
