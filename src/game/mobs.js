/**
 * Wave F3 — Distinct hostile mob type registry.
 *
 * Limbs are now stored as named pivots in group.userData.parts so the
 * animation layer can address them directly.  Each animatable limb is a
 * pivot THREE.Group whose origin sits at the shoulder/hip; the box geometry
 * is offset downward inside that pivot so rotation swings naturally about
 * the top edge, like the classic Minecraft limb rig.
 *
 * Each entry in MOB_TYPES defines:
 *   - createMesh()        THREE.Group (group.userData.parts = { … })
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

/**
 * Create a pivot group for an animatable limb.
 * The pivot sits at the joint origin (shoulder / hip); `mesh` is the box
 * geometry mesh offset so its TOP aligns with y=0 on the pivot, making
 * rotation about the X axis swing the limb like a pendulum.
 *
 * @param {THREE.Mesh} mesh   - the box mesh
 * @param {number} halfH      - half the height of the box  (mesh height / 2)
 * @returns {THREE.Group}     - pivot group with mesh as child
 */
function limbPivot(mesh, halfH) {
  const pivot = new THREE.Group();
  mesh.position.set(0, -halfH, 0); // shift mesh down so top == pivot origin
  pivot.add(mesh);
  return pivot;
}

// Build a group from static (non-animating) body parts.
// Each part is { mesh, dx, dy, dz }.
function buildStaticGroup(parts) {
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
  // Biped: torso, head, 2 arms (forward-raised), 2 legs
  const body = box(0.56, 0.72, 0.30, 0x4a7a3c);
  const head = box(0.50, 0.50, 0.50, 0x55883e);

  // Arms — pivot at shoulder (top of upper arm)
  const armLMesh = box(0.20, 0.60, 0.22, 0x4a7a3c);
  const armRMesh = box(0.20, 0.60, 0.22, 0x4a7a3c);
  const armL = limbPivot(armLMesh, 0.30);   // halfH = 0.60/2
  const armR = limbPivot(armRMesh, 0.30);
  // Default zombie arm-raise: pitch forward ~70 deg
  armL.rotation.x = -1.2;
  armR.rotation.x = -1.2;

  // Legs — pivot at hip
  const legLMesh = box(0.22, 0.52, 0.26, 0x3d6432);
  const legRMesh = box(0.22, 0.52, 0.26, 0x3d6432);
  const legL = limbPivot(legLMesh, 0.26);   // halfH = 0.52/2
  const legR = limbPivot(legRMesh, 0.26);

  const group = new THREE.Group();

  // Body and head — static
  body.position.set(0, 0.36, 0);
  head.position.set(0, 0.97, 0);
  group.add(body);
  group.add(head);

  // Arm pivots at shoulder level (top of arm, beside torso)
  armL.position.set(-0.38, 0.72, 0);  // shoulder Y = torso top
  armR.position.set( 0.38, 0.72, 0);
  group.add(armL);
  group.add(armR);

  // Leg pivots at hip (bottom of torso)
  legL.position.set(-0.17, 0.00, 0);  // hip Y
  legR.position.set( 0.17, 0.00, 0);
  group.add(legL);
  group.add(legR);

  group.userData.parts = { head, body, armL, armR, legL, legR };
  return group;
}

function createSkeletonMesh() {
  // Biped + bow: thin white humanoid
  const body = box(0.42, 0.64, 0.22, 0xe8e8d8);
  const head = box(0.44, 0.44, 0.44, 0xf0f0e0);
  const bow  = box(0.06, 0.44, 0.06, 0x8b5e20);

  const armLMesh = box(0.14, 0.54, 0.14, 0xe0e0d0);
  const armRMesh = box(0.14, 0.54, 0.14, 0xe0e0d0);
  const armL = limbPivot(armLMesh, 0.27);
  const armR = limbPivot(armRMesh, 0.27);
  // Skeleton holds bow raised — right arm pitched up
  armL.rotation.x = -0.6;
  armR.rotation.x = -1.0;

  const legLMesh = box(0.16, 0.52, 0.16, 0xdcdccc);
  const legRMesh = box(0.16, 0.52, 0.16, 0xdcdccc);
  const legL = limbPivot(legLMesh, 0.26);
  const legR = limbPivot(legRMesh, 0.26);

  const group = new THREE.Group();

  body.position.set(0, 0.32, 0);
  head.position.set(0, 0.86, 0);
  group.add(body);
  group.add(head);

  armL.position.set(-0.28, 0.64, 0);
  armR.position.set( 0.28, 0.64, 0);
  group.add(armL);
  group.add(armR);

  // Bow attached to right arm pivot (child of armR)
  bow.position.set(0.10, -0.18, 0.10);
  armR.add(bow);

  legL.position.set(-0.13, 0.00, 0);
  legR.position.set( 0.13, 0.00, 0);
  group.add(legL);
  group.add(legR);

  group.userData.parts = { head, body, armL, armR, legL, legR };
  return group;
}

