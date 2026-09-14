/**
 * PBR Texture Atlas Generation System
 *
 * Generates high-resolution (256px) procedural PBR textures for ExoCraft.
 * All textures are original clean-room art — never sampled from Minecraft.
 *
 * Atlas layout: 8×8 grid, 256px per tile, 2px gutter = 2080×2080 px
 * Three channels: albedo (sRGB), normal (linear), roughness-AO-metalness-emissive (linear packed RGBA)
 */

import * as THREE from 'three';
import { TILE, BLOCK_FACE_TILES } from './textures.js';

// === Constants ===
export const PBR_TILE_PX = 256;
export const PBR_ATLAS_COLS = 8;
export const PBR_ATLAS_ROWS = 8;
export const PBR_TILE_GUTTER = 2;
export const PBR_ATLAS_PX = (PBR_TILE_PX + PBR_TILE_GUTTER * 2) * PBR_ATLAS_COLS; // 2080

// === Resource Pack Override Hook ===
const _textureOverrides = new Map(); // key: `${tileName}:${channel}` → ImageData

/**
 * Register a texture override for resource pack support.
 * @param {string} tileName - Tile name from TILE map (e.g., "stone", "grass_top")
 * @param {'albedo'|'normal'|'roughnessAO'} channel - Which PBR channel to override
 * @param {ImageData} imageData - 256×256 ImageData to use instead of procedural generation
 */
export function registerTextureOverride(tileName, channel, imageData) {
  if (imageData.width !== PBR_TILE_PX || imageData.height !== PBR_TILE_PX) {
    throw new Error(`Override for ${tileName}/${channel} must be ${PBR_TILE_PX}×${PBR_TILE_PX}, got ${imageData.width}×${imageData.height}`);
  }
  _textureOverrides.set(`${tileName}:${channel}`, imageData);
}

/**
 * Clear all texture overrides.
 */
export function clearTextureOverrides() {
  _textureOverrides.clear();
}

// === Noise Utilities (original implementations) ===

/**
 * Simple hash-based pseudo-random number generator.
 * Deterministic for given seed — no Math.random().
 */
function hash(x, y, seed) {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/**
 * Smooth interpolation between a and b using t.
 */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * 2D value noise in [0, 1].
 */
function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const n00 = hash(ix, iy, seed);
  const n10 = hash(ix + 1, iy, seed);
  const n01 = hash(ix, iy + 1, seed);
  const n11 = hash(ix + 1, iy + 1, seed);

  const sx = smoothstep(fx);
  const sy = smoothstep(fy);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;

  return nx0 + (nx1 - nx0) * sy;
}

/**
 * Fractal Brownian Motion — multi-octave value noise.
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 * @param {number} persistence - Amplitude multiplier per octave
 * @param {number} lacunarity - Frequency multiplier per octave
 * @param {number} seed
 * @returns {number} Value in approximately [0, 1]
 */
function fbm(x, y, octaves, persistence, lacunarity, seed) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 31337) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Domain-warped FBM for organic patterns.
 */
function warpedFbm(x, y, octaves, persistence, lacunarity, seed) {
  const warpX = fbm(x + 5.2, y + 1.3, 3, 0.5, 2.0, seed + 1000);
  const warpY = fbm(x + 1.7, y + 9.2, 3, 0.5, 2.0, seed + 2000);
  return fbm(x + warpX * 4, y + warpY * 4, octaves, persistence, lacunarity, seed);
}

/**
 * Voronoi cell distance for cobblestone/gravel patterns.
 * Returns { dist1, dist2 } — closest and second-closest cell distances.
 */
function voronoi(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  let dist1 = 999;
  let dist2 = 999;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + hash(cx, cy, seed);
      const py = cy + hash(cx, cy, seed + 777);
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < dist1) {
        dist2 = dist1;
        dist1 = d;
      } else if (d < dist2) {
        dist2 = d;
      }
    }
  }

  return { dist1: Math.sqrt(dist1), dist2: Math.sqrt(dist2) };
}

// === Color Utilities ===

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerpColor(r1, g1, b1, r2, g2, b2, t) {
  return [
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  ];
}

/**
 * Set a pixel in ImageData with clamped byte values.
 */
function setPixel(data, x, y, size, r, g, b, a = 255) {
  const idx = (y * size + x) * 4;
  data[idx] = clamp(Math.round(r), 0, 255);
  data[idx + 1] = clamp(Math.round(g), 0, 255);
  data[idx + 2] = clamp(Math.round(b), 0, 255);
  data[idx + 3] = clamp(Math.round(a), 0, 255);
}

// === Heightmap Generation ===

/**
 * Generate a heightmap for a tile — used for normal map derivation.
 * Returns Float32Array of size² values in [0, 1].
 */
