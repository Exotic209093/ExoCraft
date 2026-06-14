/**
 * Sky controller — gradient skydome + star field + drifting cloud layer.
 *
 * API:
 *   const sky = new Sky(scene, THREE);
 *   sky.update(dayFactor, worldTimeMs, cameraPosition, eyeInWater);
 *
 * - dayFactor: 0 = full night, 1 = full day (same value used by updateDayNight)
 * - worldTimeMs: accumulated simulation time (drives cloud drift, never a wall clock)
 * - cameraPosition: THREE.Vector3 — dome, stars, clouds follow the camera each frame
 * - eyeInWater: boolean — hides dome/stars/clouds so wave-5 underwater fog reads correctly
 */

import * as THREE from "three";

// ── Palette ─────────────────────────────────────────────────────────────────
// Day: bright-blue zenith, pale-sky horizon
const DAY_ZENITH   = new THREE.Color(0x1a80e8);
const DAY_HORIZON  = new THREE.Color(0xb6d8ff);
// Night: deep-navy zenith, slightly lighter horizon
const NIGHT_ZENITH  = new THREE.Color(0x060d1a);
const NIGHT_HORIZON = new THREE.Color(0x10182a);
// F8: Golden hour (sunrise/sunset) — richer than the old dusk tint.
// Zenith goes deep violet-indigo; horizon blazes with orange-pink.
const GOLDEN_ZENITH  = new THREE.Color(0x1a1040); // deep violet
const GOLDEN_HORIZON = new THREE.Color(0xff6a1a); // saturated orange
// Secondary horizon band: rose-pink blended above the orange line.
const GOLDEN_MID     = new THREE.Color(0xd43e6a); // warm rose

// ── Constants ────────────────────────────────────────────────────────────────
const DOME_RADIUS      = 240;   // large enough to cover far=300 frustum
const STAR_COUNT       = 2800;
const STAR_SPHERE_R    = 220;
const CLOUD_Y          = 90;    // world-space height (well above tallest peak ~Y112)
const CLOUD_DRIFT_MS   = 120000; // ms to cross one tile width (slow)

export class Sky {
  constructor(scene) {
    this._scene = scene;

    this._dome   = this._buildDome();
    this._stars  = this._buildStars();
    this._clouds = this._buildClouds();

    scene.add(this._dome);
    scene.add(this._stars);
    scene.add(this._clouds);
  }

  // ── Public update ──────────────────────────────────────────────────────────
  update(dayFactor, worldTimeMs, cameraPos, eyeInWater) {
    const hidden = eyeInWater;

    this._dome.visible   = !hidden;
    this._stars.visible  = !hidden;
    this._clouds.visible = !hidden;

    if (hidden) return;

    // Center everything on the camera so the player can never reach the edge.
    this._dome.position.copy(cameraPos);
    this._stars.position.copy(cameraPos);

    // Clouds drift on X only; Y is fixed at CLOUD_Y (absolute world height).
    const driftX = ((worldTimeMs / CLOUD_DRIFT_MS) % 1) * 512;
    this._clouds.position.set(cameraPos.x + driftX, CLOUD_Y, cameraPos.z);

    this._updateDomeColors(dayFactor);
    this._updateStarOpacity(dayFactor);
    this._updateCloudTint(dayFactor);
  }

