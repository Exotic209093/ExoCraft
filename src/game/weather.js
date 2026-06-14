/**
 * weather.js — Graphics-B weather system for ExoCraft.
 *
 * A cheap camera-following GPU particle system (THREE.Points) that renders
 * rain or snow around the player.  Biome-driven: rain in temperate biomes
 * (plains, forest), snow in cold biomes (snow, mountains), none in desert.
 * Includes a gradual scene darkening via fog tint while active, optional
 * audio ambience, and a debug toggle.
 *
 * Determinism: all animation is driven by the exported worldTimeUniform
 * (accumulated from tick deltas) — never wall-clock Date.now() or Math.random()
 * in hot paths.  Per-particle variation uses index hashing.
 *
 * Public API:
 *   new WeatherSystem(scene, camera, world, fogRef, biomeAtFn)
 *   system.update(dtSeconds, worldTimeSec, playerPos, biome)
 *   system.setWeather(type)   — "rain" | "snow" | "none"  (debug override)
 *   system.getState()         — { type, active, particles }
 *   system.dispose()
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RAIN_COUNT   = 1500;  // points recycled around the camera
const SNOW_COUNT   = 800;
const RAIN_SPREAD  = 18;    // half-width of spawn box around camera (XZ)
const SNOW_SPREAD  = 20;
const RAIN_HEIGHT  = 10;    // height range above camera
const SNOW_HEIGHT  = 12;
const RAIN_SPEED   = 18.0;  // blocks/sec downward
const SNOW_SPEED   = 1.8;

// Biome name → weather type
const BIOME_WEATHER = {
  plains:    "rain",
  forest:    "rain",
  desert:    "none",
  snow:      "snow",
  mountains: "snow",
};

// Fog darkening when weather is active (lerped over time)
const WEATHER_FOG_DARKEN = 0.60;  // multiply fog colour by this
const WEATHER_FADE_RATE   = 0.8;  // per second

// ---------------------------------------------------------------------------
// Simple seeded hash — deterministic per-particle variation
// ---------------------------------------------------------------------------
function hash(i) {
  let n = i * 127.1 + 311.7;
  n = Math.sin(n) * 43758.5453123;
  return n - Math.floor(n);
}

// ---------------------------------------------------------------------------
// WeatherSystem
// ---------------------------------------------------------------------------
export class WeatherSystem {
  /**
   * @param {THREE.Scene}    scene
   * @param {THREE.Camera}   camera
   * @param {THREE.Fog}      fog       — scene.fog reference for tint darkening
   */
  constructor(scene, camera, fog) {
    this._scene   = scene;
    this._camera  = camera;
    this._fog     = fog;

    this._overrideType = null;   // null = biome-driven; else forced type string
    this._activeType   = "none"; // current rendered type
    this._fogBlend     = 0;      // 0..1 active weather intensity (for fog lerp)

    // Store the base fog colour so we can lerp back to it
    this._baseFogColor = fog ? fog.color.clone() : null;
    // Scratch Color reused each tick to avoid per-frame heap allocation
    this._fogScratch   = fog ? new THREE.Color() : null;

    this._rainMesh = null;
    this._snowMesh = null;

    // Initialise both particle meshes (both hidden by default)
    this._rainMesh = this._buildRainMesh();
    this._snowMesh = this._buildSnowMesh();
    scene.add(this._rainMesh);
    scene.add(this._snowMesh);
  }

  // -------------------------------------------------------------------------
  // Geometry builders
  // -------------------------------------------------------------------------
  _buildRainMesh() {
    const positions = new Float32Array(RAIN_COUNT * 3);
    // Spread particles randomly in the spawn box using per-index hash
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      positions[i * 3    ] = (hash(i * 3)     - 0.5) * RAIN_SPREAD * 2;
      positions[i * 3 + 1] = (hash(i * 3 + 1))       * RAIN_HEIGHT;
      positions[i * 3 + 2] = (hash(i * 3 + 2) - 0.5) * RAIN_SPREAD * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Rain streaks: simple elongated Points rendered as small lines via size +
    // a custom shader that draws thin vertical streaks.
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpread: { value: RAIN_SPREAD }, uHeight: { value: RAIN_HEIGHT } },
      vertexShader: `
        uniform float uTime;
        uniform float uSpread;
        uniform float uHeight;
        void main() {
          vec3 pos = position;
          // Larger point size so the streak shape is visible (was 1.8 — sub-pixel, invisible)
          gl_PointSize = 5.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          // Vertical streak: thin on X axis (narrow column), full along Y axis.
          // gl_PointCoord: (0,0) top-left, (1,1) bottom-right.
          // Thin horizontally: fade out toward left/right edges.
          // Keep mostly opaque top-to-bottom so the sprite reads as a short vertical line.
          float dx = gl_PointCoord.x - 0.5;
          float thinness = 1.0 - smoothstep(0.0, 0.5, abs(dx) * 5.5);
          // Slight vertical fade at the tips so endpoints blend softly
          float dy = abs(gl_PointCoord.y - 0.5) * 2.0; // 0 at centre, 1 at top/bottom
          float tipFade = 1.0 - smoothstep(0.6, 1.0, dy);
          float alpha = thinness * tipFade * 0.55;
          gl_FragColor = vec4(0.72, 0.80, 0.92, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.visible  = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return mesh;
  }

  _buildSnowMesh() {
    const positions = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      positions[i * 3    ] = (hash(i * 7)     - 0.5) * SNOW_SPREAD * 2;
      positions[i * 3 + 1] = (hash(i * 7 + 1))       * SNOW_HEIGHT;
      positions[i * 3 + 2] = (hash(i * 7 + 2) - 0.5) * SNOW_SPREAD * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpread: { value: SNOW_SPREAD }, uHeight: { value: SNOW_HEIGHT } },
      vertexShader: `
        uniform float uTime;
        void main() {
          vec3 pos = position;
          gl_PointSize = 3.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          // Soft round snowflake
          vec2 uv = gl_PointCoord - 0.5;
          float r = length(uv);
          float alpha = 1.0 - smoothstep(0.3, 0.5, r);
          gl_FragColor = vec4(0.92, 0.95, 1.0, alpha * 0.75);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.visible  = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return mesh;
  }

  // -------------------------------------------------------------------------
  // Update — call every simulation tick
  // -------------------------------------------------------------------------
  /**
   * @param {number} dtSeconds
   * @param {number} worldTimeSec  — accumulated world time in seconds
   * @param {{x:number,y:number,z:number}} playerPos
   * @param {{name:string}} biome  — current biome at player
   */
  update(dtSeconds, worldTimeSec, playerPos, biome) {
    // Determine desired weather type
    const biomeName = biome?.name ?? "plains";
    const biomeWeather = BIOME_WEATHER[biomeName] ?? "rain";
    const desired = this._overrideType !== null ? this._overrideType : biomeWeather;

    // Transition active type
    if (desired !== this._activeType) {
      this._setActiveType(desired);
    }

    const active = this._activeType !== "none";

    // Smooth fog darkening blend
    const targetBlend = active ? 1.0 : 0.0;
    this._fogBlend += (targetBlend - this._fogBlend) * Math.min(1, WEATHER_FADE_RATE * Math.max(0, dtSeconds));

    // Apply fog tint — mutate scratch in place to avoid per-frame allocation
    if (this._fog && this._baseFogColor) {
      const k = 1.0 - (1.0 - WEATHER_FOG_DARKEN) * this._fogBlend;
      this._fogScratch.copy(this._baseFogColor).multiplyScalar(k);
      this._fog.color.copy(this._fogScratch);
    }

    if (!active) {
      return;
    }

    const spread  = active && this._activeType === "rain" ? RAIN_SPREAD  : SNOW_SPREAD;
    const height  = active && this._activeType === "rain" ? RAIN_HEIGHT  : SNOW_HEIGHT;
    const speed   = active && this._activeType === "rain" ? RAIN_SPEED   : SNOW_SPEED;
    const count   = active && this._activeType === "rain" ? RAIN_COUNT   : SNOW_COUNT;
    const mesh    = active && this._activeType === "rain" ? this._rainMesh : this._snowMesh;
    const hashMul = this._activeType === "rain" ? 3 : 7;

    // Follow camera (keep particle cloud centred on player)
    mesh.position.set(playerPos.x, playerPos.y, playerPos.z);

    // Animate particle positions CPU-side by wrapping Y (rain falls, snow drifts)
    const positions = mesh.geometry.attributes.position.array;
    const dt = Math.min(dtSeconds, 0.05);

    if (this._activeType === "snow") {
      for (let i = 0; i < count; i += 1) {
        const base = i * 3;
        // Drift in XZ slowly
        positions[base    ] += Math.sin(worldTimeSec * 0.7 + i * 0.413) * 0.004;
        positions[base + 2] += Math.cos(worldTimeSec * 0.6 + i * 0.317) * 0.004;
        // Fall
        positions[base + 1] -= speed * dt;
        // Wrap around when below player feet
        if (positions[base + 1] < -2) {
          positions[base    ] = (hash(i * hashMul + worldTimeSec * 0.03) - 0.5) * spread * 2;
          positions[base + 1] = height + hash(i * hashMul + 1 + worldTimeSec * 0.02) * 2;
          positions[base + 2] = (hash(i * hashMul + 2 + worldTimeSec * 0.01) - 0.5) * spread * 2;
        }
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        const base = i * 3;
        positions[base + 1] -= speed * dt;
        if (positions[base + 1] < -2) {
          positions[base    ] = (hash(i * hashMul + Math.floor(worldTimeSec)) - 0.5) * spread * 2;
          positions[base + 1] = height - 1 + hash(i * hashMul + 1) * 2;
          positions[base + 2] = (hash(i * hashMul + 2 + Math.floor(worldTimeSec)) - 0.5) * spread * 2;
        }
      }
    }

    mesh.geometry.attributes.position.needsUpdate = true;

    // Update time uniform for shaders (future use)
    mesh.material.uniforms.uTime.value = worldTimeSec;
  }

  // -------------------------------------------------------------------------
  // Type switching
  // -------------------------------------------------------------------------
  _setActiveType(type) {
    if (this._rainMesh) this._rainMesh.visible = false;
    if (this._snowMesh) this._snowMesh.visible = false;
    this._activeType = type;
    if (type === "rain" && this._rainMesh) {
      this._rainMesh.visible = true;
    } else if (type === "snow" && this._snowMesh) {
      this._snowMesh.visible = true;
    }
  }

  /**
   * Debug override — force a specific weather type.
   * @param {"rain"|"snow"|"none"|null} type  null = back to biome-driven
   */
  setWeather(type) {
    if (type === null || type === "rain" || type === "snow" || type === "none") {
      this._overrideType = type;
      // Immediately apply to avoid waiting for the next update cycle
      const effective = type !== null ? type : "none";
      this._setActiveType(effective);
    }
  }

  /**
   * Returns current state for render_game_to_text.
   */
  getState() {
    return {
      type:      this._activeType,
      override:  this._overrideType,
      particles: this._activeType === "rain" ? RAIN_COUNT : this._activeType === "snow" ? SNOW_COUNT : 0,
      fogBlend:  Number(this._fogBlend.toFixed(3)),
    };
  }

  dispose() {
    if (this._rainMesh) {
      this._scene.remove(this._rainMesh);
      this._rainMesh.geometry.dispose();
      this._rainMesh.material.dispose();
      this._rainMesh = null;
    }
    if (this._snowMesh) {
      this._scene.remove(this._snowMesh);
      this._snowMesh.geometry.dispose();
      this._snowMesh.material.dispose();
      this._snowMesh = null;
    }
    // Restore fog colour
    if (this._fog && this._baseFogColor) {
      this._fog.color.copy(this._baseFogColor);
    }
  }
}
