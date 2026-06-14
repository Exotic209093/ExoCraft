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

// One shared material per emissive variant. Most blocks use the opaque atlas material;
// emissive blocks (torch, copper ore) use a tinted clone so they self-light.
// Transparent blocks (glass, leaves) use alpha-aware clones.
export function createBlockMaterials(blockTypes, atlasTexture) {
  const baseMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: false,
    alphaTest: 0,
  });
  // Alpha-cutout material for leaves (class 1): geometry stays opaque, sky peeks
  // through pixels below the alpha threshold — no depth-sort needed.
  const alphaCutoutMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  // Full-transparent material for glass (class 2): depth-sorted, no depthWrite so
  // blocks behind render correctly.
  const glassMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    alphaTest: 0.05,
  });

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
    } else {
      mat = baseMaterial;
    }
    materials.set(block.id, mat);
  }
  return materials;
}

// Build a unit cube geometry whose six faces have UVs pointing at the right atlas tiles.
// Three.js BoxGeometry stores faces in this order: +X, -X, +Y, -Y, +Z, -Z, with
// 4 vertices per face (top-left, top-right, bottom-left, bottom-right) and
// default UVs (0,1), (1,1), (0,0), (1,0).
function buildBlockGeometry(blockId) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const faceMap = BLOCK_FACE_TILES[blockId];
  if (!faceMap) {
    return geometry;
  }
  const faceOrder = ["px", "nx", "py", "ny", "pz", "nz"];
  const uvAttr = geometry.getAttribute("uv");
  for (let face = 0; face < 6; face += 1) {
    const tileName = faceMap[faceOrder[face]];
    const { uMin, uMax, vMin, vMax } = tileUvRect(tileName);
    const offset = face * 4;
    // Vertex 0: top-left -> (uMin, vMax)
    uvAttr.setXY(offset + 0, uMin, vMax);
    // Vertex 1: top-right -> (uMax, vMax)
    uvAttr.setXY(offset + 1, uMax, vMax);
    // Vertex 2: bottom-left -> (uMin, vMin)
    uvAttr.setXY(offset + 2, uMin, vMin);
    // Vertex 3: bottom-right -> (uMax, vMin)
    uvAttr.setXY(offset + 3, uMax, vMin);
  }
  uvAttr.needsUpdate = true;
  return geometry;
}

export class VoxelWorld {
  constructor({ height, chunk, blockTypes, materials, generation }) {
    this.height = height;
    this.chunkSize = chunk.size;
    this.activeRadius = chunk.activeRadius;
    // evictRadius: chunks whose Chebyshev distance from the player's chunk exceeds
    // this value have their voxel data (Uint8Array) freed. They regenerate identically
    // on re-entry because generation is deterministic and chunkEdits survive.
    this.evictRadius = Number.isFinite(chunk.evictRadius) ? chunk.evictRadius : this.activeRadius + 3;
    this.spawnSearchRadius = chunk.spawnSearchRadius;
    this.initialCenterX = chunk.initialCenterX;
    this.initialCenterZ = chunk.initialCenterZ;
    this.blockTypes = blockTypes;
    this.blockTypeIds = new Set(blockTypes.map((block) => block.id));
    this.materials = materials;
    this.generation = {
      ...generation,
      seed: Number.isFinite(generation.seed) ? generation.seed : 1337,
    };

    this.meshGroup = new THREE.Group();
    this.blockGeometries = new Map();
    for (const block of blockTypes) {
      this.blockGeometries.set(block.id, buildBlockGeometry(block.id));
    }
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
  // Pure seeded hash for a 2-D lattice point. Returns [0,1).
  // Uses two orthogonal sin-hash passes to break up the strong grid artefacts
  // that a single-sin hash produces at low frequencies.
  hashLattice2(ix, iz) {
    const s = this.generation.seed | 0;
    // First pass: fold ix, iz and seed into a scalar
    const p = Math.sin(ix * 127.1 + iz * 311.7 + s * 5.731) * 43758.5453123;
    const q = Math.sin(ix * 269.5 + iz * 183.3 + s * 3.197 + p) * 43758.5453123;
    return q - Math.floor(q);
  }

  // Pure seeded hash for a 3-D lattice point. Returns [0,1).
  hashLattice3(ix, iy, iz) {
    const s = this.generation.seed | 0;
    const p = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + s * 5.731) * 43758.5453123;
    const q = Math.sin(ix * 269.5 + iy * 183.3 + iz * 417.1 + s * 3.197 + p) * 43758.5453123;
    return q - Math.floor(q);
  }

  // Smoothstep (Ken Perlin's fade): 6t^5 - 15t^4 + 10t^3
  static _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // Bilinear interpolated value noise, returns [0,1).
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

  // Trilinear interpolated value noise, returns [0,1).
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

