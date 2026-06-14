/**
 * viewmodel.js — first-person held-item overlay
 *
 * Renders as a separate scene via renderer.render(overlayScene, overlayCam) AFTER
 * composer.render(), with autoClear=false + clearDepth() so the overlay draws on
 * top of the composed world frame and is never clipped by world geometry.
 *
 * Architecture:
 *  - overlayScene: contains only the held-item mesh (1-3 small meshes)
 *  - overlayCam: PerspectiveCamera (FOV 55, near 0.01, far 10) — fixed, not synced
 *    to the world camera orientation. The held mesh is positioned in view space
 *    (0,0,-1 region), so it always appears bottom-right regardless of where the
 *    player looks.
 *  - Mesh cache: rebuilt only when state.selectedSlot's itemId changes.
 *  - Animations: swing (quick punch) + bob (walk sine) driven by accumulated world
 *    time so window.advanceTime animates them deterministically.
 */

import * as THREE from "three";
import { BLOCK_FACE_TILES, tileUvRect, ATLAS_TILE_PX, getChipColor } from "./textures";
import { ITEM_DEFS } from "./survival";

// ── Constants ────────────────────────────────────────────────────────────────

// Overlay camera FOV — narrower than the world FOV so the held item looks "near"
const OVERLAY_FOV = 55;
const OVERLAY_NEAR = 0.01;
const OVERLAY_FAR = 10;

// Resting position of the held item in view space (right, down, forward = -Z)
// Positive X = right, negative Y = down, negative Z = into screen.
const REST_POS = new THREE.Vector3(0.28, -0.13, -0.52);
// Resting rotation (Euler YXZ) — tilted slightly so a block looks 3-D
const REST_ROT = new THREE.Euler(0.18, -0.55, 0.08, "YXZ");

// Swing animation (punch-down-and-back)
const SWING_DURATION = 0.25; // seconds
// Bob parameters — synced with main.js BOB_BASE_FREQUENCY
const BOB_FREQ = 9.5;
const BOB_V_AMP = 0.018; // vertical bob amplitude (subtler than camera bob)
const BOB_H_AMP = 0.009; // horizontal bob amplitude

// Idle sway
const IDLE_FREQ = 0.8;
const IDLE_AMP = 0.006;

// Easing: smooth in-out cubic
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── UV helpers ────────────────────────────────────────────────────────────────

/**
 * Build a BoxGeometry whose 6 faces are UV-mapped to specific atlas tiles.
 * faceNames = { px, nx, py, ny, pz, nz } — each value is an atlas tile name.
 */
function buildAtlasBoxGeometry(size, faceNames, atlasTexture) {
  // BoxGeometry interleaves faces as groups of 6 vertices (2 triangles each) in the
  // order: +X, -X, +Y, -Y, +Z, -Z. Each face occupies [faceIdx*6 .. faceIdx*6+5]
  // in the index buffer. We build a plain BoxGeometry then rewrite the UV attribute
  // per-face using the tile rects from the atlas.
  const geo = new THREE.BoxGeometry(size, size, size);

  const faceOrder = ["px", "nx", "py", "ny", "pz", "nz"];
  // BoxGeometry UV layout: each face has 4 UVs (corners).
  // Vertex order per face in the UV attribute: (0,1),(1,1),(0,0),(1,0) — top-left,
  // top-right, bottom-left, bottom-right in Three.js BoxGeometry default ordering.
  // We just remap all 4 corners to the atlas tile's rect.
  const uvAttr = geo.attributes.uv;
  const uvArray = uvAttr.array;

  faceOrder.forEach((faceKey, faceIdx) => {
    const tileName = faceNames[faceKey];
    if (!tileName) return;
    const rect = tileUvRect(tileName);
    // Each face has 4 UV pairs (8 floats). Vertex order in BoxGeometry:
    // 0: (uMax, vMax)  top-right
    // 1: (uMin, vMax)  top-left
    // 2: (uMax, vMin)  bottom-right
    // 3: (uMin, vMin)  bottom-left
    const base = faceIdx * 8; // 4 UV pairs per face
    // Top-right
    uvArray[base + 0] = rect.uMax; uvArray[base + 1] = rect.vMax;
    // Top-left
    uvArray[base + 2] = rect.uMin; uvArray[base + 3] = rect.vMax;
    // Bottom-right
    uvArray[base + 4] = rect.uMax; uvArray[base + 5] = rect.vMin;
    // Bottom-left
    uvArray[base + 6] = rect.uMin; uvArray[base + 7] = rect.vMin;
  });

  uvAttr.needsUpdate = true;
  return geo;
}

/**
 * Build a flat quad (PlaneGeometry) textured from one atlas tile, used for
 * tool/non-placeable item icons drawn at an angle.
 */
