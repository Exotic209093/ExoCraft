export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 24;
export const MAX_STACK = 64;

// ----- Tool durability -----
// Max durability for each tool/weapon item. Tools with durability don't stack
// (count is always 1) and carry a per-slot `durability` field that counts DOWN
// from the max value. When it reaches 0 the slot is cleared.
export const TOOL_MAX_DURABILITY = {
  wood_pickaxe: 60,
  wood_axe: 60,
  wood_shovel: 60,
  wood_sword: 60,
  stone_pickaxe: 132,
  stone_axe: 132,
  stone_shovel: 132,
  reinforced_pickaxe: 200,
  copper_pickaxe: 250,
  copper_blade: 200,
  bone_blade: 220,
  vanguard_blade: 350,
  deep_delver_pickaxe: 400,
  // Wave 8 — iron tier
  iron_pickaxe:  251,
  iron_axe:      251,
  iron_shovel:   251,
  iron_sword:    251,
  // Wave 8 — diamond tier
  diamond_pickaxe: 1562,
  diamond_axe:     1562,
  diamond_shovel:  1562,
  diamond_sword:   1562,
};

// ---------------------------------------------------------------------------
// Tool tier ladder (Wave 8).
// Numeric tier: 0=hand, 1=wood, 2=stone, 3=copper, 4=iron, 5=diamond.
// ---------------------------------------------------------------------------
export const TOOL_TIER = {
  wood_pickaxe:        1,
  wood_axe:            1,
  wood_shovel:         1,
  wood_sword:          1,
  stone_pickaxe:       2,
  stone_axe:           2,
  stone_shovel:        2,
  reinforced_pickaxe:  2,
  copper_pickaxe:      3,
  copper_blade:        3,
  deep_delver_pickaxe: 3,
  iron_pickaxe:        4,
  iron_axe:            4,
  iron_shovel:         4,
  iron_sword:          4,
  diamond_pickaxe:     5,
  diamond_axe:         5,
  diamond_shovel:      5,
  diamond_sword:       5,
};

/**
 * Returns the numeric tier (0–5) of the held tool; 0 = bare hand.
 */
export function getToolTier(itemId) {
  if (!itemId) return 0;
  return TOOL_TIER[itemId] || 0;
}

// Minimum tool tier required to get a DROP from each ore block.
// Mining with a lower tier still breaks the block, but yields nothing (Minecraft harvest-level rule).
// blockType -> required tier
export const ORE_HARVEST_LEVEL = {
  16: 1,  // coal ore     — wood+
  17: 2,  // iron ore     — stone+ (tier 2)
  18: 4,  // gold ore     — iron+  (tier 4)
  19: 4,  // diamond ore  — iron+
  20: 4,  // redstone ore — iron+
};

/** Returns true when this item has durability (i.e. is a tool/weapon). */
export function hasDurability(itemId) {
  return Object.prototype.hasOwnProperty.call(TOOL_MAX_DURABILITY, itemId);
}

// ---------------------------------------------------------------------------
// Wave F5 — non-stackable items (not tools; handled separately from durability)
// ---------------------------------------------------------------------------
// Buckets must never stack: filling one out of a stack of N would silently destroy N-1.
// We route these through the one-per-slot branch in addItemToInventory / transferInventoryStack.
export const NON_STACKABLE = new Set([
  "empty_bucket",
  "water_bucket",
  "lava_bucket",
]);

// ---------------------------------------------------------------------------
// Wave 10 — Armor slots
// ---------------------------------------------------------------------------
export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];

export const ARMOR_DEFENSE = {
  leather_helmet:     1,
  leather_chestplate: 3,
  leather_leggings:   2,
  leather_boots:      1,
  iron_helmet:        2,
  iron_chestplate:    6,
  iron_leggings:      5,
  iron_boots:         2,
  diamond_helmet:     3,
  diamond_chestplate: 8,
  diamond_leggings:   6,
  diamond_boots:      3,
};

/** Returns the armor slot ('head'|'chest'|'legs'|'feet') for an armor itemId, or null. */
export function getArmorSlot(itemId) {
  return ITEM_DEFS[itemId]?.armor?.slot ?? null;
}

/** Returns total defense from a worn armor object { head, chest, legs, feet }. */
export function getTotalDefense(wornArmor) {
  let total = 0;
  for (const slot of ARMOR_SLOTS) {
    const itemId = wornArmor[slot];
    if (itemId && ARMOR_DEFENSE[itemId]) {
      total += ARMOR_DEFENSE[itemId];
    }
  }
  return total;
}

