// Wave R1 — redstone signal simulation.
//
// Design (mirrors fluidSim.js): all persistent state lives in BLOCK IDS (the
// door/trapdoor pattern) so circuits save/load as ordinary block edits with no
// save-schema change. The sim keeps only TRANSIENT state: wire power levels
// (recomputed from the ids on any nearby change), pending timers (button
// release, torch flip delay), and the currently-pressed plate set.
//
// Power model (v1 simplifications vs Minecraft, documented for later waves):
// - Sources: lever-on (86), pressed button (88), pressed plate (90), redstone
//   block (95) power ADJACENT (6-neighbour) wire and blocks at strength 15.
// - Redstone torch (91 lit / 92 off): powers adjacent wire at 15 and the block
//   DIRECTLY ABOVE it; it never powers the block it is mounted on. It turns
//   off when its support block is powered (evaluated with a 100 ms delay, so
//   torch clocks oscillate like Minecraft's).
// - Wire (83 off / 84 on): carries power 15→1, losing 1 per step. Connects to
//   wire in the 4 cardinal directions on the same level, and diagonally one
//   step up/down when the corner block doesn't cut the connection.
// - A block is "powered" if a source is adjacent, a lit torch is directly
//   below it, or a powered wire is adjacent. (No strong/weak distinction yet.)
// - Consumers: lamp (93/94) follows power directly; doors/trapdoors respond to
//   power EDGES (rising edge opens, falling edge closes what redstone opened),
//   so manual door use still works while a circuit is idle.
//
// Determinism: no wall-clock, no Math.random. The sim advances only through
// tick(deltaMs); dirty cells and timers are processed in sorted key order.

import {
  BLOCK_TRANSPARENCY_CLASS,
  REDSTONE_WIRE_IDS, REDSTONE_WIRE_OFF, REDSTONE_WIRE_ON,
  LEVER_ON,
  BUTTON_OFF, BUTTON_PRESSED,
  PLATE_OFF, PLATE_ON,
  REDSTONE_TORCH_IDS, REDSTONE_TORCH_ON, REDSTONE_TORCH_OFF,
  REDSTONE_LAMP_OFF, REDSTONE_LAMP_ON,
  REDSTONE_BLOCK_ID,
  REDSTONE_ATTACHED_IDS,
  DOOR_BLOCK_IDS, DOOR_LOWER_IDS, doorIsOpen, doorToggle,
  TRAPDOOR_BLOCK_IDS, trapdoorIsOpen, trapdoorToggle,
  // Wave R2 — repeaters + comparators
  REPEATER_IDS, repeaterFacing, repeaterDelayIdx, repeaterIsPowered, makeRepeaterId,
  COMPARATOR_IDS, comparatorFacing, comparatorMode, comparatorIsPowered, makeComparatorId,
  REDSTONE_FACING_DIRS,
  // Wave R3 — pistons
  PISTON_BASE_IDS, PISTON_HEAD_IDS, pistonFacing, pistonIsExtended, pistonIsSticky,
  makePistonId, makePistonHeadId, pistonHeadFacing, pistonHeadIsSticky, PISTON_FACING_DIRS,
  FLORA_BLOCK_IDS,
  // Wave R4 — hoppers
  HOPPER_IDS, hopperFacing, hopperIsLocked, makeHopperId,
  // Wave R5 — dispensers/droppers + observers
  EJECTOR_IDS, ejectorFacing, ejectorIsDropper,
  OBSERVER_IDS, observerFacing, observerIsPowered, makeObserverId,
} from "./textures";

const MAX_POWER = 15;
// Wave R3 — pistons push at most this many contiguous blocks (Minecraft's limit).
const PISTON_PUSH_LIMIT = 12;
// Blocks a piston can never move: containers with per-position state maps
// (furnace 7, chest 22, dispensers/droppers 190-201), bedrock 13, and other
// pistons/heads (avoids desyncing pending piston timers keyed by position).
// Wave R5 — observers (202-213) are also immovable here (their last-seen state
// is keyed by position; a deliberate deviation from Minecraft, documented).
// Everything else needs to be a plain full cube (transparency class 0) or
// glass (14) to be pushable.
const PISTON_IMMOVABLE = new Set([7, 13, 22, ...Array.from({ length: 24 }, (_, i) => 190 + i)]);
// Bounded work per evaluation so a pathological wire field can't stall a frame.
// Known limit: a single connected network larger than this recomputes only the
// gathered region; wire fed solely from beyond the frontier can read stale.
const MAX_NETWORK_CELLS = 2048;
const MAX_EVAL_PASSES = 8;
// Minecraft timings: 1 redstone tick = 100 ms; stone button holds for 1 s.
const TORCH_FLIP_DELAY_MS = 100;
const BUTTON_RELEASE_MS = 1000;
// Torch burnout (Minecraft-accurate + the perf guard that keeps a torch clock
// from being a permanent 10 Hz light-emitter flip = ~90 chunk relights/sec):
// more than BURNOUT_FLIPS flips inside BURNOUT_WINDOW_MS forces the torch OFF
// and it stays off until a real neighbour change re-evaluates it.
const TORCH_BURNOUT_FLIPS = 8;
const TORCH_BURNOUT_WINDOW_MS = 1600;
// Wave R3 — the same guard for pistons: a sticky piston facing a redstone block
// self-oscillates at 10 Hz forever (each transition moves an opaque block =
// 9-column relight; measured 15-33x frame cost). After the limit the piston
// freezes in place until a real neighbour change re-evaluates it.
const PISTON_BURNOUT_FLIPS = 6;
const PISTON_BURNOUT_WINDOW_MS = 2000;
// Wave R5 — observers: two face-to-face observers ping-pong pulses at 5 Hz
// forever (each pulse edits a block = remesh). Same guard family: over the
// limit, pulses are swallowed until a real neighbour change re-evaluates.
const OBSERVER_BURNOUT_FLIPS = 8;
const OBSERVER_BURNOUT_WINDOW_MS = 1600;

