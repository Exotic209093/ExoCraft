import { HOTBAR_SIZE, ITEM_DEFS } from "./survival";

function slotLabel(slot, index, selectedSlot) {
  if (!slot) {
    return selectedSlot === index ? `[${index + 1}:--]` : `${index + 1}:--`;
  }
  const item = ITEM_DEFS[slot.itemId];
  const name = item ? item.name : slot.itemId;
  const label = `${index + 1}:${name}x${slot.count}`;
  return selectedSlot === index ? `[${label}]` : label;
}

let lastStats = "";
let lastHotbar = "";
const hotbarParts = new Array(HOTBAR_SIZE);

export function updateHud({ state, world, statsEl, hotbarEl }) {
  const x = state.playerPos.x.toFixed(1);
  const y = state.playerPos.y.toFixed(1);
  const z = state.playerPos.z.toFixed(1);
  const lockState = state.pointerLocked ? "look:locked" : "look:free";
  const solidBlocks =
    typeof world.getLoadedSolidBlocks === "function" ? world.getLoadedSolidBlocks() : world.totalSolid;
  const loadedChunks = typeof world.getLoadedChunkCount === "function" ? world.getLoadedChunkCount() : null;
  const chunkStat = loadedChunks === null ? "" : ` | chunks ${loadedChunks}`;
  const healthStat =
    Number.isFinite(state.health) && Number.isFinite(state.maxHealth)
      ? ` | hp ${Math.ceil(state.health)}/${Math.ceil(state.maxHealth)}`
      : "";
  const mobStat = Number.isFinite(state.hostileMobCount) ? ` | mobs ${state.hostileMobCount}` : "";
  const stats = `XYZ ${x}, ${y}, ${z} | solid ${solidBlocks}${chunkStat}${healthStat}${mobStat} | ${lockState}`;
  if (stats !== lastStats) {
    statsEl.textContent = stats;
    lastStats = stats;
  }

  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    hotbarParts[i] = slotLabel(state.inventory[i], i, state.selectedSlot);
  }
  const hotbar = hotbarParts.join("  ");
  if (hotbar !== lastHotbar) {
    hotbarEl.textContent = hotbar;
    lastHotbar = hotbar;
  }
}
