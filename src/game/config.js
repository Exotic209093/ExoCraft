const DEFAULT_GAME_CONFIG = {
  world: {
    maxReach: 6,
    // Wave 3: raised from 24 to 112 for mountains, deep caves, and future ocean/biome space.
    // Per-chunk Uint8Array grows from 16*16*24=6 144 bytes to 16*16*112=28 672 bytes;
    // acceptable with data eviction added this wave.
    height: 112,
    chunk: {
      size: 16,
      activeRadius: 2,
      spawnSearchRadius: 14,
      initialCenterX: 0,
      initialCenterZ: 0,
      // Evict voxel data for chunks this many chunk-radii beyond activeRadius.
      // activeRadius=2, evictRadius=5 means chunks >5 chunk-lengths away drop their
      // Uint8Array; they regenerate identically when re-entered (deterministic generation
      // + chunkEdits re-apply on createChunk).
      evictRadius: 5,
    },
    blockTypes: [
      { id: 1, name: "Grass", color: 0x76cc58 },
      { id: 2, name: "Dirt", color: 0x8b613d },
      { id: 3, name: "Stone", color: 0x80878f },
      { id: 4, name: "Wood", color: 0x9a6a3b },
      { id: 5, name: "Leaf", color: 0x61b76a },
      { id: 6, name: "Crafting Table", color: 0xc78f45 },
      { id: 7, name: "Furnace", color: 0x61666d },
      { id: 8, name: "Torch", color: 0xf4b65a, emissive: 0x6b3b08, emissiveIntensity: 0.32 },
      { id: 9, name: "Copper Ore", color: 0xad7547, emissive: 0x251307, emissiveIntensity: 0.2 },
      // Wave 2 blocks
      { id: 10, name: "Cobblestone", color: 0x808080 },
      { id: 11, name: "Sand", color: 0xe4d28e },
      { id: 12, name: "Gravel", color: 0x827a72 },
      { id: 13, name: "Bedrock", color: 0x262626 },
      { id: 14, name: "Glass", color: 0xb4dcf8, transparent: true },
      // Wave 5
      { id: 15, name: "Water", color: 0x2b6ccc, transparent: true },
      // Wave 8 — ore ladder
      { id: 16, name: "Coal Ore",     color: 0x4a4a52 },
      { id: 17, name: "Iron Ore",     color: 0xc4a07a },
      { id: 18, name: "Gold Ore",     color: 0xe8c840 },
      { id: 19, name: "Diamond Ore",  color: 0x50e8d8 },
      { id: 20, name: "Redstone Ore", color: 0xc02020 },
      // Wave 8 — lava (emissive fluid)
      { id: 21, name: "Lava", color: 0xff6600, transparent: true, emissive: 0xff3300, emissiveIntensity: 0.9 },
    ],
    generation: {
      seed: 1337,

      // --- Surface shape (Wave 3 FBM terrain) ---
      // Average surface at Y≈48 (world mid). Mountains peak ~Y 70-90, valleys ~Y 28.
      baseHeight: 48,
      // FBM rolling-hills layer: 4 octaves, base frequency ~0.008 (large features)
      fbmOctaves: 4,
      fbmBaseFrequency: 0.008,
      fbmAmplitude: 18,        // half-range of rolling terrain variation
      // Ridged-noise mountain layer: modulated by a low-freq mountainousness mask
      ridgeFrequency: 0.006,
      ridgeAmplitude: 28,      // max additional height for mountain peaks
      mountainMaskFrequency: 0.003,
      mountainMaskThreshold: 0.45, // mask value below which mountains are suppressed
      // Hard clamps for the final surface Y
      minSurfaceY: 4,
      topClearance: 8,         // keep at least 8 blocks of sky above tallest surface

      // Legacy sine-wave params removed — replaced by FBM above.

      // --- Trees ---
      treeThreshold: 0.985,
      treeTopClearance: 4,
      trunkMinHeight: 3,
      trunkHeightVariance: 2,
      leafRadius: 1,
      leafVerticalRadius: 1,
      leafDistanceLimit: 2,

      // --- Caves (Wave 3: deeper, more connected tunnels) ---
      // caveCeilingY raised from 13→50: caves now thread through the bulk of the
      // underground. caveMinRoofDepth ensures caves don't breach the surface.
      caveCeilingY: 50,
      caveFrequency: 0.07,     // lower freq = larger, more connected cave systems
      caveThreshold: 0.74,     // lower threshold = more cave volume
      caveDetailFrequency: 0.18,
      caveDetailStrength: 0.20,
      caveMinRoofDepth: 5,

      // --- Water (Wave 5) ---
      // Sea level at Y=38: valleys (~Y28) fill nicely as oceans; surface (~Y48) stays
      // above water so the player spawns on land. 10-block margin gives visible coastline.
      seaLevel: 38,
      // Beach: replace top dirt/grass with sand when the surface is within this many
      // blocks above sea level (visible shoreline band around every body of water).
      beachWidth: 4,

      // --- Copper ore (objective system must stay reachable) ---
      // Surface nodes: just below the surface, same relative depth as before
      surfaceOreDepth: 3,
      surfaceOreThreshold: 0.90,
      // Cave-embedded copper: ceiling raised to 70 so cave ore lands inside the
      // surface-relative scan band (topY-14 → topY-1) for the taller Wave-3 terrain
      // (surface Y ~40-80). wave-8 ore ladder will fill Y<20 with deeper ores later.
      caveOreCeilingY: 70,
      caveOreThreshold: 0.942,
      caveOreFrequency: 0.19,

      // --- Wave 8: ore ladder depth bands ---
      // oreFrequency: noise sampling frequency for the ore vein field
      oreFrequency: 0.22,
      // Per-ore threshold (noise must exceed this to place an ore vein voxel).
      // Higher threshold = rarer veins.
      coalOreThreshold:     0.930,  // shallow & common
      ironOreThreshold:     0.945,
      goldOreThreshold:     0.956,
      redstoneOreThreshold: 0.958,
      diamondOreThreshold:  0.968,  // deepest & rarest

      // --- Wave 8: lava ---
      // Air pockets at or below this Y in the cave zone fill with lava.
      // seaLevel=38, so Y=16 puts lava safely in the deep underground only.
      lavaLevel: 16,
    },
  },
  player: {
    radius: 0.32,
    height: 1.8,
    eyeHeight: 1.62,
    maxHealth: 20,
    stepHeight: 1.05,
    moveSpeed: 6.2,
    turnSpeed: 2.3,
    gravity: -28,
    jumpSpeed: 10.5,
    fallDamageSafeSpeed: 13,
    fallDamageMultiplier: 0.65,
  },
  simulation: {
    fixedStepMs: 1000 / 60,
    epsilon: 1e-4,
    maxNearbyBlocks: 20,
    outOfBoundsY: -5,
    autosaveIntervalMs: 15000,
    dayNightCycleMs: 240000,
    initialTimeOfDayMs: 60000,
    hostileMobs: {
      enabled: true,
      maxCount: 10,
      maxPersisted: 20,
      dropItemId: "bone_shard",
      dropMin: 1,
      dropMax: 2,
      dropChance: 1,
      spawnCheckIntervalMs: 1800,
      spawnChancePerCheck: 0.55,
      spawnDayFactorThreshold: 0.56,
      spawnMinDistance: 9,
      spawnMaxDistance: 22,
      minSeparation: 2.4,
      wanderSpeed: 1.7,
      chaseSpeed: 2.7,
      chaseRange: 12,
      giveUpRange: 18,
      attackRange: 1.1,
      attackDamage: 2,
      attackCooldownMs: 900,
      maxStepHeight: 1.1,
      dayDespawnFactor: 0.72,
      dayDespawnDistance: 13,
      dayDespawnChancePerSecond: 0.6,
      playerHitDamage: 2,
      playerBaseMobDamage: 2,
    },
    torchLighting: {
      enabled: true,
      scanRadius: 10,
      maxLights: 8,
      color: 0xffc46b,
      intensity: 1.55,
      distance: 13,
      decay: 1.9,
      yOffset: 0.68,
    },
  },
  render: {
    maxPixelRatio: 2,
    fov: 75,
    near: 0.05,
    far: 300,
    backgroundColor: 0x86c8ff,
    fogNear: 24,
    fogFar: 90,
  },
  lighting: {
    hemisphere: {
      skyColor: 0xb6e0ff,
      groundColor: 0x4f4638,
      intensity: 1.22,
    },
    sun: {
      color: 0xfff4d7,
      intensity: 1.12,
      position: { x: 30, y: 48, z: 24 },
    },
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (isPlainObject(value)) {
    const cloned = {};
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = cloneValue(nested);
    }
    return cloned;
  }
  return value;
}

function deepMerge(base, overrides) {
  if (overrides === undefined) {
    return cloneValue(base);
  }
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return cloneValue(overrides);
  }

  const result = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(overrides)]);
  for (const key of keys) {
    const baseValue = base[key];
    const overrideValue = overrides[key];
    if (overrideValue === undefined) {
      result[key] = cloneValue(baseValue);
      continue;
    }
    result[key] = deepMerge(baseValue, overrideValue);
  }
  return result;
}

export function createGameConfig(overrides = {}) {
  return deepMerge(DEFAULT_GAME_CONFIG, overrides);
}

export { DEFAULT_GAME_CONFIG };
