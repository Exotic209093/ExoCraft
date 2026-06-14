/**
 * Wave F3 — Passive animal system.
 *
 * Animals wander by day on grass blocks and drop food/materials on defeat.
 * They share the hostile-mob step-collision logic but never chase or attack.
 *
 * Limbs are stored as named pivots in group.userData.parts so the animation
 * layer can drive walk cycles deterministically.  Each pivot origin sits at
 * the joint top (hip for legs, shoulder for wings) so rotation swings the
 * limb about its top edge.
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

/**
 * Create a limb pivot: pivot origin = joint top; box shifts down by halfH.
 */
function limbPivot(mesh, halfH) {
  const pivot = new THREE.Group();
  mesh.position.set(0, -halfH, 0);
  pivot.add(mesh);
  return pivot;
}

// ---------------------------------------------------------------------------
// Mesh factories
// ---------------------------------------------------------------------------

function createCowMesh() {
  // Quadruped: big beefy body, large head, 4 stocky legs
  const body  = box(0.80, 0.60, 1.10, 0xf0ede8);
  const head  = box(0.52, 0.48, 0.52, 0xf0ede8);
  const snout = box(0.36, 0.26, 0.14, 0xd8c0a0);

  const legFLMesh = box(0.22, 0.52, 0.22, 0x3a3530);
  const legFRMesh = box(0.22, 0.52, 0.22, 0x3a3530);
  const legBLMesh = box(0.22, 0.52, 0.22, 0x3a3530);
  const legBRMesh = box(0.22, 0.52, 0.22, 0x3a3530);
  const legFrontL = limbPivot(legFLMesh, 0.26);
  const legFrontR = limbPivot(legFRMesh, 0.26);
  const legBackL  = limbPivot(legBLMesh, 0.26);
  const legBackR  = limbPivot(legBRMesh, 0.26);

  const group = new THREE.Group();

  body.position.set(0, 0.26, 0);
  head.position.set(0, 0.60, 0.54);
  snout.position.set(0, 0.44, 0.74);
  group.add(body);
  group.add(head);
  group.add(snout);

  // Hip pivots at bottom of body
  legFrontL.position.set(-0.24, 0.00, 0.34);
  legFrontR.position.set( 0.24, 0.00, 0.34);
  legBackL.position.set( -0.24, 0.00, -0.34);
  legBackR.position.set(  0.24, 0.00, -0.34);
  group.add(legFrontL);
  group.add(legFrontR);
  group.add(legBackL);
  group.add(legBackR);

  group.userData.parts = { head, body, legFrontL, legFrontR, legBackL, legBackR };
  return group;
}

function createPigMesh() {
  // Chunky pink body, round snout, stubby legs
  const body  = box(0.70, 0.52, 0.90, 0xf4b8a4);
  const head  = box(0.52, 0.44, 0.46, 0xf4b8a4);
  const snout = box(0.34, 0.22, 0.14, 0xeaa090);

  const legFLMesh = box(0.20, 0.42, 0.20, 0xeaa090);
  const legFRMesh = box(0.20, 0.42, 0.20, 0xeaa090);
  const legBLMesh = box(0.20, 0.42, 0.20, 0xeaa090);
  const legBRMesh = box(0.20, 0.42, 0.20, 0xeaa090);
  const legFrontL = limbPivot(legFLMesh, 0.21);
  const legFrontR = limbPivot(legFRMesh, 0.21);
  const legBackL  = limbPivot(legBLMesh, 0.21);
  const legBackR  = limbPivot(legBRMesh, 0.21);

  const group = new THREE.Group();

  body.position.set(0, 0.21, 0);
  head.position.set(0, 0.50, 0.42);
  snout.position.set(0, 0.36, 0.62);
  group.add(body);
  group.add(head);
  group.add(snout);

  legFrontL.position.set(-0.22, 0.00, 0.26);
  legFrontR.position.set( 0.22, 0.00, 0.26);
  legBackL.position.set( -0.22, 0.00, -0.26);
  legBackR.position.set(  0.22, 0.00, -0.26);
  group.add(legFrontL);
  group.add(legFrontR);
  group.add(legBackL);
  group.add(legBackR);

  group.userData.parts = { head, body, legFrontL, legFrontR, legBackL, legBackR };
  return group;
}

function createSheepMesh() {
  // Fluffy white body (over-sized), small legs + head
  const wool  = box(0.74, 0.68, 0.98, 0xefefef);
  const head  = box(0.38, 0.36, 0.38, 0xd8d0c0);

  const legFLMesh = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legFRMesh = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legBLMesh = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legBRMesh = box(0.18, 0.50, 0.18, 0xd0c8b8);
  const legFrontL = limbPivot(legFLMesh, 0.25);
  const legFrontR = limbPivot(legFRMesh, 0.25);
  const legBackL  = limbPivot(legBLMesh, 0.25);
  const legBackR  = limbPivot(legBRMesh, 0.25);

  const group = new THREE.Group();

  wool.position.set(0, 0.34, 0);
  head.position.set(0, 0.68, 0.46);
  group.add(wool);
  group.add(head);

  legFrontL.position.set(-0.22, 0.00, 0.30);
  legFrontR.position.set( 0.22, 0.00, 0.30);
  legBackL.position.set( -0.22, 0.00, -0.30);
  legBackR.position.set(  0.22, 0.00, -0.30);
  group.add(legFrontL);
  group.add(legFrontR);
  group.add(legBackL);
  group.add(legBackR);

  group.userData.parts = { head: head, body: wool, legFrontL, legFrontR, legBackL, legBackR };
  return group;
}

function createChickenMesh() {
  // Small biped, white body, yellow beak, red comb, wing flaps
  const body  = box(0.36, 0.36, 0.42, 0xf0ece0);
  const head  = box(0.28, 0.28, 0.28, 0xf0ece0);
  const beak  = box(0.10, 0.06, 0.10, 0xf0c040);
  const comb  = box(0.10, 0.14, 0.08, 0xcc2020);

  const legLMesh  = box(0.08, 0.30, 0.08, 0xf0c040);
  const legRMesh  = box(0.08, 0.30, 0.08, 0xf0c040);
  const wingLMesh = box(0.06, 0.26, 0.34, 0xe8e4d8);
  const wingRMesh = box(0.06, 0.26, 0.34, 0xe8e4d8);
  const legL  = limbPivot(legLMesh,  0.15);
  const legR  = limbPivot(legRMesh,  0.15);
  const wingL = limbPivot(wingLMesh, 0.13);
  const wingR = limbPivot(wingRMesh, 0.13);

  const group = new THREE.Group();

  body.position.set(0, 0.18, 0);
  head.position.set(0, 0.46, 0.22);
  beak.position.set(0, 0.40, 0.38);
  comb.position.set(0, 0.56, 0.20);
  group.add(body);
  group.add(head);
  group.add(beak);
  group.add(comb);

  // Hip/shoulder pivots
  legL.position.set(-0.10, 0.00, 0.02);
  legR.position.set( 0.10, 0.00, 0.02);
  wingL.position.set(-0.21, 0.36, 0);
  wingR.position.set( 0.21, 0.36, 0);
  group.add(legL);
  group.add(legR);
  group.add(wingL);
  group.add(wingR);

  // Expose wings as "arms" so the biped animation path drives them
  group.userData.parts = { head, body, legL, legR, armL: wingL, armR: wingR };
  return group;
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
