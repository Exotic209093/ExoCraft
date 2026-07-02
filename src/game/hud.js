import { HOTBAR_SIZE, ITEM_DEFS, hasDurability, TOOL_MAX_DURABILITY, ARMOR_SLOTS, getTotalDefense } from "./survival";
import { MAX_HUNGER } from "./hunger";
import { getItemIconCanvas } from "./textures";

// ----- Cached DOM handles built on first call -----
let _slotsBuilt = false;
let _slotEls = /** @type {HTMLElement[]} */ ([]);
let _slotIconEls = /** @type {HTMLCanvasElement[]} */ ([]);
let _slotBadgeEls = /** @type {HTMLElement[]} */ ([]);
let _slotDurabilityBarEls = /** @type {(HTMLElement|null)[]} */ ([]);
let _heartsEl = null;
let _hungerEl = null;
let _hotbarWrapEl = null;
// Wave 10 — armor bar
let _armorEl = null;
// Wave P1 — selected-item name popup
let _itemNameEl = null;
let _lastItemNameSig = null; // null = not initialised (no popup on first paint)
// Wave F2 — XP bar
let _xpBarRowEl = null;
let _xpBarFillEl = null;
let _xpLevelEl = null;

function buildHotbarDOM(hotbarEl) {
  // Replace hotbar inner content with a wrapper containing hearts + hunger + slot cells.
  hotbarEl.innerHTML = "";

  // Wave 10: armor bar sits above the status row
  _armorEl = document.createElement("div");
  _armorEl.id = "mc-armor";
  hotbarEl.appendChild(_armorEl);

  // Top HUD row: hearts (left) and hunger shanks (right) sit above the hotbar slots.
  const statusRow = document.createElement("div");
  statusRow.id = "mc-status-row";
  hotbarEl.appendChild(statusRow);

  _heartsEl = document.createElement("div");
  _heartsEl.id = "mc-hearts";
  statusRow.appendChild(_heartsEl);

  _hungerEl = document.createElement("div");
  _hungerEl.id = "mc-hunger";
  statusRow.appendChild(_hungerEl);

  // Slot row.
  _hotbarWrapEl = document.createElement("div");
  _hotbarWrapEl.id = "mc-slots";
  hotbarEl.appendChild(_hotbarWrapEl);

  _slotEls = [];
  _slotIconEls = [];
  _slotBadgeEls = [];
  _slotDurabilityBarEls = [];

  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const cell = document.createElement("div");
    cell.className = "mc-slot";

    const iconCanvas = document.createElement("canvas");
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    iconCanvas.className = "mc-slot-icon";

    const badge = document.createElement("span");
    badge.className = "mc-slot-badge hidden";

    // Durability bar — a thin colored bar that spans the bottom of the slot.
    const durBar = document.createElement("div");
    durBar.className = "mc-durability-bar hidden";
    const durFill = document.createElement("div");
    durFill.className = "mc-durability-fill";
    durBar.appendChild(durFill);

    cell.appendChild(iconCanvas);
    cell.appendChild(badge);
    cell.appendChild(durBar);
    _hotbarWrapEl.appendChild(cell);

    _slotEls.push(cell);
    _slotIconEls.push(iconCanvas);
    _slotBadgeEls.push(badge);
    _slotDurabilityBarEls.push(durBar);
  }

  // Wave F2 — XP bar + level number, directly above the slot row.
  // Structure (bottom-to-top within #hotbar column):
  //   xp-bar-row (contains: xp-level label above, xp-bar track below)
  // Inserted before _hotbarWrapEl so it sits between status-row and slots.
  _xpBarRowEl = document.createElement("div");
  _xpBarRowEl.id = "mc-xp-row";

  _xpLevelEl = document.createElement("div");
  _xpLevelEl.id = "mc-xp-level";
  _xpLevelEl.textContent = "";
  _xpBarRowEl.appendChild(_xpLevelEl);

  const xpTrack = document.createElement("div");
  xpTrack.id = "mc-xp-bar";
  _xpBarFillEl = document.createElement("div");
  _xpBarFillEl.id = "mc-xp-fill";
  xpTrack.appendChild(_xpBarFillEl);
  _xpBarRowEl.appendChild(xpTrack);

  // Insert before the slot row so ordering is: armor → status → xp → slots
  hotbarEl.insertBefore(_xpBarRowEl, _hotbarWrapEl);

  // Wave P1 — selected-item name popup: floats above the status row, fades out
  // via a CSS animation retriggered on each selection change.
  _itemNameEl = document.createElement("div");
  _itemNameEl.id = "mc-item-name";
  hotbarEl.insertBefore(_itemNameEl, _armorEl);

  _slotsBuilt = true;
}

