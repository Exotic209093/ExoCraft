import * as THREE from "three";
import { BLOCK_FACE_TILES, tileUvRect, BLOCK_TRANSPARENCY_CLASS } from "./textures";

const CARDINAL_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// Face index constants matching CARDINAL_DIRECTIONS order
const FACE_PX = 0; // +X
const FACE_NX = 1; // -X
const FACE_PY = 2; // +Y
const FACE_NY = 3; // -Y
const FACE_PZ = 4; // +Z
const FACE_NZ = 5; // -Z

// Normals per face [nx, ny, nz]
const FACE_NORMALS = [
  [ 1, 0, 0],
  [-1, 0, 0],
  [ 0, 1, 0],
  [ 0,-1, 0],
  [ 0, 0, 1],
  [ 0, 0,-1],
];

// FACE_KEYS maps face index -> key used in BLOCK_FACE_TILES
const FACE_KEYS = ["px", "nx", "py", "ny", "pz", "nz"];

// Per-face: 4 vertex offsets from block origin [x,y,z] in the range [0,1].
// Order: bottom-left, bottom-right, top-left, top-right (in face-local space).
// These are arranged so that the normal computed from cross(v1-v0, v2-v0) points outward.
// Standard triangulation: quad = [0,1,2, 1,3,2] (two CCW triangles from the viewer facing the face).
const FACE_VERTS = [
  // PX (+X face, normal +X): verts on the x=1 plane
  [[1,0,1],[1,0,0],[1,1,1],[1,1,0]],
  // NX (-X face, normal -X): verts on the x=0 plane
  [[0,0,0],[0,0,1],[0,1,0],[0,1,1]],
  // PY (+Y face, normal +Y): verts on the y=1 plane
  [[0,1,0],[1,1,0],[0,1,1],[1,1,1]],
  // NY (-Y face, normal -Y): verts on the y=0 plane
  [[0,0,1],[1,0,1],[0,0,0],[1,0,0]],
  // PZ (+Z face, normal +Z): verts on the z=1 plane
  [[0,0,1],[1,0,1],[0,1,1],[1,1,1]],
  // NZ (-Z face, normal -Z): verts on the z=0 plane
  [[1,0,0],[0,0,0],[1,1,0],[0,1,0]],
];

// UV coordinates for the 4 vertices of each face (same order as FACE_VERTS).
// [uMin,vMin], [uMax,vMin], [uMin,vMax], [uMax,vMax]
// (bottom-left, bottom-right, top-left, top-right in atlas space)
const FACE_UV_INDICES = [
  [0,0], [1,0], [0,1], [1,1],
];

// AO neighbour lookup per face per vertex.
// For each face (6) and each vertex (4), lists [side1_offset, side2_offset, corner_offset]
// where each offset is [dx,dy,dz] relative to the block being meshed.
// The three neighbours are the two edge-adjacent blocks and the corner block
// that together form the 2x2 neighbourhood behind the vertex corner.
const FACE_AO_NEIGHBOURS = buildFaceAoNeighbours();

function buildFaceAoNeighbours() {
  // For each face, we need two tangent axes to compute AO corner neighbours.
  // Face verts are [bl, br, tl, tr] (see FACE_VERTS).
  // At each corner, the two adjacent edge neighbours are:
  //   bl: side1 = left along U, side2 = down along V
  //   br: side1 = right along U, side2 = down along V
  //   tl: side1 = left along U, side2 = up along V
  //   tr: side1 = right along U, side2 = up along V
  // The corner is side1 + side2.
  // We precompute these from the normal and tangent vectors for each face.

  const faceAxes = [
    // PX: normal +X, tangent +Z (U), up +Y (V) -> bl=(1,0,1) -> left=-Z, down=-Y
    { n: [1,0,0], u: [0,0,-1], v: [0,1,0] },
    // NX: normal -X, tangent -Z (U), up +Y (V) -> bl=(0,0,0) -> left=+Z, down=-Y
    { n: [-1,0,0], u: [0,0,1], v: [0,1,0] },
    // PY: normal +Y, tangent +X (U), up -Z (V) -> bl=(0,1,0) -> left=-X, down=+Z
    { n: [0,1,0], u: [1,0,0], v: [0,0,1] },
    // NY: normal -Y, tangent +X (U), up +Z (V) -> bl=(0,0,1) -> left=-X, down=-Z
    { n: [0,-1,0], u: [1,0,0], v: [0,0,-1] },
    // PZ: normal +Z, tangent -X (U), up +Y (V) -> bl=(0,0,1) -> left=+X, down=-Y
    { n: [0,0,1], u: [-1,0,0], v: [0,1,0] },
    // NZ: normal -Z, tangent +X (U), up +Y (V) -> bl=(1,0,0) -> left=-X, down=-Y
    { n: [0,0,-1], u: [1,0,0], v: [0,1,0] },
  ];

  // Vertex order: bl(0), br(1), tl(2), tr(3)
  // For each corner:
  //   bl: u-direction = -1 (left), v-direction = -1 (down)
  //   br: u-direction = +1 (right), v-direction = -1 (down)
  //   tl: u-direction = -1 (left), v-direction = +1 (up)
  //   tr: u-direction = +1 (right), v-direction = +1 (up)
  const cornerSigns = [
    [-1, -1], // bl
    [ 1, -1], // br
    [-1,  1], // tl
    [ 1,  1], // tr
  ];

  const result = [];
  for (let f = 0; f < 6; f += 1) {
    const { n, u, v } = faceAxes[f];
    const faceVerts = [];
    for (let vert = 0; vert < 4; vert += 1) {
      const [su, sv] = cornerSigns[vert];
      const side1 = [
        n[0] + u[0] * su,
        n[1] + u[1] * su,
        n[2] + u[2] * su,
      ];
      const side2 = [
        n[0] + v[0] * sv,
        n[1] + v[1] * sv,
        n[2] + v[2] * sv,
      ];
      const corner = [
        n[0] + u[0] * su + v[0] * sv,
        n[1] + u[1] * su + v[1] * sv,
        n[2] + u[2] * su + v[2] * sv,
      ];
      faceVerts.push([side1, side2, corner]);
    }
    result.push(faceVerts);
  }
  return result;
}

// Light-emission levels per block type.
// Torch = strong block light, copper ore = faint ambient glow.
const BLOCK_LIGHT_EMIT = {
  8: 14,  // torch
  9: 3,   // copper ore
};

function toChunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function fromChunkKey(key) {
  const [cx, cz] = key.split(",").map((value) => Number(value));
  return { cx, cz };
}

function positiveMod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

const COLUMN_CACHE_LIMIT = 8192;

