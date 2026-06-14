# Wave F5: Buckets + Flowing Water & Lava — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fluid-spread simulation (flowing water/lava), variable-height rendering for flowing cells, bucket items, water/lava interaction (cobblestone/obsidian), and save/load support for fluid state.

**Architecture:** Keep flowing cells as block ids 15 (water) and 21 (lava) in the Uint8 block array so all existing submersion, collision, physics, and material paths work unchanged. A parallel `Map<string, {level, falling}>` (`fluidLevels`) tracks partial-height metadata only for flowing cells; source cells are fluid blocks NOT in the map and always render full height. A new `FluidSim` module runs a bounded, deterministic tick queue. The mesher reads `fluidLevels` to adjust the top-face and side-face Y of flowing fluid cells (following the F4 partial-geometry emitBox pattern, on the existing water/lava buffers).

**Tech Stack:** ES modules, Three.js r183, Vite. No new dependencies.

---

## Orientation — key facts about the codebase

Read this before touching any file.

- **Block array**: `Uint8Array`, no per-block metadata. Block ids 15=water, 21=lava, 10=cobblestone.
- **Mesher** (`src/game/world.js`, `buildChunkMesh` ~line 1782): For id 15 and 21 the mesher picks `waterPos`/`lavaPos` buffers and falls into the standard 6-face cube loop. The F4 partial-geometry branch (`PARTIAL_BLOCK_IDS`, ~line 1925) is the model for emitting non-cube geometry via `emitBox`.
- **Face-exposed logic** (`isFaceExposed`, ~line 1387): two fluid cells of the same class cull their shared face. A flowing water cell is still id 15 (class 2), so this logic is unchanged.
- **Shader risk**: The water shader (applied via `applyWaterShaderPatch`) reads `vColor.rgb` (not `.r`/`.g`/`.b` separately). Any change to the buffer emission for water/lava must preserve the same 3-float vertex color layout `[skylight/15, blocklight/15, aoFactor]`.
- **Position key convention**: The rest of the codebase uses `toChunkKey` for chunks. For the fluidLevels map, use a simple `${x},${y},${z}` string key.
- **Save version**: currently `8`. Wave F5 bumps to `9`. Forward-default for v<=8 = no `fluidLevels` data.
- **Determinism constraint**: `advanceTime(ms)` drives simulation. The fluid tick must accumulate sim time and fire at fixed intervals. No `Date.now()`, no `Math.random()` during spread.
- **Break/place hooks**: `world.set(x, y, z, type)` is called by `breakBlock` (main.js ~5773) and `placeBlock` (~5986). The fluid sim needs to observe these events via a callback, not by polling.
- **Cobblestone block id**: 10. No new block id needed for the lava+water=cobblestone interaction. Obsidian would need id 46 (next free id); use cobblestone for both cases in the first pass and note the simplification.
- **`hitTest` excludes fluids**: `solidMeshes` filter removes `isWater`/`isLava`. A separate fluid raycast is needed for the empty-bucket use case.

---

## File Map

| File | Change |
|---|---|
| `src/game/fluidSim.js` | **Create** — fluid spread simulation, exported `FluidSim` class |
| `src/game/world.js` | **Modify** — expose `fluidLevels` Map, hook `set()`, extend mesher for variable-height fluid emission |
| `src/game/survival.js` | **Modify** — add `empty_bucket`, `water_bucket`, `lava_bucket` items + bucket recipe + bucket crafting recipe |
| `src/main.js` | **Modify** — import FluidSim, tick it in the game loop, wire bucket use into `placeBlock`, wire block-change callback, extend save/load, add debug hooks, extend `render_game_to_text` |

---

## Task 1: Add obsidian/cobblestone block id + survival stubs

**Files:**
- Modify: `e:\My projects\ExoCraft\src\game\config.js`
- Modify: `e:\My projects\ExoCraft\src\game\survival.js`
- Modify: `e:\My projects\ExoCraft\src\game\textures.js`

**Context:** We need block id 46 for obsidian (lava source + water = obsidian). We also register bucket items in ITEM_DEFS. This task has zero mesher risk.

- [ ] **Step 1: Add obsidian block id 46 to config.js blockTypes array**

In `src/game/config.js`, after the wood stairs block on line ~76, add inside the `blockTypes` array:

```js
      // Wave F5 — obsidian (lava-source + water interaction)
      { id: 46, name: "Obsidian", color: 0x1a0a2e },
```

- [ ] **Step 2: Add obsidian tile + face map to textures.js**

In `src/game/textures.js`, in the `TILE` object after `snow: [1, 5]` (~line 54), add:

```js
  // Wave F5
  obsidian:        [2, 5],
```

Then in `BLOCK_FACE_TILES` after the wood plank stairs block (~line 130), add:

```js
  // Wave F5 — obsidian: uniform dark purple on all faces.
  46: { px: "obsidian", nx: "obsidian", py: "obsidian", ny: "obsidian", pz: "obsidian", nz: "obsidian" },
```

Then find `paintAtlas` (the function that drives the canvas tile painting, or wherever tiles are painted) and add a paint call for the obsidian tile. Search for the snow tile paint call — it will look like `paintSnow(ctx, ...)` or `fillTile(ctx, col, row, color)`. Add after it:

```js
  // Wave F5 — obsidian: dark purple with faint shimmer
  paintObsidian(ctx, 2, 5);
```

Then add the `paintObsidian` function near the other paint functions (e.g., after `paintSnow`):

```js
function paintObsidian(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 99);
      const r = 18  + Math.floor(n * 8);
      const g = 8   + Math.floor(n * 4);
      const b = 36  + Math.floor(n * 12);
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}
```

- [ ] **Step 3: Add BLOCK_HARDNESS entry for obsidian in survival.js**

In `src/game/survival.js`, find the `BLOCK_HARDNESS` object. It lives around line 340. Add:

```js
  46: 50,   // obsidian — very hard (Wave F5)
```

Also in `BLOCK_DROPS`, obsidian drops nothing from the player's perspective for now:

```js
  // 46 = obsidian: no drop in F5
```

