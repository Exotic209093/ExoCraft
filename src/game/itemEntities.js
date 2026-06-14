/**
 * itemEntities.js — Wave F1: Minecraft-style dropped item entities.
 *
 * Manages a pool of item-drop entities that:
 *  - fall under gravity and settle on solid ground
 *  - bob and spin as pure functions of worldTimeMs (deterministic)
 *  - fly toward the player magnetically when close
 *  - merge with nearby same-type entities
 *  - despawn after 300 s or when > 200 entities (oldest first)
 *
 * Public API:
 *   spawnItemEntity(itemId, count, x, y, z, opts?)
 *   tossItemEntity(itemId, count, fromPos, facingDir)
 *   update(dtSeconds, playerPos, world, worldTimeMs) → [{itemId, count}]
 *   serialize() → plain-object array
 *   restore(data) — replace entity list from saved array
 *   clear()
 *   getState() → { count, entries }
 *   .group — THREE.Group to add to the scene
 */

import * as THREE from "three";
import { ITEM_DEFS } from "./survival.js";
import { getItemIconCanvas, BLOCK_FACE_TILES, tileUvRect } from "./textures.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GRAVITY          = 14.0;      // blocks / s²
const PICKUP_DELAY_S   = 0.5;       // seconds after spawn before pickup allowed
const MAGNET_RADIUS    = 1.6;       // blocks — start accelerating
const COLLECT_RADIUS   = 0.6;       // blocks — remove and award
const MERGE_RADIUS     = 0.8;       // blocks — merge counts between ground entities
const DESPAWN_S        = 300;       // seconds of world time
const MAX_ENTITIES     = 200;

const BOB_AMPLITUDE    = 0.12;      // blocks up/down
const BOB_PERIOD_S     = 1.4;       // seconds per full bob cycle
const SPIN_PERIOD_S    = 3.0;       // seconds per full Y rotation

const ENTITY_SIZE      = 0.25;      // visual cube / sprite half-size relative

// Passable block ids — entities fall through these (same as physics.js PASSABLE_BLOCKS + 0).
const PASSABLE = new Set([0, 15, 21, 23, 24, 25]);

function isPassable(blockType) {
  return blockType === 0 || PASSABLE.has(blockType);
}

// ---------------------------------------------------------------------------
// Deterministic spawn-id seeded scatter (NEVER uses Math.random in entity sim)
// ---------------------------------------------------------------------------
let _spawnCounter = 0;