export const ITEM_DEFS = {
  // Wave 11 flora items (cross-quad blocks, passable)
  tall_grass:  { id: "tall_grass",  name: "Tall Grass",  placeBlockType: 23 },
  flower:      { id: "flower",      name: "Flower",      placeBlockType: 24 },
  sapling:     { id: "sapling",     name: "Sapling",     placeBlockType: 25 },
  seeds:       { id: "seeds",       name: "Seeds" },
  // Wave F4 — slab items (one item id per material; placement just sets the slab block)
  stone_slab:       { id: "stone_slab",       name: "Stone Slab",       placeBlockType: 31 },
  cobblestone_slab: { id: "cobblestone_slab", name: "Cobblestone Slab", placeBlockType: 32 },
  wood_slab:        { id: "wood_slab",        name: "Wood Slab",        placeBlockType: 33 },
  // Wave F4 — stair items (one item per material; placement chooses orientation id from yaw)
  // placeBlockType is the NORTH orientation by default; placement logic overrides this.
  stone_stairs:       { id: "stone_stairs",       name: "Stone Stairs",       placeBlockType: 34 },
  cobblestone_stairs: { id: "cobblestone_stairs", name: "Cobblestone Stairs", placeBlockType: 38 },
  wood_stairs:        { id: "wood_stairs",        name: "Wood Stairs",        placeBlockType: 42 },
  // Wave 12 — wood/snow blocks
  birch_log:   { id: "birch_log",   name: "Birch Log",   placeBlockType: 26 },
  birch_leaf:  { id: "birch_leaf",  name: "Birch Leaf",  placeBlockType: 27 },
  spruce_log:  { id: "spruce_log",  name: "Spruce Log",  placeBlockType: 28 },
  spruce_leaf: { id: "spruce_leaf", name: "Spruce Leaf", placeBlockType: 29 },
  snow_block:  { id: "snow_block",  name: "Snow",        placeBlockType: 30 },
  grass: { id: "grass", name: "Grass", placeBlockType: 1 },
  dirt: { id: "dirt", name: "Dirt", placeBlockType: 2 },
  stone: { id: "stone", name: "Stone", placeBlockType: 3 },
  wood: { id: "wood", name: "Wood", placeBlockType: 4 },
  leaf: { id: "leaf", name: "Leaf", placeBlockType: 5 },
  crafting_table: { id: "crafting_table", name: "Crafting Table", placeBlockType: 6 },
  furnace: { id: "furnace", name: "Furnace", placeBlockType: 7 },
  torch: { id: "torch", name: "Torch", placeBlockType: 8 },
  copper_ore: { id: "copper_ore", name: "Copper Ore", placeBlockType: 9 },
  // Wave 2 placeable blocks
  cobblestone: { id: "cobblestone", name: "Cobblestone", placeBlockType: 10 },
  sand: { id: "sand", name: "Sand", placeBlockType: 11 },
  gravel: { id: "gravel", name: "Gravel", placeBlockType: 12 },
  // Bedrock is not placeable by the player.
  glass: { id: "glass", name: "Glass", placeBlockType: 14 },
  // Wave 5 — water is not placeable or obtainable by the player (bucket later)
  water: { id: "water", name: "Water" },
  // Wave F5 — buckets (non-stackable; one per slot; fill/empty via right-click on fluid)
  empty_bucket: { id: "empty_bucket", name: "Empty Bucket" },
  water_bucket: { id: "water_bucket", name: "Water Bucket" },
  lava_bucket:  { id: "lava_bucket",  name: "Lava Bucket"  },
  // Wave 10 — chest block
  chest: { id: "chest", name: "Chest", placeBlockType: 22 },
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
  // Wave 7 — food items
  // apple: drops occasionally from leaf blocks; restores 4 hunger + 2.4 saturation
  apple: { id: "apple", name: "Apple", food: { hunger: 4, saturation: 2.4 } },
  // cooked_apple: smelt an apple for a better food value
  cooked_apple: { id: "cooked_apple", name: "Cooked Apple", food: { hunger: 6, saturation: 7.2 } },
  // Wave 9 — raw meat (low hunger, cook in furnace for better values)
  raw_beef:      { id: "raw_beef",      name: "Raw Beef",      food: { hunger: 3, saturation: 1.8 } },
  raw_porkchop:  { id: "raw_porkchop",  name: "Raw Porkchop",  food: { hunger: 3, saturation: 1.8 } },
  raw_chicken:   { id: "raw_chicken",   name: "Raw Chicken",   food: { hunger: 2, saturation: 1.2 } },
  // Wave 9 — cooked meat (smelted, much better food values)
  steak:            { id: "steak",            name: "Steak",            food: { hunger: 8, saturation: 12.8 } },
  cooked_porkchop:  { id: "cooked_porkchop",  name: "Cooked Porkchop",  food: { hunger: 8, saturation: 12.8 } },
  cooked_chicken:   { id: "cooked_chicken",   name: "Cooked Chicken",   food: { hunger: 6, saturation: 7.2  } },
  // Wave 9 — materials (feeds wave-10 armor/beds)
  wool:    { id: "wool",    name: "Wool"    },
  leather: { id: "leather", name: "Leather" },
  feather: { id: "feather", name: "Feather" },
  // Wave 10 — armor items (leather tier)
  leather_helmet:     { id: "leather_helmet",     name: "Leather Helmet",     armor: { slot: "head",  defense: 1 } },
  leather_chestplate: { id: "leather_chestplate", name: "Leather Chestplate", armor: { slot: "chest", defense: 3 } },
  leather_leggings:   { id: "leather_leggings",   name: "Leather Leggings",   armor: { slot: "legs",  defense: 2 } },
  leather_boots:      { id: "leather_boots",      name: "Leather Boots",      armor: { slot: "feet",  defense: 1 } },
  // Wave 10 — armor items (iron tier)
  iron_helmet:        { id: "iron_helmet",        name: "Iron Helmet",        armor: { slot: "head",  defense: 2 } },
  iron_chestplate:    { id: "iron_chestplate",    name: "Iron Chestplate",    armor: { slot: "chest", defense: 6 } },
  iron_leggings:      { id: "iron_leggings",      name: "Iron Leggings",      armor: { slot: "legs",  defense: 5 } },
  iron_boots:         { id: "iron_boots",         name: "Iron Boots",         armor: { slot: "feet",  defense: 2 } },
  // Wave 10 — armor items (diamond tier)
  diamond_helmet:     { id: "diamond_helmet",     name: "Diamond Helmet",     armor: { slot: "head",  defense: 3 } },
  diamond_chestplate: { id: "diamond_chestplate", name: "Diamond Chestplate", armor: { slot: "chest", defense: 8 } },
  diamond_leggings:   { id: "diamond_leggings",   name: "Diamond Leggings",   armor: { slot: "legs",  defense: 6 } },
  diamond_boots:      { id: "diamond_boots",      name: "Diamond Boots",      armor: { slot: "feet",  defense: 3 } },
  wood_pickaxe: { id: "wood_pickaxe", name: "Wood Pickaxe", toolKind: "pickaxe", toolPower: 2.1 },
  wood_axe: { id: "wood_axe", name: "Wood Axe", toolKind: "axe", toolPower: 2.1 },
  wood_shovel: { id: "wood_shovel", name: "Wood Shovel", toolKind: "shovel", toolPower: 2.1 },
  stone_pickaxe: { id: "stone_pickaxe", name: "Stone Pickaxe", toolKind: "pickaxe", toolPower: 3.4 },
  stone_axe: { id: "stone_axe", name: "Stone Axe", toolKind: "axe", toolPower: 3.4 },
  stone_shovel: { id: "stone_shovel", name: "Stone Shovel", toolKind: "shovel", toolPower: 3.4 },
  reinforced_pickaxe: { id: "reinforced_pickaxe", name: "Reinforced Pickaxe", toolKind: "pickaxe", toolPower: 4.5 },
  copper_pickaxe: { id: "copper_pickaxe", name: "Copper Pickaxe", toolKind: "pickaxe", toolPower: 5.4 },
  // Wave 8 — ore block items
  coal_ore:     { id: "coal_ore",     name: "Coal Ore",     placeBlockType: 16 },
  iron_ore:     { id: "iron_ore",     name: "Iron Ore",     placeBlockType: 17 },
  gold_ore:     { id: "gold_ore",     name: "Gold Ore",     placeBlockType: 18 },
  diamond_ore:  { id: "diamond_ore",  name: "Diamond Ore",  placeBlockType: 19 },
  redstone_ore: { id: "redstone_ore", name: "Redstone Ore", placeBlockType: 20 },
  // Wave 8 — ingots / gems / raw materials
  coal:         { id: "coal",         name: "Coal" },
  iron_ingot:   { id: "iron_ingot",   name: "Iron Ingot" },
  gold_ingot:   { id: "gold_ingot",   name: "Gold Ingot" },
  diamond:      { id: "diamond",      name: "Diamond" },
  redstone:     { id: "redstone",     name: "Redstone Dust" },
  // Wave 8 — iron tools
  iron_pickaxe: { id: "iron_pickaxe", name: "Iron Pickaxe", toolKind: "pickaxe", toolPower: 6.8 },
  iron_axe:     { id: "iron_axe",     name: "Iron Axe",     toolKind: "axe",     toolPower: 6.8 },
  iron_shovel:  { id: "iron_shovel",  name: "Iron Shovel",  toolKind: "shovel",  toolPower: 6.8 },
  iron_sword:   { id: "iron_sword",   name: "Iron Sword",   mobDamage: 10 },
  // Wave 8 — diamond tools
  diamond_pickaxe: { id: "diamond_pickaxe", name: "Diamond Pickaxe", toolKind: "pickaxe", toolPower: 9.2 },
  diamond_axe:     { id: "diamond_axe",     name: "Diamond Axe",     toolKind: "axe",     toolPower: 9.2 },
  diamond_shovel:  { id: "diamond_shovel",  name: "Diamond Shovel",  toolKind: "shovel",  toolPower: 9.2 },
  diamond_sword:   { id: "diamond_sword",   name: "Diamond Sword",   mobDamage: 14 },
};