function buildAtlasTileQuad(tileName) {
  const geo = new THREE.PlaneGeometry(0.18, 0.18);
  const uvAttr = geo.attributes.uv;
  const uvArray = uvAttr.array;
  const rect = tileUvRect(tileName);
  // PlaneGeometry UV layout: (0,1),(1,1),(0,0),(1,0) — same as BoxGeometry face
  uvArray[0] = rect.uMin; uvArray[1] = rect.vMax;
  uvArray[2] = rect.uMax; uvArray[3] = rect.vMax;
  uvArray[4] = rect.uMin; uvArray[5] = rect.vMin;
  uvArray[6] = rect.uMax; uvArray[7] = rect.vMin;
  uvAttr.needsUpdate = true;
  return geo;
}

// ── Viewmodel class ───────────────────────────────────────────────────────────

export class Viewmodel {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.CanvasTexture} atlasTexture — the shared block atlas texture
   */
  constructor(renderer, atlasTexture) {
    this._renderer = renderer;
    this._atlas = atlasTexture;

    // Overlay scene + camera
    this._scene = new THREE.Scene();
    // Ambient light so the mesh isn't pitch black
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this._scene.add(ambient);
    const fill = new THREE.DirectionalLight(0xfff8e8, 0.5);
    fill.position.set(1, 2, 1);
    this._scene.add(fill);

    this._camera = new THREE.PerspectiveCamera(
      OVERLAY_FOV,
      window.innerWidth / window.innerHeight,
      OVERLAY_NEAR,
      OVERLAY_FAR,
    );
    this._camera.position.set(0, 0, 0);

    // The pivot group holds the held item mesh; we animate its position/rotation
    this._pivot = new THREE.Group();
    this._scene.add(this._pivot);

    // Cached item id to avoid rebuilding mesh every frame
    this._cachedItemId = undefined; // undefined = "nothing cached yet"
    this._currentMesh = null;

    // Swing state
    this._swingT = 1; // 1 = idle (animation finished), 0 = start of swing

    // Accumulated idle time for sway
    this._idleTime = 0;

    // Atlas material (shared across all built meshes)
    this._atlasMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: false,
    });
    this._atlasTransparentMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Call when the player breaks a block, places a block, or attacks a mob. */
  triggerSwing() {
    this._swingT = 0;
  }

  /**
   * Update animation state.
   * @param {number} dtSeconds — frame delta in seconds
   * @param {number} bobPhase — state.bobPhase from main.js (walk sine phase)
   * @param {number} bobAmplitude — state.bobAmplitude (0 = idle, 1 = walking)
   * @param {string|null} itemId — currently held item id, or null for empty hand
   * @param {number|null} placeBlockType — ITEM_DEFS[itemId].placeBlockType or null
   */
  update(dtSeconds, bobPhase, bobAmplitude, itemId, placeBlockType) {
    // Rebuild mesh when item changes
    if (itemId !== this._cachedItemId) {
      this._rebuildMesh(itemId, placeBlockType);
      this._cachedItemId = itemId;
    }

    // Advance swing animation
    if (this._swingT < 1) {
      this._swingT = Math.min(1, this._swingT + dtSeconds / SWING_DURATION);
    }

    // Idle sway accumulator
    this._idleTime += dtSeconds;

    // Compose final transform
    this._applyTransform(bobPhase, bobAmplitude);
  }

  /**
   * Render the overlay on top of the already-composed world frame.
   * Must be called AFTER composer.render().
   */
  render() {
    const renderer = this._renderer;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this._scene, this._camera);
    renderer.autoClear = prevAutoClear;
  }

  /** Call on window resize. */
  resize(width, height) {
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _clearMesh() {
    if (this._currentMesh) {
      this._pivot.remove(this._currentMesh);

      // Dispose owned material+texture before nulling (avoids per-switch GPU leak).
      // Shared atlas materials are guarded by _ownsMaterial=false (not set) so they
      // are never disposed here.
      const disposeOwned = (obj) => {
        if (obj?.userData?._ownsMaterial) {
          obj.userData._mat?.dispose?.();
          obj.userData._tex?.dispose?.();
        }
      };
      disposeOwned(this._currentMesh);
      if (this._currentMesh.isGroup) this._currentMesh.traverse(disposeOwned);

      // Dispose geometry but not the shared material
      if (this._currentMesh.geometry) this._currentMesh.geometry.dispose();
      // For groups, dispose each child geometry
      if (this._currentMesh.isGroup) {
        this._currentMesh.traverse((child) => {
          if (child.isMesh && child.geometry) child.geometry.dispose();
        });
      }
      this._currentMesh = null;
    }
  }

  _rebuildMesh(itemId, placeBlockType) {
    this._clearMesh();

    if (itemId == null) {
      // Empty hand — simple skin-toned arm box
      this._currentMesh = this._buildArmMesh();
    } else if (placeBlockType != null && BLOCK_FACE_TILES[placeBlockType]) {
      // Placeable block — small textured cube from atlas
      this._currentMesh = this._buildBlockMesh(placeBlockType);
    } else {
      // Tool or resource item — flat angled quad
      this._currentMesh = this._buildItemQuad(itemId);
    }

    if (this._currentMesh) {
      this._pivot.add(this._currentMesh);
    }
  }

  _buildBlockMesh(blockTypeId) {
    const faceNames = BLOCK_FACE_TILES[blockTypeId];
    const geo = buildAtlasBoxGeometry(0.2, faceNames, this._atlas);
    const mesh = new THREE.Mesh(geo, this._atlasMaterial);
    // Tilt the block so it looks like you're holding it — Minecraft-style
    mesh.rotation.set(0.3, 0.8, 0.1);
    return mesh;
  }

  _buildItemQuad(itemId) {
    // Find the best tile to represent this item — use its icon tile if it has one
    // For tools/resources without a block tile we draw the chip color as a canvas
    // texture, but here we try to find any atlas tile that makes sense.
    // Most non-placeable items don't have an atlas tile, so we fall back to a
    // colored quad using a small canvas texture.

    // Check if there's a tool-ish item that has a related block tile (e.g. ore items)
    const def = ITEM_DEFS[itemId];
    if (def?.placeBlockType && BLOCK_FACE_TILES[def.placeBlockType]) {
      // Has a placed form — use the atlas quad
      const tileName = BLOCK_FACE_TILES[def.placeBlockType].py ||
                       BLOCK_FACE_TILES[def.placeBlockType].pz ||
                       BLOCK_FACE_TILES[def.placeBlockType].px;
      if (tileName) {
        const geo = buildAtlasTileQuad(tileName);
        const mesh = new THREE.Mesh(geo, this._atlasTransparentMaterial);
        mesh.rotation.set(0, 0.4, -0.35);
        return mesh;
      }
    }

    // Colored canvas quad (tool/resource)
    const colorHex = this._getChipColor(itemId);
    const canvas = document.createElement("canvas");
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext("2d");
    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = colorHex;
    ctx.fillRect(1, 1, 14, 14);
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.fillRect(1, 1, 14, 2);
    ctx.fillRect(1, 1, 2, 14);
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.36)";
    ctx.fillRect(1, 13, 14, 2);
    ctx.fillRect(13, 1, 2, 14);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(0.18, 0.18);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(0, 0.4, -0.35);

    // Store mat reference for disposal
    mesh.userData._ownsMaterial = true;
    mesh.userData._mat = mat;
    mesh.userData._tex = tex;

    return mesh;
  }

  _buildArmMesh() {
    // Simple skin-toned rectangular arm/hand box
    const geo = new THREE.BoxGeometry(0.08, 0.22, 0.08);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf5c89a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData._ownsMaterial = true;
    mesh.userData._mat = mat;
    return mesh;
  }

  _getChipColor(itemId) {
    // Delegates to textures.js — single source of truth, no circular import since
    // textures.js does not import from viewmodel.js.
    return getChipColor(itemId);
  }

  _applyTransform(bobPhase, bobAmplitude) {
    // --- Swing animation ---
    // Swing arc: punch down (offY +, offZ -) then back.
    // Phase 0→0.5 = punch down/forward; 0.5→1 = return.
    const swingNorm = this._swingT; // 0=start, 1=idle
    let swingOffY = 0;
    let swingOffZ = 0;
    let swingRotX = 0;
    if (swingNorm < 1) {
      const t = swingNorm < 0.5
        ? easeInOutCubic(swingNorm * 2)
        : easeInOutCubic((1 - swingNorm) * 2);
      swingOffY = -0.12 * t;         // punch downward (negative = lower in view)
      swingOffZ = -0.08 * t;         // punch forward
      swingRotX = 0.9 * t;           // tilt forward
    }

    // --- Walk bob ---
    const vBob = Math.sin(bobPhase * 2) * BOB_V_AMP * bobAmplitude;
    const hBob = Math.sin(bobPhase) * BOB_H_AMP * bobAmplitude;

    // --- Idle sway (when not walking) ---
    const idleAmt = 1 - Math.min(1, bobAmplitude * 4);
    const idleSway = Math.sin(this._idleTime * IDLE_FREQ) * IDLE_AMP * idleAmt;

    // Combine
    this._pivot.position.set(
      REST_POS.x + hBob + idleSway,
      REST_POS.y - vBob + swingOffY,
      REST_POS.z + swingOffZ,
    );
    this._pivot.rotation.set(
      REST_ROT.x + swingRotX,
      REST_ROT.y,
      REST_ROT.z,
      "YXZ",
    );
  }
}