function createCreeperMesh() {
  // Quadruped (4 stubby legs), no arms
  const body = box(0.60, 0.64, 0.40, 0x3d9e3a, 0x0a1f09, 0.1);
  const head = box(0.64, 0.64, 0.64, 0x4ab041, 0x0a1f09, 0.1);

  // Front and back leg pairs — pivot at hip top
  const legFLMesh = box(0.24, 0.38, 0.24, 0x328230);
  const legFRMesh = box(0.24, 0.38, 0.24, 0x328230);
  const legBLMesh = box(0.24, 0.38, 0.24, 0x328230);
  const legBRMesh = box(0.24, 0.38, 0.24, 0x328230);
  const legFrontL = limbPivot(legFLMesh, 0.19);
  const legFrontR = limbPivot(legFRMesh, 0.19);
  const legBackL  = limbPivot(legBLMesh, 0.19);
  const legBackR  = limbPivot(legBRMesh, 0.19);

  const group = new THREE.Group();

  body.position.set(0, 0.32, 0);
  head.position.set(0, 0.96, 0);
  group.add(body);
  group.add(head);

  legFrontL.position.set(-0.18, 0.00, 0.12);
  legFrontR.position.set( 0.18, 0.00, 0.12);
  legBackL.position.set( -0.18, 0.00, -0.12);
  legBackR.position.set(  0.18, 0.00, -0.12);
  group.add(legFrontL);
  group.add(legFrontR);
  group.add(legBackL);
  group.add(legBackR);

  group.userData.parts = { head, body, legFrontL, legFrontR, legBackL, legBackR };
  return group;
}

function createSpiderMesh() {
  // Spider: wide low body, 8 legs grouped into two swing banks (left/right)
  const body = box(0.90, 0.40, 0.52, 0x282828);
  const head = box(0.44, 0.36, 0.44, 0x1e1e1e);
  const eyeL = box(0.12, 0.10, 0.06, 0xcc0000, 0x880000, 0.9);
  const eyeR = box(0.12, 0.10, 0.06, 0xcc0000, 0x880000, 0.9);

  // 4 legs per side — each thin flat box offset +/-X from pivot
  // Leg pivot at body side; box extends outward (local X offset inside pivot)
  function spiderLeg(side, zOff) {
    const legMesh = box(0.48, 0.06, 0.08, 0x3a3a3a);
    // Pivot at body edge; shift mesh outward in X
    legMesh.position.set(side * 0.24, 0, 0); // half of 0.48
    const pivot = new THREE.Group();
    pivot.add(legMesh);
    return pivot;
  }

  // Left bank — legs at body left side (negative X), angled out and down
  const legBankL = new THREE.Group();
  const legL1 = spiderLeg(-1,  0.18);
  const legL2 = spiderLeg(-1,  0.06);
  const legL3 = spiderLeg(-1, -0.06);
  const legL4 = spiderLeg(-1, -0.18);
  for (const [l, z] of [[legL1, 0.18],[legL2, 0.06],[legL3,-0.06],[legL4,-0.18]]) {
    l.position.set(-0.45, 0.20, z);
    legBankL.add(l);
  }

  const legBankR = new THREE.Group();
  const legR1 = spiderLeg( 1,  0.18);
  const legR2 = spiderLeg( 1,  0.06);
  const legR3 = spiderLeg( 1, -0.06);
  const legR4 = spiderLeg( 1, -0.18);
  for (const [l, z] of [[legR1, 0.18],[legR2, 0.06],[legR3,-0.06],[legR4,-0.18]]) {
    l.position.set( 0.45, 0.20, z);
    legBankR.add(l);
  }

  const group = new THREE.Group();

  body.position.set(0, 0.20, 0);
  head.position.set(0, 0.20, 0.44);
  eyeL.position.set(-0.11, 0.22, 0.67);
  eyeR.position.set( 0.11, 0.22, 0.67);
  group.add(body);
  group.add(head);
  group.add(eyeL);
  group.add(eyeR);
  group.add(legBankL);
  group.add(legBankR);

  // Expose banks as the animatable parts
  group.userData.parts = { head, body, legBankL, legBankR };
  return group;
}

// ---------------------------------------------------------------------------
// Arrow mesh (tiny travelling projectile from skeleton)
// ---------------------------------------------------------------------------
export function createArrowMesh() {
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.40),
    new THREE.MeshLambertMaterial({ color: 0x8b5e20 }),
  );
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.08),
    new THREE.MeshLambertMaterial({ color: 0xd0c8b4 }),
  );
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
      // Wave G3 — spiders drop string (bow crafting).
      { itemId: "string", minCount: 1, maxCount: 2, chance: 0.85 },
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
