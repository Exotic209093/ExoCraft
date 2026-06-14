// Wave F5 — fluid simulation: cellular-automaton water/lava spread.
//
// Design constraints:
//   - Deterministic: driven by accumulated sim time, fixed iteration order, no RNG, no wall-clock.
//   - Bounded: at most MAX_CELLS_PER_TICK cells evaluated per tick; surplus carries to next tick.
//   - No metadata in world: VoxelWorld block array is Uint8 ids. Flowing-cell level is stored
//     in `fluidLevels` (a Map<"x,y,z", {level,falling,fluidId}>). Source cells (placed by terrain
//     or player) have no entry in fluidLevels — they render full-cube via the mesher's water/lava
//     arms and spread at MAX_LEVEL into neighbours.
//   - world.set() is called with markDirty=false and trackEdit=false so FluidSim controls its
//     own bounded chunk-dirty marking and does not persist transient flow into chunkEdits.
//   - Active-set model: only cells enqueued by disturbance (placeSource, removeSource,
//     onBlockChanged) are ever evaluated. The generated ocean is NEVER auto-enqueued, so it
//     stays inert (anti-flood + perf fix). Recede is automatic: remove a source -> fed cells
//     re-resolve -> lose feeder -> newLevel 0 -> removed -> neighbours enqueued -> cascade.

const WATER_ID = 15;
const LAVA_ID  = 21;

// Minecraft water: source=8, levels 7→1 spreading; we use 7 levels (7=source-adj, 1=farthest).
// Level stored in fluidLevels is the CURRENT level of a flowing cell (1–7).
// Source cells are NOT in fluidLevels — they spread as if they are level MAX_LEVEL (8 equiv).
const FLUID_DEFS = {
  [WATER_ID]: { maxLevel: 7, tickMs: 250 },
  [LAVA_ID]:  { maxLevel: 3, tickMs: 500 },
};

// H_DIRS uses ASCII hyphen-minus — NOT Unicode minus (U+2212).
const H_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Maximum cells evaluated per tick (prevents frame spikes).
const MAX_CELLS_PER_TICK = 400;