export const BLOCK_DROPS = {
  1: "grass",
  2: "dirt",
  3: "cobblestone", // stone drops cobblestone (Minecraft behaviour)
  4: "wood",
  5: "leaf",
  6: "crafting_table",
  7: "furnace",
  8: "torch",
  9: "copper_ore",
  // Wave 2
  10: "cobblestone",
  11: "sand",
  12: "gravel",
  // 13 = bedrock: no drop (handled by breakBlock guard)
  14: "glass",
  // 15 = water: no drop (bucket mechanic deferred)
  // Wave 10 — chest drops itself (contents handled in breakBlock)
  22: "chest",
  // Wave 11 — flora drops (tall grass → seeds, flower → flower, sapling → sapling)
  23: "seeds",       // tall grass → seeds
  24: "flower",      // flower → flower
  25: "sapling",     // sapling → sapling
  // Wave F4 — slabs drop their slab item
  31: "stone_slab",
  32: "cobblestone_slab",
  33: "wood_slab",
  // Wave F4 — all stair orientations drop the single stair item for that material
  34: "stone_stairs",
  35: "stone_stairs",
  36: "stone_stairs",
  37: "stone_stairs",
  38: "cobblestone_stairs",
  39: "cobblestone_stairs",
  40: "cobblestone_stairs",
  41: "cobblestone_stairs",
  42: "wood_stairs",
  43: "wood_stairs",
  44: "wood_stairs",
  45: "wood_stairs",
  // Wave 12 — wood/snow variants
  26: "birch_log",   // birch log → birch log item
  27: "birch_leaf",  // birch leaf → birch leaf item
  28: "spruce_log",  // spruce log → spruce log item
  29: "spruce_leaf", // spruce leaf
  30: "snow_block",  // snow block → snow block item
  // Wave 8 — ore drops (harvest-level gating applied in breakBlock, not here)
  16: "coal",        // coal ore → coal directly (no smelting needed)
  17: "iron_ore",    // iron ore → iron ore item → smelt for ingot
  18: "gold_ore",    // gold ore → gold ore item → smelt for ingot
  19: "diamond",     // diamond ore → diamond gem directly
  20: "redstone",    // redstone ore → redstone dust directly
  // 21 = lava: no drop
};