function generateHeightmap(tileName, size, seed) {
  const heightmap = new Float32Array(size * size);
  const scale = size / 8; // Noise coordinate scale relative to tile size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / scale;
      const ny = y / scale;
      let h;

      switch (tileName) {
        case 'stone':
          h = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          break;
        case 'cobblestone': {
          const v = voronoi(nx * 2, ny * 2, seed);
          h = 0.5 + (v.dist2 - v.dist1) * 0.8;
          break;
        }
        case 'bedrock':
          h = warpedFbm(nx * 1.5, ny * 1.5, 6, 0.6, 2.2, seed) * 0.7 +
              fbm(nx * 4, ny * 4, 3, 0.4, 2.5, seed + 500) * 0.3;
          break;
        case 'gravel': {
          const v = voronoi(nx * 3, ny * 3, seed);
          h = 0.4 + (v.dist2 - v.dist1) * 0.5 + fbm(nx * 2, ny * 2, 3, 0.5, 2.0, seed + 100) * 0.2;
          break;
        }
        case 'dirt':
          h = fbm(nx, ny, 4, 0.5, 2.0, seed) * 0.6 + fbm(nx * 3, ny * 3, 3, 0.4, 2.0, seed + 200) * 0.4;
          break;
        case 'sand':
          h = fbm(nx * 0.8, ny * 0.8, 3, 0.4, 2.0, seed) * 0.3 +
              fbm(nx * 6, ny * 0.5, 2, 0.3, 3.0, seed + 300) * 0.2 + 0.5;
          break;
        case 'grass_top':
          h = fbm(nx, ny, 4, 0.5, 2.0, seed) * 0.5 + fbm(nx * 4, ny * 4, 3, 0.3, 2.0, seed + 400) * 0.3 + 0.2;
          break;
        case 'grass_side':
          h = fbm(nx, ny, 4, 0.5, 2.0, seed) * 0.5 + 0.3;
          break;
        case 'wood_side':
          h = fbm(nx * 0.3, ny * 2, 4, 0.5, 2.0, seed) * 0.6 + 0.2;
          break;
        case 'wood_top':
          h = fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed) * 0.3 +
              Math.sin(Math.sqrt((nx - 4) ** 2 + (ny - 4) ** 2) * 3) * 0.15 + 0.5;
          break;
        case 'leaves':
        case 'birch_leaf':
        case 'spruce_leaf':
          h = fbm(nx * 2, ny * 2, 4, 0.5, 2.0, seed) * 0.7 + 0.15;
          break;
        case 'glass':
          h = 0.5 + fbm(nx * 8, ny * 8, 2, 0.3, 2.0, seed) * 0.05;
          break;
        case 'water':
          h = fbm(nx * 1.5, ny * 1.5, 3, 0.5, 2.0, seed) * 0.3 + 0.5;
          break;
        case 'lava':
          h = warpedFbm(nx * 1.2, ny * 1.2, 4, 0.55, 2.0, seed) * 0.6 + 0.2;
          break;
        default:
          // Generic surface for tiles not yet specialized
          h = fbm(nx, ny, 4, 0.5, 2.0, seed);
          break;
      }

      heightmap[y * size + x] = clamp(h, 0, 1);
    }
  }

  return heightmap;
}

// === Normal Map Derivation ===

/**
 * Derive tangent-space normal map from heightmap using Sobel operator.
 * Output encoded as RGB where (0.5, 0.5, 1.0) = flat surface.
 */
