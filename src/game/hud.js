import { HOTBAR_SIZE, ITEM_DEFS } from "./survival";
import { getItemIconCanvas } from "./textures";

// ----- Cached DOM handles built on first call -----
let _slotsBuilt = false;
let _slotEls = /** @type {HTMLElement[]} */ ([]);
let _slotIconEls = /** @type {HTMLCanvasElement[]} */ ([]);
let _slotBadgeEls = /** @type {HTMLElement[]} */ ([]);
let _heartsEl = null;
let _hotbarWrapEl = null;

function buildHotbarDOM(hotbarEl) {
  // Replace hotbar inner content with a wrapper containing hearts + slot cells.
  hotbarEl.innerHTML = "";

  // Hearts row sits above the hotbar slots.
  _heartsEl = document.createElement("div");
  _heartsEl.id = "mc-hearts";
  hotbarEl.appendChild(_heartsEl);

  // Slot row.
  _hotbarWrapEl = document.createElement("div");
  _hotbarWrapEl.id = "mc-slots";
  hotbarEl.appendChild(_hotbarWrapEl);

  _slotEls = [];
  _slotIconEls = [];
  _slotBadgeEls = [];

  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const cell = document.createElement("div");
    cell.className = "mc-slot";

    const iconCanvas = document.createElement("canvas");
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    iconCanvas.className = "mc-slot-icon";

    const badge = document.createElement("span");
    badge.className = "mc-slot-badge hidden";

    cell.appendChild(iconCanvas);
    cell.appendChild(badge);
    _hotbarWrapEl.appendChild(cell);

    _slotEls.push(cell);
    _slotIconEls.push(iconCanvas);
    _slotBadgeEls.push(badge);
  }

  _slotsBuilt = true;
}

// ----- Signature caches for diff-repaint -----
let lastStats = "";
let lastHotbar = "";
let lastHearts = "";

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

// ----- Hotbar slot updates -----
function hotbarSignature(inventory, selectedSlot) {
  let s = `sel:${selectedSlot}`;
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const slot = inventory[i];
    s += slot ? `|${slot.itemId}x${slot.count}` : "|_";
  }
  return s;
}

function rebuildHotbar(inventory, selectedSlot) {
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const slot = inventory[i];
    const cellEl = _slotEls[i];
    const iconCanvas = _slotIconEls[i];
    const badge = _slotBadgeEls[i];

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

      // Count badge: only show when count > 1.
      if (slot.count > 1) {
        badge.textContent = slot.count;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    } else {
      // Empty slot.
      const ctx = iconCanvas.getContext("2d");
      ctx.clearRect(0, 0, 32, 32);
      badge.classList.add("hidden");
    }
  }
}

// ----- Main export -----
export function updateHud({ state, world, statsEl, hotbarEl }) {
  // Build DOM once.
  if (!_slotsBuilt) {
    buildHotbarDOM(hotbarEl);
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

  // Hotbar icons + selection.
  const hbSig = hotbarSignature(state.inventory, state.selectedSlot);
  if (hbSig !== lastHotbar) {
    rebuildHotbar(state.inventory, state.selectedSlot);
    lastHotbar = hbSig;
  }
}