/**
 * Extra probabilistic drops per block type.
 * Each entry: { itemId, chance }  — chance in [0, 1].
 * These are additional drops (beyond the main BLOCK_DROPS entry).
 */
export const BLOCK_EXTRA_DROPS = {
  // Leaf blocks: 1-in-8 chance of an apple (Minecraft uses ~1/200 but this is
  // a small world so we're more generous at 12.5% to make foraging viable).
  5:  [{ itemId: "apple", chance: 0.125 }],
  27: [{ itemId: "apple", chance: 0.125 }], // birch leaf — same apple chance
  29: [{ itemId: "apple", chance: 0.10  }], // spruce leaf — slightly lower
};

/**
 * Roll extra drops for a block type. Returns an array of itemIds that dropped.
 * @param {number} blockType
 * @param {() => number} [rng] - function returning [0,1); defaults to Math.random
 */
export function rollExtraDrops(blockType, rng = Math.random) {
  const extras = BLOCK_EXTRA_DROPS[blockType];
  if (!extras) {
    return [];
  }
  const dropped = [];
  for (const extra of extras) {
    if (rng() < extra.chance) {
      dropped.push(extra.itemId);
    }
  }
  return dropped;
}

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
  // Wave 2
  10: 3.0,  // cobblestone — tougher than stone, needs pickaxe
  11: 1.0,  // sand — shovel
  12: 1.2,  // gravel — shovel
  13: Infinity, // bedrock — unbreakable
  14: 1.2,  // glass — fist or any tool
  15: Infinity, // water — not breakable (flow/bucket mechanic deferred)
  // Wave 8 — ore ladder
  16: 3.0,  // coal ore
  17: 3.8,  // iron ore
  18: 4.5,  // gold ore
  19: 5.0,  // diamond ore
  20: 4.5,  // redstone ore
  21: Infinity, // lava — not breakable
  // Wave 10
  22: 2.0,  // chest — axe preferred
  // Wave 11 — flora: break instantly (zero hardness → one tick)
  23: 0.05,
  24: 0.05,
  25: 0.05,
  // Wave F4 — slabs and stairs: same hardness as source material
  31: 2.2,  // stone slab
  32: 3.0,  // cobblestone slab
  33: 1.5,  // wood plank slab
  34: 2.2,  35: 2.2,  36: 2.2,  37: 2.2,  // stone stairs
  38: 3.0,  39: 3.0,  40: 3.0,  41: 3.0,  // cobblestone stairs
  42: 1.5,  43: 1.5,  44: 1.5,  45: 1.5,  // wood stairs
  // Wave 12 — wood/snow variants
  26: 1.6,   // birch log — same as oak
  27: 0.8,   // birch leaf — same as oak leaf
  28: 1.6,   // spruce log — same as oak
  29: 0.8,   // spruce leaf — same as oak leaf
  30: 0.5,   // snow — soft, shovel preferred
};