    // Trilinear interpolation
    const x00 = v000 + ux * (v100 - v000);
    const x10 = v010 + ux * (v110 - v010);
    const x01 = v001 + ux * (v101 - v001);
    const x11 = v011 + ux * (v111 - v011);
    const y0  = x00  + uy * (x10  - x00);
    const y1  = x01  + uy * (x11  - x01);
    return y0 + uz * (y1 - y0);
  }

  // Fractal Brownian Motion (2D): sum of octaves with halving amplitude / doubling freq.
  // Returns roughly [-amplitude, +amplitude] centred on 0.
  fbm2(x, z, octaves, baseFreq, amplitude) {
    let value = 0;
    let freq = baseFreq;
    let amp = amplitude;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i += 1) {
      value  += (this.noise2(x * freq, z * freq) - 0.5) * 2 * amp;
      maxAmp += amp;
      freq   *= 2;
      amp    *= 0.5;
    }
    // Normalise so the return range stays proportional to amplitude regardless of octaves
    return value;
  }

  // Ridged noise (2D): 1 - |2*noise - 1|, gives sharp ridge lines.
  // Returns [0,1] where 1 is the ridge peak.
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

    // Layer 1: rolling hills via FBM (returns roughly ±fbmAmplitude)
    const hills = this.fbm2(
      worldX, worldZ,
      g.fbmOctaves,
      g.fbmBaseFrequency,
      g.fbmAmplitude,
    );

    // Layer 2: mountain ridges, activated only where a low-frequency mask is high.
    // The mask itself is a smooth noise sample — patches of land become mountainous,
    // while surrounding areas stay as rolling hills.
    const mountainMask = this.noise2(
      worldX * g.mountainMaskFrequency,
      worldZ * g.mountainMaskFrequency,
    );
    const ridgeRaw = this.ridgedNoise2(worldX, worldZ, g.ridgeFrequency);
    // Smoothly blend the ridged term in above the mask threshold so there's no
    // hard seam at the mountain border.
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

    // Bedrock: always present at y=0.
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
      // Voxel data was evicted — regenerate it in-place. Meshes were already
      // disposed when the chunk left the active set; chunkEdits are intact.
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

  hasExposedFace(worldX, y, worldZ) {
    const selfType = this.get(worldX, y, worldZ);
    const selfClass = BLOCK_TRANSPARENCY_CLASS[selfType] || 0;
    for (const [dx, dy, dz] of CARDINAL_DIRECTIONS) {
      const neighborType = this.get(worldX + dx, y + dy, worldZ + dz);
      if (neighborType === 0) {
        // Face borders air — always exposed.
        return true;
      }
      const neighborClass = BLOCK_TRANSPARENCY_CLASS[neighborType] || 0;
      // A face is exposed when:
      // 1. The neighbor is transparent (any class > 0) and self is opaque — the
      //    opaque block must render its face so it shows through glass/leaves.
      // 2. Self is transparent and the neighbor is a different transparency class
      //    (e.g. glass next to opaque stone, or glass next to leaves).
      if (neighborClass !== 0 && selfClass === 0) {
        return true;
      }
      if (selfClass !== 0 && neighborClass !== selfClass) {
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

  disposeChunkMeshes(chunk) {
    for (const mesh of chunk.meshes) {
      this.meshGroup.remove(mesh);
      if (typeof mesh.dispose === "function") {
        mesh.dispose();
      }
    }
    chunk.meshes.length = 0;
  }

  buildChunkMesh(cx, cz) {
    const chunk = this.ensureChunk(cx, cz);
    this.disposeChunkMeshes(chunk);

    const visiblePositions = new Map(this.blockTypes.map((block) => [block.id, []]));
    const baseX = cx * this.chunkSize;
    const baseZ = cz * this.chunkSize;

    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const worldX = baseX + localX;
        const worldZ = baseZ + localZ;
        for (let y = 0; y < this.height; y += 1) {
          const idx = this.index(localX, y, localZ);
          const type = chunk.blocks[idx];
          if (type === 0 || !this.hasExposedFace(worldX, y, worldZ)) {
            continue;
          }
          const points = visiblePositions.get(type);
          if (!points) {
            continue;
          }
          points.push(worldX, y, worldZ);
        }
      }
    }

    for (const blockType of this.blockTypes) {
      const points = visiblePositions.get(blockType.id);
      if (!points || points.length === 0) {
        continue;
      }
      const geometry = this.blockGeometries.get(blockType.id);
      const mesh = new THREE.InstancedMesh(geometry, this.materials.get(blockType.id), points.length / 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < points.length; i += 3) {
        this.tempMatrix.makeTranslation(points[i] + 0.5, points[i + 1] + 0.5, points[i + 2] + 0.5);
        mesh.setMatrixAt(i / 3, this.tempMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // Transparent blocks must draw after all opaque geometry so depth blending
      // works correctly. renderOrder 1 > default 0.
      const tclass = BLOCK_TRANSPARENCY_CLASS[blockType.id] || 0;
      if (tclass !== 0) {
        mesh.renderOrder = 1;
      }
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
    markOne(cx + 1, cz);
    markOne(cx - 1, cz);
    markOne(cx, cz + 1);
    markOne(cx, cz - 1);
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

      // Voxel-data eviction: free Uint8Array for chunks beyond evictRadius.
      // The chunk entry itself stays in this.chunks (no blocks, no mesh) so
      // ensureChunk knows to regenerate it; chunkEdits survive untouched.
      // Chebyshev distance (max of |dx|, |dz|) mirrors the square active window.
      for (const [key, chunk] of this.chunks.entries()) {
        if (!chunk.blocks) {
          // Already evicted — skip.
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
