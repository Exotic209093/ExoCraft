/**
 * Wave F3 — Mob animation system.
 *
 * All animation is deterministic: driven by accumulated mob state
 * (travelDist, hurtFlashMs, dyingElapsedMs) that advances with dt.
 * No wall-clock calls, no new Math.random() here.
 *
 * Exported functions:
 *   initMobAnimState(mob)             — call once after mob object is created
 *   tickMobAnims(mobs, dtMs, playerPos, isPassive) — call each update tick
 *   getMobDebugSnapshot(mobs)         — scalar-only debug payload
 *
 * Shadow management:
 *   initMobShadow(mob, scene)         — attach a shadow disc to a mob
 *   removeMobShadow(mob, scene)       — remove and return shadow to pool
 *
 * Hurt flash:
 *   triggerHurtFlash(mob)             — set on hit; animation clears it
 *
 * Death:
 *   startMobDeath(mob)                — enter dying state; loot must be
 *                                       fired by the caller BEFORE this
 *   isMobDying(mob)                   — true while death anim plays
 *   isMobDeathFinished(mob, dtMs)     — advance and return true when done
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HURT_FLASH_DURATION_MS   = 300;
const DEATH_DURATION_MS        = 500;
const SHADOW_RADIUS            = 0.38;
const SHADOW_OPACITY           = 0.38;
const WALK_AMPLITUDE           = 0.55;   // max leg swing radians at full sprint
const WALK_FREQ                = 2.8;    // sine cycles per block of travel
const ARM_AMPLITUDE            = 0.45;
const BODY_BOB_AMPLITUDE       = 0.015; // vertical body bob in world units
const HEAD_TRACK_MAX_YAW       = Math.PI * 0.45;
const HEAD_TRACK_MAX_PITCH     = 0.35;
const HEAD_TRACK_RANGE_SQ      = 8 * 8; // blocks² before head snaps forward
const HEAD_AWARE_RANGE_SQ      = 20 * 20;

// ---------------------------------------------------------------------------
// Shadow pool
// ---------------------------------------------------------------------------

const _shadowPool = [];

function _acquireShadow() {
  if (_shadowPool.length > 0) return _shadowPool.pop();
  const geo = new THREE.CircleGeometry(SHADOW_RADIUS, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function _releaseShadow(mesh) {
  _shadowPool.push(mesh);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach transient animation state to a freshly-created mob object.
 * Does NOT mutate the save payload (these fields are never serialized).
 */
export function initMobAnimState(mob) {
  mob.travelDist    = 0;   // accumulated planar travel distance (blocks)
  mob.hurtFlashMs   = 0;   // countdown; >0 means flash is active
  mob.dying         = false;
  mob.dyingElapsedMs = 0;
  mob.shadow        = null; // THREE.Mesh assigned by initMobShadow
  // Store original material colors for hurt-flash restore
  mob._origColors   = null;
}

/**
 * Add a soft circular shadow below the mob.
 * @param {object}     mob   - mob object (must have .mesh and .pos)
 * @param {THREE.Scene} scene
 */
export function initMobShadow(mob, scene) {
  const shadow = _acquireShadow();
  shadow.position.set(mob.pos.x, mob.pos.y - 0.01, mob.pos.z);
  scene.add(shadow);
  mob.shadow = shadow;
}

/**
 * Remove a mob's shadow, returning it to the pool.
 */
export function removeMobShadow(mob, scene) {
  if (!mob.shadow) return;
  scene.remove(mob.shadow);
  _releaseShadow(mob.shadow);
  mob.shadow = null;
}

/**
 * Trigger the red hurt flash on a mob.
 */
export function triggerHurtFlash(mob) {
  mob.hurtFlashMs = HURT_FLASH_DURATION_MS;
}

/**
 * Enter dying state.  The caller MUST fire loot/XP before calling this.
 * While dying: mob.dying === true; mob deals no damage; is not a valid hit target.
 */
export function startMobDeath(mob) {
  mob.dying = true;
  mob.dyingElapsedMs = 0;
}

/** Returns true while the death animation is still playing. */
export function isMobDying(mob) {
  return mob.dying === true;
}

/**
 * Advance the death animation by dtMs.
 * @returns {boolean} true when the animation is complete and mob can be removed.
 */
export function isMobDeathFinished(mob, dtMs) {
  if (!mob.dying) return false;
  mob.dyingElapsedMs += dtMs;
  const t = Math.min(1, mob.dyingElapsedMs / DEATH_DURATION_MS);

  // Tip the whole mesh 90° onto its side, fade to 0
  mob.mesh.rotation.z = t * (Math.PI / 2);
  mob.mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.transparent = true;
      child.material.opacity = 1 - t;
    }
  });

  return t >= 1;
}

// ---------------------------------------------------------------------------
// Per-tick animation driver
// ---------------------------------------------------------------------------

/**
 * Tick animations for a list of mobs.
 *
 * @param {object[]} mobs       - hostileMobs or passiveMobs array
 * @param {number}   dtMs       - delta time in milliseconds
 * @param {THREE.Vector3} playerPos
 * @param {boolean}  isPassive  - if true, mobs are never "chasing"
 */