(This is just a comment — the existing `getBlockDropItem` returns `null` for missing ids, so no code change is needed unless there's a gap.)

- [ ] **Step 4: Add bucket item defs + recipe in survival.js**

In the `ITEM_DEFS` object (after the Wave 8 / diamond tools section, around line 236), add:

```js
  // Wave F5 — buckets
  empty_bucket: { id: "empty_bucket", name: "Bucket" },
  water_bucket: { id: "water_bucket", name: "Water Bucket" },
  lava_bucket:  { id: "lava_bucket",  name: "Lava Bucket"  },
```

Then in the `RECIPES` array (find the section with iron tools around line 920), add the bucket recipe. Buckets are crafted with 3 iron ingots in a V pattern (Minecraft: row0=[_,_,_], row1=[X,_,X], row2=[_,X,_]). Add:

```js
  {
    id: "empty_bucket",
    pattern: [
      "X_X",
      "_X_",
    ],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 3 }],
    output: { itemId: "empty_bucket", count: 1 },
    requiresWorkbench: true,
  },
```

- [ ] **Step 5: Verify build passes**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: no errors. The obsidian block exists in config but no mesher code emits it yet — that's fine, it's just an opaque block and falls into the default opaque branch.

- [ ] **Step 6: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/game/config.js src/game/survival.js src/game/textures.js && git commit -m "feat(f5): obsidian block id 46 + bucket items + recipe stubs"
```

---

## Task 2: Create FluidSim module

**Files:**
- Create: `e:\My projects\ExoCraft\src\game\fluidSim.js`

**Context:** The FluidSim owns:
- A `fluidLevels` Map: key=`"x,y,z"` → `{level: number, falling: boolean}`. SOURCE cells (permanent) are fluid blocks NOT in this map. Flowing cells are fluid blocks IN the map.
- An `activeQueue`: Set of position keys to evaluate on the next tick.
- Tick logic: process up to N cells from the queue per tick, deterministically (sorted key order).

Constants:
- Water max level = 7, lava max level = 3
- Tick interval = 250ms sim time
- Max cells processed per tick = 300

Spread rules:
1. A fluid cell (source or level >= 1) propagates DOWN into air below at full level (level=maxLevel, falling=true). A falling column cell skips horizontal spread.
2. A fluid cell with level >= 1 propagates HORIZONTALLY into air neighbors at level-1 (only if level-1 >= 1).
3. A flowing cell is removed (block set to 0) if it has no upstream source — i.e., no horizontal neighbor with level >= own level + 1 (or no neighbor that is a source) AND is not below a fluid.
4. Infinite water source: an air cell with >= 2 orthogonal water SOURCE neighbors becomes a new water source (not added to fluidLevels — it IS a source).
5. Water+lava interaction: when placing water adjacent to lava, convert lava source to obsidian (46), lava flow to cobblestone (10).

Spread does NOT scan the whole world — it only processes cells enqueued via `enqueue(x, y, z)`.

- [ ] **Step 1: Write the FluidSim module**

Create `e:\My projects\ExoCraft\src\game\fluidSim.js`:

```js
// FluidSim — bounded, deterministic fluid spread simulation.
// SOURCE cell: fluid block id (15 or 21) NOT in fluidLevels → full height, permanent.
// FLOWING cell: fluid block id (15 or 21) IN fluidLevels → partial height, may dry up.
// Ticks are driven by accumulated sim time in main.js via tick(dtMs).

const WATER_ID = 15;
const LAVA_ID  = 21;
const COBBLE_ID = 10;
const OBSIDIAN_ID = 46;

const WATER_MAX_LEVEL = 7;
const LAVA_MAX_LEVEL  = 3;
const TICK_INTERVAL_MS = 250;
const MAX_CELLS_PER_TICK = 300;

// Orthogonal horizontal neighbours
const H_DIRS = [[1,0],[−1,0],[0,1],[0,−1]];

function posKey(x, y, z) {
  return `${x},${y},${z}`;
}

function maxLevelFor(fluidId) {
  return fluidId === WATER_ID ? WATER_MAX_LEVEL : LAVA_MAX_LEVEL;
}

export class FluidSim {
  /**
   * @param {object} world  — VoxelWorld instance (has .get(x,y,z), .set(x,y,z,id), .inBounds)
   */
  constructor(world) {
    this.world = world;
    // Map<string, {level: number, falling: boolean}>
    // Only FLOWING cells are in this map; source cells are not.
    this.fluidLevels = new Map();
    // Queue of cell keys to evaluate; use a Set for O(1) membership check.
    this._activeSet = new Set();
    // Ordered snapshot for deterministic processing; rebuilt each tick.
    this._tickBuffer = [];
    this._accumMs = 0;
  }

  /** Enqueue a world position for evaluation on next tick. */
  enqueue(x, y, z) {
    this._activeSet.add(posKey(x, y, z));
  }

  /** Enqueue a position and all 6 face-adjacent cells. */
  enqueueNeighbours(x, y, z) {
    this.enqueue(x, y, z);
    this.enqueue(x+1, y, z); this.enqueue(x-1, y, z);
    this.enqueue(x, y+1, z); this.enqueue(x, y-1, z);
    this.enqueue(x, y, z+1); this.enqueue(x, y, z-1);
  }

  /**
   * Advance the sim by dtMs of sim time.
   * Fires a bounded tick every TICK_INTERVAL_MS.
   */
  tick(dtMs) {
    this._accumMs += dtMs;
    while (this._accumMs >= TICK_INTERVAL_MS) {
      this._accumMs -= TICK_INTERVAL_MS;
      this._runTick();
    }
  }

  /** Force n deterministic ticks (debug hook). */
  stepN(n) {
    for (let i = 0; i < n; i++) this._runTick();
  }

  _runTick() {
    if (this._activeSet.size === 0) return;

    // Snapshot the active set in sorted order for determinism.
    this._tickBuffer = Array.from(this._activeSet).sort();
    // Cap at MAX_CELLS_PER_TICK; re-enqueue the rest for the next tick.
    const toProcess = this._tickBuffer.splice(0, MAX_CELLS_PER_TICK);
    // Rebuild activeSet from remaining cells (those not processed this tick).
    this._activeSet = new Set(this._tickBuffer);

    for (const key of toProcess) {
      const [x, y, z] = key.split(",").map(Number);
      this._evaluateCell(x, y, z);
    }
  }

  _isSource(x, y, z, fluidId) {
    return this.world.get(x, y, z) === fluidId && !this.fluidLevels.has(posKey(x, y, z));
  }

  _isFluid(x, y, z, fluidId) {
    return this.world.get(x, y, z) === fluidId;
  }

  /** Determine the effective level at (x,y,z) for the given fluidId. Returns 0 if not fluid. */
  _levelAt(x, y, z, fluidId) {
    if (!this._isFluid(x, y, z, fluidId)) return 0;
    const info = this.fluidLevels.get(posKey(x, y, z));
    if (!info) return maxLevelFor(fluidId); // source = max
    return info.level;
  }

  _evaluateCell(x, y, z) {
    const world = this.world;
    const key = posKey(x, y, z);
    const blockId = world.get(x, y, z);

    // --- Case A: cell is currently a fluid ---
    if (blockId === WATER_ID || blockId === LAVA_ID) {
      const fluidId = blockId;
      const maxLvl = maxLevelFor(fluidId);
      const isSource = !this.fluidLevels.has(key);

      if (isSource) {
        // Sources propagate but never dry up.
        this._spreadFrom(x, y, z, fluidId, maxLvl, false);
        return;
      }

      // Flowing cell: check if it is still fed.
      const info = this.fluidLevels.get(key);
      const lvl = info.level;

      if (info.falling) {
        // A falling cell is fed if there's fluid directly above it.
        const aboveId = world.get(x, y+1, z);
        if (aboveId !== fluidId) {
          // No fluid above — remove this falling cell.
          this._removeFlowingCell(x, y, z, fluidId);
          return;
        }
        // Still falling — propagate downward and horizontally.
        this._spreadFrom(x, y, z, fluidId, maxLvl, true);
        return;
      }

      // Horizontal flowing cell: is it fed by a higher-or-equal level source or flow?
      const fed = this._isFed(x, y, z, fluidId, lvl);
      if (!fed) {
        this._removeFlowingCell(x, y, z, fluidId);
        return;
      }

      this._spreadFrom(x, y, z, fluidId, lvl, false);
      return;
    }

    // --- Case B: cell is currently air — check for infinite water source ---
    if (blockId === 0) {
      let waterSourceCount = 0;
      for (const [dx, dz] of H_DIRS) {
        if (this._isSource(x+dx, y, z+dz, WATER_ID)) {
          waterSourceCount++;
        }
      }
      if (waterSourceCount >= 2) {
        // Infinite water source rule — create a new source here.
        world.set(x, y, z, WATER_ID);
        // It is a source (no fluidLevels entry).
        this.enqueueNeighbours(x, y, z);
        this._markChunkDirty(x, y, z);
      }
    }
  }

  /** Return true if (x,y,z) is a flowing cell that has a valid upstream source. */
  _isFed(x, y, z, fluidId, ownLevel) {
    // A cell at level L is fed if any orthogonal horizontal neighbour has level >= L+1
    // (or is a source = max level), OR if the block directly above is the same fluid
    // (falling column above us).
    if (this._isFluid(x, y+1, z, fluidId)) return true;
    const maxLvl = maxLevelFor(fluidId);
    for (const [dx, dz] of H_DIRS) {
      const nx = x+dx, nz = z+dz;
      const nLvl = this._levelAt(nx, y, nz, fluidId);
      if (nLvl > ownLevel) return true;
      // Source (nLvl == maxLvl and not in fluidLevels) also feeds
      if (nLvl === maxLvl && this._isSource(nx, y, nz, fluidId)) return true;
    }
    return false;
  }

  _spreadFrom(x, y, z, fluidId, lvl, isFalling) {
    const world = this.world;
    const maxLvl = maxLevelFor(fluidId);

    // 1. Try to fall DOWN
    const below = world.get(x, y-1, z);
    if (below === 0 && world.inBounds(x, y-1, z)) {
      this._placeFlowing(x, y-1, z, fluidId, maxLvl, true);
    } else {
      // Check water+lava interaction below
      this._checkInteraction(x, y-1, z, fluidId);
    }

    // Falling cells don't spread horizontally (true to Minecraft).
    if (isFalling) return;

    // 2. Spread horizontally at level-1
    if (lvl <= 1) return; // level 1 can only fall, not spread
    const nextLvl = lvl - 1;
    for (const [dx, dz] of H_DIRS) {
      const nx = x+dx, ny = y, nz = z+dz;
      if (!world.inBounds(nx, ny, nz)) continue;
      const nBlock = world.get(nx, ny, nz);
      if (nBlock === 0) {
        this._placeFlowing(nx, ny, nz, fluidId, nextLvl, false);
      } else if (nBlock !== fluidId) {
        this._checkInteraction(nx, ny, nz, fluidId);
      } else {
        // Already fluid — maybe we should upgrade its level?
        const nKey = posKey(nx, ny, nz);
        const nInfo = this.fluidLevels.get(nKey);
        const nLvl = nInfo ? nInfo.level : maxLvl;
        if (nLvl < nextLvl) {
          // Our flow is stronger — upgrade neighbour.
          this.fluidLevels.set(nKey, { level: nextLvl, falling: false });
          this.enqueue(nx, ny, nz);
          this._markChunkDirty(nx, ny, nz);
        }
      }
    }
  }

  _placeFlowing(x, y, z, fluidId, level, falling) {
    const key = posKey(x, y, z);
    const existing = this.fluidLevels.get(key);
    // Only update if the new level is higher (or it's a new cell).
    if (this.world.get(x, y, z) === fluidId && existing && existing.level >= level) return;

    if (this.world.get(x, y, z) !== fluidId) {
      this.world.set(x, y, z, fluidId);
    }
    this.fluidLevels.set(key, { level, falling });
    this.enqueueNeighbours(x, y, z);
    this._markChunkDirty(x, y, z);
  }

  _removeFlowingCell(x, y, z, fluidId) {
    const key = posKey(x, y, z);
    this.fluidLevels.delete(key);
    this.world.set(x, y, z, 0);
    this.enqueueNeighbours(x, y, z);
    this._markChunkDirty(x, y, z);
  }

  /** Handle water + lava interactions at the neighbouring cell. */
  _checkInteraction(nx, ny, nz, incomingFluidId) {
    const world = this.world;
    const nBlock = world.get(nx, ny, nz);
    // Flowing water touching any lava → cobblestone
    // Lava source touching water → obsidian; flowing lava touching water → cobblestone
    if (incomingFluidId === WATER_ID && (nBlock === LAVA_ID)) {
      const nKey = posKey(nx, ny, nz);
      const isLavaSource = !this.fluidLevels.has(nKey);
      const result = isLavaSource ? OBSIDIAN_ID : COBBLE_ID;
      this.fluidLevels.delete(nKey);
      world.set(nx, ny, nz, result);
      this.enqueueNeighbours(nx, ny, nz);
      this._markChunkDirty(nx, ny, nz);
    } else if (incomingFluidId === LAVA_ID && (nBlock === WATER_ID)) {
      this.fluidLevels.delete(posKey(nx, ny, nz));
      world.set(nx, ny, nz, COBBLE_ID);
      this.enqueueNeighbours(nx, ny, nz);
      this._markChunkDirty(nx, ny, nz);
    }
  }

  _markChunkDirty(x, y, z) {
    // world.markChunkDirty expects chunk coords (cx, cz), not world coords.
    const cx = Math.floor(x / this.world.chunkSize);
    const cz = Math.floor(z / this.world.chunkSize);
    this.world.markChunkDirty(cx, cz, false);
  }

  /** Called when the player places a fluid SOURCE (bucket use). */
  placeSource(x, y, z, fluidId) {
    // Remove from fluidLevels if it was a flowing cell before (now it's a source).
    this.fluidLevels.delete(posKey(x, y, z));
    this.world.set(x, y, z, fluidId);
    this.enqueueNeighbours(x, y, z);
    this._markChunkDirty(x, y, z);
  }

  /** Called when the player removes a fluid SOURCE (bucket use). */
  removeSource(x, y, z) {
    this.fluidLevels.delete(posKey(x, y, z));
    // world.set(x, y, z, 0) is called by the caller (main.js) already.
    this.enqueueNeighbours(x, y, z);
    this._markChunkDirty(x, y, z);
  }

  /** Called when ANY block (fluid or solid) changes at (x,y,z). */
  onBlockChange(x, y, z) {
    this.enqueueNeighbours(x, y, z);
  }

  /** Serialize for save system. */
  serialize() {
    const cells = [];
    for (const [key, info] of this.fluidLevels.entries()) {
      cells.push({ k: key, l: info.level, f: info.falling ? 1 : 0 });
    }
    return { cells };
  }

  /** Restore from save data (v9+). Pass null for forward-default (v<=8 saves). */
  restore(data) {
    this.fluidLevels.clear();
    this._activeSet.clear();
    this._accumMs = 0;
    if (!data || !Array.isArray(data.cells)) return;
    for (const entry of data.cells) {
      if (typeof entry.k !== "string" || !Number.isFinite(entry.l)) continue;
      this.fluidLevels.set(entry.k, { level: entry.l, falling: entry.f === 1 });
      // Re-enqueue all restored cells so receding flows converge on load.
      this._activeSet.add(entry.k);
    }
  }

  /** Clear all fluid sim state (new world / regenerate). */
  reset() {
    this.fluidLevels.clear();
    this._activeSet.clear();
    this._accumMs = 0;
  }

  // --- Debug API ---

  getFluidAt(x, y, z) {
    const id = this.world.get(x, y, z);
    if (id !== WATER_ID && id !== LAVA_ID) return null;
    const key = posKey(x, y, z);
    const info = this.fluidLevels.get(key);
    if (!info) {
      return { type: id === WATER_ID ? "water" : "lava", level: maxLevelFor(id), falling: false, source: true };
    }
    return { type: id === WATER_ID ? "water" : "lava", level: info.level, falling: info.falling, source: false };
  }

  fluidCellCount() {
    return this.fluidLevels.size;
  }
}
```

**Note:** `H_DIRS` uses `−1` (Unicode minus) — use ASCII `-1` when writing the actual file. Also double-check that `this.world.chunkSize` is accessible (it is, on VoxelWorld instances).

- [ ] **Step 2: Verify the module parses (build check)**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: build succeeds. The module is not imported yet so nothing can break.

- [ ] **Step 3: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/game/fluidSim.js && git commit -m "feat(f5): FluidSim module — bounded deterministic fluid spread"
```

---

## Task 3: Extend VoxelWorld.set() with change callback

**Files:**
- Modify: `e:\My projects\ExoCraft\src\game\world.js`

**Context:** The FluidSim needs to know when blocks change (break/place by player, and when the sim itself calls `world.set()`). We add an optional `onBlockChange` callback on VoxelWorld that FluidSim registers itself into. The sim calls `world.set()` internally; to avoid infinite loops, the callback is suspended during sim ticks.

Actually, a simpler and safer approach: the sim calls `world.set()` in `_removeFlowingCell` and `_placeFlowing` and `_checkInteraction` and `placeSource`. Those internal calls don't need to re-notify (the sim already enqueues neighbours explicitly). Only PLAYER block changes (break/place) need to notify the sim. We wire that in main.js (Task 4). So in this task, we only need to expose `fluidLevels` to the world so the mesher can read it.

The VoxelWorld needs:
1. A `fluidLevels` reference it can hand off to the mesher (passed in from main.js after FluidSim is created).
2. The `markChunkDirty` method is already public (line 2305).

- [ ] **Step 1: Add a fluidLevels property to VoxelWorld**

Find the `VoxelWorld` class constructor in `src/game/world.js`. It starts around line 615-650 (search for `class VoxelWorld` or `constructor(`). Add a property initializer:

```js
    // Wave F5: flowing fluid metadata Map — set from main.js after FluidSim is created.
    // key = "x,y,z" → {level, falling}. Read by buildChunkMesh for variable-height rendering.
    this.fluidLevels = new Map();
```

- [ ] **Step 2: Verify build**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/game/world.js && git commit -m "feat(f5): VoxelWorld.fluidLevels property for mesher integration"
```

---

## Task 4: Variable-height fluid emission in the mesher

**Files:**
- Modify: `e:\My projects\ExoCraft\src\game\world.js` (buildChunkMesh)

**Context:** This is the highest-risk task. The mesher currently assigns `posArr/normArr/...` to `waterPos/lavaPos` buffers and then falls into the standard 6-face cube loop. We need to intercept water (15) and lava (21) before that loop and optionally emit them via a modified path that respects `fluidLevels`.

**Strategy (minimal-risk):**
- SOURCE cells (not in `fluidLevels`): emit as full-height cubes, exactly as now. The existing 6-face loop handles them perfectly.
- FLOWING cells (in `fluidLevels`): emit via a modified emitBox approach that scales the top-face Y by `level / maxLevel` (clamped to [0.1, 0.9]). Use the existing water/lava buffers and the same vertex-color layout.

To avoid touching the hot-path for sources, we add an early-continue branch for flowing cells before the existing buffer-select block.

Level-to-height mapping (Minecraft-like): `h = 0.9 - (maxLevel - level) * (0.8 / maxLevel)`.
- Source (level = maxLevel): h ≈ 0.9
- Level 1: h ≈ 0.1

For water the wave shader displaces Y by ±0.05 so h=0.9 is fine (won't breach the cell top).

**The emitFluid helper** will reuse `emitPartialQuad` if it's in scope, or duplicate a minimal version into the fluid path. Since `emitPartialQuad` is a closure scoped inside `buildChunkMesh`, we can call it from within the same function body.

- [ ] **Step 1: Read the exact lines surrounding the fluid buffer-select in buildChunkMesh**

Read `src/game/world.js` lines 2055–2075 to confirm the current structure before editing:

The structure at ~line 2055 is:
```js
            continue; // skip the cube-face loop for partial blocks
          } else if (blockType === 21) {
            posArr  = lavaPos;   ...
          } else if (blockType === 15) {
            posArr  = waterPos;  ...
          } else if (tclass === 2) {
            ...
          }