export class FluidSim {
  /**
   * @param {import('./world').VoxelWorld} world
   */
  constructor(world) {
    this.world = world;
    // fluidLevels: key = "x,y,z" → { level: number, falling: boolean, fluidId: number }
    // Only FLOWING cells are stored here; source blocks are tracked by world block id only.
    this.fluidLevels = new Map();
    // Per-fluid accumulator for fixed-step timing.
    this._accMs = { [WATER_ID]: 0, [LAVA_ID]: 0 };
    // Dirty chunk coords collected during a tick — flushed once at end of _runTick.
    this._dirtyChunks = new Set();
    // Per-fluid active sets: "x,y,z" keys that need evaluation on the next tick.
    // Keyed by fluidId so water ticks never consume lava cells and vice versa.
    // Insertion-ordered (JS Set preserves insertion order) — FIFO consumption = deterministic.
    this._active = { [WATER_ID]: new Set(), [LAVA_ID]: new Set() };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Advance the sim by dtMs milliseconds.
   * Called from updateSimulation with deltaMs.
   */
  tick(dtMs) {
    for (const [fluidId, def] of Object.entries(FLUID_DEFS)) {
      const id = Number(fluidId);
      this._accMs[id] += dtMs;
      while (this._accMs[id] >= def.tickMs) {
        this._accMs[id] -= def.tickMs;
        this._runTick(id, def);
      }
    }
  }

  /**
   * Notify the sim that a source block was placed at (x,y,z).
   * The block has already been written to world by the caller.
   */
  placeSource(x, y, z, fluidId) {
    this._enqueueWithNeighbours(x, y, z, fluidId);
    this._checkInteraction(x, y, z, fluidId);
  }

  /**
   * Notify the sim that a source block was removed (broken or replaced) at (x,y,z).
   * The caller has already set the world block to 0.
   */
  removeSource(x, y, z, fluidId) {
    // Eagerly remove any flowing cell that happens to be at this position.
    this._removeFlowingCell(x, y, z);
    // Enqueue into the specific fluid's set if known; otherwise both (block already cleared).
    this._enqueueWithNeighbours(x, y, z, fluidId);
  }

  /**
   * Notify the sim that a non-fluid block was placed or broken at (x,y,z).
   * Call this from breakBlock/placeBlock in main.js after world.set().
   * Digging next to water lets it flow in; placing a block stops flow.
   */
  onBlockChanged(x, y, z) {
    // No specific fluid: enqueue into both sets so either fluid can react.
    this._enqueueWithNeighbours(x, y, z);
  }

  /**
   * Clear all flowing cells and reset accumulators (for new-world / regenerate).
   */
  reset() {
    for (const [key] of this.fluidLevels) {
      const [x, y, z] = key.split(',').map(Number);
      this.world.set(x, y, z, 0, false, false);
    }
    this.fluidLevels.clear();
    this._accMs[WATER_ID] = 0;
    this._accMs[LAVA_ID]  = 0;
    this._dirtyChunks.clear();
    this._active[WATER_ID].clear();
    this._active[LAVA_ID].clear();
  }

  /**
   * Restore flowing cells from a save snapshot.
   * snapshot: array of [x, y, z, level, falling, fluidId] tuples, or null.
   */
  restore(snapshot) {
    this.reset();
    if (!snapshot || !Array.isArray(snapshot)) return;
    for (const [x, y, z, level, falling, fluidId] of snapshot) {
      const key = `${x},${y},${z}`;
      this.fluidLevels.set(key, { level, falling: !!falling, fluidId });
      this.world.set(x, y, z, fluidId, false, false);
      // Re-enqueue restored flowing cells so they re-verify their levels on next tick.
      this._active[fluidId].add(key);
    }
  }

  /**
   * Serialise flowing cells for saving.
   * Returns an array of [x, y, z, level, falling, fluidId] tuples.
   */
  serialise() {
    const out = [];
    for (const [key, info] of this.fluidLevels) {
      const [x, y, z] = key.split(',').map(Number);
      out.push([x, y, z, info.level, info.falling ? 1 : 0, info.fluidId]);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Internal tick logic
  // ---------------------------------------------------------------------------

  _runTick(fluidId, def) {
    const maxLevel = def.maxLevel;
    let evaluated = 0;
    const activeSet = this._active[fluidId];

    // Consume up to MAX_CELLS_PER_TICK entries from this fluid's active set in insertion order (FIFO).
    // We collect them first so iteration is not disturbed by adds during resolution.
    const toProcess = [];
    for (const key of activeSet) {
      if (evaluated >= MAX_CELLS_PER_TICK) break;
      toProcess.push(key);
      evaluated++;
    }
    for (const key of toProcess) {
      activeSet.delete(key);
    }

    // Sort for fully deterministic order within the batch (FIFO gets us most of the way;
    // sort ensures replay stability regardless of Set implementation details).
    toProcess.sort();

    for (const key of toProcess) {
      const [x, y, z] = key.split(',').map(Number);
      this._resolveCell(x, y, z, fluidId, maxLevel);
    }

    // Flush dirty chunk marks.
    for (const ck of this._dirtyChunks) {
      const [cx, cz] = ck.split(',').map(Number);
      this.world.markChunkDirty(cx, cz, false);
    }
    this._dirtyChunks.clear();
  }

  /**
   * Core recompute-from-neighbours resolution for a single cell.
   * SOURCE cells: output downward (falling) and horizontally (maxLevel-1).
   * FLOWING cells: recompute level from neighbours; remove if no feeder.
   */
  _resolveCell(x, y, z, fluidId, maxLevel) {
    const W = this.world;
    const blockId = W.get(x, y, z);
    const key = `${x},${y},${z}`;
    const flowInfo = this.fluidLevels.get(key);

    const isSource  = (blockId === fluidId) && !flowInfo;
    const isFlowing = (blockId === fluidId) && !!flowInfo;

    if (isSource) {
      // SOURCE: spread downward and horizontally. Do not modify the source block itself.
      const below = y - 1;
      if (below >= 0 && this._isPassableForFluid(x, below, z, fluidId)) {
        if (this._placeFlowing(x, below, z, maxLevel, true, fluidId)) {
          this._enqueueWithNeighbours(x, below, z, fluidId);
          this._checkInteraction(x, below, z, fluidId);
        }
      }
      for (const [dx, dz] of H_DIRS) {
        const nx = x + dx, nz = z + dz;
        if (this._isPassableForFluid(nx, y, nz, fluidId)) {
          if (this._placeFlowing(nx, y, nz, maxLevel - 1, false, fluidId)) {
            this._enqueueWithNeighbours(nx, y, nz, fluidId);
            this._checkInteraction(nx, y, nz, fluidId);
          }
        }
      }
      return;
    }

    if (isFlowing) {
      // FLOWING: recompute what level this cell should have.
      const above = y + 1;
      const aboveId = W.get(x, above, z);
      const hasFluidAbove = (aboveId === fluidId); // source OR flowing above

      if (hasFluidAbove) {
        // Fluid directly above → this cell is falling at maxLevel.
        // Continue falling downward if possible; otherwise floor and pool.
        const below = y - 1;
        if (below >= 0 && this._isPassableForFluid(x, below, z, fluidId)) {
          // Still falling — keep falling=true.
          const changed = this._placeFlowing(x, y, z, maxLevel, true, fluidId);
          if (changed) this._enqueueWithNeighbours(x, y, z, fluidId);
          if (this._placeFlowing(x, below, z, maxLevel, true, fluidId)) {
            this._enqueueWithNeighbours(x, below, z, fluidId);
            this._checkInteraction(x, below, z, fluidId);
          }
        } else {
          // Hit the floor — set falling=false and pool outward at maxLevel-1.
          // Must be decided in one _placeFlowing call so changed-detection is stable. (Fix #2)
          const changed = this._placeFlowing(x, y, z, maxLevel, false, fluidId);
          if (changed) this._enqueueWithNeighbours(x, y, z, fluidId);
          for (const [dx, dz] of H_DIRS) {
            const nx = x + dx, nz = z + dz;
            if (this._isPassableForFluid(nx, y, nz, fluidId)) {
              if (this._placeFlowing(nx, y, nz, maxLevel - 1, false, fluidId)) {
                this._enqueueWithNeighbours(nx, y, nz, fluidId);
                this._checkInteraction(nx, y, nz, fluidId);
              }
            }
          }
        }
        return;
      }

      // No fluid above: derive level from horizontal neighbours.
      // A source neighbour feeds at maxLevel so adjacent flowing cells settle at maxLevel-1,
      // matching what the source branch places directly (Fix #1 — was maxLevel+1 causing level
      // to flip between maxLevel-1 and maxLevel every tick and never settle).
      let bestFeed = 0;
      for (const [dx, dz] of H_DIRS) {
        const nx = x + dx, nz = z + dz;
        const nId = W.get(nx, y, nz);
        if (nId !== fluidId) continue;
        const nFlow = this.fluidLevels.get(`${nx},${y},${nz}`);
        const nIsSource = !nFlow;
        const feedLevel = nIsSource ? maxLevel : nFlow.level; // source feeds at maxLevel → neighbour gets maxLevel-1
        if (feedLevel > bestFeed) bestFeed = feedLevel;
      }

      const newLevel = bestFeed - 1;

      if (newLevel <= 0) {
        // No feeder → remove this cell (recede).
        this._removeFlowingCell(x, y, z);
        this._enqueueNeighbours(x, y, z, fluidId); // cascade recede outward
        return;
      }

      // Update level if it changed.
      const changed = this._placeFlowing(x, y, z, newLevel, false, fluidId);
      if (changed) this._enqueueWithNeighbours(x, y, z, fluidId);

      // Try to spread further: down first, then horizontal.
      const below = y - 1;
      if (below >= 0 && this._isPassableForFluid(x, below, z, fluidId)) {
        if (this._placeFlowing(x, below, z, maxLevel, true, fluidId)) {
          this._enqueueWithNeighbours(x, below, z, fluidId);
          this._checkInteraction(x, below, z, fluidId);
        }
      } else if (newLevel > 1) {
        for (const [dx, dz] of H_DIRS) {
          const nx = x + dx, nz = z + dz;
          if (this._isPassableForFluid(nx, y, nz, fluidId)) {
            if (this._placeFlowing(nx, y, nz, newLevel - 1, false, fluidId)) {
              this._enqueueWithNeighbours(nx, y, nz, fluidId);
              this._checkInteraction(nx, y, nz, fluidId);
            }
          }
        }
      }
      return;
    }

    // Cell is neither source nor flowing — nothing to do here.
    // (Could be air: neighbours may have been enqueued in error, which is safe to skip.)
  }

  // ---------------------------------------------------------------------------
  // Active-set helpers
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a cell and all 6 of its face-neighbours.
   * If fluidId is given, enqueue only into that fluid's active set.
   * If fluidId is omitted (undefined), enqueue into BOTH fluid sets (used when the
   * disturbed fluid is unknown, e.g. onBlockChanged or removeSource without prior id).
   */
  _enqueueWithNeighbours(x, y, z, fluidId) {
    this._enqueueKey(`${x},${y},${z}`, fluidId);
    this._enqueueNeighbours(x, y, z, fluidId);
  }

  /** Enqueue just the 6 face-neighbours (not the cell itself). */
  _enqueueNeighbours(x, y, z, fluidId) {
    this._enqueueKey(`${x},${y - 1},${z}`, fluidId);
    this._enqueueKey(`${x},${y + 1},${z}`, fluidId);
    for (const [dx, dz] of H_DIRS) {
      this._enqueueKey(`${x + dx},${y},${z + dz}`, fluidId);
    }
  }

  /** Insert a key into the appropriate active set(s). */
  _enqueueKey(key, fluidId) {
    if (fluidId !== undefined) {
      this._active[fluidId].add(key);
    } else {
      this._active[WATER_ID].add(key);
      this._active[LAVA_ID].add(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Cell placement / removal helpers
  // ---------------------------------------------------------------------------

  _isPassableForFluid(x, y, z, fluidId) {
    if (!this.world.isWithinVerticalBounds(y)) return false;
    const id = this.world.get(x, y, z);
    if (id === 0) return true;
    // A flowing cell of the same fluid is passable (can be reinforced to higher level).
    if (id === fluidId && this.fluidLevels.has(`${x},${y},${z}`)) return true;
    return false;
  }

  /**
   * Place or update a flowing cell. Returns true if any state changed.
   */
  _placeFlowing(x, y, z, level, falling, fluidId) {
    const key = `${x},${y},${z}`;
    const existing = this.fluidLevels.get(key);
    if (existing) {
      if (existing.level === level && existing.falling === falling && existing.fluidId === fluidId) {
        return false; // no change
      }
      existing.level = level;
      existing.falling = falling;
      existing.fluidId = fluidId;
    } else {
      this.fluidLevels.set(key, { level, falling, fluidId });
    }
    this.world.set(x, y, z, fluidId, false, false);
    this._markChunkDirty(Math.floor(x / this.world.chunkSize), Math.floor(z / this.world.chunkSize));
    return true;
  }

  _removeFlowingCell(x, y, z) {
    const key = `${x},${y},${z}`;
    if (!this.fluidLevels.has(key)) return;
    this.fluidLevels.delete(key);
    const id = this.world.get(x, y, z);
    if (id === WATER_ID || id === LAVA_ID) {
      this.world.set(x, y, z, 0, false, false);
    }
    this._markChunkDirty(Math.floor(x / this.world.chunkSize), Math.floor(z / this.world.chunkSize));
  }

  // ---------------------------------------------------------------------------
  // Water + Lava interaction
  // ---------------------------------------------------------------------------

  _checkInteraction(x, y, z, newFluidId) {
    const W = this.world;
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!W.isWithinVerticalBounds(ny)) continue;
      const nId = W.get(nx, ny, nz);
      if (newFluidId === WATER_ID && nId === LAVA_ID) {
        // Water meets lava → cobblestone at the lava position.
        this._removeFlowingCell(nx, ny, nz);
        W.set(nx, ny, nz, 10, false, true);
        this._markChunkDirty(Math.floor(nx / W.chunkSize), Math.floor(nz / W.chunkSize));
      } else if (newFluidId === LAVA_ID && nId === WATER_ID) {
        // Lava meets water → cobblestone at lava position (x,y,z).
        this._removeFlowingCell(x, y, z);
        W.set(x, y, z, 10, false, true);
        this._markChunkDirty(Math.floor(x / W.chunkSize), Math.floor(z / W.chunkSize));
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Chunk-dirty batching
  // ---------------------------------------------------------------------------

  _markChunkDirty(cx, cz) {
    this._dirtyChunks.add(`${cx},${cz}`);
  }
}