export function tickMobAnims(mobs, dtMs, playerPos, isPassive) {
  const dtSec = dtMs / 1000;

  for (const mob of mobs) {
    if (mob.dying) continue;  // death anim handled separately in main loop

    const parts = mob.mesh?.userData?.parts;
    if (!parts) continue;

    // -- Shadow position --
    if (mob.shadow) {
      mob.shadow.position.x = mob.pos.x;
      mob.shadow.position.z = mob.pos.z;
      // Shadow rests just above whatever the mob is standing on
      mob.shadow.position.y = mob.pos.y + 0.02;
    }

    // -- Hurt flash --
    if (mob.hurtFlashMs > 0) {
      mob.hurtFlashMs = Math.max(0, mob.hurtFlashMs - dtMs);
      const active = mob.hurtFlashMs > 0;
      if (!mob._flashActive && active) {
        // Entering flash: save originals and tint red
        mob._flashActive = true;
        mob._origColors = [];
        mob.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            // Clone material to avoid mutating shared instances
            if (!child._flashCloned) {
              child.material = child.material.clone();
              child._flashCloned = true;
            }
            mob._origColors.push({ child, emissive: child.material.emissive.getHex(), emissiveIntensity: child.material.emissiveIntensity });
            child.material.emissive.setHex(0xff2200);
            child.material.emissiveIntensity = 0.9;
          }
        });
      } else if (mob._flashActive && !active) {
        // Flash expired: restore original emissives
        mob._flashActive = false;
        if (mob._origColors) {
          for (const { child, emissive, emissiveIntensity } of mob._origColors) {
            child.material.emissive.setHex(emissive);
            child.material.emissiveIntensity = emissiveIntensity;
          }
          mob._origColors = null;
        }
      }
    }

    // -- Determine effective speed for this frame --
    // Use the mob's last-moved distance this tick.  We approximate from
    // position difference (accumulated travelDist is set after movement in main.js).
    const hSpeed = mob._lastFrameSpeed ?? 0;

    // -- Walk cycle (sine of travel distance) --
    const phase = mob.travelDist * WALK_FREQ * Math.PI * 2;
    const legSwing    = Math.min(hSpeed / 2.5, 1) * WALK_AMPLITUDE * Math.sin(phase);
    const armSwing    = Math.min(hSpeed / 2.5, 1) * ARM_AMPLITUDE  * Math.sin(phase);
    const bobDy       = Math.abs(Math.sin(phase * 2)) * BODY_BOB_AMPLITUDE;

    // Apply bob to the whole group (very subtle)
    if (parts.body && parts.body.isMesh === false) {
      // body is a direct mesh child; bob via mesh position is messier, skip
    }
    // Offset the mesh Y by the bob, anchored to the live logical position so
    // the mesh tracks terrain correctly instead of freezing at spawn height.
    mob.mesh.position.y = mob.pos.y + bobDy;

    const mobType = mob.mobType;

    if (mobType === "spider") {
      // Spider: two banks swing alternately, also roll slightly side to side
      if (parts.legBankL) parts.legBankL.rotation.x =  legSwing * 0.7;
      if (parts.legBankR) parts.legBankR.rotation.x = -legSwing * 0.7;
    } else if (mobType === "creeper") {
      // Quadruped: diagonal pairs in antiphase
      if (parts.legFrontL) parts.legFrontL.rotation.x =  legSwing;
      if (parts.legBackR)  parts.legBackR.rotation.x  =  legSwing;
      if (parts.legFrontR) parts.legFrontR.rotation.x = -legSwing;
      if (parts.legBackL)  parts.legBackL.rotation.x  = -legSwing;
    } else if (parts.legFrontL) {
      // Quadruped passive (cow/pig/sheep)
      parts.legFrontL.rotation.x =  legSwing;
      parts.legBackR.rotation.x  =  legSwing;
      parts.legFrontR.rotation.x = -legSwing;
      parts.legBackL.rotation.x  = -legSwing;
    } else {
      // Biped (zombie/skeleton/chicken)
      if (parts.legL) parts.legL.rotation.x =  legSwing;
      if (parts.legR) parts.legR.rotation.x = -legSwing;
      // Zombie arms — swing counter to legs; add to the default raised pitch
      if (mobType === "zombie") {
        if (parts.armL) parts.armL.rotation.x = -1.2 - armSwing;
        if (parts.armR) parts.armR.rotation.x = -1.2 + armSwing;
      } else if (mobType === "skeleton") {
        // Skeleton: swing the non-bow arm, keep bow arm raised
        if (parts.armL) parts.armL.rotation.x = -0.6 + armSwing * 0.5;
        // armR holds the bow; leave mostly pitched up
      } else {
        // Chicken wings flap
        if (parts.armL) parts.armL.rotation.z =  armSwing * 0.8;
        if (parts.armR) parts.armR.rotation.z = -armSwing * 0.8;
      }
    }

    // -- Head tracking --
    if (parts.head) {
      const toPlayerX = playerPos.x - mob.pos.x;
      const toPlayerZ = playerPos.z - mob.pos.z;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      const aware = isPassive
        ? distSq < HEAD_TRACK_RANGE_SQ
        : (mob.chasing || distSq < HEAD_AWARE_RANGE_SQ);

      if (aware && distSq > 0.04) {
        // Yaw: angle from mob's forward (−Z in mob-local space) to player
        const mobYaw = mob.mesh.rotation.y;
        const globalYaw = Math.atan2(toPlayerX, toPlayerZ); // atan2(X,Z) for Y-up
        let relYaw = globalYaw - mobYaw;
        // Normalise to [-π, π]
        while (relYaw >  Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        relYaw = Math.max(-HEAD_TRACK_MAX_YAW, Math.min(HEAD_TRACK_MAX_YAW, relYaw));

        const heightDiff = playerPos.y - mob.pos.y;
        const horizDist  = Math.sqrt(distSq);
        const rawPitch   = -Math.atan2(heightDiff, horizDist);
        const pitch      = Math.max(-HEAD_TRACK_MAX_PITCH, Math.min(HEAD_TRACK_MAX_PITCH, rawPitch));

        // Smooth toward target (avoid snapping; 10 rad/s max)
        const headGroup = parts.head.parent === mob.mesh ? parts.head : null;
        if (headGroup) {
          const currentYaw = headGroup.rotation.y ?? 0;
          const dy = relYaw - currentYaw;
          const normDy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI; // remap
          headGroup.rotation.y += Math.sign(normDy) * Math.min(Math.abs(normDy), 10 * dtSec);
          headGroup.rotation.x += Math.sign(pitch - (headGroup.rotation.x ?? 0))
            * Math.min(Math.abs(pitch - (headGroup.rotation.x ?? 0)), 8 * dtSec);
        }
      } else {
        // Return head to neutral
        const headGroup = parts.head.parent === mob.mesh ? parts.head : null;
        if (headGroup) {
          headGroup.rotation.y *= Math.pow(0.05, dtSec);
          headGroup.rotation.x *= Math.pow(0.05, dtSec);
        }
      }
    }
  }
}