function seededFloat(seed) {
  // Low-quality but cheap: fract(sin(seed) * large-prime)
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function popVelocity(seed) {
  const angle = seededFloat(seed) * Math.PI * 2;
  const hSpeed = 0.8 + seededFloat(seed + 1) * 1.2; // 0.8–2.0 blocks/s lateral
  return {
    vx: Math.cos(angle) * hSpeed,
    vy: 3.0 + seededFloat(seed + 2) * 2.0,           // 3–5 blocks/s upward
    vz: Math.sin(angle) * hSpeed,
  };
}

// ---------------------------------------------------------------------------
// Visual builders
// ---------------------------------------------------------------------------

/**
 * Build a small textured cube for block items using the block atlas UVs.
 * Returns a THREE.Mesh.
 */
function buildBlockMesh(blockType) {
  const geo = new THREE.BoxGeometry(ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE);
  const faces = BLOCK_FACE_TILES[blockType];
  if (!faces) {
    // Fallback: flat colour
    const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    return new THREE.Mesh(geo, mat);
  }

  // BoxGeometry UVs: face order is +X, -X, +Y, -Y, +Z, -Z (6 groups).
  // We need to remap each group's UVs to the atlas rect.
  const faceKeys = ["px", "nx", "py", "ny", "pz", "nz"];

  // Build a single atlas texture (CanvasTexture shared reference would be ideal
  // but we create a small CanvasTexture here from the item icon for simplicity).
  // For block cubes we sample 6 different tiles from the atlas via UV offsets.
  // We use a single material array (one per face) to set UVs independently.
  const uvAttr = geo.attributes.uv;

  // BoxGeometry has 24 vertices (4 per face × 6 faces), laid out sequentially.
  faceKeys.forEach((key, faceIdx) => {
    const tileName = faces[key] || faces.px;
    const { uMin, uMax, vMin, vMax } = tileUvRect(tileName);
    // Each face occupies 4 UV pairs starting at faceIdx * 4.
    const base = faceIdx * 4;
    // Standard BoxGeometry UV quad order: (uMax,vMax), (uMin,vMax), (uMax,vMin), (uMin,vMin)
    uvAttr.setXY(base + 0, uMax, vMax);
    uvAttr.setXY(base + 1, uMin, vMax);
    uvAttr.setXY(base + 2, uMax, vMin);
    uvAttr.setXY(base + 3, uMin, vMin);
  });
  uvAttr.needsUpdate = true;

  // We need the atlas texture. Build it lazily from a shared hidden canvas.
  if (!buildBlockMesh._atlasTex) {
    buildBlockMesh._atlasTex = null; // will be set externally via setAtlasTexture()
  }
  const mat = new THREE.MeshLambertMaterial({
    map: buildBlockMesh._atlasTex,
    color: 0xffffff,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Build a billboarded sprite from getItemIconCanvas().
 * Returns a THREE.Mesh (PlaneGeometry) — caller must update .rotation each frame.
 */
function buildSpriteMesh(itemId, placeBlockType) {
  const canvas = getItemIconCanvas(itemId, placeBlockType ?? null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(ENTITY_SIZE, ENTITY_SIZE);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// ItemEntityManager
// ---------------------------------------------------------------------------
export class ItemEntityManager {
  constructor() {
    this.group   = new THREE.Group();
    this.group.name = "itemEntities";
    /** @type {Array<ItemEntity>} */
    this._entities = [];
    this._atlasTex = null; // set via setAtlasTexture() before first block spawn
  }

  /**
   * Must be called once by main.js after the atlas texture is created,
   * so block-item cubes can be textured.
   */
  setAtlasTexture(tex) {
    this._atlasTex = tex;
    buildBlockMesh._atlasTex = tex;
  }

  // -------------------------------------------------------------------------
  // Spawn helpers
  // -------------------------------------------------------------------------

  /**
   * Spawn an item entity at world position (x, y, z).
   * opts.vx/vy/vz override the pop velocity (e.g. for toss).
   * opts.pickupDelayS overrides the pickup delay (useful for toss to avoid
   * immediate re-pickup).
   */
  spawnItemEntity(itemId, count, x, y, z, opts = {}) {
    if (typeof itemId !== "string" || !ITEM_DEFS[itemId]) return null;
    const c = Math.max(1, Math.floor(count));

    const seed = ++_spawnCounter;
    const defaultPop = popVelocity(seed);

    const def   = ITEM_DEFS[itemId];
    const blockType = (def && def.placeBlockType != null) ? def.placeBlockType : null;
    const isBlock   = blockType !== null && BLOCK_FACE_TILES[blockType] != null;

    const mesh = isBlock
      ? buildBlockMesh(blockType)
      : buildSpriteMesh(itemId, blockType);
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
    mesh.userData.isItemEntity = true;

    this.group.add(mesh);

    const entity = {
      id:           seed,
      itemId,
      count:        c,
      pos:          new THREE.Vector3(x, y, z),
      vel:          new THREE.Vector3(
        opts.vx ?? defaultPop.vx,
        opts.vy ?? defaultPop.vy,
        opts.vz ?? defaultPop.vz,
      ),
      ageS:         0,
      pickupDelayS: opts.pickupDelayS ?? PICKUP_DELAY_S,
      onGround:     false,
      isBlock,
      blockType,
      mesh,
    };

    this._entities.push(entity);
    this._enforceCap();
    return entity;
  }

  /**
   * Toss 1 of itemId from fromPos in the camera facing direction.
   */
  tossItemEntity(itemId, count, fromPos, facingDir) {
    const speed = 7.0;
    return this.spawnItemEntity(
      itemId, count,
      fromPos.x, fromPos.y, fromPos.z,
      {
        vx: facingDir.x * speed,
        vy: facingDir.y * speed + 1.0, // slight upward bias
        vz: facingDir.z * speed,
        pickupDelayS: 0.8, // slightly longer so it doesn't boomerang instantly
      },
    );
  }

  // -------------------------------------------------------------------------
  // Per-tick update — called by main.js updateSimulation
  // -------------------------------------------------------------------------

  /**
   * Step all entities; return array of {itemId, count} pickups the player earns.
   * main.js is responsible for calling addItemToInventory on each entry
   * and, if inventory is full, spawning a leftover entity back.
   */
  update(dtSeconds, playerPos, world, worldTimeMs) {
    if (dtSeconds <= 0 || this._entities.length === 0) return [];
    const pickups = [];
    const toRemove = [];

    // Phase 1 — physics + pickup detection
    for (const e of this._entities) {
      e.ageS += dtSeconds;

      // Despawn check
      if (e.ageS >= DESPAWN_S) {
        toRemove.push(e);
        continue;
      }

      const { pos, vel } = e;

      // ---- Gravity ----
      if (!e.onGround) {
        vel.y -= GRAVITY * dtSeconds;
      }

      // ---- Magnetic attraction ----
      const dx = playerPos.x - pos.x;
      const dy = playerPos.y - pos.y;
      const dz = playerPos.z - pos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (e.ageS >= e.pickupDelayS) {
        if (distSq <= COLLECT_RADIUS * COLLECT_RADIUS) {
          pickups.push({ itemId: e.itemId, count: e.count });
          toRemove.push(e);
          continue;
        }
        if (distSq <= MAGNET_RADIUS * MAGNET_RADIUS) {
          const dist = Math.sqrt(distSq) + 0.001;
          const accel = 14.0 / (dist + 0.5); // stronger when closer
          vel.x += (dx / dist) * accel * dtSeconds;
          vel.y += (dy / dist) * accel * dtSeconds;
          vel.z += (dz / dist) * accel * dtSeconds;
        }
      }

      // ---- Integrate position ----
      // Clamp velocity to avoid tunnelling
      const maxSpeed = 20;
      const speedSq = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
      if (speedSq > maxSpeed * maxSpeed) {
        const s = maxSpeed / Math.sqrt(speedSq);
        vel.x *= s; vel.y *= s; vel.z *= s;
      }

      const nx = pos.x + vel.x * dtSeconds;
      const ny = pos.y + vel.y * dtSeconds;
      const nz = pos.z + vel.z * dtSeconds;

      // ---- Ground collision (Y axis only — cheap and sufficient) ----
      const bx = Math.floor(nx);
      const bz = Math.floor(nz);

      // The block at (bx, floor(ny), bz) — are we inside a solid?
      const floorY = Math.floor(ny);
      const blockBelow = world.get(bx, floorY, bz);
      const blockAbove = world.get(bx, floorY + 1, bz);

      if (!isPassable(blockBelow) && ny < floorY + 1) {
        // Settled on top of a solid block
        pos.y = floorY + 1.0;
        vel.y = 0;
        vel.x *= 0.55; // friction
        vel.z *= 0.55;
        e.onGround = Math.abs(vel.x) < 0.05 && Math.abs(vel.z) < 0.05;
        if (e.onGround) { vel.x = 0; vel.z = 0; }
      } else if (!isPassable(blockAbove) && ny > floorY + 1) {
        // Hit a ceiling
        pos.y = floorY + 1.0 - 0.001;
        vel.y = 0;
      } else {
        pos.y = ny;
        e.onGround = false;
      }

      // Horizontal — allow movement but stop on solid block edge
      const bxNew = Math.floor(nx);
      const bzNew = Math.floor(nz);
      const blockAtX = world.get(bxNew, Math.floor(pos.y), bz);
      if (isPassable(blockAtX)) {
        pos.x = nx;
      } else {
        vel.x = 0;
      }
      const blockAtZ = world.get(bxNew, Math.floor(pos.y), bzNew);
      if (isPassable(blockAtZ)) {
        pos.z = nz;
      } else {
        vel.z = 0;
      }

      // ---- Bob + spin (pure functions of worldTimeMs) ----
      const t = worldTimeMs / 1000; // to seconds, still deterministic
      const baseY = pos.y;
      const bob = Math.sin((t + e.id * 0.37) / BOB_PERIOD_S * Math.PI * 2) * BOB_AMPLITUDE;
      const spinY = ((t + e.id * 0.61) / SPIN_PERIOD_S) * Math.PI * 2;

      e.mesh.position.set(pos.x, baseY + bob + ENTITY_SIZE * 0.5, pos.z);

      if (e.isBlock) {
        e.mesh.rotation.set(0.4, spinY, 0.2);
      } else {
        // Billboard: face the world +Y axis, spin in Y
        e.mesh.rotation.set(0, spinY, 0);
      }
    }

    // Phase 2 — merge nearby same-item ground entities
    // O(n²) is fine — typically < 50 entities; cap is 200
    const removeSet0 = new Set(toRemove);
    const active = this._entities.filter((e) => !removeSet0.has(e));
    // Track which entities have already been absorbed so chained merges (A→B→C)
    // accumulate into a single survivor instead of losing counts.
    const mergedAway = new Set();
    for (let i = 0; i < active.length; i += 1) {
      const a = active[i];
      if (mergedAway.has(a) || !a.onGround) continue;
      for (let j = i + 1; j < active.length; j += 1) {
        const b = active[j];
        if (mergedAway.has(b) || !b.onGround || b.itemId !== a.itemId) continue;
        const ddx = a.pos.x - b.pos.x;
        const ddz = a.pos.z - b.pos.z;
        if (ddx * ddx + ddz * ddz <= MERGE_RADIUS * MERGE_RADIUS) {
          a.count += b.count;
          mergedAway.add(b);
          toRemove.push(b);
        }
      }
    }

    // Phase 3 — remove dead entities
    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove);
      for (const e of removeSet) {
        this.group.remove(e.mesh);
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material) {
          const mats = Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material];
          for (const m of mats) {
            // Never dispose the shared block atlas — only sprite entities own their map.
            if (m.map && !e.isBlock) m.map.dispose();
            m.dispose();
          }
        }
      }
      this._entities = this._entities.filter((e) => !removeSet.has(e));
    }

    return pickups;
  }

  // -------------------------------------------------------------------------
  // Entity cap
  // -------------------------------------------------------------------------
  _enforceCap() {
    if (this._entities.length <= MAX_ENTITIES) return;
    // Despawn oldest first (they're appended, so slice from front)
    const excess = this._entities.splice(0, this._entities.length - MAX_ENTITIES);
    for (const e of excess) {
      this.group.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      if (e.mesh.material) {
        const mats = Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material];
        for (const m of mats) {
          // Never dispose the shared block atlas — only sprite entities own their map.
          if (m.map && !e.isBlock) m.map.dispose();
          m.dispose();
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Serialize / restore / clear
  // -------------------------------------------------------------------------

  serialize() {
    return this._entities.map((e) => ({
      itemId: e.itemId,
      count:  e.count,
      x:      e.pos.x,
      y:      e.pos.y,
      z:      e.pos.z,
      vx:     e.vel.x,
      vy:     e.vel.y,
      vz:     e.vel.z,
      ageS:   e.ageS,
      pickupDelayS: e.pickupDelayS,
    }));
  }

  restore(data) {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const raw of data) {
      if (!raw || typeof raw.itemId !== "string") continue;
      const remaining = DESPAWN_S - (raw.ageS ?? 0);
      if (remaining <= 0) continue; // already despawned
      const e = this.spawnItemEntity(
        raw.itemId, raw.count,
        raw.x ?? 0, raw.y ?? 0, raw.z ?? 0,
        { vx: raw.vx ?? 0, vy: raw.vy ?? 0, vz: raw.vz ?? 0 },
      );
      if (e) {
        e.ageS = raw.ageS ?? 0;
        e.pickupDelayS = raw.pickupDelayS ?? PICKUP_DELAY_S;
      }
    }
  }

  clear() {
    for (const e of this._entities) {
      this.group.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      if (e.mesh.material) {
        const mats = Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material];
        for (const m of mats) {
          // Never dispose the shared block atlas — only sprite entities own their map.
          if (m.map && !e.isBlock) m.map.dispose();
          m.dispose();
        }
      }
    }
    this._entities = [];
  }

  // -------------------------------------------------------------------------
  // Debug / hooks
  // -------------------------------------------------------------------------

  getState() {
    return {
      count:   this._entities.length,
      entries: this._entities.slice(0, 20).map((e) => ({
        itemId: e.itemId,
        count:  e.count,
        x:      Number(e.pos.x.toFixed(3)),
        y:      Number(e.pos.y.toFixed(3)),
        z:      Number(e.pos.z.toFixed(3)),
        ageMs:  Math.floor(e.ageS * 1000),
      })),
    };
  }
}
