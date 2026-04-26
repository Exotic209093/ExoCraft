const DEFAULT_GAME_CONFIG = {
  world: {
    maxReach: 6,
    height: 24,
    chunk: {
      size: 16,
      activeRadius: 2,
      spawnSearchRadius: 14,
      initialCenterX: 0,
      initialCenterZ: 0,
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
    ],
    generation: {
      seed: 1337,
      baseHeight: 7,
      waveXFrequency: 0.17,
      waveXAmplitude: 1.7,
      waveZFrequency: 0.13,
      waveZAmplitude: 1.4,
      waveDiagonalFrequency: 0.11,
      waveDiagonalAmplitude: 1.2,
      noiseAmplitude: 2.2,
      minSurfaceY: 2,
      topClearance: 6,
      treeThreshold: 0.985,
      treeTopClearance: 4,
      trunkMinHeight: 3,
      trunkHeightVariance: 2,
      leafRadius: 1,
      leafVerticalRadius: 1,
      leafDistanceLimit: 2,
      caveCeilingY: 13,
      caveFrequency: 0.11,
      caveThreshold: 0.78,
      caveDetailFrequency: 0.24,
      caveDetailStrength: 0.22,
      caveMinRoofDepth: 3,
      surfaceOreDepth: 3,
      surfaceOreThreshold: 0.968,
      caveOreCeilingY: 11,
      caveOreThreshold: 0.942,
      caveOreFrequency: 0.19,
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