const BLOCK_PREFERRED_TOOL = {
  1: "shovel",
  2: "shovel",
  3: "pickaxe",
  4: "axe",
  6: "axe",
  7: "pickaxe",
  // Wave F4 — slabs and stairs
  31: "pickaxe", 32: "pickaxe",               // stone + cobblestone slabs
  34: "pickaxe", 35: "pickaxe", 36: "pickaxe", 37: "pickaxe", // stone stairs
  38: "pickaxe", 39: "pickaxe", 40: "pickaxe", 41: "pickaxe", // cobblestone stairs
  33: "axe",                                   // wood plank slab
  42: "axe", 43: "axe", 44: "axe", 45: "axe", // wood stairs
  // Wave 12 — wood/snow variants
  26: "axe",    // birch log
  28: "axe",    // spruce log
  30: "shovel", // snow
  9: "pickaxe",
  // Wave 2
  10: "pickaxe", // cobblestone
  11: "shovel",  // sand
  12: "shovel",  // gravel
  // 13 bedrock: no tool matters — always Infinity hardness
  // 14 glass: no preferred tool (any breaks it equally)
  // Wave 10
  22: "axe",   // chest
  // Wave 8 — all ores need a pickaxe
  16: "pickaxe", // coal ore
  17: "pickaxe", // iron ore
  18: "pickaxe", // gold ore
  19: "pickaxe", // diamond ore
  20: "pickaxe", // redstone ore
};

// ---------------------------------------------------------------------------
// Recipe matching helpers — shared by the crafting grid and applyRecipe.
// ---------------------------------------------------------------------------

/**
 * Try to match a 3x3 grid (9-slot array, row-major) against a shaped recipe.
 * pattern: array of strings (rows), each char maps to an itemId via `key`.
 * Matching is offset-normalized: trim empty rows and columns, then compare.
 * Returns true when the non-empty layout matches regardless of position.
 */
