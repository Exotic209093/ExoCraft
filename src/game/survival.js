export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 24;
export const MAX_STACK = 64;

export const ITEM_DEFS = {
  grass: { id: "grass", name: "Grass", placeBlockType: 1 },
  dirt: { id: "dirt", name: "Dirt", placeBlockType: 2 },
  stone: { id: "stone", name: "Stone", placeBlockType: 3 },
  wood: { id: "wood", name: "Wood", placeBlockType: 4 },
  leaf: { id: "leaf", name: "Leaf", placeBlockType: 5 },
  crafting_table: { id: "crafting_table", name: "Crafting Table", placeBlockType: 6 },
  furnace: { id: "furnace", name: "Furnace", placeBlockType: 7 },
  torch: { id: "torch", name: "Torch", placeBlockType: 8 },
  copper_ore: { id: "copper_ore", name: "Copper Ore", placeBlockType: 9 },
  plank: { id: "plank", name: "Plank" },
  stick: { id: "stick", name: "Stick" },
  bone_shard: { id: "bone_shard", name: "Bone Shard" },
  copper_ingot: { id: "copper_ingot", name: "Copper Ingot" },
  charcoal: { id: "charcoal", name: "Charcoal" },
  refined_stone: { id: "refined_stone", name: "Refined Stone" },
  wood_sword: { id: "wood_sword", name: "Wood Sword", mobDamage: 4 },
  bone_blade: { id: "bone_blade", name: "Bone Blade", mobDamage: 6 },
  copper_blade: { id: "copper_blade", name: "Copper Blade", mobDamage: 8 },
  vanguard_blade: { id: "vanguard_blade", name: "Vanguard Blade", mobDamage: 12 },
  warden_totem: { id: "warden_totem", name: "Warden Totem" },
  deep_delver_pickaxe: { id: "deep_delver_pickaxe", name: "Deep Delver Pickaxe", toolKind: "pickaxe", toolPower: 7.2 },
  spelunker_compass: { id: "spelunker_compass", name: "Spelunker Compass" },
  wood_pickaxe: { id: "wood_pickaxe", name: "Wood Pickaxe", toolKind: "pickaxe", toolPower: 2.1 },
  wood_axe: { id: "wood_axe", name: "Wood Axe", toolKind: "axe", toolPower: 2.1 },
  wood_shovel: { id: "wood_shovel", name: "Wood Shovel", toolKind: "shovel", toolPower: 2.1 },
  stone_pickaxe: { id: "stone_pickaxe", name: "Stone Pickaxe", toolKind: "pickaxe", toolPower: 3.4 },
  stone_axe: { id: "stone_axe", name: "Stone Axe", toolKind: "axe", toolPower: 3.4 },
  stone_shovel: { id: "stone_shovel", name: "Stone Shovel", toolKind: "shovel", toolPower: 3.4 },
  reinforced_pickaxe: { id: "reinforced_pickaxe", name: "Reinforced Pickaxe", toolKind: "pickaxe", toolPower: 4.5 },
  copper_pickaxe: { id: "copper_pickaxe", name: "Copper Pickaxe", toolKind: "pickaxe", toolPower: 5.4 },
};

export const BLOCK_DROPS = {
  1: "grass",
  2: "dirt",
  3: "stone",
  4: "wood",
  5: "leaf",
  6: "crafting_table",
  7: "furnace",
  8: "torch",
  9: "copper_ore",
};

const BLOCK_HARDNESS = {
  1: 1.0,
  2: 1.0,
  3: 2.2,
  4: 1.6,
  5: 0.8,
  6: 1.8,
  7: 2.6,
  8: 0.5,
  9: 3.3,
};

const BLOCK_PREFERRED_TOOL = {
  1: "shovel",
  2: "shovel",
  3: "pickaxe",
  4: "axe",
  6: "axe",
  7: "pickaxe",
  9: "pickaxe",
};