```

- [ ] **Step 2: Add the flowing-fluid early branch**

In `buildChunkMesh`, after the `PARTIAL_BLOCK_IDS` branch ends (the `continue` at ~line 2056), and before the `} else if (blockType === 21)` block, insert the following block. The insertion point is the blank line or right before `} else if (blockType === 21)`:

```js
          // Wave F5: flowing fluid — variable height rendering.
          // Source cells (not in fluidLevels) fall through to the regular cube path.
          const _flKey = blockType === 15 || blockType === 21
            ? `${worldX},${y},${worldZ}` : null;
          const _flInfo = _flKey ? this.fluidLevels.get(_flKey) : null;
          if (_flInfo) {
            // Flowing cell: emit a box of reduced height via the partial-geometry helpers.
            const isWaterFlow = blockType === 15;
            const maxLvl = isWaterFlow ? 7 : 3;
            const flH = Math.max(0.1, 0.9 - (maxLvl - _flInfo.level) * (0.8 / maxLvl));
            const fposArr  = isWaterFlow ? waterPos  : lavaPos;
            const fnormArr = isWaterFlow ? waterNorm  : lavaNorm;
            const fuvArr   = isWaterFlow ? waterUv    : lavaUv;
            const fcolArr  = isWaterFlow ? waterCol   : lavaCol;
            const ftintArr = isWaterFlow ? waterTint  : lavaTint;
            const fidxArr  = isWaterFlow ? waterIdx   : lavaIdx;
            const x0 = worldX, y0 = y, z0 = worldZ;
            // Sample light from the voxel above (open sky side).
            const aLX = x0 - baseX, aLZ = z0 - baseZ;
            const aboveY = y0 + 1;
            let fSky = 0, fBlk = 0;
            if (aboveY < H && aLX >= 0 && aLX < S && aLZ >= 0 && aLZ < S) {
              fSky = skylight[lIndex(aLX, aboveY, aLZ)];
              fBlk = blocklight[lIndex(aLX, aboveY, aLZ)];
            } else if (aboveY >= H) { fSky = 15; }
            const fLR = fSky / 15.0;
            const fLG = fBlk / 15.0;
            const AO_N = 1.0;
            // Emit flowing fluid as a reduced-height box using the emitPartialQuad helper.
            // emitPartialQuad is defined in this function scope (Wave F4).
            const emitFluidQuad = (verts, nx, ny, nz, uvRect) => {
              const base = fposArr.length / 3;
              const { uMin, uMax, vMin, vMax } = uvRect;
              for (let v = 0; v < 4; v++) {
                fposArr.push(...verts[v]);
                fnormArr.push(nx, ny, nz);
                const [ut, vt] = FACE_UV_INDICES[v];
                fuvArr.push(ut === 0 ? uMin : uMax, vt === 0 ? vMin : vMax);
                fcolArr.push(fLR, fLG, AO_N);
                ftintArr.push(1.0, 1.0, 1.0);
              }
              const isPyNy = (ny !== 0);
              if (isPyNy) {
                fidxArr.push(base, base+2, base+1, base+1, base+2, base+3);
              } else {
                fidxArr.push(base, base+1, base+2, base+1, base+3, base+2);
              }
            };
            const emitFluidBox = (ox, oy, oz, sx, sy, sz, bid) => {
              emitFluidQuad([[ox+sx,oy,oz+sz],[ox+sx,oy,oz],[ox+sx,oy+sy,oz+sz],[ox+sx,oy+sy,oz]], 1,0,0, getFaceUvRect(bid, FACE_PX));
              emitFluidQuad([[ox,oy,oz],[ox,oy,oz+sz],[ox,oy+sy,oz],[ox,oy+sy,oz+sz]], -1,0,0, getFaceUvRect(bid, FACE_NX));
              emitFluidQuad([[ox,oy+sy,oz],[ox+sx,oy+sy,oz],[ox,oy+sy,oz+sz],[ox+sx,oy+sy,oz+sz]], 0,1,0, getFaceUvRect(bid, FACE_PY));
              emitFluidQuad([[ox,oy,oz+sz],[ox+sx,oy,oz+sz],[ox,oy,oz],[ox+sx,oy,oz]], 0,-1,0, getFaceUvRect(bid, FACE_NY));
              emitFluidQuad([[ox,oy,oz+sz],[ox+sx,oy,oz+sz],[ox,oy+sy,oz+sz],[ox+sx,oy+sy,oz+sz]], 0,0,1, getFaceUvRect(bid, FACE_PZ));
              emitFluidQuad([[ox+sx,oy,oz],[ox,oy,oz],[ox+sx,oy+sy,oz],[ox,oy+sy,oz]], 0,0,-1, getFaceUvRect(bid, FACE_NZ));
            };
            emitFluidBox(x0, y0, z0, 1.0, flH, 1.0, blockType);
            continue; // skip the standard cube-face loop for this flowing cell
          }