export function matchShapedRecipe(gridSlots, recipe) {
  if (!recipe.pattern || !recipe.key) return false;

  // Build a 3x3 canonical grid from the pattern.
  const patRows = recipe.pattern;
  const keyMap = recipe.key;
  const patGrid = [];
  for (let row = 0; row < patRows.length; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const ch = patRows[row]?.[col] ?? "_";
      patGrid.push(ch === "_" || ch === " " ? null : (keyMap[ch] ?? null));
    }
  }
  // Pad to 9 slots
  while (patGrid.length < 9) patGrid.push(null);

  // Compute bounding box of non-null cells in pattern and in grid.
  function bbox(arr) {
    let minR = 3, maxR = -1, minC = 3, maxC = -1;
    for (let i = 0; i < 9; i += 1) {
      if (arr[i] !== null) {
        const r = Math.floor(i / 3);
        const c = i % 3;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    return { minR, maxR, minC, maxC };
  }

  const pb = bbox(patGrid);
  const gb = bbox(gridSlots.map((s) => (s ? s.itemId : null)));

  // Both must be empty or both non-empty
  const patEmpty = pb.maxR < 0;
  const gridEmpty = gb.maxR < 0;
  if (patEmpty !== gridEmpty) return false;
  if (patEmpty) return false;

  // Bounding-box dimensions must match
  const patH = pb.maxR - pb.minR + 1;
  const patW = pb.maxC - pb.minC + 1;
  const gridH = gb.maxR - gb.minR + 1;
  const gridW = gb.maxC - gb.minC + 1;
  if (patH !== gridH || patW !== gridW) return false;

  // Compare cell-by-cell within the bounding box
  for (let dr = 0; dr < patH; dr += 1) {
    for (let dc = 0; dc < patW; dc += 1) {
      const pIdx = (pb.minR + dr) * 3 + (pb.minC + dc);
      const gIdx = (gb.minR + dr) * 3 + (gb.minC + dc);
      const pId = patGrid[pIdx];
      const gSlot = gridSlots[gIdx];
      const gId = gSlot ? gSlot.itemId : null;
      if (pId !== gId) return false;
    }
  }
  return true;
}

/**
 * Try to match a grid (or inventory for shapeless) against a shapeless recipe.
 * For grid matching: each grid slot contributes exactly 1 of its item.
 * For applyRecipe: uses countInventoryItems against each required input.count.
 */
export function matchShapelessRecipeFromGrid(gridSlots, recipe) {
  // Build a count map from what's in the grid (1 per non-null slot)
  const gridCounts = new Map();
  for (const slot of gridSlots) {
    if (!slot) continue;
    gridCounts.set(slot.itemId, (gridCounts.get(slot.itemId) ?? 0) + 1);
  }
  // Check every required input is satisfied
  for (const input of recipe.inputs) {
    const have = gridCounts.get(input.itemId) ?? 0;
    if (have < input.count) return false;
  }
  // Check the grid doesn't have extra items not in the recipe
  const recipeItems = new Set(recipe.inputs.map((i) => i.itemId));
  for (const [itemId] of gridCounts) {
    if (!recipeItems.has(itemId)) return false;
  }
  // Also check total item count in grid matches total required
  const gridTotal = [...gridCounts.values()].reduce((a, b) => a + b, 0);
  const recipeTotal = recipe.inputs.reduce((a, i) => a + i.count, 0);
  return gridTotal === recipeTotal;
}

/**
 * Match a grid against any recipe (shaped first, then shapeless).
 * Returns the matching recipe or null.
 */
export function matchGridRecipe(gridSlots, recipes, needsWorkbench) {
  for (const recipe of recipes) {
    if (recipe.requiresWorkbench && !needsWorkbench) continue;
    const matched = recipe.pattern
      ? matchShapedRecipe(gridSlots, recipe)
      : matchShapelessRecipeFromGrid(gridSlots, recipe);
    if (matched) return recipe;
  }
  return null;
}

export const RECIPES = [
  {
    id: "planks",
    name: "Planks x4",
    inputs: [{ itemId: "wood", count: 1 }],
    output: { itemId: "plank", count: 4 },
    requiresWorkbench: false,
  },
  {
    id: "birch_planks",
    name: "Planks x4 (Birch)",
    inputs: [{ itemId: "birch_log", count: 1 }],
    output: { itemId: "plank", count: 4 },
    requiresWorkbench: false,
  },
  {
    id: "spruce_planks",
    name: "Planks x4 (Spruce)",
    inputs: [{ itemId: "spruce_log", count: 1 }],
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
    // XXX_   (3 planks top row, sticks middle and bottom of center col)
    pattern: ["XXX", "_S_", "_S_"],
    key: { X: "plank", S: "stick" },
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
    // Plank over plank over stick
    pattern: ["_X_", "_X_", "_S_"],
    key: { X: "plank", S: "stick" },
    inputs: [
      { itemId: "plank", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "wood_sword", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "wood_axe",
    name: "Wood Axe",
    // XX_ / _S_ / _S_ (2 planks + 2 sticks, matching original inputs)
    pattern: ["XX_", "_S_", "_S_"],
    key: { X: "plank", S: "stick" },
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
    // _X_ / _S_ / _S_
    pattern: ["_X_", "_S_", "_S_"],
    key: { X: "plank", S: "stick" },
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
    pattern: ["XXX", "_S_", "_S_"],
    key: { X: "stone", S: "stick" },
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
    pattern: ["XX_", "_S_", "_S_"],
    key: { X: "stone", S: "stick" },
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
    pattern: ["_X_", "_S_", "_S_"],
    key: { X: "stone", S: "stick" },
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
    pattern: ["XXX", "_S_", "_S_"],
    key: { X: "copper_ingot", S: "stick" },
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
  // Wave 8 — iron tools (3 ingots + 2 sticks)
  {
    id: "iron_pickaxe",
    name: "Iron Pickaxe",
    pattern: ["XXX", "_S_", "_S_"],
    key: { X: "iron_ingot", S: "stick" },
    inputs: [
      { itemId: "iron_ingot", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "iron_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_axe",
    name: "Iron Axe",
    pattern: ["XX_", "_S_", "_S_"],
    key: { X: "iron_ingot", S: "stick" },
    inputs: [
      { itemId: "iron_ingot", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "iron_axe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_shovel",
    name: "Iron Shovel",
    pattern: ["_X_", "_S_", "_S_"],
    key: { X: "iron_ingot", S: "stick" },
    inputs: [
      { itemId: "iron_ingot", count: 1 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "iron_shovel", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_sword",
    name: "Iron Sword",
    pattern: ["_X_", "_X_", "_S_"],
    key: { X: "iron_ingot", S: "stick" },
    inputs: [
      { itemId: "iron_ingot", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "iron_sword", count: 1 },
    requiresWorkbench: true,
  },
  // Wave 8 — diamond tools (3 diamonds + 2 sticks)
  {
    id: "diamond_pickaxe",
    name: "Diamond Pickaxe",
    pattern: ["XXX", "_S_", "_S_"],
    key: { X: "diamond", S: "stick" },
    inputs: [
      { itemId: "diamond", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "diamond_pickaxe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_axe",
    name: "Diamond Axe",
    pattern: ["XX_", "_S_", "_S_"],
    key: { X: "diamond", S: "stick" },
    inputs: [
      { itemId: "diamond", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "diamond_axe", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_shovel",
    name: "Diamond Shovel",
    pattern: ["_X_", "_S_", "_S_"],
    key: { X: "diamond", S: "stick" },
    inputs: [
      { itemId: "diamond", count: 1 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "diamond_shovel", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_sword",
    name: "Diamond Sword",
    pattern: ["_X_", "_X_", "_S_"],
    key: { X: "diamond", S: "stick" },
    inputs: [
      { itemId: "diamond", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "diamond_sword", count: 1 },
    requiresWorkbench: true,
  },
  // Wave 8 — coal is also a fuel; allow crafting torches with coal (same recipe path)
  {
    id: "torch_coal",
    name: "Torch x4 (coal)",
    inputs: [
      { itemId: "stick", count: 1 },
      { itemId: "coal", count: 1 },
    ],
    output: { itemId: "torch", count: 4 },
    requiresWorkbench: false,
  },
  // Wave 10 — chest (8 planks around the perimeter, empty center)
  {
    id: "chest",
    name: "Chest",
    pattern: ["XXX", "X_X", "XXX"],
    key: { X: "plank" },
    inputs: [{ itemId: "plank", count: 8 }],
    output: { itemId: "chest", count: 1 },
    requiresWorkbench: true,
  },
  // Wave 10 — leather armor
  {
    id: "leather_helmet",
    name: "Leather Helmet",
    pattern: ["XXX", "X_X", "___"],
    key: { X: "leather" },
    inputs: [{ itemId: "leather", count: 5 }],
    output: { itemId: "leather_helmet", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "leather_chestplate",
    name: "Leather Chestplate",
    pattern: ["X_X", "XXX", "XXX"],
    key: { X: "leather" },
    inputs: [{ itemId: "leather", count: 8 }],
    output: { itemId: "leather_chestplate", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "leather_leggings",
    name: "Leather Leggings",
    pattern: ["XXX", "X_X", "X_X"],
    key: { X: "leather" },
    inputs: [{ itemId: "leather", count: 7 }],
    output: { itemId: "leather_leggings", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "leather_boots",
    name: "Leather Boots",
    pattern: ["___", "X_X", "X_X"],
    key: { X: "leather" },
    inputs: [{ itemId: "leather", count: 4 }],
    output: { itemId: "leather_boots", count: 1 },
    requiresWorkbench: true,
  },
  // Wave 10 — iron armor
  {
    id: "iron_helmet",
    name: "Iron Helmet",
    pattern: ["XXX", "X_X", "___"],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 5 }],
    output: { itemId: "iron_helmet", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_chestplate",
    name: "Iron Chestplate",
    pattern: ["X_X", "XXX", "XXX"],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 8 }],
    output: { itemId: "iron_chestplate", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_leggings",
    name: "Iron Leggings",
    pattern: ["XXX", "X_X", "X_X"],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 7 }],
    output: { itemId: "iron_leggings", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "iron_boots",
    name: "Iron Boots",
    pattern: ["___", "X_X", "X_X"],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 4 }],
    output: { itemId: "iron_boots", count: 1 },
    requiresWorkbench: true,
  },
  // Wave 10 — diamond armor
  {
    id: "diamond_helmet",
    name: "Diamond Helmet",
    pattern: ["XXX", "X_X", "___"],
    key: { X: "diamond" },
    inputs: [{ itemId: "diamond", count: 5 }],
    output: { itemId: "diamond_helmet", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_chestplate",
    name: "Diamond Chestplate",
    pattern: ["X_X", "XXX", "XXX"],
    key: { X: "diamond" },
    inputs: [{ itemId: "diamond", count: 8 }],
    output: { itemId: "diamond_chestplate", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_leggings",
    name: "Diamond Leggings",
    pattern: ["XXX", "X_X", "X_X"],
    key: { X: "diamond" },
    inputs: [{ itemId: "diamond", count: 7 }],
    output: { itemId: "diamond_leggings", count: 1 },
    requiresWorkbench: true,
  },
  {
    id: "diamond_boots",
    name: "Diamond Boots",
    pattern: ["___", "X_X", "X_X"],
    key: { X: "diamond" },
    inputs: [{ itemId: "diamond", count: 4 }],
    output: { itemId: "diamond_boots", count: 1 },
    requiresWorkbench: true,
  },
  // Wave F4 — slabs: 3 of the material in a horizontal row → 6 slabs
  {
    id: "stone_slab",
    name: "Stone Slab x6",
    pattern: ["___", "___", "XXX"],
    key: { X: "stone" },
    inputs: [{ itemId: "stone", count: 3 }],
    output: { itemId: "stone_slab", count: 6 },
    requiresWorkbench: false,
  },
  {
    id: "cobblestone_slab",
    name: "Cobblestone Slab x6",
    pattern: ["___", "___", "XXX"],
    key: { X: "cobblestone" },
    inputs: [{ itemId: "cobblestone", count: 3 }],
    output: { itemId: "cobblestone_slab", count: 6 },
    requiresWorkbench: false,
  },
  {
    id: "wood_slab",
    name: "Wood Slab x6",
    pattern: ["___", "___", "XXX"],
    key: { X: "plank" },
    inputs: [{ itemId: "plank", count: 3 }],
    output: { itemId: "wood_slab", count: 6 },
    requiresWorkbench: false,
  },
  // Wave F4 — stairs: Minecraft stair pattern (6 blocks → 4 stairs)
  // Pattern: X__/ XX_/ XXX  (staircase shape, 6 inputs)
  {
    id: "stone_stairs",
    name: "Stone Stairs x4",
    pattern: ["X__", "XX_", "XXX"],
    key: { X: "stone" },
    inputs: [{ itemId: "stone", count: 6 }],
    output: { itemId: "stone_stairs", count: 4 },
    requiresWorkbench: true,
  },
  {
    id: "cobblestone_stairs",
    name: "Cobblestone Stairs x4",
    pattern: ["X__", "XX_", "XXX"],
    key: { X: "cobblestone" },
    inputs: [{ itemId: "cobblestone", count: 6 }],
    output: { itemId: "cobblestone_stairs", count: 4 },
    requiresWorkbench: true,
  },
  {
    id: "wood_stairs",
    name: "Wood Stairs x4",
    pattern: ["X__", "XX_", "XXX"],
    key: { X: "plank" },
    inputs: [{ itemId: "plank", count: 6 }],
    output: { itemId: "wood_stairs", count: 4 },
    requiresWorkbench: true,
  },
  // Wave F5 — bucket (3 iron ingots in a U-shape: bottom row + left + right of middle row)
  {
    id: "empty_bucket",
    name: "Bucket",
    pattern: ["_X_", "X_X", "_X_"],
    key: { X: "iron_ingot" },
    inputs: [{ itemId: "iron_ingot", count: 3 }],
    output: { itemId: "empty_bucket", count: 1 },
    requiresWorkbench: true,
  },
];

export const FUEL_ITEM_MS = {
  leaf: 800,
  stick: 1200,
  plank: 2500,
  wood: 3000,
  birch_log: 3000,
  spruce_log: 3000,
  charcoal: 6000,
  coal: 6000, // Wave 8 — coal burns as long as charcoal
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
  // Wave 2 smelting
  {
    id: "cobblestone_to_stone",
    inputItemId: "cobblestone",
    outputItemId: "stone",
    cookTimeMs: 2000,
  },
  {
    id: "sand_to_glass",
    inputItemId: "sand",
    outputItemId: "glass",
    cookTimeMs: 1600,
  },
  // Wave 7 — cook apples in the furnace for a better food item
  {
    id: "cooked_apple",
    inputItemId: "apple",
    outputItemId: "cooked_apple",
    cookTimeMs: 1200,
  },
  // Wave 8 — smelt ores into ingots
  {
    id: "iron_ingot",
    inputItemId: "iron_ore",
    outputItemId: "iron_ingot",
    cookTimeMs: 2800,
  },
  {
    id: "gold_ingot",
    inputItemId: "gold_ore",
    outputItemId: "gold_ingot",
    cookTimeMs: 3200,
  },
  // Wave 9 — cook meat into higher-value food
  {
    id: "steak",
    inputItemId: "raw_beef",
    outputItemId: "steak",
    cookTimeMs: 1400,
  },
  {
    id: "cooked_porkchop",
    inputItemId: "raw_porkchop",
    outputItemId: "cooked_porkchop",
    cookTimeMs: 1400,
  },
  {
    id: "cooked_chicken",
    inputItemId: "raw_chicken",
    outputItemId: "cooked_chicken",
    cookTimeMs: 1200,
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

  // Tools with durability are never stacked — each goes into its own slot at
  // count:1 with durability initialised to the item's max.
  if (hasDurability(itemId)) {
    for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
      if (inventory[i]) {
        continue;
      }
      inventory[i] = { itemId, count: 1, durability: TOOL_MAX_DURABILITY[itemId] };
      remaining -= 1;
    }
    return remaining;
  }

  // Wave F5: non-stackable items (buckets) — one per slot, count always 1.
  if (NON_STACKABLE.has(itemId)) {
    for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
      if (inventory[i]) {
        continue;
      }
      inventory[i] = { itemId, count: 1 };
      remaining -= 1;
    }
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

  // Tools with durability and non-stackable items (buckets) never merge — only swap.
  if (!hasDurability(fromSlot.itemId) && !NON_STACKABLE.has(fromSlot.itemId) && toSlot.itemId === fromSlot.itemId && toSlot.count < MAX_STACK) {
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

/**
 * Returns the food definition {hunger, saturation} for an item, or null.
 */
export function getFoodDef(itemId) {
  return ITEM_DEFS[itemId]?.food || null;
}

/**
 * Decrement durability on the slot at slotIndex by `amount`.
 * If durability reaches 0 the slot is cleared (tool breaks).
 * Returns true when the tool broke, false otherwise.
 * No-ops when the slot isn't a durability item.
 * @param {Array} inventory
 * @param {number} slotIndex
 * @param {number} [amount=1]
 */
export function decrementDurability(inventory, slotIndex, amount = 1) {
  const slot = inventory[slotIndex];
  if (!slot || !hasDurability(slot.itemId)) {
    return false;
  }
  // Initialise durability lazily for items that pre-date Wave 7.
  if (!Number.isFinite(slot.durability)) {
    slot.durability = TOOL_MAX_DURABILITY[slot.itemId] ?? 1;
  }
  slot.durability = Math.max(0, slot.durability - amount);
  if (slot.durability <= 0) {
    inventory[slotIndex] = null;
    return true; // broke
  }
  return false;
}