function deriveNormalMap(heightmap, size, strength = 2.0) {
  const normals = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample neighbors with wrapping for tileability
      const xm = ((x - 1) + size) % size;
      const xp = (x + 1) % size;
      const ym = ((y - 1) + size) % size;
      const yp = (y + 1) % size;

      const hL = heightmap[y * size + xm];
      const hR = heightmap[y * size + xp];
      const hU = heightmap[ym * size + x];
      const hD = heightmap[yp * size + x];

      // Sobel gradients
      const dx = (hR - hL) * strength;
      const dy = (hD - hU) * strength;

      // Normal in tangent space
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1 / len;

      // Encode to [0, 255]
      const idx = (y * size + x) * 4;
      normals[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normals[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normals[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normals[idx + 3] = 255;
    }
  }

  return normals;
}

// === Per-Tile Albedo Painters ===

/**
 * Paint a single tile's albedo into the atlas canvas.
 * Each painter generates ORIGINAL art from mathematical descriptions.
 */
function paintTileAlbedo(tileName, ctx, ox, oy, size, seed) {
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;
  const scale = size / 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / scale;
      const ny = y / scale;
      let r, g, b, a = 255;

      switch (tileName) {
        case 'stone': {
          const n = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const base = 100 + n * 60;
          const variation = fbm(nx * 3, ny * 3, 3, 0.4, 2.0, seed + 100) * 20;
          r = base + variation;
          g = base + variation - 5;
          b = base + variation - 3;
          break;
        }
        case 'cobblestone': {
          const v = voronoi(nx * 2, ny * 2, seed);
          const edge = 1 - clamp((v.dist2 - v.dist1) * 3, 0, 1);
          const base = 90 + fbm(nx * 2, ny * 2, 3, 0.5, 2.0, seed + 50) * 50;
          const dark = base * (0.6 + edge * 0.4);
          r = dark;
          g = dark - 3;
          b = dark - 1;
          break;
        }
        case 'bedrock': {
          const n = warpedFbm(nx * 1.5, ny * 1.5, 6, 0.6, 2.2, seed);
          const base = 40 + n * 50;
          r = base;
          g = base - 2;
          b = base + 3;
          break;
        }
        case 'dirt': {
          const n = fbm(nx, ny, 4, 0.5, 2.0, seed);
          const detail = fbm(nx * 4, ny * 4, 3, 0.4, 2.0, seed + 200) * 0.3;
          const t = n * 0.7 + detail;
          [r, g, b] = lerpColor(90, 60, 30, 140, 100, 55, t);
          break;
        }
        case 'grass_top': {
          const n = fbm(nx, ny, 4, 0.5, 2.0, seed);
          const detail = fbm(nx * 5, ny * 5, 3, 0.3, 2.0, seed + 400) * 0.2;
          const t = n * 0.6 + detail + 0.2;
          [r, g, b] = lerpColor(50, 120, 30, 90, 170, 50, t);
          break;
        }
        case 'grass_side': {
          const n = fbm(nx, ny, 4, 0.5, 2.0, seed);
          // Top portion is grassy, bottom is dirt
          const grassLine = 0.25 + fbm(nx * 2, ny * 0.5, 2, 0.4, 2.0, seed + 500) * 0.1;
          const yNorm = y / size;
          if (yNorm < grassLine) {
            const t = n * 0.6 + 0.2;
            [r, g, b] = lerpColor(50, 120, 30, 90, 170, 50, t);
          } else {
            const t = n * 0.7;
            [r, g, b] = lerpColor(90, 60, 30, 140, 100, 55, t);
          }
          break;
        }
        case 'sand': {
          const n = fbm(nx * 0.8, ny * 0.8, 3, 0.4, 2.0, seed);
          const ripple = Math.sin(nx * 6 + fbm(nx, ny, 2, 0.3, 3.0, seed + 300) * 2) * 0.1;
          const t = n * 0.3 + ripple + 0.6;
          [r, g, b] = lerpColor(190, 170, 110, 220, 200, 140, t);
          break;
        }
        case 'gravel': {
          const v = voronoi(nx * 3, ny * 3, seed);
          const cell = fbm(nx * 2, ny * 2, 3, 0.5, 2.0, seed + 100);
          const base = 100 + cell * 50;
          const edge = clamp((v.dist2 - v.dist1) * 2, 0, 1);
          r = base * (0.8 + edge * 0.2);
          g = r - 5;
          b = r - 8;
          break;
        }
        case 'wood_side': {
          const grain = fbm(nx * 0.3, ny * 3, 4, 0.5, 2.0, seed);
          const streak = fbm(nx * 0.2, ny * 8, 3, 0.4, 2.0, seed + 150) * 0.3;
          const t = grain * 0.6 + streak;
          [r, g, b] = lerpColor(100, 70, 35, 160, 120, 60, t);
          break;
        }
        case 'wood_top': {
          const dist = Math.sqrt((nx - 4) ** 2 + (ny - 4) ** 2);
          const rings = Math.sin(dist * 4 + fbm(nx, ny, 2, 0.3, 2.0, seed) * 2) * 0.5 + 0.5;
          const t = rings * 0.5 + fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed + 50) * 0.3;
          [r, g, b] = lerpColor(110, 80, 40, 170, 130, 65, t);
          break;
        }
        case 'leaves': {
          const n = fbm(nx * 2, ny * 2, 4, 0.5, 2.0, seed);
          const pattern = n > 0.35 ? 1 : 0;
          if (pattern) {
            const t = n * 0.6;
            [r, g, b] = lerpColor(30, 90, 20, 60, 140, 35, t);
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'birch_leaf': {
          const n = fbm(nx * 2, ny * 2, 4, 0.5, 2.0, seed);
          const pattern = n > 0.35 ? 1 : 0;
          if (pattern) {
            const t = n * 0.5;
            [r, g, b] = lerpColor(40, 110, 30, 80, 160, 50, t);
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'spruce_leaf': {
          const n = fbm(nx * 2, ny * 2, 4, 0.5, 2.0, seed);
          const pattern = n > 0.3 ? 1 : 0;
          if (pattern) {
            const t = n * 0.5;
            [r, g, b] = lerpColor(20, 60, 15, 40, 100, 30, t);
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'glass': {
          const imperfection = fbm(nx * 8, ny * 8, 2, 0.3, 2.0, seed) * 0.08;
          r = 200 + imperfection * 55;
          g = 210 + imperfection * 45;
          b = 220 + imperfection * 35;
          a = 160;
          break;
        }
        case 'water': {
          const n = fbm(nx * 1.5, ny * 1.5, 3, 0.5, 2.0, seed);
          const caustic = fbm(nx * 4, ny * 4, 2, 0.4, 2.5, seed + 600) * 0.2;
          const t = n * 0.4 + caustic + 0.3;
          [r, g, b] = lerpColor(20, 60, 140, 50, 120, 200, t);
          a = 168;
          break;
        }
        case 'lava': {
          const n = warpedFbm(nx * 1.2, ny * 1.2, 4, 0.55, 2.0, seed);
          const crust = n > 0.55 ? 1 : 0;
          if (crust) {
            const t = (n - 0.55) * 3;
            [r, g, b] = lerpColor(80, 20, 5, 40, 10, 5, clamp(t, 0, 1));
          } else {
            const t = n * 2;
            [r, g, b] = lerpColor(255, 100, 10, 255, 200, 30, clamp(t, 0, 1));
          }
          break;
        }
        case 'coal_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 700);
          const isOre = oreN > 0.65;
          if (isOre) {
            const t = (oreN - 0.65) * 5;
            [r, g, b] = lerpColor(30, 30, 30, 10, 10, 10, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'iron_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 800);
          const isOre = oreN > 0.62;
          if (isOre) {
            const t = (oreN - 0.62) * 4;
            [r, g, b] = lerpColor(180, 160, 140, 200, 180, 160, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'gold_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 900);
          const isOre = oreN > 0.68;
          if (isOre) {
            const t = (oreN - 0.68) * 5;
            [r, g, b] = lerpColor(220, 190, 50, 255, 220, 80, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'diamond_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 1000);
          const isOre = oreN > 0.7;
          if (isOre) {
            const t = (oreN - 0.7) * 5;
            [r, g, b] = lerpColor(80, 220, 230, 120, 240, 250, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'redstone_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 1100);
          const isOre = oreN > 0.64;
          if (isOre) {
            const t = (oreN - 0.64) * 4;
            [r, g, b] = lerpColor(180, 30, 20, 220, 50, 30, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'copper_ore': {
          const stoneN = warpedFbm(nx, ny, 5, 0.55, 2.0, seed);
          const oreN = fbm(nx * 3, ny * 3, 3, 0.5, 2.0, seed + 1200);
          const isOre = oreN > 0.63;
          if (isOre) {
            const t = (oreN - 0.63) * 4;
            [r, g, b] = lerpColor(180, 120, 70, 210, 140, 80, clamp(t, 0, 1));
          } else {
            const base = 100 + stoneN * 60;
            r = base; g = base - 5; b = base - 3;
          }
          break;
        }
        case 'snow': {
          const n = fbm(nx, ny, 3, 0.4, 2.0, seed);
          const sparkle = fbm(nx * 8, ny * 8, 2, 0.3, 2.0, seed + 1300) * 0.1;
          const t = n * 0.15 + sparkle;
          [r, g, b] = lerpColor(220, 225, 235, 250, 252, 255, t);
          break;
        }
        case 'crafting_top': {
          const plank = fbm(nx * 0.5, ny * 3, 3, 0.4, 2.0, seed);
          const grid = (Math.abs(Math.sin(nx * 3.14)) < 0.1 || Math.abs(Math.sin(ny * 3.14)) < 0.1) ? 0.7 : 1.0;
          const t = plank * 0.5 * grid;
          [r, g, b] = lerpColor(120, 85, 40, 170, 130, 65, t);
          break;
        }
        case 'crafting_side': {
          const grain = fbm(nx * 0.3, ny * 3, 4, 0.5, 2.0, seed);
          const t = grain * 0.6;
          [r, g, b] = lerpColor(100, 70, 35, 160, 120, 60, t);
          break;
        }
        case 'furnace_top':
        case 'furnace_side': {
          const n = warpedFbm(nx, ny, 4, 0.5, 2.0, seed);
          const base = 110 + n * 40;
          r = base; g = base - 2; b = base - 5;
          break;
        }
        case 'furnace_front': {
          const n = warpedFbm(nx, ny, 4, 0.5, 2.0, seed);
          const base = 100 + n * 40;
          // Dark opening in center
          const cx = (x / size - 0.5) * 2;
          const cy = (y / size - 0.5) * 2;
          const opening = (cx * cx + cy * cy) < 0.25 ? 0.4 : 1.0;
          r = base * opening; g = (base - 2) * opening; b = (base - 5) * opening;
          break;
        }
        case 'torch': {
          // Stick at bottom, flame at top
          const yNorm = y / size;
          if (yNorm > 0.4) {
            // Wooden stick
            const stickW = Math.abs(x / size - 0.5) < 0.08 ? 1 : 0;
            if (stickW) {
              const t = fbm(nx * 2, ny * 4, 2, 0.4, 2.0, seed) * 0.4;
              [r, g, b] = lerpColor(100, 70, 30, 140, 100, 50, t);
            } else {
              r = g = b = a = 0;
            }
          } else {
            // Flame glow
            const cx = (x / size - 0.5) * 2;
            const cy = (y / size - 0.3) * 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const flame = clamp(1 - dist * 1.5, 0, 1);
            r = 255 * flame;
            g = 200 * flame;
            b = 50 * flame;
            a = Math.round(flame * 255);
          }
          break;
        }
        case 'tall_grass': {
          const blade = Math.abs(x / size - 0.5) < 0.15 + fbm(nx, ny * 2, 2, 0.3, 2.0, seed) * 0.1;
          const yFade = y / size;
          if (blade && yFade > 0.2) {
            const t = fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed) * 0.5;
            [r, g, b] = lerpColor(40, 100, 25, 70, 150, 40, t);
            a = Math.round(clamp(yFade * 1.5, 0, 1) * 255);
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'flower': {
          const cx = (x / size - 0.5) * 2;
          const cy = (y / size - 0.5) * 2;
          const dist = Math.sqrt(cx * cx + cy * cy);
          // Stem
          if (Math.abs(cx) < 0.05 && cy > 0) {
            r = 40; g = 120; b = 30; a = 255;
          } else if (dist < 0.35) {
            // Petals — red flower
            const petal = Math.cos(Math.atan2(cy, cx) * 5) * 0.5 + 0.5;
            if (petal > 0.3) {
              r = 220; g = 40; b = 40; a = 255;
            } else {
              r = g = b = a = 0;
            }
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'sapling': {
          const cx = (x / size - 0.5) * 2;
          const cy = (y / size - 0.5) * 2;
          // Thin stem
          if (Math.abs(cx) < 0.03 && cy > 0.2) {
            r = 60; g = 100; b = 30; a = 255;
          } else if (cy < 0.2 && Math.sqrt(cx * cx + cy * cy) < 0.3) {
            // Small branching leaves
            const n = fbm(nx * 4, ny * 4, 2, 0.4, 2.0, seed);
            if (n > 0.4) {
              r = 40; g = 130; b = 35; a = 220;
            } else {
              r = g = b = a = 0;
            }
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'wool': {
          const fiber = fbm(nx * 4, ny * 4, 3, 0.4, 2.0, seed);
          const base = 220 + fiber * 30;
          r = base; g = base; b = base;
          break;
        }
        case 'farmland': {
          const furrow = Math.sin(nx * 8) * 0.5 + 0.5;
          const n = fbm(nx, ny, 3, 0.4, 2.0, seed);
          const t = furrow * 0.4 + n * 0.3;
          [r, g, b] = lerpColor(70, 45, 20, 110, 75, 35, t);
          break;
        }
        case 'wheat_stage0':
        case 'wheat_stage1':
        case 'wheat_stage2':
        case 'wheat_stage3': {
          const stage = parseInt(tileName.slice(-1));
          const height = 0.3 + stage * 0.18;
          const yNorm = y / size;
          const cx = (x / size - 0.5) * 2;
          if (Math.abs(cx) < 0.06 && yNorm > (1 - height)) {
            const greenness = 1 - stage * 0.2;
            r = 120 + (1 - greenness) * 100;
            g = 140 * greenness + 80;
            b = 30 * greenness + 20;
            a = 255;
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'birch_top': {
          const dist = Math.sqrt((nx - 4) ** 2 + (ny - 4) ** 2);
          const rings = Math.sin(dist * 4 + fbm(nx, ny, 2, 0.3, 2.0, seed) * 2) * 0.5 + 0.5;
          const t = rings * 0.3 + 0.5;
          [r, g, b] = lerpColor(180, 170, 140, 220, 210, 180, t);
          break;
        }
        case 'birch_side': {
          const base = 220 + fbm(nx * 0.5, ny * 2, 3, 0.3, 2.0, seed) * 30;
          // Dark horizontal streaks
          const streak = fbm(nx * 0.3, ny * 6, 2, 0.4, 2.0, seed + 1400);
          const dark = streak > 0.7 ? 0.6 : 1.0;
          r = base * dark; g = (base - 5) * dark; b = (base - 15) * dark;
          break;
        }
        case 'spruce_top': {
          const dist = Math.sqrt((nx - 4) ** 2 + (ny - 4) ** 2);
          const rings = Math.sin(dist * 5 + fbm(nx, ny, 2, 0.3, 2.0, seed) * 2) * 0.5 + 0.5;
          const t = rings * 0.4 + 0.3;
          [r, g, b] = lerpColor(80, 55, 25, 130, 90, 40, t);
          break;
        }
        case 'spruce_side': {
          const grain = fbm(nx * 0.3, ny * 3, 4, 0.5, 2.0, seed);
          const t = grain * 0.5 + 0.2;
          [r, g, b] = lerpColor(60, 40, 20, 100, 70, 35, t);
          break;
        }
        case 'fence_oak': {
          const grain = fbm(nx * 0.5, ny * 3, 3, 0.4, 2.0, seed);
          const t = grain * 0.5 + 0.3;
          [r, g, b] = lerpColor(120, 85, 40, 170, 130, 65, t);
          break;
        }
        case 'ladder': {
          const rung = Math.sin(ny * 8) > 0.3 ? 1 : 0;
          const side = Math.abs(x / size - 0.15) < 0.05 || Math.abs(x / size - 0.85) < 0.05 ? 1 : 0;
          if (rung || side) {
            const t = fbm(nx * 2, ny * 2, 2, 0.4, 2.0, seed) * 0.4;
            [r, g, b] = lerpColor(100, 70, 30, 150, 110, 50, t);
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'door_oak': {
          const plank = fbm(nx * 0.5, ny * 3, 3, 0.4, 2.0, seed);
          const panel = (x / size > 0.1 && x / size < 0.9 && y / size > 0.05 && y / size < 0.95) ? 1 : 0.7;
          const t = plank * 0.5 * panel;
          [r, g, b] = lerpColor(110, 75, 35, 160, 120, 60, t);
          break;
        }
        case 'trapdoor_oak': {
          const plank = fbm(nx * 2, ny * 0.5, 3, 0.4, 2.0, seed);
          const slat = Math.sin(nx * 12) > 0 ? 1 : 0.8;
          const t = plank * 0.5 * slat;
          [r, g, b] = lerpColor(110, 75, 35, 160, 120, 60, t);
          break;
        }
        case 'repeater_top':
        case 'comparator_top': {
          const base = 120 + fbm(nx, ny, 3, 0.4, 2.0, seed) * 30;
          r = base; g = base - 5; b = base - 10;
          break;
        }
        case 'redstone_nub_on': {
          r = 200; g = 30; b = 20; a = 255;
          break;
        }
        case 'redstone_nub_off': {
          r = 100; g = 20; b = 15; a = 255;
          break;
        }
        case 'redstone_wire_on': {
          const wire = Math.abs(x / size - 0.5) < 0.1 || Math.abs(y / size - 0.5) < 0.1 ? 1 : 0;
          if (wire) {
            r = 220; g = 40; b = 20; a = 255;
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'redstone_wire_off': {
          const wire = Math.abs(x / size - 0.5) < 0.1 || Math.abs(y / size - 0.5) < 0.1 ? 1 : 0;
          if (wire) {
            r = 100; g = 20; b = 15; a = 255;
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'redstone_torch_on': {
          const yNorm = y / size;
          if (yNorm > 0.4) {
            const stickW = Math.abs(x / size - 0.5) < 0.06 ? 1 : 0;
            if (stickW) { r = 100; g = 70; b = 30; a = 255; }
            else { r = g = b = a = 0; }
          } else {
            const cx = (x / size - 0.5) * 2;
            const cy = (y / size - 0.3) * 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const glow = clamp(1 - dist * 1.5, 0, 1);
            r = 220 * glow; g = 30 * glow; b = 20 * glow; a = Math.round(glow * 255);
          }
          break;
        }
        case 'redstone_torch_off': {
          const yNorm = y / size;
          if (yNorm > 0.4) {
            const stickW = Math.abs(x / size - 0.5) < 0.06 ? 1 : 0;
            if (stickW) { r = 80; g = 55; b = 25; a = 255; }
            else { r = g = b = a = 0; }
          } else {
            const cx = (x / size - 0.5) * 2;
            const cy = (y / size - 0.3) * 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const glow = clamp(1 - dist * 2, 0, 1);
            r = 80 * glow; g = 20 * glow; b = 15 * glow; a = Math.round(glow * 200);
          }
          break;
        }
        case 'lever_off':
        case 'lever_on': {
          const cx = (x / size - 0.5) * 2;
          const cy = (y / size - 0.5) * 2;
          // Base plate
          if (Math.abs(cx) < 0.4 && Math.abs(cy) < 0.4) {
            const n = fbm(nx * 2, ny * 2, 2, 0.4, 2.0, seed);
            r = 100 + n * 30; g = r - 5; b = r - 10;
          } else {
            r = g = b = a = 0;
          }
          break;
        }
        case 'redstone_lamp_off': {
          const n = fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed);
          const base = 60 + n * 30;
          r = base; g = base + 5; b = base + 10;
          break;
        }
        case 'redstone_lamp_on': {
          const n = fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed);
          const base = 180 + n * 50;
          r = base; g = base - 20; b = base - 60;
          break;
        }
        case 'redstone_block': {
          const n = fbm(nx * 2, ny * 2, 4, 0.5, 2.0, seed);
          const t = n * 0.4 + 0.4;
          [r, g, b] = lerpColor(160, 20, 10, 220, 50, 30, t);
          break;
        }
        case 'bed_top': {
          const fabric = fbm(nx * 3, ny * 3, 3, 0.4, 2.0, seed);
          const pillow = y / size < 0.3 ? 1 : 0;
          if (pillow) {
            r = 220; g = 220; b = 220;
          } else {
            const t = fabric * 0.3 + 0.5;
            [r, g, b] = lerpColor(140, 30, 30, 190, 50, 50, t);
          }
          break;
        }
        case 'bed_side': {
          const wood = fbm(nx * 0.5, ny * 3, 3, 0.4, 2.0, seed);
          const t = wood * 0.5 + 0.3;
          [r, g, b] = lerpColor(100, 70, 35, 150, 110, 55, t);
          break;
        }
        default: {
          // Fallback: generic noise surface
          const n = fbm(nx, ny, 4, 0.5, 2.0, seed);
          const base = 128 + n * 60;
          r = base; g = base; b = base;
          break;
        }
      }

      setPixel(d, x, y, size, r, g, b, a);
    }
  }

  ctx.putImageData(imgData, ox, oy);
}

// === Roughness/AO/Metalness/Emissive Painter ===

/**
 * Paint packed roughness-AO-metalness-emissive data for a tile.
 * R = roughness (0=smooth, 1=rough)
 * G = AO (0=occluded, 1=open)
 * B = metalness (0=dielectric, 1=metal)
 * A = emissive mask (0=none, 1=emissive)
 */
function paintTileRoughnessAO(tileName, ctx, ox, oy, size, seed, raw = false) {
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;
  const scale = size / 8;
  // Every pixel samples the same tile heightmap; generate it once per tile.
  const heightmap = generateHeightmap(tileName, size, seed);

  // Default material properties by category
  let baseRoughness = 0.8;
  let baseMetalness = 0.0;
  let emissive = false;

  switch (tileName) {
    case 'stone': case 'cobblestone': case 'bedrock': case 'gravel':
      baseRoughness = 0.85; break;
    case 'dirt': case 'farmland': case 'grass_side':
      baseRoughness = 0.95; break;
    case 'grass_top':
      baseRoughness = 0.9; break;
    case 'sand':
      baseRoughness = 0.9; break;
    case 'wood_side': case 'wood_top': case 'birch_side': case 'birch_top':
    case 'spruce_side': case 'spruce_top': case 'crafting_top': case 'crafting_side':
    case 'fence_oak': case 'door_oak': case 'trapdoor_oak': case 'ladder':
    case 'bed_side':
      baseRoughness = 0.75; break;
    case 'leaves': case 'birch_leaf': case 'spruce_leaf':
      baseRoughness = 0.85; break;
    case 'glass':
      baseRoughness = 0.1; break;
    case 'water':
      baseRoughness = 0.05; break;
    case 'lava':
      baseRoughness = 0.6; emissive = true; break;
    case 'coal_ore':
      baseRoughness = 0.7; baseMetalness = 0.1; break;
    case 'iron_ore':
      baseRoughness = 0.5; baseMetalness = 0.4; break;
    case 'gold_ore':
      baseRoughness = 0.3; baseMetalness = 0.6; break;
    case 'diamond_ore':
      baseRoughness = 0.2; baseMetalness = 0.3; break;
    case 'redstone_ore':
      baseRoughness = 0.6; baseMetalness = 0.2; break;
    case 'copper_ore':
      baseRoughness = 0.4; baseMetalness = 0.5; break;
    case 'snow':
      baseRoughness = 0.7; break;
    case 'wool':
      baseRoughness = 0.95; break;
    case 'torch': case 'redstone_torch_on':
      emissive = true; baseRoughness = 0.8; break;
    case 'redstone_lamp_on':
      emissive = true; baseRoughness = 0.4; break;
    case 'redstone_nub_on': case 'redstone_wire_on':
      emissive = true; baseRoughness = 0.6; break;
    case 'furnace_front': case 'furnace_side': case 'furnace_top':
      baseRoughness = 0.8; break;
    case 'repeater_top': case 'comparator_top':
      baseRoughness = 0.6; break;
    default:
      baseRoughness = 0.8; break;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / scale;
      const ny = y / scale;

      // Roughness variation from surface detail
      const roughVar = fbm(nx * 2, ny * 2, 3, 0.4, 2.0, seed + 5000) * 0.15;
      const roughness = clamp(baseRoughness + roughVar, 0, 1);

      // AO from heightmap curvature approximation
      const idx = y * size + x;
      const h = heightmap[idx];
      const xm = heightmap[y * size + ((x - 1 + size) % size)];
      const xp = heightmap[y * size + ((x + 1) % size)];
      const ym = heightmap[((y - 1 + size) % size) * size + x];
      const yp = heightmap[((y + 1) % size) * size + x];
      const curvature = (xm + xp + ym + yp) / 4 - h;
      const ao = clamp(0.7 + curvature * 2, 0.3, 1.0);

      // Metalness with slight variation for ores
      const metalVar = baseMetalness > 0 ? fbm(nx * 3, ny * 3, 2, 0.3, 2.0, seed + 6000) * 0.1 : 0;
      const metalness = clamp(baseMetalness + metalVar, 0, 1);

      // Emissive mask
      const emissiveVal = emissive ? 255 : 0;

      const pIdx = (y * size + x) * 4;
      d[pIdx] = Math.round(roughness * 255);
      d[pIdx + 1] = Math.round(ao * 255);
      d[pIdx + 2] = Math.round(metalness * 255);
      d[pIdx + 3] = emissiveVal;
    }
  }

  if (raw) return imgData;
  ctx.putImageData(imgData, ox, oy);
}

// === Atlas Generation Entry Points ===

/**
 * Generate the albedo atlas canvas.
 * @returns {HTMLCanvasElement}
 */
export function generateAlbedoAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = PBR_ATLAS_PX;
  canvas.height = PBR_ATLAS_PX;
  const ctx = canvas.getContext('2d');

  const tileEntries = Object.entries(TILE);
  for (const [tileName, [col, row]] of tileEntries) {
    const ox = col * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;
    const oy = row * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;

    // Check for override
    const overrideKey = `${tileName}:albedo`;
    if (_textureOverrides.has(overrideKey)) {
      ctx.putImageData(_textureOverrides.get(overrideKey), ox, oy);
    } else {
      const seed = tileName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      paintTileAlbedo(tileName, ctx, ox, oy, PBR_TILE_PX, seed);
    }
  }

  return canvas;
}

/**
 * Generate the normal map atlas canvas.
 * @returns {HTMLCanvasElement}
 */
export function generateNormalAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = PBR_ATLAS_PX;
  canvas.height = PBR_ATLAS_PX;
  const ctx = canvas.getContext('2d');

  const tileEntries = Object.entries(TILE);
  for (const [tileName, [col, row]] of tileEntries) {
    const ox = col * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;
    const oy = row * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;

    // Check for override
    const overrideKey = `${tileName}:normal`;
    if (_textureOverrides.has(overrideKey)) {
      ctx.putImageData(_textureOverrides.get(overrideKey), ox, oy);
    } else {
      const seed = tileName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const heightmap = generateHeightmap(tileName, PBR_TILE_PX, seed);
      const normalData = deriveNormalMap(heightmap, PBR_TILE_PX, 2.0);
      const imgData = new ImageData(new Uint8ClampedArray(normalData), PBR_TILE_PX, PBR_TILE_PX);
      ctx.putImageData(imgData, ox, oy);
    }
  }

  return canvas;
}

/**
 * Generate the packed atlas as raw bytes for GPU upload, or a canvas preview.
 * @param {boolean} raw - Preserve RGB even where the emissive alpha is zero.
 * @returns {HTMLCanvasElement|Uint8Array}
 */
export function generateRoughnessAOAtlas(raw = false) {
  const canvas = document.createElement('canvas');
  canvas.width = PBR_ATLAS_PX;
  canvas.height = PBR_ATLAS_PX;
  const ctx = canvas.getContext('2d');
  // Canvas premultiplies RGB by alpha, destroying material data wherever the
  // emissive mask is zero. Upload the packed bytes directly for GPU sampling.
  const packed = raw ? new Uint8Array(PBR_ATLAS_PX * PBR_ATLAS_PX * 4) : null;

  const tileEntries = Object.entries(TILE);
  for (const [tileName, [col, row]] of tileEntries) {
    const ox = col * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;
    const oy = row * (PBR_TILE_PX + PBR_TILE_GUTTER * 2) + PBR_TILE_GUTTER;

    // Check for override
    const overrideKey = `${tileName}:roughnessAO`;
    if (raw) {
      const seed = tileName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const tile = _textureOverrides.get(overrideKey)
        || paintTileRoughnessAO(tileName, ctx, ox, oy, PBR_TILE_PX, seed, true);
      for (let y = 0; y < PBR_TILE_PX; y++) {
        packed.set(tile.data.subarray(y * PBR_TILE_PX * 4, (y + 1) * PBR_TILE_PX * 4),
          ((oy + y) * PBR_ATLAS_PX + ox) * 4);
      }
    } else if (_textureOverrides.has(overrideKey)) {
      ctx.putImageData(_textureOverrides.get(overrideKey), ox, oy);
    } else {
      const seed = tileName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      paintTileRoughnessAO(tileName, ctx, ox, oy, PBR_TILE_PX, seed);
    }
  }

  return packed || canvas;
}

/**
 * Create all three PBR atlas textures as THREE.CanvasTexture objects.
 * @returns {{ albedo: THREE.CanvasTexture, normal: THREE.CanvasTexture, roughnessAO: THREE.DataTexture }}
 */
export function createPBRAtlasTextures() {
  const albedoCanvas = generateAlbedoAtlas();
  const normalCanvas = generateNormalAtlas();
  const roughnessAOData = generateRoughnessAOAtlas(true);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.wrapS = THREE.ClampToEdgeWrapping;
  albedo.wrapT = THREE.ClampToEdgeWrapping;

  const normal = new THREE.CanvasTexture(normalCanvas);
  normal.colorSpace = THREE.LinearSRGBColorSpace;
  normal.magFilter = THREE.LinearFilter;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.generateMipmaps = true;
  normal.wrapS = THREE.ClampToEdgeWrapping;
  normal.wrapT = THREE.ClampToEdgeWrapping;

  const roughnessAO = new THREE.DataTexture(roughnessAOData, PBR_ATLAS_PX, PBR_ATLAS_PX);
  roughnessAO.flipY = true;
  roughnessAO.needsUpdate = true;
  roughnessAO.colorSpace = THREE.LinearSRGBColorSpace;
  roughnessAO.magFilter = THREE.LinearFilter;
  roughnessAO.minFilter = THREE.LinearFilter; // No mipmaps needed for data texture
  roughnessAO.generateMipmaps = false;
  roughnessAO.wrapS = THREE.ClampToEdgeWrapping;
  roughnessAO.wrapT = THREE.ClampToEdgeWrapping;

  return { albedo, normal, roughnessAO };
}

/**
 * Compute UV rect for a tile name in the PBR atlas.
 * Same slot layout as the 16px atlas but with PBR dimensions.
 * @param {string} tileName
 * @returns {{ uMin: number, uMax: number, vMin: number, vMax: number }}
 */
export function pbrTileUvRect(tileName) {
  const slot = TILE[tileName];
  if (!slot) {
    console.warn(`PBR UV: unknown tile "${tileName}"`);
    return { uMin: 0, uMax: 1 / PBR_ATLAS_COLS, vMin: 0, vMax: 1 / PBR_ATLAS_ROWS };
  }

  const [col, row] = slot;
  const cellSize = (PBR_TILE_PX + PBR_TILE_GUTTER * 2) / PBR_ATLAS_PX;
  const gutterNorm = PBR_TILE_GUTTER / PBR_ATLAS_PX;

  const uMin = col * cellSize + gutterNorm;
  const uMax = (col + 1) * cellSize - gutterNorm;
  // V-axis inverted: canvas Y=0 is top, UV V=1 is top
  const vMin = 1 - ((row + 1) * cellSize - gutterNorm);
  const vMax = 1 - (row * cellSize + gutterNorm);

  return { uMin, uMax, vMin, vMax };
}