function setBoundedCache(cache, key, value) {
  if (cache.size >= COLUMN_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
}

// ---------------------------------------------------------------------------
// Shared dayFactor uniform — updated each tick from main.js
// ---------------------------------------------------------------------------
export const dayFactorUniform = { value: 1.0 };

// ---------------------------------------------------------------------------
// Material factories
// ---------------------------------------------------------------------------

// Shader patch that reads pre-baked skylight (R), blocklight (G), and AO (B)
// from vertex colors and combines them: finalBrightness = max(sky*dayFactor, bl) * ao
// with a small ambient floor so nothing is unreadably dark even underground at day.
// The Lambert diffuse color from the texture is multiplied by this factor.
function applyLightingShaderPatch(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDayFactor = dayFactorUniform;

    // Inject uniform declaration before main
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vLightColor;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <color_vertex>",
      `#include <color_vertex>
// vColor.r = skylight (0-1), vColor.g = blocklight (0-1), vColor.b = AO factor
// NOTE: in three r183 vColor is a vec4 even for 3-component color attributes,
// so take .rgb (assigning vec4 -> vec3 fails shader compilation = blank world).
vLightColor = vColor.rgb;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float uDayFactor;
varying vec3 vLightColor;`,
    );
    // Replace the built-in color_fragment entirely so it doesn't double-multiply
    // diffuseColor by vColor (which carries packed light data, not a tint color).
    // Without this replacement, Three's built-in does: diffuseColor *= vColor (wrong hue cast),
    // and then the block below multiplies again — double-application produces magenta/green tints.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `{
  // vLightColor.r = skylight (0-1), .g = blocklight (0-1), .b = AO factor
  float skyLight = vLightColor.r * uDayFactor;
  float blockLight = vLightColor.g;
  float ao = vLightColor.b;
  // Ambient floor: ensures surface is never pitch black at night.
  float ambientFloor = 0.08;
  float lightFactor = max(max(skyLight, blockLight), ambientFloor) * ao;
  diffuseColor.rgb *= lightFactor;
}`,
    );
  };
  material.needsUpdate = true;
}

export function createBlockMaterials(blockTypes, atlasTexture) {
  const baseMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: false,
    alphaTest: 0,
    vertexColors: true,
  });
  applyLightingShaderPatch(baseMaterial);

  // Alpha-cutout material for leaves (class 1)
  const alphaCutoutMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  applyLightingShaderPatch(alphaCutoutMaterial);

  // Full-transparent material for glass (class 2)
  const glassMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    alphaTest: 0.05,
    vertexColors: true,
  });
  applyLightingShaderPatch(glassMaterial);

  const materials = new Map();
  for (const block of blockTypes) {
    const tclass = BLOCK_TRANSPARENCY_CLASS[block.id] || 0;
    let mat;
    if (tclass === 2) {
      mat = glassMaterial;
    } else if (tclass === 1) {
      mat = alphaCutoutMaterial;
    } else if (block.emissive && block.emissive !== 0x000000) {
      mat = baseMaterial.clone();
      mat.emissive = new THREE.Color(block.emissive);
      mat.emissiveMap = atlasTexture;
      mat.emissiveIntensity = Number.isFinite(block.emissiveIntensity) ? block.emissiveIntensity : 0.3;
      applyLightingShaderPatch(mat);
    } else {
      mat = baseMaterial;
    }
    materials.set(block.id, mat);
  }

  // Shared opaque and transparent merged-chunk materials (with vertexColors + lighting shader).
  // These are the materials used by the merged mesher geometry.
  const opaqueMat = baseMaterial;
  const leafMat = alphaCutoutMaterial;
  const glassMat = glassMaterial;

  return { byBlock: materials, opaque: opaqueMat, leaf: leafMat, glass: glassMat };
}

// ---------------------------------------------------------------------------
// Per-face UV lookup helper (replaces buildBlockGeometry for merged mesher)
// ---------------------------------------------------------------------------
function getFaceUvRect(blockId, faceIndex) {
  const faceMap = BLOCK_FACE_TILES[blockId];
  if (!faceMap) {
    return tileUvRect("stone"); // fallback
  }
  const tileName = faceMap[FACE_KEYS[faceIndex]];
  return tileUvRect(tileName);
}

export class VoxelWorld {
  constructor({ height, chunk, blockTypes, materials, generation }) {
    this.height = height;
    this.chunkSize = chunk.size;
    this.activeRadius = chunk.activeRadius;
    this.evictRadius = Number.isFinite(chunk.evictRadius) ? chunk.evictRadius : this.activeRadius + 3;
    this.spawnSearchRadius = chunk.spawnSearchRadius;
    this.initialCenterX = chunk.initialCenterX;
    this.initialCenterZ = chunk.initialCenterZ;
    this.blockTypes = blockTypes;
    this.blockTypeIds = new Set(blockTypes.map((block) => block.id));
    // materials is now { byBlock, opaque, leaf, glass } from createBlockMaterials
    this.materials = materials;
    this.generation = {
      ...generation,
      seed: Number.isFinite(generation.seed) ? generation.seed : 1337,
    };

    this.meshGroup = new THREE.Group();
    // blockGeometries no longer used by the merged mesher but kept for compatibility
    // with any external callers that might reference it (none expected).
    this.blockGeometries = new Map();
    this.tempMatrix = new THREE.Matrix4();

    this.chunks = new Map();
    this.chunkEdits = new Map();
    this.activeChunkKeys = new Set();
    this.dirtyActiveChunkKeys = new Set();
    this.lastCenterChunk = null;

    this.surfaceHeightCache = new Map();
    this.treeInfoCache = new Map();
    this.surfaceOreNodeCache = new Map();
  }

  normalizeBlockType(type) {
    const normalized = Number.isFinite(type) ? Math.floor(type) : 0;
    if (normalized === 0) {
      return 0;
    }
    return this.blockTypeIds.has(normalized) ? normalized : 0;
  }

  get totalSolid() {
    return this.getLoadedSolidBlocks();
  }

  getLoadedChunkCount() {
    return this.activeChunkKeys.size;
  }

  getGeneratedChunkCount() {
    return this.chunks.size;
  }

  getEditCount() {
    let count = 0;
    for (const edits of this.chunkEdits.values()) {
      count += edits.size;
    }
    return count;
  }

  getLoadedSolidBlocks() {
    let total = 0;
    for (const key of this.activeChunkKeys) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        total += chunk.solidCount;
      }
    }
    return total;
  }

  index(localX, y, localZ) {
    return localX + this.chunkSize * (localZ + this.chunkSize * y);
  }

  isWithinVerticalBounds(y) {
    return y >= 0 && y < this.height;
  }

  inBounds(_x, y, _z) {
    return this.isWithinVerticalBounds(y);
  }

  toChunkPosition(worldX, worldZ) {
    const x = Math.floor(worldX);
    const z = Math.floor(worldZ);
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const localX = positiveMod(x, this.chunkSize);
    const localZ = positiveMod(z, this.chunkSize);
    return { x, z, cx, cz, localX, localZ, key: toChunkKey(cx, cz) };
  }

  // ---------------------------------------------------------------------------
  // Noise primitives (Wave 3)
  // ---------------------------------------------------------------------------
  hashLattice2(ix, iz) {
    const s = this.generation.seed | 0;
    const p = Math.sin(ix * 127.1 + iz * 311.7 + s * 5.731) * 43758.5453123;
    const q = Math.sin(ix * 269.5 + iz * 183.3 + s * 3.197 + p) * 43758.5453123;
    return q - Math.floor(q);
  }

  hashLattice3(ix, iy, iz) {
    const s = this.generation.seed | 0;
    const p = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + s * 5.731) * 43758.5453123;
    const q = Math.sin(ix * 269.5 + iy * 183.3 + iz * 417.1 + s * 3.197 + p) * 43758.5453123;
    return q - Math.floor(q);
  }

  static _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  noise2(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = VoxelWorld._fade(fx);
    const uz = VoxelWorld._fade(fz);

    const v00 = this.hashLattice2(ix,     iz);
    const v10 = this.hashLattice2(ix + 1, iz);
    const v01 = this.hashLattice2(ix,     iz + 1);
    const v11 = this.hashLattice2(ix + 1, iz + 1);

    return v00 + ux * (v10 - v00) + uz * (v01 - v00) + ux * uz * (v11 - v01 - v10 + v00);
  }

  noise3(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const ux = VoxelWorld._fade(fx);
    const uy = VoxelWorld._fade(fy);
    const uz = VoxelWorld._fade(fz);

    const v000 = this.hashLattice3(ix,     iy,     iz);
    const v100 = this.hashLattice3(ix + 1, iy,     iz);
    const v010 = this.hashLattice3(ix,     iy + 1, iz);
    const v110 = this.hashLattice3(ix + 1, iy + 1, iz);
    const v001 = this.hashLattice3(ix,     iy,     iz + 1);
    const v101 = this.hashLattice3(ix + 1, iy,     iz + 1);
    const v011 = this.hashLattice3(ix,     iy + 1, iz + 1);
    const v111 = this.hashLattice3(ix + 1, iy + 1, iz + 1);

    const x00 = v000 + ux * (v100 - v000);
    const x10 = v010 + ux * (v110 - v010);
    const x01 = v001 + ux * (v101 - v001);
    const x11 = v011 + ux * (v111 - v011);
    const y0  = x00  + uy * (x10  - x00);
    const y1  = x01  + uy * (x11  - x01);
    return y0 + uz * (y1 - y0);
  }

  fbm2(x, z, octaves, baseFreq, amplitude) {
    let value = 0;
    let freq = baseFreq;
    let amp = amplitude;
    for (let i = 0; i < octaves; i += 1) {
      value  += (this.noise2(x * freq, z * freq) - 0.5) * 2 * amp;
      freq   *= 2;
      amp    *= 0.5;
    }
    return value;
  }

  ridgedNoise2(x, z, freq) {
    const n = this.noise2(x * freq, z * freq);
    return 1 - Math.abs(2 * n - 1);
  }

  getSeed() {
    return this.generation.seed;
  }

  setSeed(seed) {
    const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 1337;
    this.generation.seed = normalized;
    this.surfaceHeightCache.clear();
    this.treeInfoCache.clear();
    this.surfaceOreNodeCache.clear();
  }

  surfaceHeight(worldX, worldZ) {
    const cacheKey = `${worldX},${worldZ}`;
    if (this.surfaceHeightCache.has(cacheKey)) {
      return this.surfaceHeightCache.get(cacheKey);
    }
    const g = this.generation;

    const hills = this.fbm2(
      worldX, worldZ,
      g.fbmOctaves,
      g.fbmBaseFrequency,
      g.fbmAmplitude,
    );

    const mountainMask = this.noise2(
      worldX * g.mountainMaskFrequency,
      worldZ * g.mountainMaskFrequency,
    );
    const ridgeRaw = this.ridgedNoise2(worldX, worldZ, g.ridgeFrequency);
    const maskBlend = THREE.MathUtils.clamp(
      (mountainMask - g.mountainMaskThreshold) / (1 - g.mountainMaskThreshold),
      0, 1,
    );
    const mountains = ridgeRaw * maskBlend * g.ridgeAmplitude;

    const value = Math.floor(g.baseHeight + hills + mountains);
    const clamped = THREE.MathUtils.clamp(value, g.minSurfaceY, this.height - g.topClearance);
    setBoundedCache(this.surfaceHeightCache, cacheKey, clamped);
    return clamped;
  }

  getTreeInfo(worldX, worldZ) {
    const cacheKey = `${worldX},${worldZ}`;
    if (this.treeInfoCache.has(cacheKey)) {
      return this.treeInfoCache.get(cacheKey);
    }
    const g = this.generation;
    const topY = this.surfaceHeight(worldX, worldZ);
    const treeNoise = this.noise2(worldX * 3 + 11, worldZ * 3 + 17);
    if (treeNoise <= g.treeThreshold || topY + g.treeTopClearance >= this.height) {
      setBoundedCache(this.treeInfoCache, cacheKey, null);
      return null;
    }
    const trunkHeight = g.trunkMinHeight + Math.floor(this.noise2(worldX + 91, worldZ + 47) * g.trunkHeightVariance);
    const info = {
      topY,
      trunkHeight,
      leafBase: topY + trunkHeight,
    };
    setBoundedCache(this.treeInfoCache, cacheKey, info);
    return info;
  }

  hasSurfaceOreNode(worldX, worldZ) {
    const cacheKey = `${worldX},${worldZ}`;
    if (this.surfaceOreNodeCache.has(cacheKey)) {
      return this.surfaceOreNodeCache.get(cacheKey);
    }
    const g = this.generation;
    const n1 = this.noise2(worldX * 1.9 + 17, worldZ * 1.9 - 23);
    const n2 = this.noise2(worldX * 3.7 - 11, worldZ * 3.7 + 29);
    const threshold = Number.isFinite(g.surfaceOreThreshold) ? g.surfaceOreThreshold : 0.968;
    const hasNode = n1 * 0.65 + n2 * 0.35 >= threshold;
    setBoundedCache(this.surfaceOreNodeCache, cacheKey, hasNode);
    return hasNode;
  }

  isCavePocketAir(worldX, y, worldZ, topY) {
    const g = this.generation;
    const caveCeilingY = Number.isFinite(g.caveCeilingY) ? g.caveCeilingY : 13;
    const caveMinRoofDepth = Number.isFinite(g.caveMinRoofDepth) ? g.caveMinRoofDepth : 3;
    if (y <= 1 || y > caveCeilingY || topY - y < caveMinRoofDepth) {
      return false;
    }

    const caveFrequency = Number.isFinite(g.caveFrequency) ? g.caveFrequency : 0.11;
    const detailFrequency = Number.isFinite(g.caveDetailFrequency) ? g.caveDetailFrequency : 0.24;
    const detailStrength = Number.isFinite(g.caveDetailStrength) ? g.caveDetailStrength : 0.22;
    const threshold = Number.isFinite(g.caveThreshold) ? g.caveThreshold : 0.78;

    const base = this.noise3(worldX * caveFrequency, y * caveFrequency * 1.31, worldZ * caveFrequency);
    const detail = this.noise3(
      worldX * detailFrequency + 13.2,
      y * detailFrequency * 1.17 - 7.6,
      worldZ * detailFrequency + 9.4,
    );
    const caveField = base + (detail - 0.5) * detailStrength;
    return caveField > threshold;
  }

  isCaveOre(worldX, y, worldZ) {
    const g = this.generation;
    const caveOreCeilingY = Number.isFinite(g.caveOreCeilingY) ? g.caveOreCeilingY : 11;
    if (y <= 1 || y > caveOreCeilingY) {
      return false;
    }
    const caveOreFrequency = Number.isFinite(g.caveOreFrequency) ? g.caveOreFrequency : 0.19;
    const caveOreThreshold = Number.isFinite(g.caveOreThreshold) ? g.caveOreThreshold : 0.942;
    const oreField =
      this.noise3(worldX * caveOreFrequency + 31.5, y * caveOreFrequency * 1.53, worldZ * caveOreFrequency - 11.7) *
        0.75 +
      this.noise2(worldX * 0.33 + y * 0.19, worldZ * 0.31 - y * 0.17) * 0.25;
    return oreField >= caveOreThreshold;
  }

  proceduralBlockTypeAt(worldX, y, worldZ) {
    if (!this.isWithinVerticalBounds(y)) {
      return 0;
    }

    if (y === 0) {
      return 13;
    }

    const g = this.generation;
    const topY = this.surfaceHeight(worldX, worldZ);
    if (y <= topY) {
      let baseType = 3;
      if (y === topY) {
        baseType = 1;
      } else if (y >= topY - 2) {
        baseType = 2;
      }

      if (baseType === 3) {
        if (this.isCavePocketAir(worldX, y, worldZ, topY)) {
          return 0;
        }

        const surfaceOreDepth = Number.isFinite(g.surfaceOreDepth) ? Math.max(1, Math.floor(g.surfaceOreDepth)) : 3;
        const surfaceDepth = topY - y;
        if (surfaceDepth >= 1 && surfaceDepth <= surfaceOreDepth && this.hasSurfaceOreNode(worldX, worldZ)) {
          return 9;
        }
        if (this.isCaveOre(worldX, y, worldZ)) {
          return 9;
        }
      }

      return baseType;
    }

    const treeAtColumn = this.getTreeInfo(worldX, worldZ);
    if (treeAtColumn && y > treeAtColumn.topY && y <= treeAtColumn.topY + treeAtColumn.trunkHeight) {
      return 4;
    }

    for (let tz = worldZ - g.leafRadius; tz <= worldZ + g.leafRadius; tz += 1) {
      for (let tx = worldX - g.leafRadius; tx <= worldX + g.leafRadius; tx += 1) {
        const tree = this.getTreeInfo(tx, tz);
        if (!tree) {
          continue;
        }
        const distance = Math.abs(worldX - tx) + Math.abs(worldZ - tz) + Math.abs(y - tree.leafBase);
        if (distance > g.leafDistanceLimit) {
          continue;
        }
        if (worldX === tx && worldZ === tz && y > tree.topY && y <= tree.topY + tree.trunkHeight) {
          continue;
        }
        return 5;
      }
    }

    return 0;
  }

  createChunk(cx, cz) {
    const key = toChunkKey(cx, cz);
    const blocks = new Uint8Array(this.chunkSize * this.chunkSize * this.height);
    let solidCount = 0;
    const baseX = cx * this.chunkSize;
    const baseZ = cz * this.chunkSize;

    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const worldX = baseX + localX;
        const worldZ = baseZ + localZ;
        for (let y = 0; y < this.height; y += 1) {
          const type = this.proceduralBlockTypeAt(worldX, y, worldZ);
          if (type === 0) {
            continue;
          }
          blocks[this.index(localX, y, localZ)] = type;
          solidCount += 1;
        }
      }
    }

    const edits = this.chunkEdits.get(key);
    if (edits) {
      for (const [idx, type] of edits.entries()) {
        const normalizedType = this.normalizeBlockType(type);
        const previous = blocks[idx];
        if (previous > 0) {
          solidCount -= 1;
        }
        if (normalizedType > 0) {
          solidCount += 1;
        }
        blocks[idx] = normalizedType;
      }
    }

    return {
      key,
      cx,
      cz,
      blocks,
      solidCount,
      dirtyMesh: true,
      meshes: [],
    };
  }

  ensureChunk(cx, cz) {
    const key = toChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.createChunk(cx, cz);
      this.chunks.set(key, chunk);
    } else if (!chunk.blocks) {
      const regenerated = this.createChunk(cx, cz);
      chunk.blocks = regenerated.blocks;
      chunk.solidCount = regenerated.solidCount;
      chunk.dirtyMesh = true;
    }
    return chunk;
  }

  get(worldX, y, worldZ) {
    if (!this.isWithinVerticalBounds(y)) {
      return 0;
    }
    const pos = this.toChunkPosition(worldX, worldZ);
    const chunk = this.ensureChunk(pos.cx, pos.cz);
    return chunk.blocks[this.index(pos.localX, y, pos.localZ)];
  }

  set(worldX, y, worldZ, type, markDirty = true, trackEdit = true) {
    if (!this.isWithinVerticalBounds(y)) {
      return false;
    }
    const pos = this.toChunkPosition(worldX, worldZ);
    const chunk = this.ensureChunk(pos.cx, pos.cz);
    const idx = this.index(pos.localX, y, pos.localZ);
    const nextType = this.normalizeBlockType(type);
    const previous = chunk.blocks[idx];
    if (previous === nextType) {
      return false;
    }

    chunk.blocks[idx] = nextType;
    if (previous > 0) {
      chunk.solidCount -= 1;
    }
    if (nextType > 0) {
      chunk.solidCount += 1;
    }

    if (trackEdit) {
      const proceduralType = this.proceduralBlockTypeAt(pos.x, y, pos.z);
      let edits = this.chunkEdits.get(pos.key);
      if (nextType === proceduralType) {
        if (edits) {
          edits.delete(idx);
          if (edits.size === 0) {
            this.chunkEdits.delete(pos.key);
          }
        }
      } else {
        if (!edits) {
          edits = new Map();
          this.chunkEdits.set(pos.key, edits);
        }
        edits.set(idx, nextType);
      }
    }

    if (markDirty) {
      this.markChunkDirty(pos.cx, pos.cz, true);
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Per-face exposure check (transparency-class aware)
  // ---------------------------------------------------------------------------
  isFaceExposed(worldX, y, worldZ, faceIndex) {
    const selfType = this.get(worldX, y, worldZ);
    const selfClass = BLOCK_TRANSPARENCY_CLASS[selfType] || 0;
    const [dx, dy, dz] = CARDINAL_DIRECTIONS[faceIndex];
    const neighborType = this.get(worldX + dx, y + dy, worldZ + dz);
    if (neighborType === 0) {
      return true;
    }
    const neighborClass = BLOCK_TRANSPARENCY_CLASS[neighborType] || 0;
    // Opaque behind transparent: show face
    if (neighborClass !== 0 && selfClass === 0) {
      return true;
    }
    // Transparent next to different-class or opaque: show face
    if (selfClass !== 0 && neighborClass !== selfClass) {
      return true;
    }
    return false;
  }

  // Legacy whole-block check (kept for compatibility)
  hasExposedFace(worldX, y, worldZ) {
    for (let f = 0; f < 6; f += 1) {
      if (this.isFaceExposed(worldX, y, worldZ, f)) {
        return true;
      }
    }
    return false;
  }

  findSurfaceY(worldX, worldZ) {
    for (let y = this.height - 1; y >= 0; y -= 1) {
      if (this.get(worldX, y, worldZ) > 0) {
        return y;
      }
    }
    return 0;
  }

  decodeIndex(index) {
    const layerArea = this.chunkSize * this.chunkSize;
    const y = Math.floor(index / layerArea);
    const remainder = index - y * layerArea;
    const localZ = Math.floor(remainder / this.chunkSize);
    const localX = remainder % this.chunkSize;
    return { localX, y, localZ };
  }

  exportEdits() {
    const edits = [];
    for (const [key, chunkEdits] of this.chunkEdits.entries()) {
      const { cx, cz } = fromChunkKey(key);
      for (const [idx, type] of chunkEdits.entries()) {
        const { localX, y, localZ } = this.decodeIndex(idx);
        edits.push({
          x: cx * this.chunkSize + localX,
          y,
          z: cz * this.chunkSize + localZ,
          type,
        });
      }
    }
    return edits;
  }

  importEdits(rawEdits) {
    this.chunkEdits.clear();
    if (!Array.isArray(rawEdits)) {
      return;
    }
    for (const edit of rawEdits) {
      if (!edit || !Number.isFinite(edit.x) || !Number.isFinite(edit.y) || !Number.isFinite(edit.z)) {
        continue;
      }
      const y = Math.floor(edit.y);
      if (!this.isWithinVerticalBounds(y)) {
        continue;
      }
      const type = this.normalizeBlockType(edit.type);
      const pos = this.toChunkPosition(edit.x, edit.z);
      const idx = this.index(pos.localX, y, pos.localZ);
      let chunkEditMap = this.chunkEdits.get(pos.key);
      if (!chunkEditMap) {
        chunkEditMap = new Map();
        this.chunkEdits.set(pos.key, chunkEditMap);
      }
      chunkEditMap.set(idx, type);
    }
  }

  // ---------------------------------------------------------------------------
  // Light BFS — skylight + blocklight per chunk
  // ---------------------------------------------------------------------------
  // Returns a Float32Array[chunkSize * chunkSize * height] for both skylight and blocklight.
  // Values are 0..15. BFS crosses chunk boundaries via world.get() on neighbour chunks.
  computeChunkLight(cx, cz) {
    const S = this.chunkSize;
    const H = this.height;
    const volume = S * S * H;
    const skylight = new Float32Array(volume);   // 0..15
    const blocklight = new Float32Array(volume); // 0..15

    // Light index: local coords within the extended sampling region.
    // We compute light in the chunk's own S*S*H volume, but BFS reads neighbours
    // via world.get(worldX, y, worldZ) so boundary handling is automatic.
    const baseX = cx * S;
    const baseZ = cz * S;

    const lIndex = (lx, ly, lz) => lx + S * (lz + S * ly);

    // ---------- SKYLIGHT ----------
    // Phase 1: flood straight down from the top (full 15 for open sky columns).
    // A column is "open" if every voxel above it (going down from height-1) is air.
    for (let lz = 0; lz < S; lz += 1) {
      for (let lx = 0; lx < S; lx += 1) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        let open = true;
        for (let y = H - 1; y >= 0; y -= 1) {
          const block = this.get(wx, y, wz);
          if (block !== 0) {
            open = false;
          }
          if (open) {
            skylight[lIndex(lx, y, lz)] = 15;
          }
        }
      }
    }

    // Phase 2: BFS to spread skylight sideways into shadowed areas.
    // Queue stores [worldX, y, worldZ, level]. We only propagate within a
    // reasonable border around the chunk to limit cost while covering seams.
    const SKY_SPREAD = 15; // max skylight value = max propagation range
    const queue = [];
    // Seed the queue from every lit voxel on the chunk boundary columns
    // (the boundary between the chunk and its neighbours needs proper seam handling).
    // For efficiency: seed from the 4 neighbour faces (1 block deep into neighbours).
    const seedSky = (wx, y, wz, level) => {
      const lx = wx - baseX;
      const lz = wz - baseZ;
      if (lx >= 0 && lx < S && lz >= 0 && lz < S) {
        const idx = lIndex(lx, y, lz);
        if (level > skylight[idx]) {
          skylight[idx] = level;
          queue.push(wx, y, wz, level);
        }
      }
    };

    // Seed from already-computed column values (in-chunk skylight we set above)
    for (let lz = 0; lz < S; lz += 1) {
      for (let lx = 0; lx < S; lx += 1) {
        for (let y = 0; y < H; y += 1) {
          const level = skylight[lIndex(lx, y, lz)];
          if (level > 0) {
            queue.push(baseX + lx, y, baseZ + lz, level);
          }
        }
      }
    }

    // Seed seam skylight from the neighbour chunk's already-computed skylight buffer
    // (at the neighbour-side edge voxel, reduced by 1), not from a re-derived sky-open test.
    // This prevents cave voxels at chunk edges being flooded to 15 just because the
    // adjacent chunk column happens to be open sky.
    // If the neighbour chunk's buffer isn't available yet, seed nothing — the chunk will
    // be re-meshed when the neighbour finishes computing.
    for (let side = 0; side < 4; side += 1) {
      const [ndx, ndz] = side === 0 ? [1, 0] : side === 1 ? [-1, 0] : side === 2 ? [0, 1] : [0, -1];
      const lxBase = ndx === 1 ? S - 1 : ndx === -1 ? 0 : null;
      const lzBase = ndz === 1 ? S - 1 : ndz === -1 ? 0 : null;

      const nCx = cx + ndx;
      const nCz = cz + ndz;
      const neighbourChunk = this.chunks.get(toChunkKey(nCx, nCz));
      const neighbourSky = neighbourChunk ? neighbourChunk.skylight : null;

      if (lxBase !== null) {
        // X-axis neighbour: the neighbour's edge lx is (ndx===1 ? 0 : S-1)
        const nLxEdge = ndx === 1 ? 0 : S - 1;
        for (let lz = 0; lz < S; lz += 1) {
          const wx = baseX + lxBase;
          const wz = baseZ + lz;
          if (neighbourSky) {
            for (let y = 0; y < H; y += 1) {
              const nLevel = neighbourSky[lIndex(nLxEdge, y, lz)];
              if (nLevel > 1) {
                seedSky(wx, y, wz, nLevel - 1);
              }
            }
          }
          // No fallback seeding when neighbour buffer missing.
        }
      } else {
        // Z-axis neighbour: the neighbour's edge lz is (ndz===1 ? 0 : S-1)
        const nLzEdge = ndz === 1 ? 0 : S - 1;
        for (let lx = 0; lx < S; lx += 1) {
          const wx = baseX + lx;
          const wz = baseZ + lzBase;
          if (neighbourSky) {
            for (let y = 0; y < H; y += 1) {
              const nLevel = neighbourSky[lIndex(lx, y, nLzEdge)];
              if (nLevel > 1) {
                seedSky(wx, y, wz, nLevel - 1);
              }
            }
          }
          // No fallback seeding when neighbour buffer missing.
        }
      }
    }

    // BFS propagation for skylight
    let qi = 0;
    while (qi < queue.length) {
      const wx = queue[qi];
      const y  = queue[qi + 1];
      const wz = queue[qi + 2];
      const level = queue[qi + 3];
      qi += 4;

      if (level <= 1) continue;
      const nextLevel = level - 1;

      for (const [ddx, ddy, ddz] of CARDINAL_DIRECTIONS) {
        const nx = wx + ddx;
        const ny = y  + ddy;
        const nz = wz + ddz;
        if (ny < 0 || ny >= H) continue;
        const nlx = nx - baseX;
        const nlz = nz - baseZ;
        if (nlx < 0 || nlx >= S || nlz < 0 || nlz >= S) continue;
        const nidx = lIndex(nlx, ny, nlz);
        if (nextLevel <= skylight[nidx]) continue;
        // Only propagate through air / transparent blocks
        const block = this.get(nx, ny, nz);
        if (block !== 0) continue;
        skylight[nidx] = nextLevel;
        queue.push(nx, ny, nz, nextLevel);
      }
    }

    // ---------- BLOCKLIGHT ----------
    const blQueue = [];
    // Seed from emissive blocks inside the chunk
    for (let lz = 0; lz < S; lz += 1) {
      for (let lx = 0; lx < S; lx += 1) {
        for (let y = 0; y < H; y += 1) {
          const block = this.get(baseX + lx, y, baseZ + lz);
          const emit = BLOCK_LIGHT_EMIT[block] || 0;
          if (emit > 0) {
            const idx = lIndex(lx, y, lz);
            if (emit > blocklight[idx]) {
              blocklight[idx] = emit;
              blQueue.push(baseX + lx, y, baseZ + lz, emit);
            }
          }
        }
      }
    }
    // Seed cross-chunk blocklight from the neighbour's already-computed blocklight buffer
    // at the adjacent edge voxel (value-1), not from raw emissive sources at the edge.
    // A torch 5 blocks deep in a neighbour has propagated level ~9 at the seam — seeding
    // only emit-1 from the source misses that propagated glow entirely.
    for (let side = 0; side < 4; side += 1) {
      const [ndx, ndz] = side === 0 ? [1, 0] : side === 1 ? [-1, 0] : side === 2 ? [0, 1] : [0, -1];
      const lxEdge = ndx === 1 ? S - 1 : ndx === -1 ? 0 : null;
      const lzEdge = ndz === 1 ? S - 1 : ndz === -1 ? 0 : null;

      const nCx = cx + ndx;
      const nCz = cz + ndz;
      const neighbourChunk = this.chunks.get(toChunkKey(nCx, nCz));
      const neighbourBL = neighbourChunk ? neighbourChunk.blocklight : null;

      if (lxEdge !== null) {
        // X-axis neighbour edge
        const nLxEdge = ndx === 1 ? 0 : S - 1;
        if (neighbourBL) {
          for (let lz = 0; lz < S; lz += 1) {
            for (let y = 0; y < H; y += 1) {
              const nLevel = neighbourBL[lIndex(nLxEdge, y, lz)];
              if (nLevel > 1) {
                const eidx = lIndex(lxEdge, y, lz);
                const reduced = nLevel - 1;
                if (reduced > blocklight[eidx]) {
                  blocklight[eidx] = reduced;
                  blQueue.push(baseX + lxEdge, y, baseZ + lz, reduced);
                }
              }
            }
          }
        }
      } else {
        // Z-axis neighbour edge
        const nLzEdge = ndz === 1 ? 0 : S - 1;
        if (neighbourBL) {
          for (let lx = 0; lx < S; lx += 1) {
            for (let y = 0; y < H; y += 1) {
              const nLevel = neighbourBL[lIndex(lx, y, nLzEdge)];
              if (nLevel > 1) {
                const eidx = lIndex(lx, y, lzEdge);
                const reduced = nLevel - 1;
                if (reduced > blocklight[eidx]) {
                  blocklight[eidx] = reduced;
                  blQueue.push(baseX + lx, y, baseZ + lzEdge, reduced);
                }
              }
            }
          }
        }
      }
    }

    // BFS propagation for blocklight
    let bqi = 0;
    while (bqi < blQueue.length) {
      const wx = blQueue[bqi];
      const y  = blQueue[bqi + 1];
      const wz = blQueue[bqi + 2];
      const level = blQueue[bqi + 3];
      bqi += 4;

      if (level <= 1) continue;
      const nextLevel = level - 1;

      for (const [ddx, ddy, ddz] of CARDINAL_DIRECTIONS) {
        const nx = wx + ddx;
        const ny = y  + ddy;
        const nz = wz + ddz;
        if (ny < 0 || ny >= H) continue;
        const nlx = nx - baseX;
        const nlz = nz - baseZ;
        if (nlx < 0 || nlx >= S || nlz < 0 || nlz >= S) continue;
        const nidx = lIndex(nlx, ny, nlz);
        if (nextLevel <= blocklight[nidx]) continue;
        const block = this.get(nx, ny, nz);
        if (block !== 0) continue;
        blocklight[nidx] = nextLevel;
        blQueue.push(nx, ny, nz, nextLevel);
      }
    }

    // Persist the computed buffers on the chunk so the mesher and neighbour chunks
    // can read seam light values without re-running the BFS.
    const chunkObj = this.chunks.get(toChunkKey(cx, cz));
    if (chunkObj) {
      chunkObj.skylight   = skylight;
      chunkObj.blocklight = blocklight;
    }

    return { skylight, blocklight };
  }

  // ---------------------------------------------------------------------------
  // AO helper: compute occlusion level (0..3) for one vertex of a face.
  // side1, side2, corner are [dx,dy,dz] relative to the voxel being meshed.
  // ---------------------------------------------------------------------------
  computeAO(worldX, y, worldZ, side1, side2, corner) {
    const s1 = this.get(worldX + side1[0], y + side1[1], worldZ + side1[2]) !== 0 ? 1 : 0;
    const s2 = this.get(worldX + side2[0], y + side2[1], worldZ + side2[2]) !== 0 ? 1 : 0;
    const co = this.get(worldX + corner[0], y + corner[1], worldZ + corner[2]) !== 0 ? 1 : 0;
    if (s1 && s2) {
      // Corner fully enclosed by two solid sides
      return 3;
    }
    return s1 + s2 + co;
  }

  // AO level -> colour multiplier. Minecraft-style darkening.
  static aoFactor(level) {
    // level 0: no occlusion (1.0), level 3: heavily occluded (0.4)
    return 1.0 - level * 0.2;
  }

  // ---------------------------------------------------------------------------
  // Merged-geometry chunk mesher
  // ---------------------------------------------------------------------------
  disposeChunkMeshes(chunk) {
    for (const mesh of chunk.meshes) {
      this.meshGroup.remove(mesh);
      // Dispose the per-chunk merged geometry (not shared, unlike the old InstancedMesh).
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Do NOT dispose materials — they're shared across all chunks.
    }
    chunk.meshes.length = 0;
  }

  buildChunkMesh(cx, cz) {
    const chunk = this.ensureChunk(cx, cz);
    this.disposeChunkMeshes(chunk);

    const S = this.chunkSize;
    const H = this.height;
    const baseX = cx * S;
    const baseZ = cz * S;

    // Compute lighting for this chunk
    const { skylight, blocklight } = this.computeChunkLight(cx, cz);
    const lIndex = (lx, ly, lz) => lx + S * (lz + S * ly);

    // Geometry buffers for opaque and transparent faces.
    // We keep leaves and glass separate because they need different material params.
    const opaquePos  = [];
    const opaqueNorm = [];
    const opaqueUv   = [];
    const opaqueCol  = [];
    const opaqueIdx  = [];
    const leafPos    = [];
    const leafNorm   = [];
    const leafUv     = [];
    const leafCol    = [];
    const leafIdx    = [];
    const glassPos   = [];
    const glassNorm  = [];
    const glassUv    = [];
    const glassCol   = [];
    const glassIdx   = [];

    for (let lz = 0; lz < S; lz += 1) {
      for (let lx = 0; lx < S; lx += 1) {
        const worldX = baseX + lx;
        const worldZ = baseZ + lz;
        for (let y = 0; y < H; y += 1) {
          const blockType = chunk.blocks[this.index(lx, y, lz)];
          if (blockType === 0) continue;

          const tclass = BLOCK_TRANSPARENCY_CLASS[blockType] || 0;

          // Pick which buffer set to push into
          let posArr, normArr, uvArr, colArr, idxArr;
          if (tclass === 2) {
            posArr  = glassPos;  normArr = glassNorm; uvArr = glassUv;
            colArr  = glassCol;  idxArr  = glassIdx;
          } else if (tclass === 1) {
            posArr  = leafPos;   normArr = leafNorm;  uvArr = leafUv;
            colArr  = leafCol;   idxArr  = leafIdx;
          } else {
            posArr  = opaquePos; normArr = opaqueNorm; uvArr = opaqueUv;
            colArr  = opaqueCol; idxArr  = opaqueIdx;
          }

          for (let f = 0; f < 6; f += 1) {
            if (!this.isFaceExposed(worldX, y, worldZ, f)) continue;

            // UV rect for this block/face
            const { uMin, uMax, vMin, vMax } = getFaceUvRect(blockType, f);

            // Vertex positions (4 verts for a quad)
            const fverts = FACE_VERTS[f];
            const [nx, ny, nz] = FACE_NORMALS[f];
            const aoNeighbours = FACE_AO_NEIGHBOURS[f];

            // Compute AO for each of the 4 vertices
            const ao = [0, 0, 0, 0];
            for (let v = 0; v < 4; v += 1) {
              const [s1, s2, co] = aoNeighbours[v];
              ao[v] = this.computeAO(worldX, y, worldZ, s1, s2, co);
            }

            // Skylight and blocklight for the face — sample the voxel on the far side of the face
            // (the air voxel this face looks into), then use that voxel's light level.
            const [fdx, fdy, fdz] = CARDINAL_DIRECTIONS[f];
            const faceAirX = worldX + fdx;
            const faceAirY = y + fdy;
            const faceAirZ = worldZ + fdz;
            const fairLX = faceAirX - baseX;
            const fairLZ = faceAirZ - baseZ;
            let faceSkylight = 0;
            let faceBlocklight = 0;
            if (faceAirY >= 0 && faceAirY < H &&
                fairLX >= 0 && fairLX < S && fairLZ >= 0 && fairLZ < S) {
              // Face air voxel is inside this chunk — use the chunk's own light buffer.
              faceSkylight   = skylight[lIndex(fairLX, faceAirY, fairLZ)];
              faceBlocklight = blocklight[lIndex(fairLX, faceAirY, fairLZ)];
            } else if (faceAirY >= H) {
              // Above world top: full skylight (open sky above the build height).
              faceSkylight = 15;
            } else if (faceAirY >= 0 && faceAirY < H) {
              // Face looks into a neighbour chunk (fairLX or fairLZ out of [0,S)).
              // Read the neighbour's persisted light buffer at the adjacent edge voxel.
              // Falls back to 0 (dark seam) if the neighbour hasn't been lit yet — far
              // less jarring than the previous full-bright (15) heuristic in caves.
              const nCx = Math.floor(faceAirX / S);
              const nCz = Math.floor(faceAirZ / S);
              const neighbourChunk = this.chunks.get(toChunkKey(nCx, nCz));
              if (neighbourChunk && neighbourChunk.skylight) {
                const nLx = positiveMod(faceAirX, S);
                const nLz = positiveMod(faceAirZ, S);
                const nIdx = lIndex(nLx, faceAirY, nLz);
                faceSkylight   = neighbourChunk.skylight[nIdx];
                faceBlocklight = neighbourChunk.blocklight[nIdx];
              }
              // else: both remain 0 — under-dark seam until neighbour is built.
            }

            // Flipped-quad rule: if AO is asymmetric (ao[0]+ao[3] != ao[1]+ao[2]),
            // flip the triangulation to avoid the diagonal dark-stripe artifact.
            // Standard quad verts: [bl=0, br=1, tl=2, tr=3]
            // Standard triangles: [0,1,2] and [1,3,2]
            // Flipped triangles: [0,1,3] and [0,3,2]
            const flip = ao[0] + ao[3] > ao[1] + ao[2];

            const baseVertex = posArr.length / 3;

            for (let v = 0; v < 4; v += 1) {
              const [bx, by, bz] = fverts[v];
              posArr.push(worldX + bx, y + by, worldZ + bz);
              normArr.push(nx, ny, nz);

              // UV: map FACE_UV_INDICES onto [uMin..uMax, vMin..vMax]
              const [ut, vt] = FACE_UV_INDICES[v];
              const u = ut === 0 ? uMin : uMax;
              const vv = vt === 0 ? vMin : vMax;
              uvArr.push(u, vv);

              // Vertex color: R=skylight, G=blocklight, B=AO factor
              const aoF = VoxelWorld.aoFactor(ao[v]);
              colArr.push(
                faceSkylight   / 15.0,
                faceBlocklight / 15.0,
                aoF,
              );
            }

            // Two triangles forming the quad.
            // PY (+Y) and NY (-Y) face vertices are wound CW relative to their outward normal
            // in FACE_VERTS (a Wave-4 regression; PX/NX/PZ/NZ are correct). Reverse their
            // index order so the outward normal is CCW — THREE.FrontSide culls otherwise.
            // Vertex positions, UVs, AO, and colours are left in FACE_VERTS order.
            const pyOrNy = (f === FACE_PY || f === FACE_NY);
            if (!flip) {
              if (pyOrNy) {
                // Reversed: (0,2,1, 1,2,3)
                idxArr.push(
                  baseVertex, baseVertex + 2, baseVertex + 1,
                  baseVertex + 1, baseVertex + 2, baseVertex + 3,
                );
              } else {
                idxArr.push(
                  baseVertex, baseVertex + 1, baseVertex + 2,
                  baseVertex + 1, baseVertex + 3, baseVertex + 2,
                );
              }
            } else {
              if (pyOrNy) {
                // Reversed flip: (0,3,1, 0,2,3)
                idxArr.push(
                  baseVertex, baseVertex + 3, baseVertex + 1,
                  baseVertex, baseVertex + 2, baseVertex + 3,
                );
              } else {
                idxArr.push(
                  baseVertex, baseVertex + 1, baseVertex + 3,
                  baseVertex, baseVertex + 3, baseVertex + 2,
                );
              }
            }
          }
        }
      }
    }

    // Build Three.js meshes from the accumulated buffers
    const makeGeometry = (pos, norm, uv, col, idx) => {
      if (idx.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal",   new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute("color",    new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      return geo;
    };

    const mats = this.materials;

    const opaqueGeo = makeGeometry(opaquePos, opaqueNorm, opaqueUv, opaqueCol, opaqueIdx);
    if (opaqueGeo) {
      const mesh = new THREE.Mesh(opaqueGeo, mats.opaque);
      chunk.meshes.push(mesh);
      this.meshGroup.add(mesh);
    }

    const leafGeo = makeGeometry(leafPos, leafNorm, leafUv, leafCol, leafIdx);
    if (leafGeo) {
      const mesh = new THREE.Mesh(leafGeo, mats.leaf);
      mesh.renderOrder = 1;
      chunk.meshes.push(mesh);
      this.meshGroup.add(mesh);
    }

    const glassGeo = makeGeometry(glassPos, glassNorm, glassUv, glassCol, glassIdx);
    if (glassGeo) {
      const mesh = new THREE.Mesh(glassGeo, mats.glass);
      mesh.renderOrder = 2;
      chunk.meshes.push(mesh);
      this.meshGroup.add(mesh);
    }

    chunk.dirtyMesh = false;
    this.dirtyActiveChunkKeys.delete(chunk.key);
  }

  markChunkDirty(cx, cz, includeNeighbors = false) {
    const markOne = (chunkX, chunkZ) => {
      const key = toChunkKey(chunkX, chunkZ);
      const chunk = this.chunks.get(key);
      if (!chunk) {
        return;
      }
      chunk.dirtyMesh = true;
      if (this.activeChunkKeys.has(key)) {
        this.dirtyActiveChunkKeys.add(key);
      }
    };

    markOne(cx, cz);
    if (!includeNeighbors) {
      return;
    }
    // Cardinal neighbours
    markOne(cx + 1, cz);
    markOne(cx - 1, cz);
    markOne(cx, cz + 1);
    markOne(cx, cz - 1);
    // Diagonal neighbours: required for torches near chunk corners (emit=14,
    // radius can reach 13 blocks, easily crossing into a diagonal chunk).
    // Without these, blocklight from a placed/broken torch persists or fails to
    // appear in the diagonal neighbour after cross-seam propagation is corrected.
    markOne(cx + 1, cz + 1);
    markOne(cx + 1, cz - 1);
    markOne(cx - 1, cz + 1);
    markOne(cx - 1, cz - 1);
  }

  ensureActiveChunksAround(worldX, worldZ) {
    const pos = this.toChunkPosition(worldX, worldZ);
    const centerKey = toChunkKey(pos.cx, pos.cz);
    const centerChanged = !this.lastCenterChunk || this.lastCenterChunk !== centerKey;
    if (centerChanged) {
      const desired = new Set();
      for (let dz = -this.activeRadius; dz <= this.activeRadius; dz += 1) {
        for (let dx = -this.activeRadius; dx <= this.activeRadius; dx += 1) {
          const cx = pos.cx + dx;
          const cz = pos.cz + dz;
          const key = toChunkKey(cx, cz);
          desired.add(key);
          if (!this.activeChunkKeys.has(key)) {
            this.ensureChunk(cx, cz);
            this.activeChunkKeys.add(key);
            this.dirtyActiveChunkKeys.add(key);
          }
        }
      }

      for (const key of Array.from(this.activeChunkKeys)) {
        if (desired.has(key)) {
          continue;
        }
        const chunk = this.chunks.get(key);
        if (chunk) {
          this.disposeChunkMeshes(chunk);
        }
        this.activeChunkKeys.delete(key);
        this.dirtyActiveChunkKeys.delete(key);
      }

      for (const [key, chunk] of this.chunks.entries()) {
        if (!chunk.blocks) {
          continue;
        }
        const { cx, cz } = fromChunkKey(key);
        const dist = Math.max(Math.abs(cx - pos.cx), Math.abs(cz - pos.cz));
        if (dist > this.evictRadius) {
          chunk.blocks = null;
          chunk.solidCount = 0;
          chunk.dirtyMesh = true;
        }
      }

      this.lastCenterChunk = centerKey;
    }

    for (const key of Array.from(this.dirtyActiveChunkKeys)) {
      if (!this.activeChunkKeys.has(key)) {
        this.dirtyActiveChunkKeys.delete(key);
        continue;
      }
      const { cx, cz } = fromChunkKey(key);
      this.buildChunkMesh(cx, cz);
    }
  }

  getSpawnCenter() {
    return {
      x: this.initialCenterX * this.chunkSize + Math.floor(this.chunkSize / 2),
      z: this.initialCenterZ * this.chunkSize + Math.floor(this.chunkSize / 2),
    };
  }

  clearChunkRuntime() {
    for (const chunk of this.chunks.values()) {
      this.disposeChunkMeshes(chunk);
    }
    this.chunks.clear();
    this.activeChunkKeys.clear();
    this.dirtyActiveChunkKeys.clear();
    this.lastCenterChunk = null;
    this.surfaceHeightCache.clear();
    this.treeInfoCache.clear();
    this.surfaceOreNodeCache.clear();
  }

  clear() {
    this.clearChunkRuntime();
    this.chunkEdits.clear();
  }

  generateTerrain(options = {}) {
    const { preserveEdits = false } = options;
    if (!preserveEdits) {
      this.chunkEdits.clear();
    }
    this.clearChunkRuntime();
    const center = this.getSpawnCenter();
    this.ensureActiveChunksAround(center.x, center.z);
  }

  rebuildMeshes() {
    for (const key of this.activeChunkKeys) {
      this.dirtyActiveChunkKeys.add(key);
    }
    if (this.lastCenterChunk) {
      const { cx, cz } = fromChunkKey(this.lastCenterChunk);
      const worldX = cx * this.chunkSize + Math.floor(this.chunkSize / 2);
      const worldZ = cz * this.chunkSize + Math.floor(this.chunkSize / 2);
      this.ensureActiveChunksAround(worldX, worldZ);
      return;
    }
    const center = this.getSpawnCenter();
    this.ensureActiveChunksAround(center.x, center.z);
  }
}