  // ── Skydome ───────────────────────────────────────────────────────────────
  _buildDome() {
    const geo = new THREE.SphereGeometry(DOME_RADIUS, 32, 16);

    const mat = new THREE.ShaderMaterial({
      side:         THREE.BackSide,
      depthWrite:   false,
      fog:          false,
      uniforms: {
        uZenith:  { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */`
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying float vY;
        void main() {
          // vY runs -1 (nadir) to +1 (zenith).
          // Map 0..1 across the upper hemisphere; below horizon stays at horizon color.
          float t = clamp(vY, 0.0, 1.0);
          t = t * t * (3.0 - 2.0 * t); // smoothstep
          gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -2;
    return mesh;
  }

  _updateDomeColors(dayFactor) {
    // F8: Golden-hour bell — narrow peak at the day/night transitions.
    // Centers at ~0.32 (sunset) and ~0.68 (sunrise), width ~0.09 so the warm
    // color flares briefly rather than lingering across half the cycle.
    const golden = Math.max(
      _goldenBell(dayFactor, 0.32), // sunset
      _goldenBell(dayFactor, 0.68), // sunrise
    );

    const u = this._dome.material.uniforms;

    // Zenith: night→day base, with violet-indigo overlay during golden hour.
    u.uZenith.value
      .copy(NIGHT_ZENITH).lerp(DAY_ZENITH, dayFactor)
      .lerp(GOLDEN_ZENITH, golden * 0.60);

    // Horizon: night→day base, then blazing orange-to-rose blend during golden hour.
    // We first lerp to orange, then nudge toward rose to add a two-tone warmth.
    u.uHorizon.value
      .copy(NIGHT_HORIZON).lerp(DAY_HORIZON, dayFactor)
      .lerp(GOLDEN_HORIZON, golden * 0.92)
      .lerp(GOLDEN_MID,     golden * 0.28);
  }

  // ── Stars ─────────────────────────────────────────────────────────────────
  _buildStars() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const rng = _seededRng(0xc0ffee);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform distribution on sphere surface via rejection sampling
      let x, y, z, len;
      do {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        z = rng() * 2 - 1;
        len = Math.sqrt(x * x + y * y + z * z);
      } while (len < 0.001 || len > 1.0);
      const s = STAR_SPHERE_R / len;
      positions[i * 3]     = x * s;
      positions[i * 3 + 1] = y * s;
      positions[i * 3 + 2] = z * s;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xffffff,
      size:        0.55,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      fog:         false,
      blending:    THREE.AdditiveBlending,
    });

    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -1;
    return pts;
  }

  _updateStarOpacity(dayFactor) {
    // Stars fully visible at night (dayFactor=0), invisible by day (dayFactor=1).
    // F8: Tighten fade window to match golden-hour transition.
    // Stars appear as dayFactor drops below ~0.55 and vanish as it rises above ~0.45.
    const nightness = 1 - dayFactor;
    const t = _smoothstep(0.35, 0.55, nightness);
    this._stars.material.opacity = t;
  }

  // ── Clouds ────────────────────────────────────────────────────────────────
  _buildClouds() {
    // A large horizontal plane with a procedural cloud texture (white blobs on
    // transparent). One plane is enough for the effect; position is offset each
    // frame so it drifts without discontinuity via modulo.
    const tex = _makeCloudTexture();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);

    const geo = new THREE.PlaneGeometry(512, 512);
    const mat = new THREE.MeshBasicMaterial({
      map:         tex,
      transparent: true,
      opacity:     0.82,
      depthWrite:  false,
      fog:         false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    // PlaneGeometry is in XY; rotate to lie flat in XZ.
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = -1;
    return mesh;
  }

  _updateCloudTint(dayFactor) {
    // Slightly blue-grey at night, bright white by day.
    const night = 0.6;
    const day   = 1.0;
    const v = night + (day - night) * dayFactor;
    this._clouds.material.color.setRGB(v, v, v);
    // Also drop cloud opacity a bit at night for realism.
    this._clouds.material.opacity = 0.55 + 0.27 * dayFactor;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Bell curve peaking at `center`, width ~0.15 either side. */
function _duskBell(x, center) {
  const d = (x - center) / 0.12;
  return Math.exp(-d * d * 0.5);
}

/** Narrower bell for golden-hour glow — peaks sharply at the horizon crossing.
 *  Width ~0.09 either side so the warm color flares briefly, not lazily. */
function _goldenBell(x, center) {
  const d = (x - center) / 0.08;
  return Math.exp(-d * d * 0.5);
}

/** Minimal seeded PRNG (mulberry32) — deterministic star placement. */
function _seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Procedural cloud texture: 512×512 canvas of soft white blobs.
 * Built once, never rebuilt.
 */
function _makeCloudTexture() {
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, SIZE, SIZE);

  const rng = _seededRng(0xbeef1234);

  // Layer many soft radial blobs to form cloud puffs.
  const BLOB_COUNT = 60;
  for (let i = 0; i < BLOB_COUNT; i++) {
    const cx = rng() * SIZE;
    const cy = rng() * SIZE;
    const r  = 40 + rng() * 90;
    const a  = 0.18 + rng() * 0.28;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   `rgba(255,255,255,${a.toFixed(2)})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${(a * 0.5).toFixed(2)})`);
    grad.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  return new THREE.CanvasTexture(canvas);
}
