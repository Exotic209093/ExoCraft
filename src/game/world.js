import * as THREE from "three";
import { BLOCK_FACE_TILES, tileUvRect } from "./textures";

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
export function createBlockMaterials(blockTypes, atlasTexture) {
  const baseMaterial = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    transparent: false,
    alphaTest: 0,
  });
  const materials = new Map();
  for (const block of blockTypes) {
    if (block.emissive && block.emissive !== 0x000000) {
      const emissiveMaterial = baseMaterial.clone();
      emissiveMaterial.emissive = new THREE.Color(block.emissive);
      emissiveMaterial.emissiveMap = atlasTexture;
      emissiveMaterial.emissiveIntensity = Number.isFinite(block.emissiveIntensity) ? block.emissiveIntensity : 0.3;
      materials.set(block.id, emissiveMaterial);
    } else {
      materials.set(block.id, baseMaterial);
    }
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

  noise2(x, z) {
    const seed = this.generation.seed || 0;
    const nx = x + seed * 0.00137;
    const nz = z - seed * 0.00191;
    const raw = Math.sin(nx * 127.1 + nz * 311.7 + seed * 0.013) * 43758.5453123;
    return raw - Math.floor(raw);
  }

  noise3(x, y, z) {
    const seed = this.generation.seed || 0;
    const nx = x + seed * 0.00111;
    const ny = y - seed * 0.00079;
    const nz = z + seed * 0.00157;
    const raw = Math.sin(nx * 127.1 + ny * 311.7 + nz * 74.7 + seed * 0.017) * 43758.5453123;
    return raw - Math.floor(raw);
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
    const h1 = Math.sin(worldX * g.waveXFrequency) * g.waveXAmplitude;
    const h2 = Math.cos(worldZ * g.waveZFrequency) * g.waveZAmplitude;
    const h3 = Math.sin((worldX + worldZ) * g.waveDiagonalFrequency) * g.waveDiagonalAmplitude;
    const h4 = (this.noise2(worldX, worldZ) - 0.5) * g.noiseAmplitude;
    const value = Math.floor(g.baseHeight + h1 + h2 + h3 + h4);
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
    for (const [dx, dy, dz] of CARDINAL_DIRECTIONS) {
      if (this.get(worldX + dx, y + dy, worldZ + dz) === 0) {
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
