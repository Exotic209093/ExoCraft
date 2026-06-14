/**
 * Wave 9 — Passive animal system.
 *
 * Animals wander by day on grass blocks and drop food/materials on defeat.
 * They share the hostile-mob step-collision logic but never chase or attack.
 *
 * Each type: { createMesh, maxHealth, drops, speed }
 * Drops: [{ itemId, minCount, maxCount, chance }]
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Low-poly mesh helpers
// ---------------------------------------------------------------------------

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
}

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

function createCowMesh() {
  // Big beefy body, large head, 4 stocky legs — black & white patchwork
  const body  = box(0.80, 0.60, 1.10, 0xf0ede8);
  const head  = box(0.52, 0.48, 0.52, 0xf0ede8);
  const snout = box(0.36, 0.26, 0.14, 0xd8c0a0);
  const legFL = box(0.22, 0.52, 0.22, 0x3a3530);
  const legFR = box(0.22, 0.52, 0.22, 0x3a3530);
  const legBL = box(0.22, 0.52, 0.22, 0x3a3530);
  const legBR = box(0.22, 0.52, 0.22, 0x3a3530);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.26,  dz:  0     },
    { mesh: head,  dx:  0,     dy:  0.60,  dz:  0.54  },
    { mesh: snout, dx:  0,     dy:  0.44,  dz:  0.74  },
    { mesh: legFL, dx: -0.24,  dy: -0.26,  dz:  0.34  },
    { mesh: legFR, dx:  0.24,  dy: -0.26,  dz:  0.34  },
    { mesh: legBL, dx: -0.24,  dy: -0.26,  dz: -0.34  },
    { mesh: legBR, dx:  0.24,  dy: -0.26,  dz: -0.34  },
  ]);
}

function createPigMesh() {
  // Chunky pink body, round snout, stubby legs
  const body  = box(0.70, 0.52, 0.90, 0xf4b8a4);
  const head  = box(0.52, 0.44, 0.46, 0xf4b8a4);
  const snout = box(0.34, 0.22, 0.14, 0xeaa090);
  const legFL = box(0.20, 0.42, 0.20, 0xeaa090);
  const legFR = box(0.20, 0.42, 0.20, 0xeaa090);
  const legBL = box(0.20, 0.42, 0.20, 0xeaa090);
  const legBR = box(0.20, 0.42, 0.20, 0xeaa090);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.21,  dz:  0     },
    { mesh: head,  dx:  0,     dy:  0.50,  dz:  0.42  },
    { mesh: snout, dx:  0,     dy:  0.36,  dz:  0.62  },
    { mesh: legFL, dx: -0.22,  dy: -0.21,  dz:  0.26  },
    { mesh: legFR, dx:  0.22,  dy: -0.21,  dz:  0.26  },
    { mesh: legBL, dx: -0.22,  dy: -0.21,  dz: -0.26  },
    { mesh: legBR, dx:  0.22,  dy: -0.21,  dz: -0.26  },
  ]);
}

function createSheepMesh() {
  // Fluffy white body (over-sized), smallish legs + head
  const wool  = box(0.74, 0.68, 0.98, 0xefefef);
  const head  = box(0.38, 0.36, 0.38, 0xd8d0c0);
  const legFL = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legFR = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legBL = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legBR = box(0.18, 0.50, 0.18, 0xd0c8b8);
  return buildGroup([
    { mesh: wool,  dx:  0,     dy:  0.34,  dz:  0     },
    { mesh: head,  dx:  0,     dy:  0.68,  dz:  0.46  },
    { mesh: legFL, dx: -0.22,  dy: -0.25,  dz:  0.30  },
    { mesh: legFR, dx:  0.22,  dy: -0.25,  dz:  0.30  },
    { mesh: legBL, dx: -0.22,  dy: -0.25,  dz: -0.30  },
    { mesh: legBR, dx:  0.22,  dy: -0.25,  dz: -0.30  },
  ]);
}

function createChickenMesh() {
  // Small, two-legged, white body, yellow beak, red comb
  const body  = box(0.36, 0.36, 0.42, 0xf0ece0);
  const head  = box(0.28, 0.28, 0.28, 0xf0ece0);
  const beak  = box(0.10, 0.06, 0.10, 0xf0c040);
  const comb  = box(0.10, 0.14, 0.08, 0xcc2020);
  const legL  = box(0.08, 0.30, 0.08, 0xf0c040);
  const legR  = box(0.08, 0.30, 0.08, 0xf0c040);
  const wingL = box(0.06, 0.26, 0.34, 0xe8e4d8);
  const wingR = box(0.06, 0.26, 0.34, 0xe8e4d8);
  return buildGroup([
    { mesh: body,  dx:  0,     dy:  0.18,  dz:  0     },
    { mesh: head,  dx:  0,     dy:  0.46,  dz:  0.22  },
    { mesh: beak,  dx:  0,     dy:  0.40,  dz:  0.38  },
    { mesh: comb,  dx:  0,     dy:  0.56,  dz:  0.20  },
    { mesh: legL,  dx: -0.10,  dy: -0.15,  dz:  0.02  },
    { mesh: legR,  dx:  0.10,  dy: -0.15,  dz:  0.02  },
    { mesh: wingL, dx: -0.21,  dy:  0.18,  dz:  0     },
    { mesh: wingR, dx:  0.21,  dy:  0.18,  dz:  0     },
  ]);
}

// ---------------------------------------------------------------------------
// Type registry
// ---------------------------------------------------------------------------

export const PASSIVE_MOB_TYPES = {
  cow: {
    createMesh: createCowMesh,
    maxHealth: 10,
    speed: 1.2,
    spawnWeight: 3,
    drops: [
      { itemId: "raw_beef",  minCount: 1, maxCount: 3, chance: 1.0 },
      { itemId: "leather",   minCount: 0, maxCount: 2, chance: 0.75 },
    ],
  },
  pig: {
    createMesh: createPigMesh,
    maxHealth: 10,
    speed: 1.4,
    spawnWeight: 3,
    drops: [
      { itemId: "raw_porkchop", minCount: 1, maxCount: 3, chance: 1.0 },
    ],
  },
  sheep: {
    createMesh: createSheepMesh,
    maxHealth: 8,
    speed: 1.3,
    spawnWeight: 3,
    drops: [
      { itemId: "wool",      minCount: 1, maxCount: 3, chance: 1.0 },
      { itemId: "raw_beef",  minCount: 0, maxCount: 1, chance: 0.5 },  // mutton substitute
    ],
  },
  chicken: {
    createMesh: createChickenMesh,
    maxHealth: 4,
    speed: 1.6,
    spawnWeight: 3,
    drops: [
      { itemId: "raw_chicken", minCount: 1, maxCount: 2, chance: 1.0 },
      { itemId: "feather",     minCount: 0, maxCount: 2, chance: 0.8 },
    ],
  },
};

// Weighted random selection
const PASSIVE_ENTRIES = Object.entries(PASSIVE_MOB_TYPES);
const PASSIVE_TOTAL_WEIGHT = PASSIVE_ENTRIES.reduce((s, [, d]) => s + d.spawnWeight, 0);

export function pickRandomPassiveMobType() {
  let r = Math.random() * PASSIVE_TOTAL_WEIGHT;
  for (const [typeId, def] of PASSIVE_ENTRIES) {
    r -= def.spawnWeight;
    if (r <= 0) return typeId;
  }
  return PASSIVE_ENTRIES[0][0];
}

export function getPassiveMobTypeDef(typeId) {
  return PASSIVE_MOB_TYPES[typeId] || PASSIVE_MOB_TYPES.cow;
}

export function rollPassiveMobDrops(typeId) {
  const def = getPassiveMobTypeDef(typeId);
  const results = [];
  for (const drop of def.drops) {
    if (Math.random() > drop.chance) continue;
    const count = drop.minCount + Math.floor(Math.random() * (drop.maxCount - drop.minCount + 1));
    if (count > 0) results.push({ itemId: drop.itemId, count });
  }
  return results;
}