const EMPTY_CELLS = [];

const HORIZONTAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function cellKey(x, y, z) {
  return `${x},${y},${z}`;
}

function parseKey(key) {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

// A component can be mounted on (and signal is cut by) plain full opaque cubes.
function isSolidCube(id) {
  return id !== 0 && (BLOCK_TRANSPARENCY_CLASS[id] || 0) === 0;
}

function isActiveSource(id) {
  return id === LEVER_ON || id === BUTTON_PRESSED || id === PLATE_ON || id === REDSTONE_BLOCK_ID;
}

export class RedstoneSim {
  /**
   * @param {object} opts
   * @param {object} opts.world - VoxelWorld (get/set).
   * @param {function} [opts.onComponentPopped] - (blockId, x, y, z) called when a
   *   component loses its support and pops off. The caller resolves the drop item
   *   (survival.js BLOCK_DROPS) and spawns the entity — no drop table lives here.
   */
  constructor({ world, onComponentPopped = null }) {
    this.world = world;
    this.onComponentPopped = onComponentPopped;
    this._accumMs = 0;
    this._dirty = new Set();          // cell keys needing circuit re-evaluation
    this._wirePower = new Map();      // wire cell key -> 0..15 (transient, derived)
    this._pressedPlates = new Set();  // plate cell keys currently held down
    this._buttonTimers = new Map();   // cell key -> release-due ms (accum clock)
    this._torchTimers = new Map();    // cell key -> { due, target }
    this._torchFlipHistory = new Map(); // cell key -> { windowStart, count } (burnout)
    this._poweredDoors = new Set();   // lower-door cell keys opened by redstone
    this._poweredTrapdoors = new Set();
    // Wave R2 — repeater/comparator transient state. _componentOutput is the
    // analog strength a powered component drives its FRONT cell with (repeater
    // always 15; comparator computed 0-15). Timers model the 1-4 tick delays.
    this._componentOutput = new Map();  // cell key -> 0..15
    this._repeaterTimers = new Map();   // cell key -> { due, target: bool }
    this._comparatorTimers = new Map(); // cell key -> { due, powered: bool, strength }
    // Wave R3 — piston timers: { due, extend: bool } keyed by the base cell.
    this._pistonTimers = new Map();
    this._pistonFlipHistory = new Map(); // cell key -> { windowStart, count } (burnout)
    // Optional callback: (movedCells: [{x,y,z}], dir: [dx,dy,dz]) after an extension
    // moves blocks — main.js displaces overlapping entities + flags falling blocks.
    this.onPistonMoved = null;
    // Wave R4 — optional callback: (x,y,z) -> 0..15 comparator signal for a
    // container cell (chest/furnace/hopper fullness). main.js supplies it since
    // container state maps live there.
    this.getContainerSignal = null;
    // Wave R5 — dispensers/droppers (edge-triggered) + observers (change pulse).
    this._ejectorPowered = new Map();   // cell key -> bool (last seen powered state)
    this._ejectorTimers = new Map();    // cell key -> fire-due ms
    this._observerLastSeen = new Map(); // cell key -> watched cell's block id
    this._observerTimers = new Map();   // cell key -> { due, phase: "on"|"off" }
    this._observerFlipHistory = new Map(); // cell key -> { windowStart, count }
    // Optional callback: (x, y, z, facing, isDropper) when an ejector fires.
    // main.js owns the 9-slot contents and does the actual dispensing.
    this.onEjectorFire = null;
    this._changedCells = [];          // cells world.set since the last drain
  }

  reset() {
    this._accumMs = 0;
    this._dirty.clear();
    this._wirePower.clear();
    this._pressedPlates.clear();
    this._buttonTimers.clear();
    this._torchTimers.clear();
    this._torchFlipHistory.clear();
    this._poweredDoors.clear();
    this._poweredTrapdoors.clear();
    this._componentOutput.clear();
    this._repeaterTimers.clear();
    this._comparatorTimers.clear();
    this._pistonTimers.clear();
    this._pistonFlipHistory.clear();
    this._ejectorPowered.clear();
    this._ejectorTimers.clear();
    this._observerLastSeen.clear();
    this._observerTimers.clear();
    this._observerFlipHistory.clear();
    this._changedCells.length = 0;
  }

  /** Notify the sim that a block changed at x,y,z (break/place/debug setBlock). */
  onBlockChanged(x, y, z) {
    this._dirty.add(cellKey(x, y, z));
  }

  /**
   * After a save is loaded: seed evaluation from the persisted edit list so wire
   * power is rederived and any mid-activation button/plate ids get released.
   * `edits` is world.exportEdits() shape — a flat array of { x, y, z, type }.
   */
  seedFromWorldEdits(edits) {
    if (!Array.isArray(edits)) return;
    for (const e of edits) {
      const id = e?.type;
      if (!Number.isFinite(id) || id < 83 || id > 213) continue;
      const key = cellKey(e.x, e.y, e.z);
      this._dirty.add(key);
      // Stale pressed buttons from an old save get a release timer.
      if (id === BUTTON_PRESSED && !this._buttonTimers.has(key)) {
        this._buttonTimers.set(key, this._accumMs + BUTTON_RELEASE_MS);
      }
      // Wave R5 — a powered observer id (208-213) is a TRANSIENT pulse state that
      // was captured mid-pulse (its 100 ms off-flip lived only in _observerTimers,
      // which reset() just cleared). Left as-is it would emit 15 out of its back
      // FOREVER — a stuck circuit with no in-game remedy. Reset it to unpowered
      // now; _evaluate re-primes _observerLastSeen so the next real change pulses.
      if (OBSERVER_IDS.has(id) && observerIsPowered(id)) {
        this._setBlock(e.x, e.y, e.z, makeObserverId(observerFacing(id), false));
      }
    }
  }

  /** Right-click on a lever: flip it and re-evaluate. Returns the new id. */
  toggleLever(x, y, z) {
    const id = this.world.get(x, y, z);
    if (id !== 85 && id !== 86) return null;
    const next = id === 85 ? 86 : 85;
    this._setBlock(x, y, z, next);
    return next;
  }

  /** Right-click on a button: press it (no-op if already pressed). */
  pressButton(x, y, z) {
    const id = this.world.get(x, y, z);
    if (id !== BUTTON_OFF) return false;
    this._setBlock(x, y, z, BUTTON_PRESSED);
    this._buttonTimers.set(cellKey(x, y, z), this._accumMs + BUTTON_RELEASE_MS);
    return true;
  }

  /**
   * Per-tick plate detection. `pressingCells` = block cells occupied by entity
   * feet (player + mobs); `count` bounds the scan so callers can reuse a pooled
   * scratch array. Newly-covered plates press; vacated plates release.
   * Idle path (no plate under anyone, none pressed) allocates nothing.
   */
  updatePlates(pressingCells, count = pressingCells.length) {
    let now = null; // lazily created — most frames touch no plates
    for (let i = 0; i < count; i += 1) {
      const c = pressingCells[i];
      const id = this.world.get(c.x, c.y, c.z);
      if (id === PLATE_OFF || id === PLATE_ON) {
        const key = cellKey(c.x, c.y, c.z);
        if (!now) now = new Set();
        now.add(key);
        if (id === PLATE_OFF) this._setBlockKey(key, PLATE_ON);
      }
    }
    if (this._pressedPlates.size > 0) {
      for (const key of [...this._pressedPlates].sort()) {
        if (!now || !now.has(key)) {
          const { x, y, z } = parseKey(key);
          if (this.world.get(x, y, z) === PLATE_ON) this._setBlock(x, y, z, PLATE_OFF);
        }
      }
    }
    if (now) this._pressedPlates = now;
    else if (this._pressedPlates.size > 0) this._pressedPlates.clear();
  }

  /**
   * Advance the sim clock: fire due timers, then re-evaluate dirty circuits.
   * Returns (and drains) the cells whose block id changed since the last drain —
   * including plate flips recorded by updatePlates earlier this frame — so the
   * caller can rebuild those chunks immediately. Idle path allocates nothing.
   */
  tick(deltaMs) {
    this._accumMs += deltaMs;

    // Button releases (sorted for determinism).
    if (this._buttonTimers.size > 0) {
      for (const key of [...this._buttonTimers.keys()].sort()) {
        if (this._buttonTimers.get(key) > this._accumMs) continue;
        this._buttonTimers.delete(key);
        const { x, y, z } = parseKey(key);
        if (this.world.get(x, y, z) === BUTTON_PRESSED) this._setBlock(x, y, z, BUTTON_OFF);
      }
    }

    // Torch flips (the 1-redstone-tick delay that makes clocks oscillate).
    if (this._torchTimers.size > 0) {
      for (const key of [...this._torchTimers.keys()].sort()) {
        const timer = this._torchTimers.get(key);
        if (timer.due > this._accumMs) continue;
        this._torchTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!REDSTONE_TORCH_IDS.has(id) || id === timer.target) continue;
        // Burnout: count fired flips per torch in a rolling window; a fast clock
        // exceeds the limit and the torch refuses to relight until a real
        // neighbour change re-evaluates it (Minecraft behaviour + perf bound).
        let hist = this._torchFlipHistory.get(key);
        if (!hist || this._accumMs - hist.windowStart > TORCH_BURNOUT_WINDOW_MS) {
          hist = { windowStart: this._accumMs, count: 0 };
          this._torchFlipHistory.set(key, hist);
        }
        hist.count += 1;
        if (hist.count >= TORCH_BURNOUT_FLIPS && timer.target === REDSTONE_TORCH_ON) {
          continue; // burned out — stay off
        }
        this._setBlock(x, y, z, timer.target);
      }
    }

    // Wave R2 — repeater flips (1-4 tick delay; refresh-to-15 directional output).
    if (this._repeaterTimers.size > 0) {
      for (const key of [...this._repeaterTimers.keys()].sort()) {
        const timer = this._repeaterTimers.get(key);
        if (timer.due > this._accumMs) continue;
        this._repeaterTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!REPEATER_IDS.has(id)) continue;
        this._componentOutput.set(key, timer.target ? MAX_POWER : 0);
        const next = makeRepeaterId(repeaterFacing(id), repeaterDelayIdx(id), timer.target);
        if (id !== next) this._setBlock(x, y, z, next);
        else this._dirty.add(key); // output changed without an id change — recompute downstream
      }
    }

    // Wave R3 — piston extend/retract (1 tick delay; moves blocks).
    if (this._pistonTimers.size > 0) {
      for (const key of [...this._pistonTimers.keys()].sort()) {
        const timer = this._pistonTimers.get(key);
        if (timer.due > this._accumMs) continue;
        this._pistonTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!PISTON_BASE_IDS.has(id)) continue;
        const wouldTransition = timer.extend !== pistonIsExtended(id);
        if (wouldTransition) {
          // Burnout: an unattended oscillator (e.g. sticky piston + redstone
          // block) must not run at 10 Hz forever. Over the limit -> freeze; a
          // skipped fire changes nothing, so no new dirty is seeded and the
          // contraption stays quiet until a real neighbour change re-kicks it.
          let hist = this._pistonFlipHistory.get(key);
          if (!hist || this._accumMs - hist.windowStart > PISTON_BURNOUT_WINDOW_MS) {
            hist = { windowStart: this._accumMs, count: 0 };
            this._pistonFlipHistory.set(key, hist);
          }
          hist.count += 1;
          if (hist.count >= PISTON_BURNOUT_FLIPS) continue;
        }
        if (timer.extend && !pistonIsExtended(id)) this._pistonExtend(x, y, z, id);
        else if (!timer.extend && pistonIsExtended(id)) this._pistonRetract(x, y, z, id);
      }
    }

    // Wave R2 — comparator updates (1 tick delay; analog strength output).
    if (this._comparatorTimers.size > 0) {
      for (const key of [...this._comparatorTimers.keys()].sort()) {
        const timer = this._comparatorTimers.get(key);
        if (timer.due > this._accumMs) continue;
        this._comparatorTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!COMPARATOR_IDS.has(id)) continue;
        this._componentOutput.set(key, timer.strength);
        const next = makeComparatorId(comparatorFacing(id), comparatorMode(id), timer.powered);
        if (id !== next) this._setBlock(x, y, z, next);
        else this._dirty.add(key); // strength-only change still re-evaluates downstream
      }
    }

    // Wave R5 — ejector fire: one dispense per rising edge, 1 tick after it.
    // main.js owns the item logic; the sim only reports (x,y,z,facing,kind).
    if (this._ejectorTimers.size > 0) {
      for (const key of [...this._ejectorTimers.keys()].sort()) {
        if (this._ejectorTimers.get(key) > this._accumMs) continue;
        this._ejectorTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!EJECTOR_IDS.has(id)) continue;
        if (this.onEjectorFire) this.onEjectorFire(x, y, z, ejectorFacing(id), ejectorIsDropper(id));
      }
    }

    // Wave R5 — observer pulse: 1 tick after the watched change, the back
    // powers for 1 tick, then drops. Both flips ride _setBlock so downstream
    // circuits (and observers watching THIS observer) re-evaluate.
    if (this._observerTimers.size > 0) {
      for (const key of [...this._observerTimers.keys()].sort()) {
        const timer = this._observerTimers.get(key);
        if (timer.due > this._accumMs) continue;
        this._observerTimers.delete(key);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        if (!OBSERVER_IDS.has(id)) continue;
        if (timer.phase === "on") {
          if (!observerIsPowered(id)) this._setBlock(x, y, z, makeObserverId(observerFacing(id), true));
          this._observerTimers.set(key, { due: this._accumMs + TORCH_FLIP_DELAY_MS, phase: "off" });
        } else if (observerIsPowered(id)) {
          this._setBlock(x, y, z, makeObserverId(observerFacing(id), false));
        }
      }
    }

    if (this._dirty.size > 0) this._evaluate();

    if (this._changedCells.length === 0) return EMPTY_CELLS;
    const drained = this._changedCells.slice();
    this._changedCells.length = 0;
    return drained;
  }

  /** Wire power (0-15) or source strength at a cell — for debug/text-state. */
  getPowerAt(x, y, z) {
    const id = this.world.get(x, y, z);
    if (REDSTONE_WIRE_IDS.has(id)) {
      const stored = this._wirePower.get(cellKey(x, y, z));
      if (stored !== undefined) return stored;
      return id === REDSTONE_WIRE_ON ? MAX_POWER : 0;
    }
    if (isActiveSource(id) || id === REDSTONE_TORCH_ON) return MAX_POWER;
    // Wave R2 — a component reports its current output strength.
    if (REPEATER_IDS.has(id)) {
      if (!repeaterIsPowered(id)) return 0;
      return this._componentOutput.get(cellKey(x, y, z)) ?? MAX_POWER;
    }
    if (COMPARATOR_IDS.has(id)) {
      if (!comparatorIsPowered(id)) return 0;
      return this._componentOutput.get(cellKey(x, y, z)) ?? MAX_POWER;
    }
    // Wave R5 — a pulsing observer reads 15 (its back output strength).
    if (OBSERVER_IDS.has(id)) return observerIsPowered(id) ? MAX_POWER : 0;
    return 0;
  }

  stats() {
    return {
      trackedWireCells: this._wirePower.size,
      pressedPlates: this._pressedPlates.size,
      pendingButtons: this._buttonTimers.size,
      pendingTorchFlips: this._torchTimers.size,
      pendingRepeaters: this._repeaterTimers.size,
      pendingComparators: this._comparatorTimers.size,
      pendingPistons: this._pistonTimers.size,
      pendingEjectors: this._ejectorTimers.size,
      pendingObservers: this._observerTimers.size,
      dirtyCells: this._dirty.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _setBlock(x, y, z, id) {
    this.world.set(x, y, z, id);
    this._changedCells.push({ x, y, z });
    this._dirty.add(cellKey(x, y, z));
  }

  _setBlockKey(key, id) {
    const { x, y, z } = parseKey(key);
    this._setBlock(x, y, z, id);
  }

  /** Wire cells connected to the wire at x,y,z (cardinals + one-step up/down). */
  _wireNeighbors(x, y, z) {
    const result = [];
    const aboveSelf = this.world.get(x, y + 1, z);
    for (const [dx, dz] of HORIZONTAL_DIRS) {
      const side = this.world.get(x + dx, y, z + dz);
      if (REDSTONE_WIRE_IDS.has(side)) {
        result.push([x + dx, y, z + dz]);
        continue;
      }
      // Step up: wire on top of the neighbouring block, reachable when nothing
      // solid sits directly above this wire to cut the diagonal.
      if (!isSolidCube(aboveSelf) && REDSTONE_WIRE_IDS.has(this.world.get(x + dx, y + 1, z + dz))) {
        result.push([x + dx, y + 1, z + dz]);
      }
      // Step down: wire one below the neighbouring cell, reachable when the
      // neighbouring cell itself doesn't contain a solid block.
      if (!isSolidCube(side) && REDSTONE_WIRE_IDS.has(this.world.get(x + dx, y - 1, z + dz))) {
        result.push([x + dx, y - 1, z + dz]);
      }
    }
    return result;
  }

  /**
   * Wave R2 — strength a repeater/comparator at (cx,cy,cz) drives into the cell
   * (tx,ty,tz), or 0 when it isn't a powered component facing that cell.
   */
  _componentOutputInto(cx, cy, cz, tx, ty, tz) {
    const id = this.world.get(cx, cy, cz);
    // Wave R5 — a pulsing observer drives 15 out of its BACK. Checked before
    // the same-level guard because observers can face (and output) vertically.
    if (OBSERVER_IDS.has(id)) {
      if (!observerIsPowered(id)) return 0;
      const [odx, ody, odz] = PISTON_FACING_DIRS[observerFacing(id)];
      return (cx - odx === tx && cy - ody === ty && cz - odz === tz) ? MAX_POWER : 0;
    }
    if (cy !== ty) return 0;
    let facing = -1;
    if (REPEATER_IDS.has(id)) {
      if (!repeaterIsPowered(id)) return 0;
      facing = repeaterFacing(id);
    } else if (COMPARATOR_IDS.has(id)) {
      if (!comparatorIsPowered(id)) return 0;
      facing = comparatorFacing(id);
    } else {
      return 0;
    }
    const [fdx, fdz] = REDSTONE_FACING_DIRS[facing];
    if (cx + fdx !== tx || cz + fdz !== tz) return 0;
    const stored = this._componentOutput.get(cellKey(cx, cy, cz));
    return stored !== undefined ? stored : MAX_POWER;
  }

  /**
   * Wave R2 — analog signal level present in a single cell, as read by a
   * repeater/comparator input at (rx,ry,rz): wire level, full-strength sources,
   * or another component's output pointed at the reader.
   */
  _readSignalAt(x, y, z, rx, ry, rz, allowContainer = false) {
    const id = this.world.get(x, y, z);
    if (REDSTONE_WIRE_IDS.has(id)) {
      const stored = this._wirePower.get(cellKey(x, y, z));
      if (stored !== undefined) return stored;
      return id === REDSTONE_WIRE_ON ? MAX_POWER : 0;
    }
    if (isActiveSource(id) || id === REDSTONE_TORCH_ON) return MAX_POWER;
    // Wave R4 — ONLY the comparator's REAR read may see container fullness
    // (chest 22, furnace 7, hopper). Without the gate, a repeater in front of a
    // stocked chest would phantom-latch ON and comparator SIDES would subtract
    // phantom signal (must-fix from the R4 review).
    if (allowContainer && (id === 22 || id === 7 || HOPPER_IDS.has(id)) && this.getContainerSignal) {
      return this.getContainerSignal(x, y, z) | 0;
    }
    return this._componentOutputInto(x, y, z, rx, ry, rz);
  }

  /** Source strength injected into the wire at x,y,z by adjacent components. */
  _wireSourcePower(x, y, z) {
    let best = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const id = this.world.get(x + dx, y + dy, z + dz);
      if (isActiveSource(id) || id === REDSTONE_TORCH_ON) return MAX_POWER;
      // All 6 directions: observers output vertically; the function itself
      // keeps repeaters/comparators same-level (Wave R5).
      const out = this._componentOutputInto(x + dx, y + dy, z + dz, x, y, z);
      if (out > best) best = out;
    }
    return best;
  }

  /**
   * Is the block cell at x,y,z powered? Adjacent active source, lit torch
   * directly below, or adjacent powered wire. `powerMap` supplies wire levels
   * computed this pass (falls back to the on/off id for un-visited wire).
   */
  _isCellPowered(x, y, z, powerMap) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const id = this.world.get(nx, ny, nz);
      if (isActiveSource(id)) return true;
      if (id === REDSTONE_TORCH_ON && dy === -1) return true; // torch below powers this block
      if (REDSTONE_WIRE_IDS.has(id)) {
        const p = powerMap.get(cellKey(nx, ny, nz));
        if (p !== undefined ? p > 0 : id === REDSTONE_WIRE_ON) return true;
      }
      // Wave R2 — a repeater/comparator pointing at this cell powers it.
      // Wave R5 — all 6 directions (observers output vertically; the function
      // itself keeps repeaters/comparators same-level).
      if (this._componentOutputInto(nx, ny, nz, x, y, z) > 0) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Wave R3 — piston mechanics
  // -------------------------------------------------------------------------

  /** Can a piston move this block id (as part of a push, or a sticky pull)? */
  _isPushable(id) {
    if (id === 0) return false;
    if (PISTON_IMMOVABLE.has(id)) return false;
    if (PISTON_BASE_IDS.has(id) || PISTON_HEAD_IDS.has(id)) return false;
    if (id === 14) return true; // glass pushes fine
    return (BLOCK_TRANSPARENCY_CLASS[id] || 0) === 0; // plain full cubes
  }

  /**
   * Extend: collect up to PISTON_PUSH_LIMIT contiguous pushable blocks in front,
   * shift them one cell forward (far to near), place the head, mark the base
   * extended. Attached redstone components in the path pop as drops; a fluid or
   * air cell terminates the row and is overwritten. Fails (no-op) on immovable
   * blocks, over-limit rows, or world bounds.
   */
  _pistonExtend(x, y, z, id) {
    const facing = pistonFacing(id);
    const [dx, dy, dz] = PISTON_FACING_DIRS[facing];
    const row = []; // {x,y,z,id} contiguous pushable blocks, near -> far
    let cx = x + dx, cy = y + dy, cz = z + dz;
    for (; ;) {
      if (!this.world.inBounds(cx, cy, cz)) return; // fail: nowhere to push into
      const b = this.world.get(cx, cy, cz);
      if (b === 0 || b === 15 || b === 21) break; // air/fluid: row ends, cell is consumed
      if (REDSTONE_ATTACHED_IDS.has(b) || FLORA_BLOCK_IDS.has(b)) {
        // Thin components AND flora pop off (as drops); the push consumes their
        // cell. Without the flora case, a stray tall-grass silently bricks the
        // piston with no visible reason.
        this._setBlock(cx, cy, cz, 0);
        this._wirePower.delete(cellKey(cx, cy, cz));
        if (this.onComponentPopped) this.onComponentPopped(b, cx, cy, cz);
        break;
      }
      if (!this._isPushable(b)) return; // fail: immovable in the way
      row.push({ x: cx, y: cy, z: cz, id: b });
      if (row.length > PISTON_PUSH_LIMIT) return; // fail: too heavy
      cx += dx; cy += dy; cz += dz;
    }
    // Move far -> near so nothing overwrites a block that still has to move.
    const moved = [];
    for (let i = row.length - 1; i >= 0; i -= 1) {
      const cell = row[i];
      this._setBlock(cell.x + dx, cell.y + dy, cell.z + dz, cell.id);
      moved.push({ x: cell.x + dx, y: cell.y + dy, z: cell.z + dz });
    }
    // Head occupies the first cell in front; base flips to its extended id.
    // The head cell counts as a moved-into cell too (must-fix: an entity standing
    // in front of a bare piston has to be displaced, not entombed in the head).
    this._setBlock(x + dx, y + dy, z + dz, makePistonHeadId(facing, pistonIsSticky(id)));
    moved.push({ x: x + dx, y: y + dy, z: z + dz });
    this._setBlock(x, y, z, makePistonId(facing, pistonIsSticky(id), true));
    if (this.onPistonMoved) {
      this.onPistonMoved(moved, [dx, dy, dz]);
    }
  }

  /**
   * Retract: clear the head cell; a sticky piston additionally pulls the single
   * pushable block behind the head into the head's old cell.
   */
  _pistonRetract(x, y, z, id) {
    const facing = pistonFacing(id);
    const [dx, dy, dz] = PISTON_FACING_DIRS[facing];
    const hx = x + dx, hy = y + dy, hz = z + dz;
    const headId = this.world.get(hx, hy, hz);
    // Ownership check: only clear a head that matches this base's facing and
    // stickiness — after an explosion severs a pair, a stale extended base must
    // not delete a NEIGHBOURING piston's head (cross-piston corruption).
    const ownsHead = PISTON_HEAD_IDS.has(headId)
      && pistonHeadFacing(headId) === facing
      && pistonHeadIsSticky(headId) === pistonIsSticky(id);
    if (ownsHead) {
      this._setBlock(hx, hy, hz, 0);
      if (pistonIsSticky(id)) {
        const px = hx + dx, py = hy + dy, pz = hz + dz;
        const pulled = this.world.inBounds(px, py, pz) ? this.world.get(px, py, pz) : 0;
        if (this._isPushable(pulled)) {
          this._setBlock(hx, hy, hz, pulled);
          this._setBlock(px, py, pz, 0);
          if (this.onPistonMoved) this.onPistonMoved([{ x: hx, y: hy, z: hz }], [-dx, -dy, -dz]);
        }
      }
    }
    this._setBlock(x, y, z, makePistonId(facing, pistonIsSticky(id), false));
  }

  _evaluate() {
    for (let pass = 0; pass < MAX_EVAL_PASSES && this._dirty.size > 0; pass += 1) {
      const seeds = [...this._dirty].sort();
      this._dirty.clear();

      // --- 1. Support pops: attached components above a removed/changed cell fall off.
      for (const key of seeds) {
        const { x, y, z } = parseKey(key);
        const aboveId = this.world.get(x, y + 1, z);
        if (REDSTONE_ATTACHED_IDS.has(aboveId) && !isSolidCube(this.world.get(x, y, z))) {
          this._setBlock(x, y + 1, z, 0);
          this._wirePower.delete(cellKey(x, y + 1, z));
          if (this.onComponentPopped) {
            this.onComponentPopped(aboveId, x, y + 1, z);
          }
        }
        const selfId = this.world.get(x, y, z);
        // A wire id that vanished (broken/popped) leaves no stale power entry.
        if (!REDSTONE_WIRE_IDS.has(selfId)) this._wirePower.delete(key);
        // Wave R2 — same hygiene for component outputs.
        if (!REPEATER_IDS.has(selfId) && !COMPARATOR_IDS.has(selfId)) this._componentOutput.delete(key);
        // Wave R5 — stale ejector/observer transients when the id vanished. A NEW
        // ejector/observer placed here later must prime fresh (no ghost edges).
        if (!EJECTOR_IDS.has(selfId)) { this._ejectorPowered.delete(key); this._ejectorTimers.delete(key); }
        if (!OBSERVER_IDS.has(selfId)) { this._observerLastSeen.delete(key); this._observerTimers.delete(key); }
        // A door/trapdoor id that vanished must not leave a stale powered-edge key:
        // a NEW door placed here later would otherwise miss its rising edge (or see
        // a phantom falling edge that slams a manually opened door).
        if (!DOOR_LOWER_IDS.has(selfId)) this._poweredDoors.delete(key);
        if (!TRAPDOOR_BLOCK_IDS.has(selfId)) this._poweredTrapdoors.delete(key);
        // Stale pressed plates (e.g. restored from a save) release when no entity holds them.
        if (selfId === PLATE_ON && !this._pressedPlates.has(key)) {
          this._setBlock(x, y, z, PLATE_OFF);
        }
      }

      // --- 2. Gather affected wire networks (bounded flood from seed adjacency).
      const network = new Map(); // wire key -> power (filled in step 3)
      const gatherQueue = [];
      const pushWire = (x, y, z) => {
        const key = cellKey(x, y, z);
        if (!network.has(key) && network.size < MAX_NETWORK_CELLS) {
          network.set(key, 0);
          gatherQueue.push([x, y, z]);
        }
      };
      for (const key of seeds) {
        const { x, y, z } = parseKey(key);
        if (REDSTONE_WIRE_IDS.has(this.world.get(x, y, z))) pushWire(x, y, z);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          if (REDSTONE_WIRE_IDS.has(this.world.get(x + dx, y + dy, z + dz))) pushWire(x + dx, y + dy, z + dz);
        }
        // Also gather STEP-DIAGONAL wires: a removed wire whose only connections
        // were step up/down (a wire staircase) has no 6-adjacent wire, and the far
        // side would otherwise keep stale power forever. _wireNeighbors works from
        // an air cell (it only inspects neighbours); over-gathering is harmless.
        for (const [nx, ny, nz] of this._wireNeighbors(x, y, z)) pushWire(nx, ny, nz);
      }
      while (gatherQueue.length > 0) {
        const [x, y, z] = gatherQueue.shift();
        for (const [nx, ny, nz] of this._wireNeighbors(x, y, z)) pushWire(nx, ny, nz);
      }

      // --- 3. Recompute wire power: multi-source BFS with -1 decay per step.
      const bfs = [];
      for (const key of [...network.keys()].sort()) {
        const { x, y, z } = parseKey(key);
        const src = this._wireSourcePower(x, y, z);
        network.set(key, src);
        if (src > 0) bfs.push([x, y, z, src]);
      }
      while (bfs.length > 0) {
        const [x, y, z, power] = bfs.shift();
        if (power <= 1) continue;
        for (const [nx, ny, nz] of this._wireNeighbors(x, y, z)) {
          const nKey = cellKey(nx, ny, nz);
          if (!network.has(nKey)) continue; // outside the bounded gather — stays as-is
          if (network.get(nKey) < power - 1) {
            network.set(nKey, power - 1);
            bfs.push([nx, ny, nz, power - 1]);
          }
        }
      }

      // --- 4. Apply wire results: store levels, flip on/off ids where crossed.
      for (const [key, power] of network) {
        this._wirePower.set(key, power);
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);
        const want = power > 0 ? REDSTONE_WIRE_ON : REDSTONE_WIRE_OFF;
        if (REDSTONE_WIRE_IDS.has(id) && id !== want) {
          // Direct set (not _setBlock): wire visual flips must not re-dirty the
          // network every pass — power is already authoritative here.
          this.world.set(x, y, z, want);
          this._changedCells.push({ x, y, z });
        }
      }

      // --- 5. Consumers + torches around everything we touched this pass.
      const interesting = new Set(seeds);
      for (const key of network.keys()) interesting.add(key);
      const consumerCells = new Set();
      for (const key of [...interesting].sort()) {
        const { x, y, z } = parseKey(key);
        consumerCells.add(key);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          consumerCells.add(cellKey(x + dx, y + dy, z + dz));
          // A torch INVERTS the block below it, so a torch two cells from a change
          // (sitting on a neighbour of the changed cell) must also re-evaluate.
          consumerCells.add(cellKey(x + dx, y + dy + 1, z + dz));
        }
      }
      for (const key of [...consumerCells].sort()) {
        const { x, y, z } = parseKey(key);
        const id = this.world.get(x, y, z);

        if (id === REDSTONE_LAMP_OFF || id === REDSTONE_LAMP_ON) {
          const powered = this._isCellPowered(x, y, z, this._wirePower);
          const want = powered ? REDSTONE_LAMP_ON : REDSTONE_LAMP_OFF;
          if (id !== want) this._setBlock(x, y, z, want);
        } else if (REDSTONE_TORCH_IDS.has(id)) {
          // Torch inverts its support block's powered state, on a 100 ms delay.
          // A redstone block IS power, so a torch mounted on one is always off.
          const supportPowered = this.world.get(x, y - 1, z) === REDSTONE_BLOCK_ID
            || this._isCellPowered(x, y - 1, z, this._wirePower);
          const want = supportPowered ? REDSTONE_TORCH_OFF : REDSTONE_TORCH_ON;
          const pending = this._torchTimers.get(key);
          if (id === want) {
            if (pending) this._torchTimers.delete(key);
          } else if (!pending || pending.target !== want) {
            this._torchTimers.set(key, { due: this._accumMs + TORCH_FLIP_DELAY_MS, target: want });
          }
        } else if (REPEATER_IDS.has(id)) {
          // Wave R2 — repeater: reads the cell BEHIND (opposite its facing) and,
          // after its delay, drives the cell in front with a fresh 15.
          const facing = repeaterFacing(id);
          const [fdx, fdz] = REDSTONE_FACING_DIRS[facing];
          const level = this._readSignalAt(x - fdx, y, z - fdz, x, y, z);
          const want = level > 0;
          const current = repeaterIsPowered(id);
          const pending = this._repeaterTimers.get(key);
          if (want === current) {
            if (pending && pending.target !== current) this._repeaterTimers.delete(key);
          } else if (!pending || pending.target !== want) {
            const delayMs = (repeaterDelayIdx(id) + 1) * TORCH_FLIP_DELAY_MS;
            this._repeaterTimers.set(key, { due: this._accumMs + delayMs, target: want });
          }
        } else if (COMPARATOR_IDS.has(id)) {
          // Wave R2 — comparator: rear vs the stronger side input. Compare mode
          // passes the rear signal through when rear >= side; subtract mode
          // outputs rear - side. Analog strength feeds the wire BFS.
          const facing = comparatorFacing(id);
          const [fdx, fdz] = REDSTONE_FACING_DIRS[facing];
          const rear = this._readSignalAt(x - fdx, y, z - fdz, x, y, z, true);
          const sideA = this._readSignalAt(x - fdz, y, z + fdx, x, y, z);
          const sideB = this._readSignalAt(x + fdz, y, z - fdx, x, y, z);
          const side = Math.max(sideA, sideB);
          const out = comparatorMode(id) === 1
            ? Math.max(0, rear - side)
            : (rear >= side ? rear : 0);
          const wantPowered = out > 0;
          const currentPowered = comparatorIsPowered(id);
          const stored = this._componentOutput.get(key) ?? (currentPowered ? MAX_POWER : 0);
          const pending = this._comparatorTimers.get(key);
          if (wantPowered === currentPowered && out === stored) {
            if (pending && (pending.powered !== currentPowered || pending.strength !== stored)) {
              this._comparatorTimers.delete(key);
            }
          } else if (!pending || pending.powered !== wantPowered || pending.strength !== out) {
            this._comparatorTimers.set(key, { due: this._accumMs + TORCH_FLIP_DELAY_MS, powered: wantPowered, strength: out });
          }
        } else if (HOPPER_IDS.has(id)) {
          // Wave R4 — powered hopper locks (transfers pause). Instant flip like
          // the lamp; the id change is retexture-free (same tiles) and cheap.
          const wantLocked = this._isCellPowered(x, y, z, this._wirePower);
          if (wantLocked !== hopperIsLocked(id)) {
            this._setBlock(x, y, z, makeHopperId(hopperFacing(id), wantLocked));
          }
        } else if (EJECTOR_IDS.has(id)) {
          // Wave R5 — dispensers/droppers fire once per OFF->ON edge. First
          // sight (placement or load) primes to the current state WITHOUT
          // firing, so a save loaded next to a lit lever stays quiet.
          const powered = this._isCellPowered(x, y, z, this._wirePower);
          const prev = this._ejectorPowered.get(key);
          if (prev === undefined) {
            this._ejectorPowered.set(key, powered);
          } else if (powered !== prev) {
            this._ejectorPowered.set(key, powered);
            if (powered && !this._ejectorTimers.has(key)) {
              this._ejectorTimers.set(key, this._accumMs + TORCH_FLIP_DELAY_MS);
            }
          }
        } else if (OBSERVER_IDS.has(id)) {
          // Wave R5 — observer: pulse when the WATCHED cell's id changes.
          // First sight primes without pulsing (placement/load never fires).
          const facing = observerFacing(id);
          const [wdx, wdy, wdz] = PISTON_FACING_DIRS[facing];
          const seen = this.world.get(x + wdx, y + wdy, z + wdz);
          const prev = this._observerLastSeen.get(key);
          if (prev === undefined) {
            this._observerLastSeen.set(key, seen);
          } else if (seen !== prev) {
            this._observerLastSeen.set(key, seen);
            // Burnout counts EVERY detected change — including ones swallowed
            // by an in-flight pulse. Gated on scheduling only, a face-to-face
            // observer pair paces itself just under the window and ping-pongs
            // forever (found by rig AU).
            let hist = this._observerFlipHistory.get(key);
            if (!hist || this._accumMs - hist.windowStart > OBSERVER_BURNOUT_WINDOW_MS) {
              hist = { windowStart: this._accumMs, count: 0 };
              this._observerFlipHistory.set(key, hist);
            }
            hist.count += 1;
            if (hist.count < OBSERVER_BURNOUT_FLIPS && !this._observerTimers.has(key)) {
              this._observerTimers.set(key, { due: this._accumMs + TORCH_FLIP_DELAY_MS, phase: "on" });
            }
          }
        } else if (PISTON_BASE_IDS.has(id)) {
          // Wave R3 — piston: powered = extend, unpowered = retract, on a 1-tick
          // delay. A blocked extension simply no-ops; it retries on the next
          // circuit change that re-dirties this cell.
          const want = this._isCellPowered(x, y, z, this._wirePower);
          const current = pistonIsExtended(id);
          const pending = this._pistonTimers.get(key);
          if (want === current) {
            if (pending && pending.extend !== current) this._pistonTimers.delete(key);
          } else if (!pending || pending.extend !== want) {
            this._pistonTimers.set(key, { due: this._accumMs + TORCH_FLIP_DELAY_MS, extend: want });
          }
        } else if (DOOR_BLOCK_IDS.has(id)) {
          // Re-anchor on the LOWER half: power beside the UPPER half must also
          // drive the door, and the scan may only have visited the upper cell.
          const ly = DOOR_LOWER_IDS.has(id) ? y : y - 1;
          const lid = this.world.get(x, ly, z);
          if (!DOOR_LOWER_IDS.has(lid)) continue;
          const lowerKey = ly === y ? key : cellKey(x, ly, z);
          const powered = this._isCellPowered(x, ly, z, this._wirePower)
            || this._isCellPowered(x, ly + 1, z, this._wirePower);
          const wasPowered = this._poweredDoors.has(lowerKey);
          if (powered && !wasPowered) {
            this._poweredDoors.add(lowerKey);
            if (!doorIsOpen(lid)) this._toggleDoorPair(x, ly, z);
          } else if (!powered && wasPowered) {
            this._poweredDoors.delete(lowerKey);
            if (doorIsOpen(this.world.get(x, ly, z))) this._toggleDoorPair(x, ly, z);
          }
        } else if (TRAPDOOR_BLOCK_IDS.has(id)) {
          const powered = this._isCellPowered(x, y, z, this._wirePower);
          const wasPowered = this._poweredTrapdoors.has(key);
          if (powered && !wasPowered) {
            this._poweredTrapdoors.add(key);
            if (!trapdoorIsOpen(id)) this._setBlock(x, y, z, trapdoorToggle(id));
          } else if (!powered && wasPowered) {
            this._poweredTrapdoors.delete(key);
            const cur = this.world.get(x, y, z);
            if (trapdoorIsOpen(cur)) this._setBlock(x, y, z, trapdoorToggle(cur));
          }
        }
      }
    }
    // Anything still dirty after MAX_EVAL_PASSES carries into the next tick —
    // that's what lets torch clocks keep oscillating without stalling a frame.
  }

  _toggleDoorPair(x, y, z) {
    const id = this.world.get(x, y, z);
    if (!DOOR_BLOCK_IDS.has(id)) return;
    this._setBlock(x, y, z, doorToggle(id));
    const otherY = DOOR_LOWER_IDS.has(id) ? y + 1 : y - 1;
    const other = this.world.get(x, otherY, z);
    if (DOOR_BLOCK_IDS.has(other)) this._setBlock(x, otherY, z, doorToggle(other));
  }
}