```

This block goes immediately BEFORE the `} else if (blockType === 21) {` line.

- [ ] **Step 3: Build and verify no blank world**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -30
```

Expected: clean build with no errors.

- [ ] **Step 4: Manually verify the mesher shader contract**

After building, read `src/game/world.js` lines 286-290 to confirm `vLightColor = vColor.rgb` is still in the water shader's vertex shader replacement. This ensures the `[fLR, fLG, AO_N]` vertex color we push is read correctly as `.rgb` (not `.rgba`) in the shader.

Expected: line 287 reads `vLightColor = vColor.rgb;` — unchanged.

- [ ] **Step 5: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/game/world.js && git commit -m "feat(f5): mesher variable-height emission for flowing fluid cells"
```

---

## Task 5: Wire FluidSim into main.js (import, tick, block-change hook)

**Files:**
- Modify: `e:\My projects\ExoCraft\src\main.js`

**Context:** main.js is 7700+ lines. Surgical edits only. We need to:
1. Import `FluidSim` from `./game/fluidSim`.
2. Create a `fluidSim` instance after `world` is created, and assign `world.fluidLevels = fluidSim.fluidLevels`.
3. Call `fluidSim.tick(dtMs)` in the game loop (the fixed-step simulation block).
4. Call `fluidSim.onBlockChange(x, y, z)` after every player break/place.
5. Reset `fluidSim` when a new world is generated.

- [ ] **Step 1: Add the import**

In `src/main.js` at the top, after the existing game imports (around line 13-14), add:

```js
import { FluidSim } from "./game/fluidSim";
```

- [ ] **Step 2: Create the FluidSim instance**

Search for where `world` is created. It will be something like `const world = new VoxelWorld(...)`. Add immediately after it:

```js
const fluidSim = new FluidSim(world);
world.fluidLevels = fluidSim.fluidLevels;
```

- [ ] **Step 3: Tick FluidSim in the game loop**

Find the fixed-step simulation section in `main.js`. It runs on `advanceTime` and is called from the RAF loop. Search for `state.mode === "playing"` or the `fixedStepMs` usage block. You'll find a loop like:

```js
  while (accumulatedMs >= fixedStepMs) {
    const dt = fixedStepMs;
    accumulatedMs -= fixedStepMs;
    // ... physics, mobs, etc.
  }
```

Add `fluidSim.tick(dt);` inside that loop, near the end of the physics tick:

```js
    fluidSim.tick(dt);
```

- [ ] **Step 4: Hook block changes for breakBlock**

Find `breakBlock` in main.js (~line 5725). After `world.set(coords.x, coords.y, coords.z, 0)` (where the block is cleared), add:

```js
    fluidSim.onBlockChange(coords.x, coords.y, coords.z);
```

- [ ] **Step 5: Hook block changes for placeBlock**

Find `placeBlock` in main.js (~line 5986). After `world.set(coords.x, coords.y, coords.z, placeType)`, add:

```js
  fluidSim.onBlockChange(coords.x, coords.y, coords.z);
```

- [ ] **Step 6: Reset FluidSim on new world / regenerate**

Search for `world.generateTerrain` calls (there are two: one in loadGame, one in new world). After each `world.generateTerrain(...)` call, add:

```js
    fluidSim.reset();
    world.fluidLevels = fluidSim.fluidLevels;
```

- [ ] **Step 7: Build**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/main.js && git commit -m "feat(f5): wire FluidSim tick + block-change hooks into main.js"
```

---

## Task 6: Bucket items — use action in main.js

**Files:**
- Modify: `e:\My projects\ExoCraft\src\main.js`

**Context:** Right-clicking with an `empty_bucket` aimed at a fluid SOURCE collects it. Right-clicking with `water_bucket` or `lava_bucket` aimed at a solid block face places a fluid source in the adjacent air cell. The bucket use takes priority over food and block placement.

The hitTest excludes fluid meshes (`isWater`/`isLava`). For the empty-bucket collection case, we need a FLUID hit test. We'll write a `hitTestFluid()` helper that includes fluid meshes.

- [ ] **Step 1: Add hitTestFluid helper**

In main.js, after the `hitTest` function definition (~line 5682), add:

```js
function hitTestFluid(ndcX = 0, ndcY = 0, maxDistance = worldConfig.maxReach) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  // Include ONLY fluid meshes for bucket collection.
  const fluidMeshes = world.meshGroup.children.filter(m => m.userData.isWater || m.userData.isLava);
  const hits = raycaster.intersectObjects(fluidMeshes, false);
  for (const hit of hits) {
    if (hit.distance <= maxDistance) return hit;
  }
  return null;
}
```

- [ ] **Step 2: Add bucket use logic**

In `placeBlock` (~line 5900), at the very start of the function (after the `chestOpen` check at line 5901), add the bucket handler block:

```js
  // Wave F5 — bucket use (takes priority over food/place)
  {
    const bucketSlot = getSelectedInventorySlot();
    const bucketId = bucketSlot?.itemId;
    if (bucketId === "empty_bucket") {
      // Try to collect a fluid source.
      const fluidHit = hitTestFluid(ndcX, ndcY);
      if (fluidHit) {
        const fNormal = getWorldNormal(fluidHit);
        if (fNormal) {
          const fc = toBlockCoords(fluidHit.point, fNormal, -1);
          const fType = world.get(fc.x, fc.y, fc.z);
          const isSource = (fType === WATER_BLOCK_TYPE || fType === LAVA_BLOCK_TYPE)
            && !fluidSim.fluidLevels.has(`${fc.x},${fc.y},${fc.z}`);
          if (isSource) {
            const filledBucket = fType === WATER_BLOCK_TYPE ? "water_bucket" : "lava_bucket";
            world.set(fc.x, fc.y, fc.z, 0);
            fluidSim.onBlockChange(fc.x, fc.y, fc.z);
            // Replace empty_bucket with filled bucket (count stays 1).
            state.inventory[state.selectedSlot] = { itemId: filledBucket, count: 1 };
            world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
            markInventoryPanelDirty();
            refreshHud();
            state.recentAction = `Collected ${filledBucket}`;
            return true;
          }
        }
      }
      // No fluid hit — fall through (treat as normal use, likely does nothing placeable).
    } else if (bucketId === "water_bucket" || bucketId === "lava_bucket") {
      // Place a fluid source.
      const solidHit = hitTest(ndcX, ndcY);
      if (solidHit) {
        const sNormal = getWorldNormal(solidHit);
        if (sNormal) {
          const sc = toBlockCoords(solidHit.point, sNormal, 1);
          if (world.inBounds(sc.x, sc.y, sc.z) && world.get(sc.x, sc.y, sc.z) === 0
              && !playerInsideBlock(sc.x, sc.y, sc.z)) {
            const fluidId = bucketId === "water_bucket" ? WATER_BLOCK_TYPE : LAVA_BLOCK_TYPE;
            fluidSim.placeSource(sc.x, sc.y, sc.z, fluidId);
            world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
            // Return empty bucket (does not stack; replace slot directly).
            state.inventory[state.selectedSlot] = { itemId: "empty_bucket", count: 1 };
            markInventoryPanelDirty();
            refreshHud();
            state.recentAction = `Placed ${fluidId === WATER_BLOCK_TYPE ? "water" : "lava"} source`;
            return true;
          }
        }
      }
      return false; // Bucket selected but no valid placement — do nothing.
    }
  }
```

This block should be inserted right after the `if (state.chestOpen) return false;` line and before the `const slot = getSelectedInventorySlot();` line (at ~line 5920) so it fires before the food/place logic.

- [ ] **Step 3: Build**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/main.js && git commit -m "feat(f5): bucket item use — collect and place fluid sources"
```

---

## Task 7: Save / load fluid state (version 9)

**Files:**
- Modify: `e:\My projects\ExoCraft\src\main.js`

**Context:** The save system (collectSaveSnapshot / loadGame) must persist and restore `fluidSim`. Version bump: 8 → 9.

- [ ] **Step 1: Bump save version to 9**

In `collectSaveSnapshot` (~line 5498), change:

```js
    version: 8, // Wave F8: persist dayCount for deterministic moon phase
```

to:

```js
    version: 9, // Wave F5: persist fluid sim state (fluidLevels)
```

- [ ] **Step 2: Add fluidSim serialization to collectSaveSnapshot**

In `collectSaveSnapshot`, after `xp: { ... }` (the last field, around line 5524-5529), add:

```js
    fluidSim: fluidSim.serialize(),
```

- [ ] **Step 3: Add fluidSim restore in loadGame**

In `loadGame` (~line 5588), after the `loadObjectives(snapshot.objectives);` call (~line 5625), add:

```js
    // Wave F5: restore fluid sim; v<=8 saves have no fluidSim field → clear (no flowing cells).
    fluidSim.restore(snapshot.fluidSim ?? null);
    world.fluidLevels = fluidSim.fluidLevels;
```

- [ ] **Step 4: Also reset fluidSim on generateTerrain for new world**

Verify from Task 5 Step 6 that `fluidSim.reset()` is already called after each `world.generateTerrain`. If not, add it now.

- [ ] **Step 5: Build**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/main.js && git commit -m "feat(f5): save/load fluid sim state, bump save version 8→9"
```

---

## Task 8: Debug hooks + render_game_to_text fluids payload

**Files:**
- Modify: `e:\My projects\ExoCraft\src\main.js`

**Context:** The orchestrator verifies behavior via JS hooks. We need:
- `window.__exoCraftDebug.placeFluidSource(x, y, z, type)` where type is `"water"` or `"lava"`
- `window.__exoCraftDebug.getFluidAt(x, y, z)` → `{type, level, falling}` or null
- `window.__exoCraftDebug.stepFluidSim(n)` — force n ticks
- `window.__exoCraftDebug.fluidCellCount()` — number of flowing cells
- `render_game_to_text` gains a `fluids` field: `{activeCells, sampleLevels}`

- [ ] **Step 1: Add fluids hooks to __exoCraftDebug**

Find `window.__exoCraftDebug = {` (~line 7238). Add before the closing `};`:

```js
  // Wave F5 — fluid sim debug hooks
  placeFluidSource: (x, y, z, type = "water") => {
    const fluidId = type === "lava" ? LAVA_BLOCK_TYPE : WATER_BLOCK_TYPE;
    if (!world.inBounds(x, y, z)) return false;
    fluidSim.placeSource(x, y, z, fluidId);
    world.ensureActiveChunksAround(x, z);
    return true;
  },
  getFluidAt: (x, y, z) => fluidSim.getFluidAt(x, y, z),
  stepFluidSim: (n = 1) => { fluidSim.stepN(Math.max(1, Math.floor(n))); },
  fluidCellCount: () => fluidSim.fluidCellCount(),
```

- [ ] **Step 2: Add fluids field to render_game_to_text payload**

Find the `payload` object inside `window.render_game_to_text` (~line 7040). After the last field before the closing `};`, add:

```js
    fluids: {
      activeCells: fluidSim.fluidCellCount(),
      // Sample up to 5 flowing cells for verification.
      sampleLevels: (() => {
        const out = [];
        let i = 0;
        for (const [key, info] of fluidSim.fluidLevels.entries()) {
          if (i++ >= 5) break;
          out.push({ pos: key, level: info.level, falling: info.falling });
        }
        return out;
      })(),
    },
```

- [ ] **Step 3: Build**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd 'e:\My projects\ExoCraft' && git add src/main.js && git commit -m "feat(f5): debug hooks + render_game_to_text fluids payload"
```

---

## Task 9: Final build verification + post-build mesher audit

**Files:** None (read-only verification).

**Context:** The spec requires explicitly checking the mesher fluid emission after building to confirm: (a) buffers are still flushed, (b) materials are still shader-compatible (`vColor.rgb`, `uMoonFactor` uniform still declared).

- [ ] **Step 1: Run production build and capture output**

```bash
cd 'e:\My projects\ExoCraft' && npm run build 2>&1
```

Expected: `dist/` created, no errors, no warnings about undefined variables.

- [ ] **Step 2: Confirm water/lava mesh creation path is intact**

Read `src/game/world.js` lines 2261-2280 to confirm the `waterGeo` and `lavaGeo` makeGeometry calls are still present and the `makeGeometry` function still has all 5 buffer arguments (pos, norm, uv, col, tint):

```
2261:    const waterGeo = makeGeometry(waterPos, waterNorm, waterUv, waterCol, waterTint, waterIdx);
2272:    const lavaGeo  = makeGeometry(lavaPos, lavaNorm, lavaUv, lavaCol, lavaTint, lavaIdx);
```

- [ ] **Step 3: Confirm vColor.rgb read is intact in water shader**

Read `src/game/world.js` lines 283-290. Confirm the line `vLightColor = vColor.rgb;` is still present inside `applyWaterShaderPatch` (not changed to `.r` or full `.rgba` assignment).

- [ ] **Step 4: Confirm uMoonFactor uniform is still declared in water shader**

Read `src/game/world.js` lines 312-320. Confirm `uniform float uMoonFactor;` appears inside the fragmentShader `#include <common>` replacement block of `applyWaterShaderPatch`.

- [ ] **Step 5: Confirm flowing cell emitFluidBox pushes tint (1,1,1)**

Read the `emitFluidBox` code added in Task 4 Step 2. Confirm each vertex pushes exactly 3 floats into `ftintArr` via `ftintArr.push(1.0, 1.0, 1.0)`. A missing tint push would cause a buffer-length mismatch and crash the geometry build silently (blank chunk).

- [ ] **Step 6: Final commit**

```bash
cd 'e:\My projects\ExoCraft' && git add -p && git commit -m "chore(f5): wave F5 complete — buckets, flowing fluids, save v9"
```

---

## Self-Review Checklist

**Spec coverage:**

| Requirement | Task |
|---|---|
| Fluid spread sim (FluidSim module) | Task 2 |
| Water max level 7, lava max level 3 | Task 2 |
| Falling column + horizontal spread | Task 2 |
| Drying up / recede when unfed | Task 2 |
| Infinite water source rule | Task 2 |
| NO spread into settled ocean (bounded queue — only air cells, no whole-world scan) | Task 2 (active queue, only enqueue on block change or neighbour notification) |
| Bounded + deterministic tick | Task 2 (sorted key order, cap 300/tick) |
| Water + lava interaction → cobblestone/obsidian | Task 2 + Task 1 (obsidian id 46) |
| Variable-height render (flowing cells) | Task 4 |
| Source cells still render at full height | Task 4 (early-continue only for `_flInfo != null`) |
| Do NOT break water shader (vColor.rgb, uMoonFactor) | Task 4 (same buffers, same vertex layout) + Task 9 |
| Buckets: empty, water, lava | Task 1 (item defs) + Task 6 (use action) |
| Bucket right-click collect source | Task 6 |
| Bucket right-click place source | Task 6 |
| Save version 8 → 9 | Task 7 |
| v<=8 forward-default (no flowing cells) | Task 7 (restore null → clear) |
| New world clears fluid state | Task 5 (reset on generateTerrain) |
| Debug hooks (placeFluidSource, getFluidAt, stepFluidSim, fluidCellCount) | Task 8 |
| render_game_to_text fluids payload | Task 8 |
| Build passes | Task 9 |

**Gaps / notes:**
- Obsidian (id 46) is wired in as the lava-source + water result. Flowing lava + water → cobblestone (id 10). This matches the spec's preferred behavior.
- The bucket collection test uses `hitTestFluid` which includes fluid meshes. The `fluidLevels` check (`!fluidSim.fluidLevels.has(key)`) correctly identifies sources.
- Sea-level ocean water is NOT in `fluidLevels` (no entry = source) and has no air neighbors (settled ocean), so the flood-fill constraint is satisfied — the active queue never contains those cells unless the player breaks an adjacent block.
- Lava buckets: lava is placeable (placeSource) and collectable. The collection check uses `!fluidLevels.has(key)` which is correct for lava sources too.
- `emitFluidBox` winding: the PY and NZ face winding must match the existing partial-block emitPartialQuad convention. The PY quad in `emitFluidBox` is in FACE_VERTS[FACE_PY] order: `[bl=[ox,oy+sy,oz], br=[ox+sx,oy+sy,oz], tl=[ox,oy+sy,oz+sz], tr=[ox+sx,oy+sy,oz+sz]]` and gets `fidxArr.push(base, base+2, base+1, ...)` (isPyNy path). This matches the PY face winding correction used in the standard cube path.
- The `emitFluidBox` inner helper closes over `emitFluidQuad` which closes over `fposArr`/`fnormArr` etc. All are `let` or `const` block-scoped inside the `if (_flInfo)` block so there's no variable leak.