// ----- Signature caches for diff-repaint -----
let lastStats = "";
let lastHotbar = "";
let lastHearts = "";
let lastHunger = "";
let lastArmor = "";
let lastXp = "";

// ----- Heart drawing -----
const HEART_SIZE = 9; // Minecraft heart icon size in pixels (rendered at 2x = 18px CSS)

/**
 * Draw a heart shape on a small canvas context.
 * fill: "full" | "half" | "empty"
 */
function drawHeart(ctx, fill) {
  const s = HEART_SIZE;
  ctx.clearRect(0, 0, s, s);

  // Background container (dark gray square, like Minecraft's health background).
  ctx.fillStyle = "#3d1f1f";
  ctx.fillRect(0, 0, s, s);

  if (fill === "empty") {
    // Faint outline heart.
    ctx.fillStyle = "#5c2020";
    paintHeartPixels(ctx, s);
    return;
  }

  // Full red heart.
  ctx.fillStyle = fill === "half" ? "#b02020" : "#d42020";
  paintHeartPixels(ctx, s);

  if (fill === "half") {
    // Mask the right half back to the empty color.
    ctx.fillStyle = "#5c2020";
    for (let y = 0; y < s; y += 1) {
      for (let x = Math.ceil(s / 2); x < s; x += 1) {
        if (isHeartPixel(x, y, s)) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // Highlight: top-left bright pixel.
  if (fill !== "empty") {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(2, 1, 1, 1);
  }
}

function isHeartPixel(x, y, s) {
  // 9x9 heart pixel map (rows 0..8).
  // Row 0: .##.#.##.
  // Row 1: #####.###  — actually use a standard 9x9 heart pattern.
  // We use a compact lookup.
  const ROWS = [
    0b011001100, // row 0
    0b111111110, // row 1 (no corners)
    0b111111111, // row 2
    0b111111111, // row 3
    0b011111110, // row 4
    0b001111100, // row 5
    0b000111000, // row 6
    0b000010000, // row 7
    0b000000000, // row 8
  ];
  if (y < 0 || y >= ROWS.length) return false;
  // Bit s-1-x from the left (MSB = leftmost).
  return ((ROWS[y] >> (s - 1 - x)) & 1) === 1;
}

function paintHeartPixels(ctx, s) {
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      if (isHeartPixel(x, y, s)) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

// ----- Hunger shank drawing -----
const SHANK_SIZE = 9; // same pixel size as hearts

/**
 * Paint a hunger shank icon on a small canvas context.
 * fill: "full" | "half" | "empty"
 */
function drawShank(ctx, fill) {
  const s = SHANK_SIZE;
  ctx.clearRect(0, 0, s, s);

  // Dark brown background.
  ctx.fillStyle = "#2a1a00";
  ctx.fillRect(0, 0, s, s);

  // Shank is a simple drumstick-like shape using a pixel map.
  // We approximate a drumstick silhouette: round head top-right, handle bottom-left.
  const ROWS = [
    0b000111100, // row 0  — top of drumstick head
    0b001111110, // row 1
    0b011111111, // row 2
    0b011111111, // row 3
    0b001111110, // row 4
    0b000111100, // row 5
    0b000011000, // row 6  — start of handle
    0b000011000, // row 7
    0b000011000, // row 8
  ];

  if (fill === "empty") {
    ctx.fillStyle = "#4a2e00";
  } else if (fill === "half") {
    ctx.fillStyle = "#c47c28";
  } else {
    ctx.fillStyle = "#e8a030";
  }

  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      if (((ROWS[y] >> (s - 1 - x)) & 1) === 1) {
        // For half fill: right side of head uses dimmed color.
        if (fill === "half" && x >= Math.ceil(s / 2) && y <= 5) {
          ctx.fillStyle = "#4a2e00";
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = "#c47c28";
        } else {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // Highlight on full shank.
  if (fill === "full") {
    ctx.fillStyle = "rgba(255,220,120,0.5)";
    ctx.fillRect(3, 1, 1, 1);
  }
}

function hungerSignature(hunger, maxHunger) {
  return `${hunger}/${maxHunger}`;
}

function rebuildHunger(hunger, maxHunger) {
  if (!_hungerEl) return;
  _hungerEl.innerHTML = "";

  const shankCount = Math.ceil(maxHunger / 2);
  for (let i = 0; i < shankCount; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = SHANK_SIZE;
    canvas.height = SHANK_SIZE;
    canvas.className = "mc-shank";
    const ctx = canvas.getContext("2d");

    const shankValue = (i + 1) * 2;
    let fill;
    if (hunger >= shankValue) {
      fill = "full";
    } else if (hunger >= shankValue - 1) {
      fill = "half";
    } else {
      fill = "empty";
    }

    drawShank(ctx, fill);
    _hungerEl.appendChild(canvas);
  }
}

// ----- Durability bar color -----
function durabilityColor(fraction) {
  // Green → yellow → red as durability falls (mirrors Minecraft's item damage bar).
  const r = Math.round(255 * (1 - fraction));
  const g = Math.round(255 * fraction);
  return `rgb(${r},${g},0)`;
}

// Build a hearts-row signature from health values.
function heartsSignature(health, maxHealth) {
  return `${health}/${maxHealth}`;
}

function rebuildHearts(health, maxHealth) {
  if (!_heartsEl) return;
  _heartsEl.innerHTML = "";

  const heartCount = Math.ceil(maxHealth / 2);
  for (let i = 0; i < heartCount; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = HEART_SIZE;
    canvas.height = HEART_SIZE;
    canvas.className = "mc-heart";
    const ctx = canvas.getContext("2d");

    const heartValue = (i + 1) * 2; // HP covered by hearts up to and including this one.
    let fill;
    if (health >= heartValue) {
      fill = "full";
    } else if (health >= heartValue - 1) {
      fill = "half";
    } else {
      fill = "empty";
    }

    drawHeart(ctx, fill);
    _heartsEl.appendChild(canvas);
  }
}

// ----- Wave 10: Armor bar -----
const ARMOR_ICON_SIZE = 9;

/**
 * Draw a shield-style armor icon.
 * fill: "full" | "half" | "empty"
 */
function drawArmorIcon(ctx, fill) {
  const s = ARMOR_ICON_SIZE;
  ctx.clearRect(0, 0, s, s);

  // Dark background
  ctx.fillStyle = "#1a1f2a";
  ctx.fillRect(0, 0, s, s);

  // Shield pixel shape (inverted-V top, squared sides, pointed bottom)
  // Row 0: _###_####  etc — a simple 9x9 chestplate silhouette
  const ROWS = [
    0b011111110, // row 0
    0b111111111, // row 1
    0b111111111, // row 2
    0b111111111, // row 3
    0b011111110, // row 4
    0b001111100, // row 5
    0b000111000, // row 6
    0b000111000, // row 7
    0b000010000, // row 8
  ];

  if (fill === "empty") {
    ctx.fillStyle = "#3a3f4a";
  } else if (fill === "half") {
    ctx.fillStyle = "#7098c0";
  } else {
    ctx.fillStyle = "#80b8e8";
  }

  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      if (((ROWS[y] >> (s - 1 - x)) & 1) === 1) {
        if (fill === "half" && x >= Math.ceil(s / 2)) {
          ctx.fillStyle = "#3a3f4a";
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = "#7098c0";
        } else {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  if (fill === "full") {
    ctx.fillStyle = "rgba(200, 230, 255, 0.5)";
    ctx.fillRect(2, 1, 1, 1);
  }
}

function armorSignature(wornArmor) {
  if (!wornArmor) return "none";
  return ARMOR_SLOTS.map((s) => wornArmor[s] || "_").join("|");
}

function rebuildArmorBar(wornArmor) {
  if (!_armorEl) return;
  _armorEl.innerHTML = "";

  if (!wornArmor) return;

  const totalDefense = getTotalDefense(wornArmor);
  if (totalDefense <= 0) return;

  // Max armor in the game: leather=7, iron=15, diamond=20
  const MAX_ARMOR = 20;
  const iconCount = 10;
  for (let i = 0; i < iconCount; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = ARMOR_ICON_SIZE;
    canvas.height = ARMOR_ICON_SIZE;
    canvas.className = "mc-armor-icon";
    const ctx = canvas.getContext("2d");

    const iconValue = (i + 1) * 2;
    const normalized = Math.round((totalDefense / MAX_ARMOR) * iconCount * 2);
    let fill;
    if (normalized >= iconValue) {
      fill = "full";
    } else if (normalized >= iconValue - 1) {
      fill = "half";
    } else {
      fill = "empty";
    }

    drawArmorIcon(ctx, fill);
    _armorEl.appendChild(canvas);
  }
}

// ----- Hotbar slot updates -----
function hotbarSignature(inventory, selectedSlot) {
  let s = `sel:${selectedSlot}`;
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const slot = inventory[i];
    if (!slot) {
      s += "|_";
    } else if (hasDurability(slot.itemId)) {
      s += `|${slot.itemId}d${slot.durability ?? TOOL_MAX_DURABILITY[slot.itemId]}`;
    } else {
      s += `|${slot.itemId}x${slot.count}`;
    }
  }
  return s;
}

function rebuildHotbar(inventory, selectedSlot) {
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const slot = inventory[i];
    const cellEl = _slotEls[i];
    const iconCanvas = _slotIconEls[i];
    const badge = _slotBadgeEls[i];
    const durBar = _slotDurabilityBarEls[i];

    // Selection highlight.
    if (i === selectedSlot) {
      cellEl.classList.add("selected");
    } else {
      cellEl.classList.remove("selected");
    }

    if (slot && slot.itemId) {
      const itemDef = ITEM_DEFS[slot.itemId];
      const placeBlockType = itemDef?.placeBlockType ?? null;
      const srcCanvas = getItemIconCanvas(slot.itemId, placeBlockType);

      // Blit the 32x32 icon into the cell's canvas.
      const ctx = iconCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(srcCanvas, 0, 0);

      // Count badge: only show when count > 1 and item is not a tool.
      if (!hasDurability(slot.itemId) && slot.count > 1) {
        badge.textContent = slot.count;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }

      // Durability bar: show when tool is damaged (below max).
      if (durBar && hasDurability(slot.itemId)) {
        const maxDur = TOOL_MAX_DURABILITY[slot.itemId] ?? 1;
        const curDur = Number.isFinite(slot.durability) ? slot.durability : maxDur;
        if (curDur < maxDur) {
          const fraction = curDur / maxDur;
          durBar.classList.remove("hidden");
          const fill = durBar.firstElementChild;
          if (fill) {
            fill.style.width = `${Math.round(fraction * 100)}%`;
            fill.style.backgroundColor = durabilityColor(fraction);
          }
        } else {
          durBar.classList.add("hidden");
        }
      } else if (durBar) {
        durBar.classList.add("hidden");
      }
    } else {
      // Empty slot.
      const ctx = iconCanvas.getContext("2d");
      ctx.clearRect(0, 0, 32, 32);
      badge.classList.add("hidden");
      if (durBar) durBar.classList.add("hidden");
    }
  }
}

// ----- Wave F2: XP bar -----
function xpSignature(level, xpWithinLevel, xpToNext) {
  return `${level}|${xpWithinLevel}|${xpToNext}`;
}

function rebuildXpBar(level, xpWithinLevel, xpToNext) {
  if (!_xpBarFillEl || !_xpLevelEl) return;
  const progress = xpToNext > 0 ? Math.min(1, Math.max(0, xpWithinLevel / xpToNext)) : 0;
  _xpBarFillEl.style.width = `${Math.round(progress * 100)}%`;
  _xpLevelEl.textContent = level > 0 ? String(level) : "";
}

// ----- Main export -----
export function updateHud({ state, world, statsEl, hotbarEl }) {
  // Build DOM once.
  if (!_slotsBuilt) {
    buildHotbarDOM(hotbarEl);
  }

  // Armor bar (above hearts).
  const aSig = armorSignature(state.wornArmor);
  if (aSig !== lastArmor) {
    rebuildArmorBar(state.wornArmor);
    lastArmor = aSig;
  }

  // Stats (unchanged — top-left debug text).
  const x = state.playerPos.x.toFixed(1);
  const y = state.playerPos.y.toFixed(1);
  const z = state.playerPos.z.toFixed(1);
  const lockState = state.pointerLocked ? "look:locked" : "look:free";
  const solidBlocks =
    typeof world.getLoadedSolidBlocks === "function" ? world.getLoadedSolidBlocks() : world.totalSolid;
  const loadedChunks = typeof world.getLoadedChunkCount === "function" ? world.getLoadedChunkCount() : null;
  const chunkStat = loadedChunks === null ? "" : ` | chunks ${loadedChunks}`;
  const mobStat = Number.isFinite(state.hostileMobCount) ? ` | mobs ${state.hostileMobCount}` : "";
  const stats = `XYZ ${x}, ${y}, ${z} | solid ${solidBlocks}${chunkStat}${mobStat} | ${lockState}`;
  if (stats !== lastStats) {
    statsEl.textContent = stats;
    lastStats = stats;
  }

  // Hearts row.
  const hSig = heartsSignature(state.health, state.maxHealth);
  if (hSig !== lastHearts) {
    rebuildHearts(state.health, state.maxHealth);
    lastHearts = hSig;
    // Low-health vignette on #hud parent.
    const hudEl = hotbarEl.closest("#hud") || document.getElementById("hud");
    if (hudEl) {
      const lowHealth = Number.isFinite(state.health) && Number.isFinite(state.maxHealth) &&
        state.maxHealth > 0 && state.health / state.maxHealth <= 0.25;
      hudEl.classList.toggle("low-health", lowHealth);
    }
  }

  // Hunger shank bar.
  const hunger = Number.isFinite(state.hunger) ? state.hunger : MAX_HUNGER;
  const maxHunger = Number.isFinite(state.maxHunger) ? state.maxHunger : MAX_HUNGER;
  const huSig = hungerSignature(hunger, maxHunger);
  if (huSig !== lastHunger) {
    rebuildHunger(hunger, maxHunger);
    lastHunger = huSig;
  }

  // XP bar (Wave F2).
  const xpLevel    = Number.isFinite(state.xpLevel) ? state.xpLevel : 0;
  const xpWithin   = Number.isFinite(state.xpWithinLevel) ? state.xpWithinLevel : 0;
  const xpToNext   = Number.isFinite(state.xpToNext) ? state.xpToNext : 7;
  const xpSig = xpSignature(xpLevel, xpWithin, xpToNext);
  if (xpSig !== lastXp) {
    rebuildXpBar(xpLevel, xpWithin, xpToNext);
    lastXp = xpSig;
  }

  // Hotbar icons + selection.
  const hbSig = hotbarSignature(state.inventory, state.selectedSlot);
  if (hbSig !== lastHotbar) {
    rebuildHotbar(state.inventory, state.selectedSlot);
    lastHotbar = hbSig;
  }

  // Wave P1 — item name popup: fires when the selected slot OR the item under it
  // changes (not on count changes). First paint initialises silently so the popup
  // doesn't flash at game start.
  const selItemId = state.inventory?.[state.selectedSlot]?.itemId ?? "";
  const nameSig = `${state.selectedSlot}|${selItemId}`;
  if (nameSig !== _lastItemNameSig) {
    const first = _lastItemNameSig === null;
    _lastItemNameSig = nameSig;
    if (!first && _itemNameEl) {
      if (selItemId && ITEM_DEFS[selItemId]) {
        _itemNameEl.textContent = ITEM_DEFS[selItemId].name;
        // Retrigger the fade animation (same reflow trick as the damage flash).
        _itemNameEl.classList.remove("show");
        void _itemNameEl.offsetWidth;
        _itemNameEl.classList.add("show");
      } else {
        _itemNameEl.classList.remove("show");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Wave 11 — F3 debug overlay
// A toggleable <pre> overlay that shows real-time debug info (default hidden).
// Toggled by F3 key (controls.js sets state.f3Visible).
// ---------------------------------------------------------------------------
let _f3El = null;
let _f3LastSig = "";

function yawToCardinal(yaw) {
  // yaw=0 faces -Z (north), increases clockwise when viewed from above.
  // Normalise to [0, 2π) then map to 8 directions.
  const tau = Math.PI * 2;
  const n = ((yaw % tau) + tau) % tau;
  const eighths = Math.round(n / (tau / 8)) % 8;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][eighths];
}

/**
 * Update (or create) the F3 debug overlay.
 *
 * @param {{
 *   state: object,
 *   world: object,
 *   fps: number,
 *   chunkSize?: number,
 * }} opts
 */
export function updateF3Overlay({ state, world, fps, chunkSize = 16, biome = null }) {
  // Create the element on first call.
  if (!_f3El) {
    _f3El = document.createElement("pre");
    _f3El.id = "f3-overlay";
    _f3El.style.cssText = [
      "position:fixed",
      "top:8px",
      "right:8px",
      "background:rgba(0,0,0,0.55)",
      "color:#e8e8e8",
      "font:12px/1.45 monospace",
      "padding:8px 10px",
      "border-radius:4px",
      "pointer-events:none",
      "z-index:9999",
      "white-space:pre",
      "display:none",
    ].join(";");
    document.body.appendChild(_f3El);
  }

  const visible = !!state.f3Visible;
  _f3El.style.display = visible ? "block" : "none";
  if (!visible) return;

  const px = state.playerPos.x;
  const py = state.playerPos.y;
  const pz = state.playerPos.z;
  const cx = Math.floor(px / chunkSize);
  const cz = Math.floor(pz / chunkSize);

  const facing = yawToCardinal(state.yaw);
  const yawDeg = ((state.yaw * 180 / Math.PI) % 360 + 360) % 360;

  const tod = state.timeOfDayMs;
  const totalSec = Math.floor(tod / 1000);
  const hh = String(Math.floor(totalSec / 60) % 24).padStart(2, "0");
  const mm = String(totalSec % 60).padStart(2, "0");

  const tb = state.targetBlock;
  const tbStr = tb
    ? `${tb.name} (${tb.x},${tb.y},${tb.z})`
    : "none";

  const loadedChunks = typeof world.getLoadedChunkCount === "function"
    ? world.getLoadedChunkCount()
    : "?";

  // Light info: sample the block the eye is in and derive sky/block light.
  const eyeX = Math.floor(px);
  const eyeY = Math.floor(py + 1.62);
  const eyeZ = Math.floor(pz);
  const eyeBlock = typeof world.get === "function" ? world.get(eyeX, eyeY, eyeZ) : 0;
  const inFluid = state.eyeInWater ? "water" : state.eyeInLava ? "lava" : "air";

  // Sky light: 15 when eye is at or above the open-sky surface, 0 underground.
  // findSurfaceY returns the Y of the first solid block top-down, so if eye is
  // below that surface the column has a roof overhead.
  let skyLight = 15;
  if (typeof world.findSurfaceY === "function") {
    const surfaceY = world.findSurfaceY(eyeX, eyeZ);
    if (Number.isFinite(surfaceY) && eyeY < surfaceY) {
      skyLight = 0;
    }
  }
  // Block light: emission level when the eye voxel is a light-emitting block,
  // 0 otherwise. Mirrors BLOCK_LIGHT_EMIT in world.js (torch 8, redstone torch 91,
  // lit redstone lamp 94; copper ore/lava omitted — the eye is never inside them).
  const blockLight = (eyeBlock === 8) ? 15 : (eyeBlock === 91) ? 7 : (eyeBlock === 94) ? 15 : 0;

  const fpsRounded = Math.round(fps);
  const sig = `${px.toFixed(1)}|${py.toFixed(1)}|${pz.toFixed(1)}|${facing}|${tbStr}|${fpsRounded}|${loadedChunks}|${tod}`;
  if (sig === _f3LastSig) return;
  _f3LastSig = sig;

  const biomeStr = biome ? biome.name : (typeof world.biomeAt === "function"
    ? (world.biomeAt(Math.floor(px), Math.floor(pz))?.name ?? "?")
    : "?");

  _f3El.textContent = [
    `XYZ:    ${px.toFixed(3)} / ${py.toFixed(3)} / ${pz.toFixed(3)}`,
    `Chunk:  ${cx}, ${cz}  (local ${Math.floor(((px % chunkSize) + chunkSize) % chunkSize)}, ${Math.floor(((pz % chunkSize) + chunkSize) % chunkSize)})`,
    `Biome:  ${biomeStr}`,
    `Facing: ${facing}  (yaw ${yawDeg.toFixed(1)}°)`,
    `Target: ${tbStr}`,
    `Eye:    ${eyeX}, ${eyeY}, ${eyeZ}  (${inFluid})`,
    `Light:  sky ${skyLight} / block ${blockLight}`,
    `FPS:    ${fpsRounded}`,
    `Chunks: ${loadedChunks} loaded`,
    `Time:   ${hh}:${mm}  (dayFactor ${(state.dayFactor ?? 0).toFixed(2)})`,
  ].join("\n");
}