/**
 * Update mob.travelDist each tick from how far the mob moved.
 * Called AFTER movement in the main loop so the walk phase is correct.
 *
 * @param {object} mob       - mob object with .pos
 * @param {THREE.Vector3} prevPos - position before movement
 * @param {number} dtSec     - for speed estimation
 */
export function updateMobTravel(mob, prevPos, dtSec) {
  const dx = mob.pos.x - prevPos.x;
  const dz = mob.pos.z - prevPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  mob.travelDist = (mob.travelDist ?? 0) + dist;
  mob._lastFrameSpeed = dtSec > 0 ? dist / dtSec : 0;
}

// ---------------------------------------------------------------------------
// Debug snapshot (scalar-only, safe for serialisation)
// ---------------------------------------------------------------------------

/**
 * Return a lightweight debug array; no Three.js objects included.
 * @param {object[]} hostileMobs
 * @param {object[]} passiveMobs
 * @returns {{ kind: string, type: string, mode: string, dying: boolean,
 *             animPhase: number, sampleLimbAngleRad: number,
 *             headYawRad: number }[]}
 */
export function getMobDebugSnapshot(hostileMobs, passiveMobs) {
  const result = [];
  for (const mob of hostileMobs) {
    const parts = mob.mesh?.userData?.parts ?? {};
    const sampleLimb = parts.legL ?? parts.legFrontL ?? parts.legBankL ?? null;
    result.push({
      kind: "hostile",
      type: mob.mobType ?? "unknown",
      mode: mob.mode ?? "wander",
      dying: mob.dying === true,
      animPhase: Number(((mob.travelDist ?? 0) * WALK_FREQ * Math.PI * 2 % (Math.PI * 2)).toFixed(4)),
      sampleLimbAngleRad: sampleLimb ? Number((sampleLimb.rotation.x ?? 0).toFixed(4)) : 0,
      headYawRad: parts.head ? Number((parts.head.rotation.y ?? 0).toFixed(4)) : 0,
    });
  }
  for (const mob of passiveMobs) {
    const parts = mob.mesh?.userData?.parts ?? {};
    const sampleLimb = parts.legL ?? parts.legFrontL ?? null;
    result.push({
      kind: "passive",
      type: mob.mobType ?? "unknown",
      mode: mob.mode ?? "wander",
      dying: mob.dying === true,
      animPhase: Number(((mob.travelDist ?? 0) * WALK_FREQ * Math.PI * 2 % (Math.PI * 2)).toFixed(4)),
      sampleLimbAngleRad: sampleLimb ? Number((sampleLimb.rotation.x ?? 0).toFixed(4)) : 0,
      headYawRad: parts.head ? Number((parts.head.rotation.y ?? 0).toFixed(4)) : 0,
    });
  }
  return result;
}