export const RECIPES = [
  {
    id: "planks",
    name: "Planks x4",
    inputs: [{ itemId: "wood", count: 1 }],
    output: { itemId: "plank", count: 4 },
    requiresWorkbench: false,
  },
  {
    id: "sticks",
    name: "Sticks x4",
    inputs: [{ itemId: "plank", count: 2 }],
    output: { itemId: "stick", count: 4 },
    requiresWorkbench: false,
  },
  {
    id: "torch",
    name: "Torch x4",
    inputs: [
      { itemId: "stick", count: 1 },
      { itemId: "plank", count: 1 },
    ],
    output: { itemId: "torch", count: 4 },
    requiresWorkbench: false,
  },
  {
    id: "crafting_table",
    name: "Crafting Table",
    inputs: [{ itemId: "plank", count: 4 }],
    output: { itemId: "crafting_table", count: 1 },
    requiresWorkbench: false,
  },
  {
    id: "furnace",
    name: "Furnace",
    inputs: [{ itemId: "stone", count: 8 }],
    output: { itemId: "furnace", count: 1 },
    requiresWorkbench: false,
  },
  {
    id: "wood_pickaxe",
    name: "Wood Pickaxe",
    inputs: [
      { itemId: "plank", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "wood_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "wood_sword",
    name: "Wood Sword",
    inputs: [
      { itemId: "plank", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "wood_sword", count: 1 },
    requiresWorkbench: false,
  },
  {
    id: "wood_axe",
    name: "Wood Axe",
    inputs: [
      { itemId: "plank", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "wood_axe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "wood_shovel",
    name: "Wood Shovel",
    inputs: [
      { itemId: "plank", count: 1 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "wood_shovel", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "stone_pickaxe",
    name: "Stone Pickaxe",
    inputs: [
      { itemId: "stone", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "stone_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "stone_axe",
    name: "Stone Axe",
    inputs: [
      { itemId: "stone", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "stone_axe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "stone_shovel",
    name: "Stone Shovel",
    inputs: [
      { itemId: "stone", count: 1 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "stone_shovel", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "reinforced_pickaxe",
    name: "Reinforced Pickaxe",
    inputs: [
      { itemId: "refined_stone", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "reinforced_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "bone_blade",
    name: "Bone Blade",
    inputs: [
      { itemId: "bone_shard", count: 3 },
      { itemId: "stick", count: 1 },
      { itemId: "refined_stone", count: 1 },
    ],
    output: { itemId: "bone_blade", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "copper_pickaxe",
    name: "Copper Pickaxe",
    inputs: [
      { itemId: "copper_ingot", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "copper_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "copper_blade",
    name: "Copper Blade",
    inputs: [
      { itemId: "copper_ingot", count: 2 },
      { itemId: "stick", count: 1 },
      { itemId: "bone_shard", count: 1 },
    ],
    output: { itemId: "copper_blade", count: 1 },
    requiresWorkbench: false,
  },
  {
    id: "vanguard_blade",
    name: "Vanguard Blade",
    inputs: [
      { itemId: "copper_blade", count: 1 },
      { itemId: "bone_shard", count: 4 },
      { itemId: "copper_ingot", count: 2 },
      { itemId: "refined_stone", count: 2 },
    ],
    output: { itemId: "vanguard_blade", count: 1 },
    requiresWorkbench: true,
    requiredSpecialization: "combat",
  },
  {
    id: "warden_totem",
    name: "Warden Totem",
    inputs: [
      { itemId: "bone_shard", count: 6 },
      { itemId: "charcoal", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "warden_totem", count: 1 },
    requiresWorkbench: false,
    requiredSpecialization: "combat",
  },
  {
    id: "deep_delver_pickaxe",
    name: "Deep Delver Pickaxe",
    inputs: [
      { itemId: "copper_pickaxe", count: 1 },
      { itemId: "copper_ingot", count: 2 },
      { itemId: "refined_stone", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "deep_delver_pickaxe", count: 1 },
    requiresWorkbench: true,
    requiredSpecialization: "explorer",
  },
  {
    id: "spelunker_compass",
    name: "Spelunker Compass",
    inputs: [
      { itemId: "torch", count: 6 },
      { itemId: "copper_ingot", count: 2 },
      { itemId: "charcoal", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "spelunker_compass", count: 1 },
    requiresWorkbench: false,
    requiredSpecialization: "explorer",
  },
  {
    id: "leaf_mulch",
    name: "Mulch Dirt",
    inputs: [{ itemId: "leaf", count: 3 }],
    output: { itemId: "dirt", count: 1 },
    requiresWorkbench: false,
  },
];

export const FUEL_ITEM_MS = {
  leaf: 800,
  stick: 1200,
  plank: 2500,
  wood: 3000,
  charcoal: 6000,
};

export const SMELTING_RECIPES = [
  {
    id: "stone_refining",
    inputItemId: "stone",
    outputItemId: "refined_stone",
    cookTimeMs: 2400,
  },
  {
    id: "charcoal",
    inputItemId: "wood",
    outputItemId: "charcoal",
    cookTimeMs: 1800,
  },
  {
    id: "copper_ingot",
    inputItemId: "copper_ore",
    outputItemId: "copper_ingot",
    cookTimeMs: 2600,
  },
];

const SMELTING_RECIPE_BY_INPUT = new Map(SMELTING_RECIPES.map((recipe) => [recipe.inputItemId, recipe]));

export function createEmptyInventory() {
  return new Array(INVENTORY_SIZE).fill(null);
}

export function cloneInventory(inventory) {
  return inventory.map((slot) => (slot ? { ...slot } : null));
}

export function addItemToInventory(inventory, itemId, count) {
  let remaining = count;
  if (!ITEM_DEFS[itemId]) {
    return remaining;
  }

  for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
    const slot = inventory[i];
    if (!slot || slot.itemId !== itemId || slot.count >= MAX_STACK) {
      continue;
    }
    const room = MAX_STACK - slot.count;
    const add = Math.min(room, remaining);
    slot.count += add;
    remaining -= add;
  }

  for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
    const slot = inventory[i];
    if (slot) {
      continue;
    }
    const add = Math.min(MAX_STACK, remaining);
    inventory[i] = { itemId, count: add };
    remaining -= add;
  }

  return remaining;
}

export function removeItemFromInventory(inventory, itemId, count) {
  if (count <= 0) {
    return true;
  }
  let needed = count;
  for (const slot of inventory) {
    if (!slot || slot.itemId !== itemId) {
      continue;
    }
    needed -= slot.count;
    if (needed <= 0) {
      return true;
    }
  }
  return false;
}

export function consumeItemFromInventory(inventory, itemId, count) {
  if (!removeItemFromInventory(inventory, itemId, count)) {
    return false;
  }
  let remaining = count;
  for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
    const slot = inventory[i];
    if (!slot || slot.itemId !== itemId) {
      continue;
    }
    const take = Math.min(slot.count, remaining);
    slot.count -= take;
    remaining -= take;
    if (slot.count <= 0) {
      inventory[i] = null;
    }
  }
  return true;
}

export function consumeFromSlot(inventory, slotIndex, count) {
  const slot = inventory[slotIndex];
  if (!slot || slot.count < count) {
    return false;
  }
  slot.count -= count;
  if (slot.count <= 0) {
    inventory[slotIndex] = null;
  }
  return true;
}

export function transferInventoryStack(inventory, fromIndex, toIndex) {
  if (!Array.isArray(inventory)) {
    return false;
  }
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return false;
  }
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= inventory.length || toIndex >= inventory.length) {
    return false;
  }
  if (fromIndex === toIndex) {
    return false;
  }

  const fromSlot = inventory[fromIndex];
  if (!fromSlot) {
    return false;
  }

  const toSlot = inventory[toIndex];
  if (!toSlot) {
    inventory[toIndex] = { ...fromSlot };
    inventory[fromIndex] = null;
    return true;
  }

  if (toSlot.itemId === fromSlot.itemId && toSlot.count < MAX_STACK) {
    const moved = Math.min(MAX_STACK - toSlot.count, fromSlot.count);
    if (moved <= 0) {
      return false;
    }
    toSlot.count += moved;
    fromSlot.count -= moved;
    if (fromSlot.count <= 0) {
      inventory[fromIndex] = null;
    }
    return true;
  }

  inventory[fromIndex] = toSlot;
  inventory[toIndex] = fromSlot;
  return true;
}

export function countInventoryItems(inventory, itemId) {
  let total = 0;
  for (const slot of inventory) {
    if (slot && slot.itemId === itemId) {
      total += slot.count;
    }
  }
  return total;
}

export function getSelectedSlot(inventory, index) {
  return inventory[index] || null;
}

export function getItemName(itemId) {
  return ITEM_DEFS[itemId]?.name || itemId;
}

export function getPlaceableBlockType(itemId) {
  return ITEM_DEFS[itemId]?.placeBlockType || 0;
}

export function getBlockDropItem(blockType) {
  return BLOCK_DROPS[blockType] || null;
}

export function getBlockHardness(blockType) {
  return BLOCK_HARDNESS[blockType] || 1.0;
}

export function getBreakPower(itemId, blockType) {
  const preferredTool = BLOCK_PREFERRED_TOOL[blockType];
  if (!itemId) {
    return 1.0;
  }
  const item = ITEM_DEFS[itemId];
  if (!item) {
    return 1.0;
  }
  if (!preferredTool) {
    return item.toolPower ? Math.max(1.0, item.toolPower * 0.8) : 1.0;
  }
  if (item.toolKind === preferredTool && item.toolPower) {
    return item.toolPower;
  }
  return 1.0;
}

export function getMobDamage(itemId, baseDamage = 1) {
  const base = Number.isFinite(baseDamage) ? Math.max(1, Math.floor(baseDamage)) : 1;
  if (!itemId) {
    return base;
  }
  const item = ITEM_DEFS[itemId];
  if (!item || !Number.isFinite(item.mobDamage)) {
    return base;
  }
  return Math.max(base, Math.floor(item.mobDamage));
}

export function getFuelValue(itemId) {
  return FUEL_ITEM_MS[itemId] || 0;
}

export function getSmeltingRecipeByInput(itemId) {
  if (!itemId) {
    return null;
  }
  return SMELTING_RECIPE_BY_INPUT.get(itemId) || null;
}

export function createStartingInventory() {
  const inventory = createEmptyInventory();
  addItemToInventory(inventory, "grass", 32);
  addItemToInventory(inventory, "dirt", 32);
  addItemToInventory(inventory, "stone", 24);
  addItemToInventory(inventory, "wood", 16);
  return inventory;
}

export function applyRecipe(inventory, recipe, isWorkbenchNearby) {
  if (recipe.requiresWorkbench && !isWorkbenchNearby) {
    return { ok: false, reason: "Need nearby crafting table" };
  }
  const snapshot = cloneInventory(inventory);

  for (const input of recipe.inputs) {
    if (!consumeItemFromInventory(snapshot, input.itemId, input.count)) {
      return { ok: false, reason: "Missing ingredients" };
    }
  }

  const leftover = addItemToInventory(snapshot, recipe.output.itemId, recipe.output.count);
  if (leftover > 0) {
    return { ok: false, reason: "Inventory full" };
  }

  for (let i = 0; i < inventory.length; i += 1) {
    inventory[i] = snapshot[i] ? { ...snapshot[i] } : null;
  }
  return { ok: true };
}
