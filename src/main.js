import "./style.css";
import * as THREE from "three";
import { createGameConfig } from "./game/config";
import { setupControls } from "./game/controls";
import { updateHud } from "./game/hud";
import { aabbIntersectsBlock, playerAABBAt, resolveAxis } from "./game/physics";
import { getSave, putSave, removeSave } from "./game/save";
import {
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  MAX_STACK,
  ITEM_DEFS,
  FUEL_ITEM_MS,
  RECIPES,
  SMELTING_RECIPES,
  addItemToInventory,
  applyRecipe,
  consumeItemFromInventory,
  consumeFromSlot,
  countInventoryItems,
  createStartingInventory,
  getBlockDropItem,
  getFuelValue,
  getBlockHardness,
  getBreakPower,
  getItemName,
  getMobDamage,
  getPlaceableBlockType,
  getSelectedSlot,
  getSmeltingRecipeByInput,
  transferInventoryStack,
} from "./game/survival";
import { createBlockMaterials, VoxelWorld, dayFactorUniform } from "./game/world";
import {
  createAtlasTexture,
  createCrackTextures,
  CRACK_STAGE_COUNT,
  createSunTexture,
  createMoonTexture,
} from "./game/textures";

const configOverrides = typeof window.EXOCRAFT_CONFIG === "object" ? window.EXOCRAFT_CONFIG : {};
const gameConfig = createGameConfig(configOverrides);
window.getExoCraftConfig = () => gameConfig;

const { world: worldConfig, player: playerConfig, simulation: simConfig, render: renderConfig, lighting: lightingConfig } = gameConfig;
const BLOCK_TYPES = worldConfig.blockTypes;
const BLOCK_BY_ID = new Map(BLOCK_TYPES.map((block) => [block.id, block]));
const WOOD_BLOCK_TYPE = 4;
const LEAF_BLOCK_TYPE = 5;
const CRAFTING_TABLE_BLOCK_TYPE = 6;
const FURNACE_BLOCK_TYPE = 7;
const TORCH_BLOCK_TYPE = 8;
const COPPER_ORE_BLOCK_TYPE = 9;
// Wave 2 block type ids
const COBBLESTONE_BLOCK_TYPE = 10;
const SAND_BLOCK_TYPE = 11;
const GRAVEL_BLOCK_TYPE = 12;
const BEDROCK_BLOCK_TYPE = 13;
const GLASS_BLOCK_TYPE = 14;
// Wave 5 block type ids
const WATER_BLOCK_TYPE = 15;
const FALLING_BLOCK_TYPES = new Set([SAND_BLOCK_TYPE, GRAVEL_BLOCK_TYPE]);
const FURNACE_INTERACT_RADIUS = 6;
const OBJECTIVE_WAYPOINT_RESCAN_MS = 250;
const OBJECTIVE_CAVE_MIN_ROOF_DEPTH = 3;
const SPECIALIZATION_COMBAT_KILLS_REQUIRED = 3;
const SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED = 3;
const SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED = 4;
const SPECIAL_ITEM_WARDEN_TOTEM = "warden_totem";
const SPECIAL_ITEM_SPELUNKER_COMPASS = "spelunker_compass";
const SPECIAL_ITEM_WARDEN_TOTEM_MAX_HEALTH_BONUS = 3;
const SPECIAL_ITEM_SPELUNKER_COMPASS_MOVE_SPEED_BONUS = 0.55;
const SPECIAL_ITEM_SPELUNKER_COMPASS_TORCH_SCAN_BONUS = 3;
const OBJECTIVE_TOTAL_STEPS = 7;
const BRANCH_LOOP_COMBAT_KILLS_REQUIRED = 4;
const BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED = 2;
const BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED = 2;
const COMBAT_BRANCH_REWARD_BUNDLE = [
  { itemId: "bone_shard", count: 4 },
  { itemId: "copper_ingot", count: 1 },
];
const EXPLORER_BRANCH_REWARD_BUNDLE = [
  { itemId: "torch", count: 4 },
  { itemId: "copper_ore", count: 2 },
];
const hostileMobConfig = simConfig.hostileMobs || {};
// Damage the player's bare-hand attack deals to mobs (NOT the damage a mob deals to the player —
// that lives in hostileMobConfig.attackDamage / playerHitDamage).
const playerBaseMobDamage = Number.isFinite(hostileMobConfig.playerBaseMobDamage)
  ? hostileMobConfig.playerBaseMobDamage
  : 2;
const torchLightConfig = simConfig.torchLighting || {};
const furnaceStates = new Map();

const app = document.querySelector("#app");
const menu = document.querySelector("#menu");
const startButton = document.querySelector("#start-btn");
const hud = document.querySelector("#hud");
const hotbarEl = document.querySelector("#hotbar");
const statsEl = document.querySelector("#stats");
const objectiveHudEl = document.querySelector("#objective-hud");
const objectiveTitleEl = document.querySelector("#objective-title");
const objectiveDetailEl = document.querySelector("#objective-detail");
const objectiveWaypointEl = document.querySelector("#objective-waypoint");
const saveControls = document.querySelector("#save-controls");
const saveButton = document.querySelector("#save-btn");
const loadButton = document.querySelector("#load-btn");
const newWorldButton = document.querySelector("#new-world-btn");
const saveStatusEl = document.querySelector("#save-status");
const craftPanel = document.querySelector("#craft-panel");
const craftContext = document.querySelector("#craft-context");
const craftRecipes = document.querySelector("#craft-recipes");
const furnacePanel = document.querySelector("#furnace-panel");
const furnaceContext = document.querySelector("#furnace-context");
const furnaceControls = document.querySelector("#furnace-controls");
const inventoryPanel = document.querySelector("#inventory-panel");
const inventoryHint = document.querySelector("#inventory-hint");
const inventoryHotbarGrid = document.querySelector("#inventory-hotbar-grid");
const inventoryBackpackGrid = document.querySelector("#inventory-backpack-grid");
const damageFlashEl = document.querySelector("#damage-flash");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderConfig.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.tabIndex = 1;
renderer.domElement.setAttribute("aria-label", "ExoCraft canvas");
app.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(renderConfig.backgroundColor);
scene.fog = new THREE.Fog(renderConfig.backgroundColor, renderConfig.fogNear, renderConfig.fogFar);
const daySkyColor = new THREE.Color(renderConfig.backgroundColor);
const nightSkyColor = new THREE.Color(0x10182a);
// Underwater fog: deep blue tint with short draw distance to feel immersed.
const underwaterFogColor = new THREE.Color(0x0a3a7a);
const UNDERWATER_FOG_NEAR = 2;
const UNDERWATER_FOG_FAR  = 16;
const dayGroundColor = new THREE.Color(lightingConfig.hemisphere.groundColor);
const nightGroundColor = new THREE.Color(0x1b2029);
const daySunColor = new THREE.Color(lightingConfig.sun.color);
const nightSunColor = new THREE.Color(0x516a91);
const dayHemiSkyColor = new THREE.Color(lightingConfig.hemisphere.skyColor);
const nightHemiSkyColor = new THREE.Color(0x304464);

const camera = new THREE.PerspectiveCamera(renderConfig.fov, window.innerWidth / window.innerHeight, renderConfig.near, renderConfig.far);
camera.rotation.order = "YXZ";

const hemiLight = new THREE.HemisphereLight(
  lightingConfig.hemisphere.skyColor,
  lightingConfig.hemisphere.groundColor,
  lightingConfig.hemisphere.intensity,
);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(lightingConfig.sun.color, lightingConfig.sun.intensity);
sun.position.set(lightingConfig.sun.position.x, lightingConfig.sun.position.y, lightingConfig.sun.position.z);
scene.add(sun);

// Visible sun + moon discs. Both follow the simulation's sun-direction so they line up
// with where the directional light is "coming from". Moon sits on the opposite side.
const SKY_BODY_DISTANCE = 180;
const SKY_BODY_SCALE = 22;
const sunSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createSunTexture(),
    depthWrite: false,
    depthTest: false,
    transparent: true,
    fog: false,
  }),
);
sunSprite.scale.set(SKY_BODY_SCALE, SKY_BODY_SCALE, 1);
sunSprite.renderOrder = -1;
scene.add(sunSprite);
const moonSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createMoonTexture(),
    depthWrite: false,
    depthTest: false,
    transparent: true,
    fog: false,
  }),
);
moonSprite.scale.set(SKY_BODY_SCALE * 0.7, SKY_BODY_SCALE * 0.7, 1);
moonSprite.renderOrder = -1;
scene.add(moonSprite);

const torchLights = [];
let activeTorchLights = 0;
const torchLightsEnabled = torchLightConfig.enabled !== false;
const torchLightPoolSize = Number.isFinite(torchLightConfig.maxLights) ? Math.max(0, Math.floor(torchLightConfig.maxLights)) : 8;
if (torchLightsEnabled && torchLightPoolSize > 0) {
  const torchColor = Number.isFinite(torchLightConfig.color) ? torchLightConfig.color : 0xffc46b;
  const torchDistance = Number.isFinite(torchLightConfig.distance) ? torchLightConfig.distance : 13;
  const torchIntensity = Number.isFinite(torchLightConfig.intensity) ? torchLightConfig.intensity : 1.55;
  const torchDecay = Number.isFinite(torchLightConfig.decay) ? torchLightConfig.decay : 1.9;
  for (let i = 0; i < torchLightPoolSize; i += 1) {
    const light = new THREE.PointLight(torchColor, torchIntensity, torchDistance, torchDecay);
    light.visible = false;
    scene.add(light);
    torchLights.push(light);
  }
}

const atlasTexture = createAtlasTexture();
const blockMaterials = createBlockMaterials(BLOCK_TYPES, atlasTexture);
const world = new VoxelWorld({
  height: worldConfig.height,
  chunk: worldConfig.chunk,
  blockTypes: BLOCK_TYPES,
  materials: blockMaterials,
  generation: worldConfig.generation,
});
world.generateTerrain();
scene.add(world.meshGroup);

const hostileMobGroup = new THREE.Group();
scene.add(hostileMobGroup);
const hostileMobGeometry = new THREE.BoxGeometry(0.82, 0.9, 0.82);
const hostileMobMaterial = new THREE.MeshLambertMaterial({ color: 0xcc5a56, emissive: 0x2c0c0c });

const targetOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);
targetOutline.visible = false;
scene.add(targetOutline);

// Mining-cracks overlay: a slightly-larger box anchored to the targeted block, with
// a transparent texture that swaps through 10 stages as break progress increases.
const crackTextures = createCrackTextures();
const crackOverlayMaterial = new THREE.MeshBasicMaterial({
  map: crackTextures[0],
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const crackOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), crackOverlayMaterial);
crackOverlay.visible = false;
scene.add(crackOverlay);
let lastCrackStage = -1;

// ----- Block-break particle pool -----
const PARTICLE_POOL_SIZE = 96;
const PARTICLES_PER_BREAK = 14;
const PARTICLE_LIFE_MS_MIN = 480;
const PARTICLE_LIFE_MS_MAX = 880;
const PARTICLE_GRAVITY = -22;

const particleGroup = new THREE.Group();
scene.add(particleGroup);
const particleGeometry = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const particles = [];
for (let i = 0; i < PARTICLE_POOL_SIZE; i += 1) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(particleGeometry, material);
  mesh.visible = false;
  particleGroup.add(mesh);
  particles.push({
    mesh,
    material,
    vx: 0,
    vy: 0,
    vz: 0,
    lifeMs: 0,
    maxLifeMs: 0,
    active: false,
  });
}

function spawnBlockBreakParticles(blockX, blockY, blockZ, blockType) {
  const blockDef = BLOCK_BY_ID.get(blockType);
  const baseColor = blockDef?.color ?? 0xffffff;
  let spawned = 0;
  for (let i = 0; i < particles.length && spawned < PARTICLES_PER_BREAK; i += 1) {
    const p = particles[i];
    if (p.active) {
      continue;
    }
    p.active = true;
    p.maxLifeMs = PARTICLE_LIFE_MS_MIN + Math.random() * (PARTICLE_LIFE_MS_MAX - PARTICLE_LIFE_MS_MIN);
    p.lifeMs = p.maxLifeMs;
    p.mesh.position.set(
      blockX + 0.2 + Math.random() * 0.6,
      blockY + 0.2 + Math.random() * 0.6,
      blockZ + 0.2 + Math.random() * 0.6,
    );
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 2.6;
    p.vx = Math.cos(angle) * speed;
    p.vz = Math.sin(angle) * speed;
    p.vy = 3.0 + Math.random() * 3.0;
    // Slight per-particle color jitter so all 14 particles aren't identical.
    const jitter = (Math.random() - 0.5) * 0.18;
    p.material.color.set(baseColor);
    p.material.color.r = THREE.MathUtils.clamp(p.material.color.r + jitter, 0, 1);
    p.material.color.g = THREE.MathUtils.clamp(p.material.color.g + jitter, 0, 1);
    p.material.color.b = THREE.MathUtils.clamp(p.material.color.b + jitter, 0, 1);
    p.material.opacity = 1;
    p.mesh.visible = true;
    spawned += 1;
  }
}

function updateParticles(deltaMs) {
  if (deltaMs <= 0) {
    return;
  }
  const dtSec = deltaMs / 1000;
  for (const p of particles) {
    if (!p.active) continue;
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }
    p.vy += PARTICLE_GRAVITY * dtSec;
    p.mesh.position.x += p.vx * dtSec;
    p.mesh.position.y += p.vy * dtSec;
    p.mesh.position.z += p.vz * dtSec;
    // Apply mild drag so particles settle.
    p.vx *= 0.92;
    p.vz *= 0.92;
    // Fade out in the last 30% of life.
    const fadeStart = p.maxLifeMs * 0.3;
    p.material.opacity = p.lifeMs < fadeStart ? Math.max(0, p.lifeMs / fadeStart) : 1;
  }
}

// ----- Procedural sound effects via Web Audio -----
let audioContext = null;
let audioMaster = null;
function ensureAudio() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  audioMaster = audioContext.createGain();
  audioMaster.gain.value = 0.35;
  audioMaster.connect(audioContext.destination);
  return audioContext;
}

function playNoiseBurst({ durationMs, lowpass = 1200, gain = 0.6, gainStart = 0.6 }) {
  const ctx = ensureAudio();
  if (!ctx || ctx.state === "suspended") {
    if (ctx?.resume) ctx.resume().catch(() => {});
    if (!ctx || ctx.state !== "running") return;
  }
  const samples = Math.floor(ctx.sampleRate * (durationMs / 1000));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.85;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(gainStart, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  source.connect(filter).connect(env).connect(audioMaster);
  source.start(t);
  source.stop(t + durationMs / 1000 + 0.01);
}

function playTone({ frequency, durationMs, type = "sine", gain = 0.3 }) {
  const ctx = ensureAudio();
  if (!ctx || ctx.state === "suspended") {
    if (ctx?.resume) ctx.resume().catch(() => {});
    if (!ctx || ctx.state !== "running") return;
  }
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  osc.connect(env).connect(audioMaster);
  osc.start(t);
  osc.stop(t + durationMs / 1000 + 0.01);
}

function playBreakSound(blockType) {
  // Stone-ish blocks ping higher; wood/leaf softer. Lowpass approximates the muffled
  // impact you hear in Minecraft.
  const stoneLike = blockType === 3 || blockType === 7 || blockType === 9 || blockType === 6;
  playNoiseBurst({
    durationMs: 160,
    lowpass: stoneLike ? 1400 : 900,
    gainStart: stoneLike ? 0.7 : 0.55,
  });
}

function playPlaceSound(blockType) {
  const stoneLike = blockType === 3 || blockType === 7 || blockType === 9;
  playTone({
    frequency: stoneLike ? 180 : 240,
    durationMs: 90,
    type: "triangle",
    gain: 0.32,
  });
  playNoiseBurst({ durationMs: 70, lowpass: 700, gainStart: 0.25 });
}

function playStepSound() {
  playNoiseBurst({ durationMs: 60, lowpass: 600, gainStart: 0.18 });
}

function playJumpSound() {
  playTone({ frequency: 380, durationMs: 70, type: "sine", gain: 0.18 });
}

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();

const objectiveMarkerGroup = new THREE.Group();
const objectiveMarkerBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.08, 5.6, 12, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x5edbff,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    depthTest: false,
  }),
);
objectiveMarkerBeam.position.y = 2.8;
const objectiveMarkerCap = new THREE.Mesh(
  new THREE.SphereGeometry(0.24, 12, 12),
  new THREE.MeshBasicMaterial({
    color: 0x9eeaff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    depthTest: false,
  }),
);
objectiveMarkerCap.position.y = 5.6;
objectiveMarkerGroup.visible = false;
objectiveMarkerGroup.add(objectiveMarkerBeam, objectiveMarkerCap);
scene.add(objectiveMarkerGroup);

function createDefaultObjectiveStats() {
  return {
    copperOreCollected: false,
    copperIngotSmelted: false,
    copperBladeCrafted: false,
    caveTorchPlaced: false,
    copperBladeKills: 0,
  };
}

function createDefaultBranchLoopState() {
  return {
    completions: 0,
    combatHuntKills: 0,
    explorerSurveyTorches: 0,
    explorerSurveyDeepCopper: 0,
    lastReward: "",
    encounter: {
      type: null,
      stage: "travel",
      site: null,
    },
  };
}

function createDefaultSpecializationState() {
  return {
    selected: null,
    completed: false,
    combatKills: 0,
    caveTorchesPlaced: 0,
    deepCopperMined: 0,
    rewards: {
      mobDamageBonus: 0,
      moveSpeedBonus: 0,
      maxHealthBonus: 0,
      torchScanRadiusBonus: 0,
    },
    branchLoop: createDefaultBranchLoopState(),
  };
}

const state = {
  mode: "menu",
  keys: new Set(),
  playerPos: new THREE.Vector3(),
  playerVel: new THREE.Vector3(),
  yaw: Math.PI,
  pitch: -0.2,
  onGround: false,
  jumpQueued: false,
  inventory: createStartingInventory(),
  selectedSlot: 0,
  craftingOpen: false,
  furnaceOpen: false,
  activeFurnaceKey: null,
  inventoryOpen: false,
  inventoryTransferIndex: null,
  breakProgress: {
    targetKey: null,
    amount: 0,
  },
  pointerLocked: false,
  targetBlock: null,
  recentAction: "Spawned",
  maxHealth: playerConfig.maxHealth,
  health: playerConfig.maxHealth,
  timeOfDayMs: Number.isFinite(simConfig.initialTimeOfDayMs) ? simConfig.initialTimeOfDayMs : 0,
  dayFactor: 1,
  hostileMobCount: 0,
  objectiveIndex: 0,
  objectiveStats: createDefaultObjectiveStats(),
  objectiveWaypoint: null,
  specialization: createDefaultSpecializationState(),
  // Camera-feel state: bob phase advances with horizontal walk speed; FOV lerps between
  // base and sprint values so sprinting "pulls" the world in slightly.
  bobPhase: 0,
  bobAmplitude: 0,
  cameraFov: renderConfig.fov,
  targetFov: renderConfig.fov,
  isSprinting: false,
  // Wave 5: water submersion state
  inWater: false,       // true when player body (torso/feet) is in water
  eyeInWater: false,    // true when the camera eye voxel is water
};

// Automation runs should advance only through window.advanceTime().
const isAutomationSession = typeof window.__drainVirtualTimePending === "function";
let useExternalTimeStep = isAutomationSession;
const SAVE_SLOT = "primary";
let saveInFlight = false;
let saveStatusTimer = null;
let lastAutosaveAt = 0;
let craftPanelSignature = "";
let craftPanelNeedsRefresh = true;
let furnacePanelSignature = "";
let furnacePanelNeedsRefresh = true;
let inventoryPanelSignature = "";
let inventoryPanelNeedsRefresh = true;
let mobSpawnAccumulatorMs = 0;
let hostileMobIdCounter = 1;
const hostileMobs = [];
let objectiveHudSignature = "";
let objectiveWaypointNeedsRefresh = true;
let objectiveWaypointScanAccumulatorMs = OBJECTIVE_WAYPOINT_RESCAN_MS;
let objectiveMarkerAnimMs = 0;

function blockName(type) {
  return BLOCK_BY_ID.get(type)?.name || `Block ${type}`;
}

function refreshHud() {
  updateHud({ state, world, statsEl, hotbarEl });
}

function toFurnaceKey(x, y, z) {
  return `${x},${y},${z}`;
}

function fromFurnaceKey(key) {
  const [x, y, z] = key.split(",").map((value) => Number(value));
  return { x, y, z };
}

function createDefaultFurnaceState() {
  return {
    inputItemId: null,
    inputCount: 0,
    fuelRemainingMs: 0,
    fuelBufferMs: 0,
    progressMs: 0,
    outputItemId: null,
    outputCount: 0,
  };
}

function getFurnaceState(key, createIfMissing = true) {
  let furnace = furnaceStates.get(key);
  if (!furnace && createIfMissing) {
    furnace = createDefaultFurnaceState();
    furnaceStates.set(key, furnace);
  }
  return furnace || null;
}

function normalizeTimeOfDayMs(rawMs) {
  const cycleMs = simConfig.dayNightCycleMs;
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) {
    return 0;
  }
  if (!Number.isFinite(rawMs)) {
    return 0;
  }
  const wrapped = rawMs % cycleMs;
  return wrapped < 0 ? wrapped + cycleMs : wrapped;
}

function getDayFactorFromTime(timeOfDayMs) {
  const cycleMs = simConfig.dayNightCycleMs;
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) {
    return 1;
  }
  const phase = (normalizeTimeOfDayMs(timeOfDayMs) / cycleMs) * Math.PI * 2;
  return (Math.sin(phase - Math.PI / 2) + 1) / 2;
}

function updateDayNight(deltaMs) {
  const cycleMs = simConfig.dayNightCycleMs;
  if (Number.isFinite(cycleMs) && cycleMs > 0 && Number.isFinite(deltaMs) && deltaMs > 0) {
    state.timeOfDayMs = normalizeTimeOfDayMs(state.timeOfDayMs + deltaMs);
  } else {
    state.timeOfDayMs = normalizeTimeOfDayMs(state.timeOfDayMs);
  }

  const dayFactor = getDayFactorFromTime(state.timeOfDayMs);
  state.dayFactor = dayFactor;
  // Drive the baked-lighting shader uniform — no remesh, just one float update per tick.
  dayFactorUniform.value = dayFactor;

  scene.background.copy(nightSkyColor).lerp(daySkyColor, dayFactor);
  scene.fog.color.copy(scene.background);

  hemiLight.color.copy(nightHemiSkyColor).lerp(dayHemiSkyColor, dayFactor);
  hemiLight.groundColor.copy(nightGroundColor).lerp(dayGroundColor, dayFactor);
  hemiLight.intensity = lightingConfig.hemisphere.intensity * (0.36 + dayFactor * 0.64);

  sun.color.copy(nightSunColor).lerp(daySunColor, dayFactor);
  sun.intensity = lightingConfig.sun.intensity * (0.15 + dayFactor * 0.85);

  if (Number.isFinite(cycleMs) && cycleMs > 0) {
    const orbit = (state.timeOfDayMs / cycleMs) * Math.PI * 2;
    const horizontalRadius = 44;
    const verticalRadius = 42;
    const baseHeight = 10;
    // Directional light: keep its y above the horizon clamp so the world never goes
    // pitch black on full night (dayFactor handles real darkness via intensity).
    sun.position.set(
      Math.sin(orbit) * horizontalRadius,
      Math.max(4, baseHeight + Math.cos(orbit) * verticalRadius),
      Math.cos(orbit) * 30,
    );

    // Sky bodies: use the unclamped orbital position so the sun actually sets and
    // the moon actually rises on the opposite side.
    const skyDirX = Math.sin(orbit) * horizontalRadius;
    const skyDirY = baseHeight + Math.cos(orbit) * verticalRadius;
    const skyDirZ = Math.cos(orbit) * 30;
    const skyDirLen = Math.hypot(skyDirX, skyDirY, skyDirZ) || 1;
    const skyNX = skyDirX / skyDirLen;
    const skyNY = skyDirY / skyDirLen;
    const skyNZ = skyDirZ / skyDirLen;
    const cameraOrigin = camera.position;
    sunSprite.position.set(
      cameraOrigin.x + skyNX * SKY_BODY_DISTANCE,
      cameraOrigin.y + skyNY * SKY_BODY_DISTANCE,
      cameraOrigin.z + skyNZ * SKY_BODY_DISTANCE,
    );
    moonSprite.position.set(
      cameraOrigin.x - skyNX * SKY_BODY_DISTANCE,
      cameraOrigin.y - skyNY * SKY_BODY_DISTANCE,
      cameraOrigin.z - skyNZ * SKY_BODY_DISTANCE,
    );
    // Soft fade across the horizon so neither disc pops in/out abruptly.
    const sunAboveHorizon = THREE.MathUtils.clamp(skyNY * 6 + 0.6, 0, 1);
    sunSprite.material.opacity = sunAboveHorizon;
    sunSprite.visible = sunAboveHorizon > 0.02;
    const moonAboveHorizon = THREE.MathUtils.clamp(-skyNY * 6 + 0.6, 0, 1);
    moonSprite.material.opacity = moonAboveHorizon;
    moonSprite.visible = moonAboveHorizon > 0.02;
  }
}

function getWorldNormal(hit) {
  if (!hit.face || !hit.face.normal) {
    return null;
  }
  const worldNormal = hit.face.normal.clone();
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  worldNormal.applyMatrix3(normalMatrix).normalize();
  return worldNormal;
}

function toBlockCoords(point, normal, sign) {
  const adjusted = point.clone().addScaledVector(normal, sign * 0.01);
  return {
    x: Math.floor(adjusted.x),
    y: Math.floor(adjusted.y),
    z: Math.floor(adjusted.z),
  };
}

function playerInsideBlock(x, y, z) {
  const aabb = playerAABBAt(state.playerPos, playerConfig.radius, playerConfig.height);
  return aabbIntersectsBlock(aabb, x, y, z);
}

function toNdc(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

function setSaveStatus(message, ttlMs = 2200) {
  saveStatusEl.textContent = message;
  if (saveStatusTimer) {
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = null;
  }
  if (ttlMs > 0) {
    saveStatusTimer = window.setTimeout(() => {
      saveStatusEl.textContent = "";
      saveStatusTimer = null;
    }, ttlMs);
  }
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483647) + 1;
}

function getSelectedInventorySlot() {
  return getSelectedSlot(state.inventory, state.selectedSlot);
}

function getSelectedItemId() {
  return getSelectedInventorySlot()?.itemId || null;
}

function getSelectedItemName() {
  const itemId = getSelectedItemId();
  return itemId ? getItemName(itemId) : "Empty";
}

function getSelectedMobDamage() {
  const mobDamageBonus = getCombinedBonuses().mobDamageBonus;
  return getMobDamage(getSelectedItemId(), playerBaseMobDamage) + mobDamageBonus;
}

function getBestMobDamageInInventory() {
  const mobDamageBonus = getCombinedBonuses().mobDamageBonus;
  let best = playerBaseMobDamage + mobDamageBonus;
  for (const slot of state.inventory) {
    if (!slot) {
      continue;
    }
    best = Math.max(best, getMobDamage(slot.itemId, playerBaseMobDamage) + mobDamageBonus);
  }
  return best;
}

const SPRINT_MULTIPLIER = 1.32;
const SPRINT_FOV_BUMP = 10;
const FOV_LERP_RATE = 8; // higher = snappier
const BOB_BASE_FREQUENCY = 9.5;
const BOB_VERTICAL_AMPLITUDE = 0.06;
const BOB_LATERAL_AMPLITUDE = 0.045;

function getCurrentMoveSpeed() {
  const base = playerConfig.moveSpeed + getCombinedBonuses().moveSpeedBonus;
  return state.isSprinting ? base * SPRINT_MULTIPLIER : base;
}

function countInventoryItem(itemId) {
  return countInventoryItems(state.inventory, itemId);
}

const cachedSpecialItemBonuses = { mobDamageBonus: 0, moveSpeedBonus: 0, maxHealthBonus: 0, torchScanRadiusBonus: 0 };
const cachedCombinedBonuses = { mobDamageBonus: 0, moveSpeedBonus: 0, maxHealthBonus: 0, torchScanRadiusBonus: 0 };
let bonusesDirty = true;

function invalidateBonusCache() {
  bonusesDirty = true;
}

function refreshBonusCache() {
  if (!bonusesDirty) {
    return;
  }
  const hasWardenTotem = countInventoryItem(SPECIAL_ITEM_WARDEN_TOTEM) > 0;
  const hasSpelunkerCompass = countInventoryItem(SPECIAL_ITEM_SPELUNKER_COMPASS) > 0;
  cachedSpecialItemBonuses.mobDamageBonus = 0;
  cachedSpecialItemBonuses.moveSpeedBonus = hasSpelunkerCompass ? SPECIAL_ITEM_SPELUNKER_COMPASS_MOVE_SPEED_BONUS : 0;
  cachedSpecialItemBonuses.maxHealthBonus = hasWardenTotem ? SPECIAL_ITEM_WARDEN_TOTEM_MAX_HEALTH_BONUS : 0;
  cachedSpecialItemBonuses.torchScanRadiusBonus = hasSpelunkerCompass ? SPECIAL_ITEM_SPELUNKER_COMPASS_TORCH_SCAN_BONUS : 0;

  const spec = getSpecializationBonuses();
  cachedCombinedBonuses.mobDamageBonus = spec.mobDamageBonus + cachedSpecialItemBonuses.mobDamageBonus;
  cachedCombinedBonuses.moveSpeedBonus = spec.moveSpeedBonus + cachedSpecialItemBonuses.moveSpeedBonus;
  cachedCombinedBonuses.maxHealthBonus = spec.maxHealthBonus + cachedSpecialItemBonuses.maxHealthBonus;
  cachedCombinedBonuses.torchScanRadiusBonus = spec.torchScanRadiusBonus + cachedSpecialItemBonuses.torchScanRadiusBonus;
  bonusesDirty = false;
}

function getSpecialItemBonuses() {
  refreshBonusCache();
  return cachedSpecialItemBonuses;
}

function getCombinedBonuses() {
  refreshBonusCache();
  return cachedCombinedBonuses;
}

function scanExplorationStructures(radius = 18) {
  const scanRadius = Number.isFinite(radius) ? Math.max(4, Math.floor(radius)) : 18;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  let surfaceOre = 0;
  let deepOre = 0;
  let caveAir = 0;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      const topY = world.findSurfaceY(x, z);
      const minY = Math.max(2, topY - 12);
      for (let y = minY; y <= topY - 1; y += 1) {
        const blockType = world.get(x, y, z);
        if (blockType === COPPER_ORE_BLOCK_TYPE) {
          if (topY - y <= 3) {
            surfaceOre += 1;
          } else {
            deepOre += 1;
          }
          continue;
        }
        if (blockType === 0 && topY - y >= 3) {
          caveAir += 1;
        }
      }
    }
  }

  return {
    radius: scanRadius,
    scannedColumns: (scanRadius * 2 + 1) * (scanRadius * 2 + 1),
    surfaceOre,
    deepOre,
    caveAir,
  };
}

function findNearestCopperOre(radius = 26) {
  const scanRadius = Number.isFinite(radius) ? Math.max(4, Math.floor(radius)) : 26;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  let best = null;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      const topY = world.findSurfaceY(x, z);
      const minY = Math.max(2, topY - 14);
      for (let y = minY; y <= topY - 1; y += 1) {
        if (world.get(x, y, z) !== COPPER_ORE_BLOCK_TYPE) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + 0.5 - state.playerPos.y;
        const dz = z + 0.5 - state.playerPos.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (!best || distanceSq < best.distanceSq) {
          best = { x, y, z, distanceSq };
        }
      }
    }
  }
  return best;
}

function findNearestDeepCopperOre(radius = 26) {
  const scanRadius = Number.isFinite(radius) ? Math.max(4, Math.floor(radius)) : 26;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  let best = null;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      const topY = world.findSurfaceY(x, z);
      const minY = Math.max(2, topY - 14);
      for (let y = minY; y <= topY - 1; y += 1) {
        if (world.get(x, y, z) !== COPPER_ORE_BLOCK_TYPE || !isTorchPlacementInCave(x, y, z)) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + 0.5 - state.playerPos.y;
        const dz = z + 0.5 - state.playerPos.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (!best || distanceSq < best.distanceSq) {
          best = { x, y, z, distanceSq };
        }
      }
    }
  }

  return best;
}

function findNearestCavePocket(radius = 24) {
  const scanRadius = Number.isFinite(radius) ? Math.max(4, Math.floor(radius)) : 24;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  let best = null;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      const topY = world.findSurfaceY(x, z);
      const minY = Math.max(2, topY - 14);
      for (let y = minY; y <= topY - 3; y += 1) {
        if (world.get(x, y, z) !== 0) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + 0.5 - state.playerPos.y;
        const dz = z + 0.5 - state.playerPos.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (!best || distanceSq < best.distanceSq) {
          best = { x, y, z, distanceSq, roofY: topY };
        }
      }
    }
  }
  return best;
}

function findNearestBlockTypeInYRange(blockType, radius, minY, maxY) {
  const scanRadius = Number.isFinite(radius) ? Math.max(2, Math.floor(radius)) : 24;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  const scanMinY = Math.max(1, Math.min(world.height - 1, Math.floor(minY)));
  const scanMaxY = Math.max(scanMinY, Math.min(world.height - 1, Math.floor(maxY)));
  let best = null;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      for (let y = scanMinY; y <= scanMaxY; y += 1) {
        if (world.get(x, y, z) !== blockType) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + 0.5 - state.playerPos.y;
        const dz = z + 0.5 - state.playerPos.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (!best || distanceSq < best.distanceSq) {
          best = { x, y, z, distanceSq };
        }
      }
    }
  }

  return best;
}

function findNearestBlockType(blockType, radius = 26) {
  const py = Math.floor(state.playerPos.y);
  const local = findNearestBlockTypeInYRange(blockType, radius, py - 6, py + 6);
  if (local) {
    return local;
  }
  return findNearestBlockTypeInYRange(blockType, radius, 1, world.height - 1);
}

function findNearestHostileMob() {
  let best = null;
  for (const mob of hostileMobs) {
    const dx = mob.pos.x - state.playerPos.x;
    const dy = mob.pos.y - state.playerPos.y;
    const dz = mob.pos.z - state.playerPos.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (!best || distanceSq < best.distanceSq) {
      best = {
        id: mob.id,
        x: mob.pos.x,
        y: mob.pos.y,
        z: mob.pos.z,
        distanceSq,
      };
    }
  }
  return best;
}

function toObjectiveWaypointFromBlock(target, label, yOffset = 0.82) {
  if (!target) {
    return null;
  }
  return {
    x: target.x + 0.5,
    y: target.y + yOffset,
    z: target.z + 0.5,
    label,
  };
}

function toObjectiveWaypointFromMob(target) {
  if (!target) {
    return null;
  }
  return {
    x: target.x,
    y: target.y + 1.4,
    z: target.z,
    label: "Hostile mob",
  };
}

function isTorchPlacementInCave(x, y, z) {
  const surfaceY = world.findSurfaceY(x, z);
  return surfaceY - y >= OBJECTIVE_CAVE_MIN_ROOF_DEPTH;
}

function normalizeObjectiveStats(rawStats) {
  const stats = rawStats && typeof rawStats === "object" ? rawStats : {};
  return {
    copperOreCollected: Boolean(stats.copperOreCollected),
    copperIngotSmelted: Boolean(stats.copperIngotSmelted),
    copperBladeCrafted: Boolean(stats.copperBladeCrafted),
    caveTorchPlaced: Boolean(stats.caveTorchPlaced),
    copperBladeKills: Number.isFinite(stats.copperBladeKills) ? Math.max(0, Math.floor(stats.copperBladeKills)) : 0,
  };
}

function normalizeBranchLoopState(rawState) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const encounter = source.encounter && typeof source.encounter === "object" ? source.encounter : {};
  const rawSite = encounter.site && typeof encounter.site === "object" ? encounter.site : null;
  const site =
    rawSite && Number.isFinite(rawSite.x) && Number.isFinite(rawSite.y) && Number.isFinite(rawSite.z)
      ? {
          x: rawSite.x,
          y: rawSite.y,
          z: rawSite.z,
          label: typeof rawSite.label === "string" ? rawSite.label : "Branch target",
        }
      : null;
  return {
    completions: Number.isFinite(source.completions) ? Math.max(0, Math.floor(source.completions)) : 0,
    combatHuntKills: Number.isFinite(source.combatHuntKills) ? Math.max(0, Math.floor(source.combatHuntKills)) : 0,
    explorerSurveyTorches: Number.isFinite(source.explorerSurveyTorches)
      ? Math.max(0, Math.floor(source.explorerSurveyTorches))
      : 0,
    explorerSurveyDeepCopper: Number.isFinite(source.explorerSurveyDeepCopper)
      ? Math.max(0, Math.floor(source.explorerSurveyDeepCopper))
      : 0,
    lastReward: typeof source.lastReward === "string" ? source.lastReward : "",
    encounter: {
      type: encounter.type === "combat" || encounter.type === "explorer" ? encounter.type : null,
      stage: encounter.stage === "active" ? "active" : "travel",
      site,
    },
  };
}

function normalizeSpecializationState(rawState) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const rewards = source.rewards && typeof source.rewards === "object" ? source.rewards : {};
  const selected = source.selected === "combat" || source.selected === "explorer" ? source.selected : null;
  return {
    selected,
    completed: Boolean(source.completed),
    combatKills: Number.isFinite(source.combatKills) ? Math.max(0, Math.floor(source.combatKills)) : 0,
    caveTorchesPlaced: Number.isFinite(source.caveTorchesPlaced) ? Math.max(0, Math.floor(source.caveTorchesPlaced)) : 0,
    deepCopperMined: Number.isFinite(source.deepCopperMined) ? Math.max(0, Math.floor(source.deepCopperMined)) : 0,
    rewards: {
      mobDamageBonus: Number.isFinite(rewards.mobDamageBonus) ? Math.max(0, Math.floor(rewards.mobDamageBonus)) : 0,
      moveSpeedBonus: Number.isFinite(rewards.moveSpeedBonus) ? Math.max(0, rewards.moveSpeedBonus) : 0,
      maxHealthBonus: Number.isFinite(rewards.maxHealthBonus) ? Math.max(0, Math.floor(rewards.maxHealthBonus)) : 0,
      torchScanRadiusBonus: Number.isFinite(rewards.torchScanRadiusBonus)
        ? Math.max(0, Math.floor(rewards.torchScanRadiusBonus))
        : 0,
    },
    branchLoop: normalizeBranchLoopState(source.branchLoop),
  };
}

const OBJECTIVES = [
  {
    id: "collect_copper_ore",
    title: "Collect Copper Ore",
    detail: () => "Mine at least one copper ore block from cave walls.",
    progress: () => ({ current: state.objectiveStats.copperOreCollected ? 1 : 0, required: 1 }),
    isComplete: () => state.objectiveStats.copperOreCollected,
    waypoint: () => toObjectiveWaypointFromBlock(findNearestCopperOre(28), "Copper ore", 1.04),
  },
  {
    id: "smelt_copper_ingot",
    title: "Smelt Copper Ingot",
    detail: () => "Use a furnace to smelt copper ore into an ingot.",
    progress: () => ({ current: state.objectiveStats.copperIngotSmelted ? 1 : 0, required: 1 }),
    isComplete: () => state.objectiveStats.copperIngotSmelted,
    waypoint: () => toObjectiveWaypointFromBlock(findNearestBlockType(FURNACE_BLOCK_TYPE, 28), "Furnace", 1.08),
  },
  {
    id: "craft_copper_blade",
    title: "Craft Copper Blade",
    detail: () => "Craft a Copper Blade for stronger combat damage.",
    progress: () => ({ current: state.objectiveStats.copperBladeCrafted ? 1 : 0, required: 1 }),
    isComplete: () => state.objectiveStats.copperBladeCrafted,
    waypoint: () =>
      toObjectiveWaypointFromBlock(findNearestBlockType(CRAFTING_TABLE_BLOCK_TYPE, 28), "Crafting table", 1.08),
  },
  {
    id: "place_cave_torch",
    title: "Place Torch In Cave",
    detail: () => "Place a torch underground to light a cave route.",
    progress: () => ({ current: state.objectiveStats.caveTorchPlaced ? 1 : 0, required: 1 }),
    isComplete: () => state.objectiveStats.caveTorchPlaced,
    waypoint: () => toObjectiveWaypointFromBlock(findNearestCavePocket(28), "Cave pocket", 0.74),
  },
  {
    id: "defeat_hostile_with_copper_blade",
    title: "Defeat Hostile With Copper Blade",
    detail: () => "Defeat one hostile mob while using the Copper Blade.",
    progress: () => ({ current: Math.min(1, state.objectiveStats.copperBladeKills), required: 1 }),
    isComplete: () => state.objectiveStats.copperBladeKills >= 1,
    waypoint: () => toObjectiveWaypointFromMob(findNearestHostileMob()),
  },
];

function getCurrentObjective() {
  return state.objectiveIndex >= 0 && state.objectiveIndex < OBJECTIVES.length ? OBJECTIVES[state.objectiveIndex] : null;
}

function getSpecializationRewardsFor(path) {
  if (path === "combat") {
    return {
      mobDamageBonus: 2,
      moveSpeedBonus: 0,
      maxHealthBonus: 4,
      torchScanRadiusBonus: 0,
    };
  }
  if (path === "explorer") {
    return {
      mobDamageBonus: 0,
      moveSpeedBonus: 1.1,
      maxHealthBonus: 0,
      torchScanRadiusBonus: 4,
    };
  }
  return {
    mobDamageBonus: 0,
    moveSpeedBonus: 0,
    maxHealthBonus: 0,
    torchScanRadiusBonus: 0,
  };
}

function getSpecializationBonuses() {
  return state.specialization?.rewards || getSpecializationRewardsFor(null);
}

function getBranchLoopState() {
  if (!state.specialization.branchLoop) {
    state.specialization.branchLoop = createDefaultBranchLoopState();
  }
  return state.specialization.branchLoop;
}

function getBranchEncounterState() {
  const branchLoop = getBranchLoopState();
  if (!branchLoop.encounter || typeof branchLoop.encounter !== "object") {
    branchLoop.encounter = createDefaultBranchLoopState().encounter;
  }
  return branchLoop.encounter;
}

function resetBranchEncounter() {
  const encounter = getBranchEncounterState();
  encounter.type = null;
  encounter.stage = "travel";
  encounter.site = null;
}

function isWithinEncounterRadius(site, radius = 6) {
  if (!site) {
    return false;
  }
  const dx = site.x - state.playerPos.x;
  const dy = site.y - state.playerPos.y;
  const dz = site.z - state.playerPos.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function countSurfaceClearanceColumns(centerX, centerZ, radius = 2) {
  const sampleRadius = Number.isFinite(radius) ? Math.max(1, Math.floor(radius)) : 2;
  const topY = world.findSurfaceY(centerX, centerZ);
  let clear = 0;
  for (let z = centerZ - sampleRadius; z <= centerZ + sampleRadius; z += 1) {
    for (let x = centerX - sampleRadius; x <= centerX + sampleRadius; x += 1) {
      const surfaceY = world.findSurfaceY(x, z);
      if (Math.abs(surfaceY - topY) > 1) {
        continue;
      }
      if (world.get(x, surfaceY + 1, z) !== 0 || world.get(x, surfaceY + 2, z) !== 0) {
        continue;
      }
      clear += 1;
    }
  }
  return clear;
}

function findCombatAmbushSite(radius = 30) {
  const scanRadius = Number.isFinite(radius) ? Math.max(10, Math.floor(radius)) : 30;
  const centerX = Math.floor(state.playerPos.x);
  const centerZ = Math.floor(state.playerPos.z);
  let best = null;

  for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
      const dx = x + 0.5 - state.playerPos.x;
      const dz = z + 0.5 - state.playerPos.z;
      const planarDistanceSq = dx * dx + dz * dz;
      if (planarDistanceSq < 9 * 9 || planarDistanceSq > scanRadius * scanRadius) {
        continue;
      }

      const y = isMobSpawnColumnWalkable(x + 0.5, z + 0.5);
      if (!Number.isFinite(y)) {
        continue;
      }
      const clearance = countSurfaceClearanceColumns(x, z, 2);
      if (clearance < 12) {
        continue;
      }

      const score = planarDistanceSq - clearance * 3;
      if (!best || score < best.score) {
        best = {
          x: x + 0.5,
          y,
          z: z + 0.5,
          label: "Ambush pocket",
          score,
        };
      }
    }
  }

  return best;
}

function findExplorerSurveySite(radius = 36) {
  const ore = findNearestDeepCopperOre(radius);
  if (!ore) {
    return null;
  }

  let best = null;
  for (let y = Math.max(2, ore.y - 2); y <= Math.min(world.height - 2, ore.y + 2); y += 1) {
    for (let z = ore.z - 5; z <= ore.z + 5; z += 1) {
      for (let x = ore.x - 5; x <= ore.x + 5; x += 1) {
        if (world.get(x, y, z) !== 0 || !isTorchPlacementInCave(x, y, z)) {
          continue;
        }
        if (world.get(x, y + 1, z) !== 0) {
          continue;
        }
        const dxOre = x + 0.5 - (ore.x + 0.5);
        const dyOre = y + 0.5 - (ore.y + 0.5);
        const dzOre = z + 0.5 - (ore.z + 0.5);
        const distanceToOreSq = dxOre * dxOre + dyOre * dyOre + dzOre * dzOre;
        if (distanceToOreSq > 6 * 6) {
          continue;
        }
        const dxPlayer = x + 0.5 - state.playerPos.x;
        const dyPlayer = y + 0.5 - state.playerPos.y;
        const dzPlayer = z + 0.5 - state.playerPos.z;
        const distanceToPlayerSq = dxPlayer * dxPlayer + dyPlayer * dyPlayer + dzPlayer * dzPlayer;
        if (!best || distanceToPlayerSq < best.distanceToPlayerSq) {
          best = {
            x: x + 0.5,
            y: y + 0.5,
            z: z + 0.5,
            label: "Survey cache",
            distanceToPlayerSq,
          };
        }
      }
    }
  }

  return best;
}

function ensureBranchEncounterSite(forceNew = false) {
  if (!state.specialization.completed || !state.specialization.selected) {
    resetBranchEncounter();
    return null;
  }

  const encounter = getBranchEncounterState();
  const expectedType = state.specialization.selected;
  if (forceNew || encounter.type !== expectedType) {
    resetBranchEncounter();
    encounter.type = expectedType;
  }
  if (encounter.site) {
    return encounter.site;
  }

  encounter.site = expectedType === "combat" ? findCombatAmbushSite(30) : findExplorerSurveySite(40);
  if (!encounter.site) {
    return null;
  }
  encounter.stage = "travel";
  objectiveWaypointNeedsRefresh = true;
  return encounter.site;
}

function findNearestHostileMobToSite(site, radius = 16) {
  if (!site) {
    return null;
  }
  let best = null;
  const maxDistanceSq = radius * radius;
  for (const mob of hostileMobs) {
    const dx = mob.pos.x - site.x;
    const dy = mob.pos.y - site.y;
    const dz = mob.pos.z - site.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > maxDistanceSq) {
      continue;
    }
    if (!best || distanceSq < best.distanceSq) {
      best = {
        id: mob.id,
        x: mob.pos.x,
        y: mob.pos.y,
        z: mob.pos.z,
        distanceSq,
      };
    }
  }
  return best;
}

function hasCombatBranchLoopGear() {
  return countInventoryItem("vanguard_blade") > 0;
}

function hasExplorerBranchLoopGear() {
  return countInventoryItem(SPECIAL_ITEM_SPELUNKER_COMPASS) > 0 && countInventoryItem("deep_delver_pickaxe") > 0;
}

function grantRewardBundle(bundle) {
  const granted = [];
  let inventoryFull = false;
  for (const entry of bundle) {
    if (!entry || typeof entry.itemId !== "string" || !ITEM_DEFS[entry.itemId]) {
      continue;
    }
    const amount = Number.isFinite(entry.count) ? Math.max(1, Math.floor(entry.count)) : 1;
    const leftover = addItemToInventory(state.inventory, entry.itemId, amount);
    const gained = amount - leftover;
    if (gained > 0) {
      granted.push({ itemId: entry.itemId, count: gained });
    }
    if (leftover > 0) {
      inventoryFull = true;
    }
  }
  if (granted.length > 0) {
    markCraftPanelDirty();
    markFurnacePanelDirty();
    markInventoryPanelDirty();
  }
  const rewardText = granted.length > 0 ? granted.map((entry) => `+${entry.count} ${getItemName(entry.itemId)}`).join(", ") : "inventory full";
  return {
    granted,
    inventoryFull,
    rewardText,
  };
}

function registerCaveTorchProgress() {
  if (!state.specialization.selected) {
    selectSpecialization("explorer", "Specialization chosen: Explorer");
  }
  if (state.specialization.selected !== "explorer") {
    return false;
  }
  if (!state.specialization.completed) {
    state.specialization.caveTorchesPlaced += 1;
    objectiveWaypointNeedsRefresh = true;
    return true;
  }
  const encounter = getBranchEncounterState();
  if (!hasExplorerBranchLoopGear() || encounter.type !== "explorer" || encounter.stage !== "active" || !isWithinEncounterRadius(encounter.site, 10)) {
    return false;
  }
  getBranchLoopState().explorerSurveyTorches += 1;
  objectiveWaypointNeedsRefresh = true;
  return true;
}

function registerDeepCopperProgress() {
  if (!state.specialization.selected) {
    selectSpecialization("explorer", "Specialization chosen: Explorer");
  }
  if (state.specialization.selected !== "explorer") {
    return false;
  }
  if (!state.specialization.completed) {
    state.specialization.deepCopperMined += 1;
    objectiveWaypointNeedsRefresh = true;
    return true;
  }
  const encounter = getBranchEncounterState();
  if (!hasExplorerBranchLoopGear() || encounter.type !== "explorer" || encounter.stage !== "active" || !encounter.site) {
    return false;
  }
  const dx = encounter.site.x - state.playerPos.x;
  const dy = encounter.site.y - state.playerPos.y;
  const dz = encounter.site.z - state.playerPos.z;
  const withinRadius = dx * dx + dy * dy + dz * dz <= 12 * 12;
  if (!withinRadius) {
    return false;
  }
  getBranchLoopState().explorerSurveyDeepCopper += 1;
  objectiveWaypointNeedsRefresh = true;
  return true;
}

function formatSpecializationName(path) {
  if (path === "combat") {
    return "Combat";
  }
  if (path === "explorer") {
    return "Explorer";
  }
  return "Unknown";
}

function applyProgressionBonusesToPlayerStats() {
  const maxHealthBonus = getCombinedBonuses().maxHealthBonus;
  const nextMaxHealth = playerConfig.maxHealth + maxHealthBonus;
  if (!Number.isFinite(nextMaxHealth) || nextMaxHealth <= 1) {
    return;
  }
  if (nextMaxHealth !== state.maxHealth) {
    const delta = nextMaxHealth - state.maxHealth;
    state.maxHealth = nextMaxHealth;
    if (delta > 0) {
      state.health = Math.min(state.maxHealth, state.health + delta);
    } else {
      state.health = Math.min(state.maxHealth, state.health);
    }
  } else {
    state.health = Math.min(state.maxHealth, state.health);
  }
}

function refreshObjectiveStatsFromInventory() {
  let changed = false;
  if (!state.objectiveStats.copperOreCollected && countInventoryItem("copper_ore") > 0) {
    state.objectiveStats.copperOreCollected = true;
    changed = true;
  }
  if (!state.objectiveStats.copperIngotSmelted && countInventoryItem("copper_ingot") > 0) {
    state.objectiveStats.copperIngotSmelted = true;
    changed = true;
  }
  if (!state.objectiveStats.copperBladeCrafted && countInventoryItem("copper_blade") > 0) {
    state.objectiveStats.copperBladeCrafted = true;
    changed = true;
  }
  return changed;
}

function computeObjectiveIndex() {
  for (let i = 0; i < OBJECTIVES.length; i += 1) {
    if (!OBJECTIVES[i].isComplete()) {
      return i;
    }
  }
  return OBJECTIVES.length;
}

function isCoreObjectiveChainComplete() {
  return state.objectiveIndex >= OBJECTIVES.length;
}

function selectSpecialization(path, actionLabel = null) {
  if (path !== "combat" && path !== "explorer") {
    return false;
  }
  if (!isCoreObjectiveChainComplete()) {
    return false;
  }
  if (state.specialization.selected) {
    return state.specialization.selected === path;
  }
  state.specialization.selected = path;
  state.specialization.completed = false;
  state.specialization.rewards = getSpecializationRewardsFor(null);
  state.specialization.branchLoop = createDefaultBranchLoopState();
  invalidateBonusCache();
  objectiveWaypointNeedsRefresh = true;
  if (state.mode === "playing") {
    const specializationName = path === "combat" ? "Combat" : "Explorer";
    state.recentAction = actionLabel || `Specialization chosen: ${specializationName}`;
  }
  return true;
}

function updateSpecializationProgress() {
  if (!isCoreObjectiveChainComplete()) {
    return false;
  }
  if (!state.specialization.selected || state.specialization.completed) {
    return false;
  }

  let completed = false;
  if (state.specialization.selected === "combat") {
    completed = state.specialization.combatKills >= SPECIALIZATION_COMBAT_KILLS_REQUIRED;
  } else if (state.specialization.selected === "explorer") {
    completed =
      state.specialization.caveTorchesPlaced >= SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED &&
      state.specialization.deepCopperMined >= SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED;
  }
  if (!completed) {
    return false;
  }

  state.specialization.completed = true;
  state.specialization.rewards = getSpecializationRewardsFor(state.specialization.selected);
  invalidateBonusCache();
  objectiveWaypointNeedsRefresh = true;
  if (state.mode === "playing") {
    if (state.specialization.selected === "combat") {
      state.recentAction = "Combat specialization complete: +2 damage, +4 max health";
    } else {
      state.recentAction = "Explorer specialization complete: +speed, +torch range";
    }
  }
  return true;
}

function maybeCompleteBranchLoop() {
  if (!state.specialization.completed || !state.specialization.selected) {
    return false;
  }

  const branchLoop = getBranchLoopState();
  let completedAny = false;

  if (state.specialization.selected === "combat") {
    if (branchLoop.combatHuntKills >= BRANCH_LOOP_COMBAT_KILLS_REQUIRED) {
      branchLoop.combatHuntKills -= BRANCH_LOOP_COMBAT_KILLS_REQUIRED;
      branchLoop.completions += 1;
      const reward = grantRewardBundle(COMBAT_BRANCH_REWARD_BUNDLE);
      branchLoop.lastReward = reward.rewardText;
      state.recentAction = `Combat hunt reward: ${reward.rewardText}`;
      resetBranchEncounter();
      completedAny = true;
    }
  } else if (state.specialization.selected === "explorer") {
    if (
      branchLoop.explorerSurveyTorches >= BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED &&
      branchLoop.explorerSurveyDeepCopper >= BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED
    ) {
      branchLoop.explorerSurveyTorches -= BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED;
      branchLoop.explorerSurveyDeepCopper -= BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED;
      branchLoop.completions += 1;
      const reward = grantRewardBundle(EXPLORER_BRANCH_REWARD_BUNDLE);
      branchLoop.lastReward = reward.rewardText;
      state.recentAction = `Survey run reward: ${reward.rewardText}`;
      resetBranchEncounter();
      completedAny = true;
    }
  }

  if (completedAny) {
    objectiveWaypointNeedsRefresh = true;
  }
  return completedAny;
}

function getSpecializationSelectionObjective() {
  return {
    id: "choose_specialization",
    title: "Choose Specialization",
    detail: () => "Defeat a hostile mob to pick Combat, or place a cave torch to pick Explorer.",
    progress: () => ({ current: 0, required: 1 }),
    step: OBJECTIVES.length + 1,
    total: OBJECTIVE_TOTAL_STEPS,
    waypoint: () => {
      const hostile = findNearestHostileMob();
      const cave = findNearestCavePocket(28);
      if (hostile && (!cave || hostile.distanceSq <= cave.distanceSq)) {
        return toObjectiveWaypointFromMob(hostile);
      }
      if (cave) {
        return toObjectiveWaypointFromBlock(cave, "Cave pocket", 0.74);
      }
      return null;
    },
  };
}

function getActiveSpecializationObjective() {
  if (state.specialization.selected === "combat") {
    return {
      id: "specialization_combat_hunt",
      title: "Combat Trial",
      detail: () => `Defeat hostile mobs with weapons to claim a permanent combat boost.`,
      progress: () => ({
        current: Math.min(SPECIALIZATION_COMBAT_KILLS_REQUIRED, state.specialization.combatKills),
        required: SPECIALIZATION_COMBAT_KILLS_REQUIRED,
      }),
      step: OBJECTIVES.length + 1,
      total: OBJECTIVE_TOTAL_STEPS,
      waypoint: () => toObjectiveWaypointFromMob(findNearestHostileMob()),
    };
  }
  if (state.specialization.selected === "explorer") {
    return {
      id: "specialization_explorer_pathfinder",
      title: "Explorer Trial",
      detail: () =>
        `Place cave torches (${state.specialization.caveTorchesPlaced}/${SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED}) and mine deep copper (${state.specialization.deepCopperMined}/${SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED}).`,
      progress: () => ({
        current:
          Math.min(SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED, state.specialization.caveTorchesPlaced) +
          Math.min(SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED, state.specialization.deepCopperMined),
        required: SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED + SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED,
      }),
      step: OBJECTIVES.length + 1,
      total: OBJECTIVE_TOTAL_STEPS,
      waypoint: () => {
        if (state.specialization.deepCopperMined < SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED) {
          const ore = findNearestDeepCopperOre(28);
          if (ore) {
            return toObjectiveWaypointFromBlock(ore, "Deep copper", 1.04);
          }
        }
        const cave = findNearestCavePocket(28);
        if (cave) {
          return toObjectiveWaypointFromBlock(cave, "Cave route", 0.74);
        }
        return null;
      },
    };
  }
  return null;
}

function getActiveBranchLoopObjective() {
  if (!state.specialization.completed) {
    return null;
  }

  const step = OBJECTIVES.length + 2;
  const branchLoop = getBranchLoopState();
  if (state.specialization.selected === "combat") {
    if (!hasCombatBranchLoopGear()) {
      return {
        id: "combat_branch_forge_vanguard_blade",
        title: "Forge Vanguard Blade",
        detail: () => "Craft the Vanguard Blade to unlock repeatable combat hunts and bounty rewards.",
        progress: () => ({ current: countInventoryItem("vanguard_blade") > 0 ? 1 : 0, required: 1 }),
        step,
        total: OBJECTIVE_TOTAL_STEPS,
        waypoint: () =>
          toObjectiveWaypointFromBlock(findNearestBlockType(CRAFTING_TABLE_BLOCK_TYPE, 28), "Crafting table", 1.08),
      };
    }
    const site = ensureBranchEncounterSite(false);
    const encounter = getBranchEncounterState();
    if (site && encounter.stage !== "active") {
      return {
        id: "combat_branch_reach_ambush_pocket",
        title: "Reach Ambush Pocket",
        detail: () => "Travel to the marked ambush pocket to trigger a combat encounter.",
        progress: () => ({ current: isWithinEncounterRadius(site, 4.2) ? 1 : 0, required: 1 }),
        step,
        total: OBJECTIVE_TOTAL_STEPS,
        waypoint: () => ({ ...site }),
      };
    }
    return {
      id: "combat_branch_vanguard_hunt",
      title: "Vanguard Hunt",
      detail: () =>
        `Defeat hostile mobs with the Vanguard Blade (${branchLoop.combatHuntKills}/${BRANCH_LOOP_COMBAT_KILLS_REQUIRED}) to earn bounty caches.`,
      progress: () => ({
        current: Math.min(BRANCH_LOOP_COMBAT_KILLS_REQUIRED, branchLoop.combatHuntKills),
        required: BRANCH_LOOP_COMBAT_KILLS_REQUIRED,
      }),
      step,
      total: OBJECTIVE_TOTAL_STEPS,
      waypoint: () => {
        const targetMob = findNearestHostileMobToSite(site, 18);
        if (targetMob) {
          return toObjectiveWaypointFromMob(targetMob);
        }
        return site ? { ...site } : null;
      },
    };
  }

  if (state.specialization.selected === "explorer") {
    const surveyKitParts = (countInventoryItem(SPECIAL_ITEM_SPELUNKER_COMPASS) > 0 ? 1 : 0) + (countInventoryItem("deep_delver_pickaxe") > 0 ? 1 : 0);
    if (!hasExplorerBranchLoopGear()) {
      return {
        id: "explorer_branch_assemble_survey_kit",
        title: "Assemble Survey Kit",
        detail: () => "Craft the Deep Delver Pickaxe and Spelunker Compass to unlock repeatable survey runs.",
        progress: () => ({ current: surveyKitParts, required: 2 }),
        step,
        total: OBJECTIVE_TOTAL_STEPS,
        waypoint: () =>
          toObjectiveWaypointFromBlock(findNearestBlockType(CRAFTING_TABLE_BLOCK_TYPE, 28), "Crafting table", 1.08),
      };
    }
    const site = ensureBranchEncounterSite(false);
    const encounter = getBranchEncounterState();
    if (site && encounter.stage !== "active") {
      return {
        id: "explorer_branch_reach_survey_cache",
        title: "Reach Survey Cache",
        detail: () => "Travel to the marked survey cache to begin a deep-cave survey route.",
        progress: () => ({ current: isWithinEncounterRadius(site, 4.2) ? 1 : 0, required: 1 }),
        step,
        total: OBJECTIVE_TOTAL_STEPS,
        waypoint: () => ({ ...site }),
      };
    }
    return {
      id: "explorer_branch_survey_run",
      title: "Survey Run",
      detail: () =>
        `Place cave torches (${branchLoop.explorerSurveyTorches}/${BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED}) and mine deep copper (${branchLoop.explorerSurveyDeepCopper}/${BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED}) to earn survey supplies.`,
      progress: () => ({
        current:
          Math.min(BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED, branchLoop.explorerSurveyTorches) +
          Math.min(BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED, branchLoop.explorerSurveyDeepCopper),
        required: BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED + BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED,
      }),
      step,
      total: OBJECTIVE_TOTAL_STEPS,
      waypoint: () => {
        if (site && !isWithinEncounterRadius(site, 12)) {
          return { ...site };
        }
        if (branchLoop.explorerSurveyDeepCopper < BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED) {
          const ore = findNearestDeepCopperOre(28);
          if (ore) {
            return toObjectiveWaypointFromBlock(ore, "Deep copper", 1.04);
          }
        }
        if (site) {
          return { ...site };
        }
        return null;
      },
    };
  }

  return null;
}

let cachedDescriptor = null;
let cachedDescriptorTick = -1;
let descriptorTick = 0;

function invalidateDescriptorCache() {
  cachedDescriptor = null;
  cachedDescriptorTick = -1;
}

function getActiveObjectiveDescriptor() {
  if (cachedDescriptorTick === descriptorTick) {
    return cachedDescriptor;
  }
  const coreObjective = getCurrentObjective();
  let descriptor;
  if (coreObjective) {
    descriptor = {
      ...coreObjective,
      step: state.objectiveIndex + 1,
      total: OBJECTIVE_TOTAL_STEPS,
    };
  } else if (!state.specialization.selected) {
    descriptor = getSpecializationSelectionObjective();
  } else if (!state.specialization.completed) {
    descriptor = getActiveSpecializationObjective();
  } else {
    descriptor = getActiveBranchLoopObjective();
  }
  cachedDescriptor = descriptor;
  cachedDescriptorTick = descriptorTick;
  return descriptor;
}

function setObjectiveWaypoint(waypoint) {
  if (!waypoint) {
    state.objectiveWaypoint = null;
    objectiveMarkerGroup.visible = false;
    return;
  }
  const dx = waypoint.x - state.playerPos.x;
  const dy = waypoint.y - state.playerPos.y;
  const dz = waypoint.z - state.playerPos.z;
  state.objectiveWaypoint = {
    x: waypoint.x,
    y: waypoint.y,
    z: waypoint.z,
    label: waypoint.label || "Target",
    distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
  };
}

function updateObjectiveMarker(deltaMs = 0) {
  const waypoint = state.objectiveWaypoint;
  if (!waypoint || state.mode !== "playing") {
    objectiveMarkerGroup.visible = false;
    return;
  }

  objectiveMarkerAnimMs += Math.max(0, deltaMs);
  const bobOffset = Math.sin(objectiveMarkerAnimMs / 360) * 0.24;
  objectiveMarkerGroup.position.set(waypoint.x, waypoint.y + bobOffset, waypoint.z);
  objectiveMarkerGroup.visible = true;
}

function updateObjectiveHud(force = false) {
  if (!objectiveHudEl || !objectiveTitleEl || !objectiveDetailEl || !objectiveWaypointEl) {
    return;
  }

  const visible = state.mode === "playing";
  objectiveHudEl.classList.toggle("hidden", !visible);
  if (!visible) {
    objectiveHudSignature = "";
    return;
  }

  const objective = getActiveObjectiveDescriptor();
  const progress = objective ? objective.progress() : null;
  const progressText = progress
    ? `${progress.current}/${progress.required}`
    : `${OBJECTIVE_TOTAL_STEPS}/${OBJECTIVE_TOTAL_STEPS}`;
  const titleText = objective
    ? `Goal ${objective.step}/${objective.total}: ${objective.title}`
    : "All Goals Completed";
  const detailText = objective
    ? `${objective.detail()} (${progressText})`
    : "Core and specialization objectives complete.";
  const waypointText = state.objectiveWaypoint
    ? `Waypoint: ${state.objectiveWaypoint.label} (${state.objectiveWaypoint.distance.toFixed(1)}m)`
    : "Waypoint: no nearby target";
  const signature = `${titleText}|${detailText}|${waypointText}`;

  if (!force && signature === objectiveHudSignature) {
    return;
  }
  objectiveHudSignature = signature;
  objectiveTitleEl.textContent = titleText;
  objectiveDetailEl.textContent = detailText;
  objectiveWaypointEl.textContent = waypointText;
}

function updateObjectives(deltaMs = 0, forceWaypoint = false) {
  descriptorTick += 1;
  const statsChanged = refreshObjectiveStatsFromInventory();
  const previousObjectiveIndex = state.objectiveIndex;
  const nextObjectiveIndex = computeObjectiveIndex();
  const objectiveAdvanced = nextObjectiveIndex !== previousObjectiveIndex;

  if (objectiveAdvanced) {
    state.objectiveIndex = nextObjectiveIndex;
    objectiveWaypointNeedsRefresh = true;
    if (state.mode === "playing") {
      const previousObjective = OBJECTIVES[previousObjectiveIndex];
      if (previousObjective) {
        state.recentAction = `Objective complete: ${previousObjective.title}`;
      } else {
        state.recentAction = "All objectives complete";
      }
    }
  }

  if (statsChanged) {
    objectiveWaypointNeedsRefresh = true;
  }
  const specializationChanged = updateSpecializationProgress();
  applyProgressionBonusesToPlayerStats();
  if (specializationChanged) {
    objectiveWaypointNeedsRefresh = true;
  }
  const branchLoopChanged = maybeCompleteBranchLoop();

  if (state.objectiveWaypoint) {
    const dx = state.objectiveWaypoint.x - state.playerPos.x;
    const dy = state.objectiveWaypoint.y - state.playerPos.y;
    const dz = state.objectiveWaypoint.z - state.playerPos.z;
    state.objectiveWaypoint.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  if (Number.isFinite(deltaMs) && deltaMs > 0) {
    objectiveWaypointScanAccumulatorMs += deltaMs;
  }
  if (forceWaypoint || objectiveWaypointNeedsRefresh || objectiveWaypointScanAccumulatorMs >= OBJECTIVE_WAYPOINT_RESCAN_MS) {
    objectiveWaypointScanAccumulatorMs = 0;
    objectiveWaypointNeedsRefresh = false;
    const objective = getActiveObjectiveDescriptor();
    const waypoint = objective ? objective.waypoint() : null;
    setObjectiveWaypoint(waypoint);
  }

  updateObjectiveMarker(deltaMs);
  updateObjectiveHud(objectiveAdvanced || statsChanged || specializationChanged || branchLoopChanged || forceWaypoint);
}

function serializeObjectives() {
  return {
    index: state.objectiveIndex,
    stats: { ...state.objectiveStats },
    specialization: {
      selected: state.specialization.selected,
      completed: state.specialization.completed,
      combatKills: state.specialization.combatKills,
      caveTorchesPlaced: state.specialization.caveTorchesPlaced,
      deepCopperMined: state.specialization.deepCopperMined,
      rewards: { ...state.specialization.rewards },
      branchLoop: { ...getBranchLoopState() },
    },
  };
}

function loadObjectives(serializedObjectives) {
  const objectiveState = serializedObjectives && typeof serializedObjectives === "object" ? serializedObjectives : {};
  state.objectiveStats = normalizeObjectiveStats(objectiveState.stats);
  state.specialization = normalizeSpecializationState(objectiveState.specialization);
  if (!state.specialization.selected) {
    state.specialization.completed = false;
    state.specialization.rewards = getSpecializationRewardsFor(null);
    state.specialization.branchLoop = createDefaultBranchLoopState();
  }
  if (state.specialization.completed && state.specialization.selected) {
    state.specialization.rewards = getSpecializationRewardsFor(state.specialization.selected);
  }
  invalidateBonusCache();
  refreshObjectiveStatsFromInventory();
  state.objectiveIndex = computeObjectiveIndex();
  state.objectiveWaypoint = null;
  objectiveMarkerGroup.visible = false;
  objectiveWaypointNeedsRefresh = true;
  objectiveWaypointScanAccumulatorMs = OBJECTIVE_WAYPOINT_RESCAN_MS;
  applyProgressionBonusesToPlayerStats();
  updateObjectiveHud(true);
}

function resetObjectives() {
  state.objectiveIndex = 0;
  state.objectiveStats = createDefaultObjectiveStats();
  state.specialization = createDefaultSpecializationState();
  invalidateBonusCache();
  state.objectiveWaypoint = null;
  objectiveMarkerGroup.visible = false;
  objectiveWaypointNeedsRefresh = true;
  objectiveWaypointScanAccumulatorMs = OBJECTIVE_WAYPOINT_RESCAN_MS;
  objectiveMarkerAnimMs = 0;
  applyProgressionBonusesToPlayerStats();
  updateObjectiveHud(true);
}

function buildObjectivePayload() {
  const objective = getActiveObjectiveDescriptor();
  const progress = objective ? objective.progress() : null;
  const coreCompleted = state.objectiveIndex >= OBJECTIVES.length;
  const fullyCompleted = coreCompleted && state.specialization.completed && !objective;
  const branchLoop = getBranchLoopState();
  const encounter = getBranchEncounterState();
  return {
    total: OBJECTIVE_TOTAL_STEPS,
    coreObjectiveTotal: OBJECTIVES.length,
    index: state.objectiveIndex,
    completed: coreCompleted,
    fullyCompleted,
    current: objective
      ? {
          id: objective.id,
          title: objective.title,
          detail: objective.detail(),
          progressCurrent: progress?.current ?? null,
          progressRequired: progress?.required ?? null,
          step: objective.step,
          total: objective.total,
        }
      : null,
    stats: {
      copperOreCollected: state.objectiveStats.copperOreCollected,
      copperIngotSmelted: state.objectiveStats.copperIngotSmelted,
      copperBladeCrafted: state.objectiveStats.copperBladeCrafted,
      caveTorchPlaced: state.objectiveStats.caveTorchPlaced,
      copperBladeKills: state.objectiveStats.copperBladeKills,
    },
    specialization: {
      selected: state.specialization.selected,
      completed: state.specialization.completed,
      combatKills: state.specialization.combatKills,
      combatKillsRequired: SPECIALIZATION_COMBAT_KILLS_REQUIRED,
      caveTorchesPlaced: state.specialization.caveTorchesPlaced,
      caveTorchesRequired: SPECIALIZATION_EXPLORER_CAVE_TORCHES_REQUIRED,
      deepCopperMined: state.specialization.deepCopperMined,
      deepCopperRequired: SPECIALIZATION_EXPLORER_DEEP_COPPER_REQUIRED,
      rewards: { ...state.specialization.rewards },
      branchLoop: {
        completions: branchLoop.completions,
        combatHuntKills: branchLoop.combatHuntKills,
        combatHuntKillsRequired: BRANCH_LOOP_COMBAT_KILLS_REQUIRED,
        explorerSurveyTorches: branchLoop.explorerSurveyTorches,
        explorerSurveyTorchesRequired: BRANCH_LOOP_EXPLORER_TORCHES_REQUIRED,
        explorerSurveyDeepCopper: branchLoop.explorerSurveyDeepCopper,
        explorerSurveyDeepCopperRequired: BRANCH_LOOP_EXPLORER_DEEP_COPPER_REQUIRED,
        lastReward: branchLoop.lastReward,
        combatGearReady: hasCombatBranchLoopGear(),
        explorerGearReady: hasExplorerBranchLoopGear(),
        encounter: encounter.site
          ? {
              type: encounter.type,
              stage: encounter.stage,
              site: {
                x: encounter.site.x,
                y: encounter.site.y,
                z: encounter.site.z,
                label: encounter.site.label,
              },
            }
          : {
              type: encounter.type,
              stage: encounter.stage,
              site: null,
            },
      },
    },
    waypoint: state.objectiveWaypoint
      ? {
          label: state.objectiveWaypoint.label,
          x: Number(state.objectiveWaypoint.x.toFixed(3)),
          y: Number(state.objectiveWaypoint.y.toFixed(3)),
          z: Number(state.objectiveWaypoint.z.toFixed(3)),
          distance: Number(state.objectiveWaypoint.distance.toFixed(3)),
        }
      : null,
  };
}

let inventoryMutationCounter = 0;

function inventorySignature() {
  return inventoryMutationCounter;
}

function inventoryPanelStateSignature() {
  const transfer = state.inventoryTransferIndex === null ? "-" : state.inventoryTransferIndex;
  return `${state.selectedSlot}|${transfer}|${inventoryMutationCounter}`;
}

function furnaceStateSignature(key) {
  if (!key) {
    return "none";
  }
  const furnace = getFurnaceState(key, false);
  if (!furnace) {
    return `${key}|missing`;
  }
  return [
    key,
    furnace.inputItemId || "_",
    furnace.inputCount,
    Math.floor(furnace.fuelRemainingMs),
    Math.floor(furnace.fuelBufferMs),
    Math.floor(furnace.progressMs),
    furnace.outputItemId || "_",
    furnace.outputCount,
  ].join("|");
}

function markCraftPanelDirty() {
  craftPanelNeedsRefresh = true;
}

function markFurnacePanelDirty() {
  furnacePanelNeedsRefresh = true;
}

function markInventoryPanelDirty() {
  inventoryPanelNeedsRefresh = true;
  furnacePanelNeedsRefresh = true;
  craftPanelNeedsRefresh = true;
  inventoryMutationCounter += 1;
  invalidateBonusCache();
}

function serializeInventory() {
  return state.inventory.map((slot) => (slot ? { itemId: slot.itemId, count: slot.count } : null));
}

function loadInventory(serializedInventory) {
  if (!Array.isArray(serializedInventory)) {
    state.inventory = createStartingInventory();
    markInventoryPanelDirty();
    return;
  }
  state.inventory = new Array(INVENTORY_SIZE).fill(null);
  for (let i = 0; i < state.inventory.length && i < serializedInventory.length; i += 1) {
    const slot = serializedInventory[i];
    if (!slot || typeof slot.itemId !== "string" || !Number.isFinite(slot.count) || slot.count <= 0) {
      continue;
    }
    if (!ITEM_DEFS[slot.itemId]) {
      continue;
    }
    state.inventory[i] = { itemId: slot.itemId, count: Math.min(MAX_STACK, Math.floor(slot.count)) };
  }
  markInventoryPanelDirty();
}

function serializeFurnaces() {
  const serialized = [];
  for (const [key, furnace] of furnaceStates.entries()) {
    const { x, y, z } = fromFurnaceKey(key);
    if (world.get(x, y, z) !== FURNACE_BLOCK_TYPE) {
      continue;
    }
    serialized.push({
      x,
      y,
      z,
      inputItemId: furnace.inputItemId,
      inputCount: furnace.inputCount,
      fuelRemainingMs: furnace.fuelRemainingMs,
      fuelBufferMs: furnace.fuelBufferMs,
      progressMs: furnace.progressMs,
      outputItemId: furnace.outputItemId,
      outputCount: furnace.outputCount,
    });
  }
  return serialized;
}

function loadFurnaces(serializedFurnaces) {
  furnaceStates.clear();
  if (!Array.isArray(serializedFurnaces)) {
    markFurnacePanelDirty();
    return;
  }

  for (const raw of serializedFurnaces) {
    if (
      !raw ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y) ||
      !Number.isFinite(raw.z) ||
      world.get(raw.x, raw.y, raw.z) !== FURNACE_BLOCK_TYPE
    ) {
      continue;
    }

    const furnace = createDefaultFurnaceState();
    const inputItemId = typeof raw.inputItemId === "string" && ITEM_DEFS[raw.inputItemId] ? raw.inputItemId : null;
    const outputItemId = typeof raw.outputItemId === "string" && ITEM_DEFS[raw.outputItemId] ? raw.outputItemId : null;
    furnace.inputItemId = inputItemId;
    furnace.outputItemId = outputItemId;
    furnace.inputCount = Number.isFinite(raw.inputCount) ? Math.max(0, Math.min(MAX_STACK, Math.floor(raw.inputCount))) : 0;
    furnace.outputCount = Number.isFinite(raw.outputCount) ? Math.max(0, Math.min(MAX_STACK, Math.floor(raw.outputCount))) : 0;
    furnace.fuelRemainingMs = Number.isFinite(raw.fuelRemainingMs) ? Math.max(0, raw.fuelRemainingMs) : 0;
    furnace.fuelBufferMs = Number.isFinite(raw.fuelBufferMs) ? Math.max(0, raw.fuelBufferMs) : 0;
    furnace.progressMs = Number.isFinite(raw.progressMs) ? Math.max(0, raw.progressMs) : 0;
    if (furnace.inputCount <= 0) {
      furnace.inputItemId = null;
      furnace.progressMs = 0;
    }
    if (furnace.outputCount <= 0) {
      furnace.outputItemId = null;
    }
    furnaceStates.set(toFurnaceKey(raw.x, raw.y, raw.z), furnace);
  }

  markFurnacePanelDirty();
}

function isHostileMobEnabled() {
  return hostileMobConfig.enabled !== false;
}

function syncHostileMobCount() {
  state.hostileMobCount = hostileMobs.length;
}

function clearHostileMobs() {
  while (hostileMobs.length > 0) {
    const mob = hostileMobs.pop();
    hostileMobGroup.remove(mob.mesh);
  }
  mobSpawnAccumulatorMs = 0;
  hostileMobIdCounter = 1;
  syncHostileMobCount();
}

function createHostileMob(position, saved = null) {
  const mesh = new THREE.Mesh(hostileMobGeometry, hostileMobMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  hostileMobGroup.add(mesh);

  const id = Number.isFinite(saved?.id) ? Math.max(1, Math.floor(saved.id)) : hostileMobIdCounter;
  hostileMobIdCounter = Math.max(hostileMobIdCounter, id + 1);

  const mob = {
    id,
    health: Number.isFinite(saved?.health) ? Math.max(1, Math.floor(saved.health)) : 4,
    mode: typeof saved?.mode === "string" ? saved.mode : "wander",
    y: position.y,
    pos: new THREE.Vector3(position.x, position.y, position.z),
    mesh,
    wanderAngle: Number.isFinite(saved?.wanderAngle) ? saved.wanderAngle : Math.random() * Math.PI * 2,
    wanderTimerMs: Number.isFinite(saved?.wanderTimerMs)
      ? Math.max(0, saved.wanderTimerMs)
      : 900 + Math.random() * 1800,
    attackCooldownMs: Number.isFinite(saved?.attackCooldownMs) ? Math.max(0, saved.attackCooldownMs) : 0,
    chasing: Boolean(saved?.chasing),
  };
  mesh.userData.mobId = mob.id;
  mesh.position.copy(mob.pos);
  hostileMobs.push(mob);
  syncHostileMobCount();
  return mob;
}

function removeHostileMobAt(index) {
  if (index < 0 || index >= hostileMobs.length) {
    return null;
  }
  const [mob] = hostileMobs.splice(index, 1);
  if (mob) {
    hostileMobGroup.remove(mob.mesh);
  }
  syncHostileMobCount();
  return mob || null;
}

function serializeHostileMobs() {
  return hostileMobs.slice(0, Number.isFinite(hostileMobConfig.maxPersisted) ? hostileMobConfig.maxPersisted : 20).map((mob) => ({
    id: mob.id,
    x: Number(mob.pos.x.toFixed(3)),
    y: Number(mob.pos.y.toFixed(3)),
    z: Number(mob.pos.z.toFixed(3)),
    health: mob.health,
    mode: mob.mode,
    wanderAngle: Number(mob.wanderAngle.toFixed(4)),
    wanderTimerMs: Math.floor(mob.wanderTimerMs),
    attackCooldownMs: Math.floor(mob.attackCooldownMs),
    chasing: mob.chasing,
  }));
}

function isMobSpawnColumnWalkable(x, z) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  const groundY = world.findSurfaceY(blockX, blockZ);
  if (!world.isWithinVerticalBounds(groundY + 2)) {
    return null;
  }
  if (world.get(blockX, groundY + 1, blockZ) !== 0 || world.get(blockX, groundY + 2, blockZ) !== 0) {
    return null;
  }
  return groundY + 1.01;
}

function loadHostileMobs(serializedMobs) {
  clearHostileMobs();
  if (!isHostileMobEnabled() || !Array.isArray(serializedMobs)) {
    return;
  }
  const maxCount = Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10;
  for (const raw of serializedMobs) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) {
      continue;
    }
    if (hostileMobs.length >= maxCount) {
      break;
    }
    const y = isMobSpawnColumnWalkable(raw.x, raw.z);
    if (!Number.isFinite(y)) {
      continue;
    }
    createHostileMob({ x: raw.x, y, z: raw.z }, raw);
  }
}

function deactivateTorchLights() {
  activeTorchLights = 0;
  for (const light of torchLights) {
    light.visible = false;
  }
}

const TORCH_LIGHT_RESCAN_INTERVAL_MS = 180;
const torchCandidatePool = [];
let torchLightsScanAccumulatorMs = TORCH_LIGHT_RESCAN_INTERVAL_MS;
let lastTorchScanChunkX = Number.NaN;
let lastTorchScanChunkZ = Number.NaN;

function markTorchLightsDirty() {
  torchLightsScanAccumulatorMs = TORCH_LIGHT_RESCAN_INTERVAL_MS;
}

function updateTorchLights(deltaMs = 0) {
  if (!torchLightsEnabled || torchLights.length === 0) {
    activeTorchLights = 0;
    return;
  }
  if (Number.isFinite(deltaMs) && deltaMs > 0) {
    torchLightsScanAccumulatorMs += deltaMs;
  }
  const playerChunkX = Math.floor(state.playerPos.x);
  const playerChunkZ = Math.floor(state.playerPos.z);
  const movedBlock = playerChunkX !== lastTorchScanChunkX || playerChunkZ !== lastTorchScanChunkZ;
  if (!movedBlock && torchLightsScanAccumulatorMs < TORCH_LIGHT_RESCAN_INTERVAL_MS) {
    return;
  }
  torchLightsScanAccumulatorMs = 0;
  lastTorchScanChunkX = playerChunkX;
  lastTorchScanChunkZ = playerChunkZ;

  const baseScanRadius = Number.isFinite(torchLightConfig.scanRadius) ? Math.max(1, Math.floor(torchLightConfig.scanRadius)) : 10;
  const scanRadius = Math.max(1, Math.floor(baseScanRadius + getCombinedBonuses().torchScanRadiusBonus));
  const yOffset = Number.isFinite(torchLightConfig.yOffset) ? torchLightConfig.yOffset : 0.68;
  const py = Math.floor(state.playerPos.y);
  let candidateCount = 0;

  for (let y = Math.max(1, py - 4); y <= Math.min(world.height - 1, py + 6); y += 1) {
    for (let z = playerChunkZ - scanRadius; z <= playerChunkZ + scanRadius; z += 1) {
      for (let x = playerChunkX - scanRadius; x <= playerChunkX + scanRadius; x += 1) {
        if (world.get(x, y, z) !== TORCH_BLOCK_TYPE) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + yOffset - (state.playerPos.y + playerConfig.eyeHeight * 0.4);
        const dz = z + 0.5 - state.playerPos.z;
        let entry = torchCandidatePool[candidateCount];
        if (!entry) {
          entry = { x: 0, y: 0, z: 0, distanceSq: 0 };
          torchCandidatePool[candidateCount] = entry;
        }
        entry.x = x + 0.5;
        entry.y = y + yOffset;
        entry.z = z + 0.5;
        entry.distanceSq = dx * dx + dy * dy + dz * dz;
        candidateCount += 1;
      }
    }
  }

  // Selection sort top-N keeps allocations zero and is fast for small N (torch light pool is small).
  const visibleCount = Math.min(torchLights.length, candidateCount);
  for (let i = 0; i < visibleCount; i += 1) {
    let bestIndex = i;
    for (let j = i + 1; j < candidateCount; j += 1) {
      if (torchCandidatePool[j].distanceSq < torchCandidatePool[bestIndex].distanceSq) {
        bestIndex = j;
      }
    }
    if (bestIndex !== i) {
      const swap = torchCandidatePool[i];
      torchCandidatePool[i] = torchCandidatePool[bestIndex];
      torchCandidatePool[bestIndex] = swap;
    }
  }

  activeTorchLights = visibleCount;
  for (let i = 0; i < torchLights.length; i += 1) {
    const light = torchLights[i];
    if (i < visibleCount) {
      const candidate = torchCandidatePool[i];
      light.position.set(candidate.x, candidate.y, candidate.z);
      light.visible = true;
    } else {
      light.visible = false;
    }
  }
}

function pickMobWanderAngle() {
  return Math.random() * Math.PI * 2;
}

function maybeSpawnHostileMob() {
  if (!isHostileMobEnabled()) {
    return;
  }
  const maxCount = Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10;
  if (hostileMobs.length >= maxCount) {
    return;
  }
  const threshold = Number.isFinite(hostileMobConfig.spawnDayFactorThreshold)
    ? hostileMobConfig.spawnDayFactorThreshold
    : 0.56;
  if (threshold <= 0) {
    return;
  }
  const nightFactor = THREE.MathUtils.clamp((threshold - state.dayFactor) / threshold, 0, 1);
  if (nightFactor <= 0) {
    return;
  }
  const chance = (Number.isFinite(hostileMobConfig.spawnChancePerCheck) ? hostileMobConfig.spawnChancePerCheck : 0.55) * nightFactor;
  if (Math.random() > chance) {
    return;
  }

  const minDistance = Number.isFinite(hostileMobConfig.spawnMinDistance) ? hostileMobConfig.spawnMinDistance : 9;
  const maxDistance = Number.isFinite(hostileMobConfig.spawnMaxDistance) ? hostileMobConfig.spawnMaxDistance : 22;
  const minSeparation = Number.isFinite(hostileMobConfig.minSeparation) ? hostileMobConfig.minSeparation : 2.4;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = minDistance + Math.random() * Math.max(1, maxDistance - minDistance);
    const x = state.playerPos.x + Math.sin(angle) * distance;
    const z = state.playerPos.z - Math.cos(angle) * distance;
    const y = isMobSpawnColumnWalkable(x, z);
    if (!Number.isFinite(y)) {
      continue;
    }
    let tooClose = false;
    for (const mob of hostileMobs) {
      const dx = mob.pos.x - x;
      const dy = mob.pos.y - y;
      const dz = mob.pos.z - z;
      if (dx * dx + dy * dy + dz * dz < minSeparation * minSeparation) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      continue;
    }
    createHostileMob({ x, y, z });
    state.recentAction = "Hostile mob spawned";
    return;
  }
}

function spawnHostileMobNearPlayer(preferredDistance = 2.2) {
  if (!isHostileMobEnabled()) {
    return null;
  }
  const maxCount = Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10;
  if (hostileMobs.length >= maxCount) {
    return null;
  }

  const minSeparation = Number.isFinite(hostileMobConfig.minSeparation) ? hostileMobConfig.minSeparation : 2.4;
  const distances = [preferredDistance, preferredDistance + 1, Math.max(1.1, preferredDistance - 0.7), preferredDistance + 1.8];
  const angleOffsets = [0, 0.45, -0.45, 0.9, -0.9, Math.PI, Math.PI * 0.55, -Math.PI * 0.55];

  for (const distance of distances) {
    for (const offset of angleOffsets) {
      const angle = state.yaw + offset;
      const x = state.playerPos.x + Math.sin(angle) * distance;
      const z = state.playerPos.z - Math.cos(angle) * distance;
      const y = isMobSpawnColumnWalkable(x, z);
      if (!Number.isFinite(y)) {
        continue;
      }
      let tooClose = false;
      for (const mob of hostileMobs) {
        const dx = mob.pos.x - x;
        const dy = mob.pos.y - y;
        const dz = mob.pos.z - z;
        if (dx * dx + dy * dy + dz * dz < (minSeparation * 0.7) * (minSeparation * 0.7)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }
      return createHostileMob({ x, y, z });
    }
  }
  const fallbackX = state.playerPos.x + Math.sin(state.yaw + Math.PI * 0.5) * 0.9;
  const fallbackZ = state.playerPos.z - Math.cos(state.yaw + Math.PI * 0.5) * 0.9;
  const fallbackY = isMobSpawnColumnWalkable(fallbackX, fallbackZ);
  return createHostileMob({
    x: fallbackX,
    y: Number.isFinite(fallbackY) ? fallbackY : state.playerPos.y,
    z: fallbackZ,
  });
}

function spawnHostileMobAroundSite(site, preferredDistance = 2.6) {
  if (!site || !isHostileMobEnabled()) {
    return null;
  }
  const maxCount = Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10;
  if (hostileMobs.length >= maxCount) {
    return null;
  }

  const minSeparation = Number.isFinite(hostileMobConfig.minSeparation) ? hostileMobConfig.minSeparation : 2.4;
  const distances = [preferredDistance, preferredDistance + 1.2, Math.max(1.4, preferredDistance - 0.8)];
  const angleOffsets = [0, Math.PI * 0.5, -Math.PI * 0.5, Math.PI, Math.PI * 0.25, -Math.PI * 0.25];

  for (const distance of distances) {
    for (const offset of angleOffsets) {
      const x = site.x + Math.sin(offset) * distance;
      const z = site.z - Math.cos(offset) * distance;
      const y = isMobSpawnColumnWalkable(x, z);
      if (!Number.isFinite(y)) {
        continue;
      }
      let tooClose = false;
      for (const mob of hostileMobs) {
        const dx = mob.pos.x - x;
        const dy = mob.pos.y - y;
        const dz = mob.pos.z - z;
        if (dx * dx + dy * dy + dz * dz < minSeparation * minSeparation) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }
      return createHostileMob({ x, y, z });
    }
  }
  return null;
}

// Settle pass: gravity blocks (sand, gravel) fall one step per tick when unsupported.
// Runs once per simulation step; multiple ticks cascade naturally.
function updateFallingBlocks() {
  if (!world) {
    return;
  }
  // Collect every unsupported gravity block that is currently loaded.
  // Iterate active chunks only so we don't scan the whole world.
  for (const key of world.activeChunkKeys) {
    const chunk = world.chunks.get(key);
    if (!chunk) {
      continue;
    }
    const { cx, cz } = (() => {
      const parts = key.split(",");
      return { cx: Number(parts[0]), cz: Number(parts[1]) };
    })();
    const baseX = cx * world.chunkSize;
    const baseZ = cz * world.chunkSize;

    // Seed the flag on first visit (chunk newly generated or loaded from save).
    // This one-time scan per chunk avoids re-scanning every subsequent frame.
    if (chunk.hasFallingBlocks === undefined) {
      let found = false;
      for (let i = 0; i < chunk.blocks.length; i += 1) {
        if (FALLING_BLOCK_TYPES.has(chunk.blocks[i])) {
          found = true;
          break;
        }
      }
      chunk.hasFallingBlocks = found;
    }

    // Skip chunks that contain no falling blocks — avoids scanning 153k cells/frame
    // when nothing is falling.
    if (!chunk.hasFallingBlocks) {
      continue;
    }

    // Scan bottom-up so a column can cascade multiple steps across ticks naturally.
    // Read from chunk.blocks[] via world.index() to avoid toChunkPosition+Map.get
    // per cell; only call world.set() for actual moves so edits/markDirty persist.
    let stillHasFalling = false;
    for (let localZ = 0; localZ < world.chunkSize; localZ += 1) {
      for (let localX = 0; localX < world.chunkSize; localX += 1) {
        const worldX = baseX + localX;
        const worldZ = baseZ + localZ;
        for (let y = 1; y < world.height; y += 1) {
          const type = chunk.blocks[world.index(localX, y, localZ)];
          if (!FALLING_BLOCK_TYPES.has(type)) {
            continue;
          }
          const below = chunk.blocks[world.index(localX, y - 1, localZ)];
          if (below !== 0) {
            // Still sitting on something — mark so we don't clear the flag.
            stillHasFalling = true;
            continue;
          }
          // Unsupported: move it down one block via world.set() so edits/markDirty persist.
          world.set(worldX, y, worldZ, 0);
          world.set(worldX, y - 1, worldZ, type);
          stillHasFalling = true;
        }
      }
    }
    chunk.hasFallingBlocks = stillHasFalling;
  }
}

function updateBranchEncounterState() {
  if (state.mode !== "playing" || !state.specialization.completed || !state.specialization.selected) {
    return;
  }

  const encounter = getBranchEncounterState();
  const site = ensureBranchEncounterSite(false);
  if (!site) {
    return;
  }

  if (state.specialization.selected === "combat") {
    if (!hasCombatBranchLoopGear()) {
      resetBranchEncounter();
      encounter.type = "combat";
      return;
    }
    if (encounter.stage === "travel" && isWithinEncounterRadius(site, 4.2)) {
      encounter.stage = "active";
      let spawned = 0;
      while (spawned < BRANCH_LOOP_COMBAT_KILLS_REQUIRED) {
        const mob = spawnHostileMobAroundSite(site, 2.4 + spawned * 0.25) || spawnHostileMobNearPlayer(2.1 + spawned * 0.2);
        if (!mob) {
          break;
        }
        spawned += 1;
      }
      state.recentAction = spawned > 0 ? "Combat ambush triggered" : "Reached ambush pocket";
      objectiveWaypointNeedsRefresh = true;
    }
    if (encounter.stage === "active" && findNearestHostileMobToSite(site, 18) === null && getBranchLoopState().combatHuntKills <= 0) {
      const maxMobs = Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10;
      let attempts = 0;
      while (
        attempts < BRANCH_LOOP_COMBAT_KILLS_REQUIRED &&
        hostileMobs.length < maxMobs &&
        findNearestHostileMobToSite(site, 12) === null
      ) {
        const mob = spawnHostileMobAroundSite(site, 2.6) || spawnHostileMobNearPlayer(2.2);
        attempts += 1;
        if (!mob) {
          break;
        }
      }
    }
    return;
  }

  if (!hasExplorerBranchLoopGear()) {
    resetBranchEncounter();
    encounter.type = "explorer";
    return;
  }
  if (encounter.stage === "travel" && isWithinEncounterRadius(site, 4.2)) {
    encounter.stage = "active";
    state.recentAction = "Survey cache discovered";
    objectiveWaypointNeedsRefresh = true;
  }
}

function tryMoveHostileMob(mob, dirX, dirZ, moveDistance) {
  if (moveDistance <= 0) {
    return false;
  }
  const nextX = mob.pos.x + dirX * moveDistance;
  const nextZ = mob.pos.z + dirZ * moveDistance;
  const walkY = isMobSpawnColumnWalkable(nextX, nextZ);
  if (!Number.isFinite(walkY)) {
    return false;
  }
  const maxStep = Number.isFinite(hostileMobConfig.maxStepHeight) ? hostileMobConfig.maxStepHeight : 1.1;
  if (Math.abs(walkY - mob.pos.y) > maxStep) {
    return false;
  }
  mob.pos.x = nextX;
  mob.pos.z = nextZ;
  mob.pos.y = walkY;
  return true;
}

function updateHostileMobs(deltaMs) {
  syncHostileMobCount();
  if (!isHostileMobEnabled() || deltaMs <= 0) {
    return;
  }

  if (state.mode === "playing") {
    mobSpawnAccumulatorMs += deltaMs;
    const spawnInterval = Number.isFinite(hostileMobConfig.spawnCheckIntervalMs) ? hostileMobConfig.spawnCheckIntervalMs : 1800;
    while (mobSpawnAccumulatorMs >= spawnInterval) {
      mobSpawnAccumulatorMs -= spawnInterval;
      maybeSpawnHostileMob();
      if (hostileMobs.length >= (Number.isFinite(hostileMobConfig.maxCount) ? hostileMobConfig.maxCount : 10)) {
        break;
      }
    }
  } else {
    mobSpawnAccumulatorMs = 0;
  }

  const chaseRange = Number.isFinite(hostileMobConfig.chaseRange) ? hostileMobConfig.chaseRange : 12;
  const giveUpRange = Number.isFinite(hostileMobConfig.giveUpRange) ? hostileMobConfig.giveUpRange : 18;
  const wanderSpeed = Number.isFinite(hostileMobConfig.wanderSpeed) ? hostileMobConfig.wanderSpeed : 1.7;
  const chaseSpeed = Number.isFinite(hostileMobConfig.chaseSpeed) ? hostileMobConfig.chaseSpeed : 2.7;
  const attackRange = Number.isFinite(hostileMobConfig.attackRange) ? hostileMobConfig.attackRange : 1.1;
  const attackDamage = Number.isFinite(hostileMobConfig.attackDamage) ? hostileMobConfig.attackDamage : 2;
  const attackCooldownMs = Number.isFinite(hostileMobConfig.attackCooldownMs) ? hostileMobConfig.attackCooldownMs : 900;
  const despawnDayFactor = Number.isFinite(hostileMobConfig.dayDespawnFactor) ? hostileMobConfig.dayDespawnFactor : 0.72;
  const despawnDistance = Number.isFinite(hostileMobConfig.dayDespawnDistance) ? hostileMobConfig.dayDespawnDistance : 13;
  const despawnChancePerSecond = Number.isFinite(hostileMobConfig.dayDespawnChancePerSecond)
    ? hostileMobConfig.dayDespawnChancePerSecond
    : 0.6;

  const dtSeconds = deltaMs / 1000;
  for (let i = hostileMobs.length - 1; i >= 0; i -= 1) {
    const mob = hostileMobs[i];
    const toPlayerX = state.playerPos.x - mob.pos.x;
    const toPlayerZ = state.playerPos.z - mob.pos.z;
    const planarDistance = Math.hypot(toPlayerX, toPlayerZ);
    mob.attackCooldownMs = Math.max(0, mob.attackCooldownMs - deltaMs);

    if (state.mode !== "playing") {
      mob.mesh.position.copy(mob.pos);
      continue;
    }

    if (state.dayFactor > despawnDayFactor && planarDistance >= despawnDistance) {
      if (Math.random() < despawnChancePerSecond * dtSeconds) {
        removeHostileMobAt(i);
        continue;
      }
    }

    if (mob.chasing) {
      if (planarDistance > giveUpRange) {
        mob.chasing = false;
        mob.mode = "wander";
      }
    } else if (planarDistance < chaseRange) {
      mob.chasing = true;
      mob.mode = "chase";
    }

    let dirX = 0;
    let dirZ = 0;
    let speed = wanderSpeed;

    if (mob.chasing && planarDistance > 0.001) {
      dirX = toPlayerX / planarDistance;
      dirZ = toPlayerZ / planarDistance;
      speed = chaseSpeed;
      mob.mode = "chase";
      mob.wanderTimerMs = 0;
    } else {
      mob.mode = "wander";
      mob.wanderTimerMs -= deltaMs;
      if (mob.wanderTimerMs <= 0) {
        mob.wanderTimerMs = 700 + Math.random() * 1700;
        mob.wanderAngle = pickMobWanderAngle();
      }
      dirX = Math.sin(mob.wanderAngle);
      dirZ = -Math.cos(mob.wanderAngle);
    }

    const moved = tryMoveHostileMob(mob, dirX, dirZ, speed * dtSeconds);
    if (!moved && !mob.chasing) {
      mob.wanderTimerMs = 0;
    }

    if (planarDistance <= attackRange && mob.attackCooldownMs <= 0) {
      mob.attackCooldownMs = attackCooldownMs;
      takeDamage(attackDamage, "hostile");
    }

    mob.mesh.position.copy(mob.pos);
  }
  syncHostileMobCount();
}

function registerHostileMobDefeat(weaponItemId = getSelectedItemId()) {
  const usedWeapon = typeof weaponItemId === "string" ? weaponItemId : getSelectedItemId();
  if (usedWeapon === "copper_blade") {
    state.objectiveStats.copperBladeKills += 1;
    objectiveWaypointNeedsRefresh = true;
  }
  if (!state.specialization.selected) {
    selectSpecialization("combat", "Specialization chosen: Combat");
  }
  if (state.specialization.selected === "combat" && !state.specialization.completed) {
    state.specialization.combatKills += 1;
    objectiveWaypointNeedsRefresh = true;
  }
  const encounter = getBranchEncounterState();
  if (
    state.specialization.selected === "combat" &&
    state.specialization.completed &&
    usedWeapon === "vanguard_blade" &&
    encounter.type === "combat" &&
    encounter.stage === "active" &&
    encounter.site &&
    isWithinEncounterRadius(encounter.site, 20)
  ) {
    getBranchLoopState().combatHuntKills += 1;
    objectiveWaypointNeedsRefresh = true;
  }
}

function rewardHostileMobDefeat(weaponItemId = getSelectedItemId()) {
  registerHostileMobDefeat(weaponItemId);
  const dropItemId = typeof hostileMobConfig.dropItemId === "string" ? hostileMobConfig.dropItemId : "bone_shard";
  const dropChance = Number.isFinite(hostileMobConfig.dropChance)
    ? THREE.MathUtils.clamp(hostileMobConfig.dropChance, 0, 1)
    : 1;
  if (Math.random() > dropChance) {
    state.recentAction = "Defeated hostile mob";
    return;
  }

  const minDrop = Number.isFinite(hostileMobConfig.dropMin) ? Math.max(1, Math.floor(hostileMobConfig.dropMin)) : 1;
  const maxDrop = Number.isFinite(hostileMobConfig.dropMax) ? Math.max(minDrop, Math.floor(hostileMobConfig.dropMax)) : minDrop;
  const dropCount = minDrop + Math.floor(Math.random() * (maxDrop - minDrop + 1));
  const leftover = addItemToInventory(state.inventory, dropItemId, dropCount);
  const gained = dropCount - leftover;

  if (gained <= 0) {
    state.recentAction = `Defeated hostile mob, inventory full`;
    return;
  }

  if (leftover > 0) {
    state.recentAction = `Defeated hostile mob +${gained} ${getItemName(dropItemId)}, inventory full`;
  } else {
    state.recentAction = `Defeated hostile mob +${gained} ${getItemName(dropItemId)}`;
  }
}

function tryHitHostileMob(ndcX = 0, ndcY = 0) {
  if (!isHostileMobEnabled() || hostileMobs.length === 0) {
    return false;
  }
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(hostileMobGroup.children, false);
  if (hits.length === 0) {
    return false;
  }
  const maxReach = Number.isFinite(worldConfig.maxReach) ? worldConfig.maxReach : 6;
  const hit = hits.find((entry) => entry.distance <= maxReach);
  if (!hit) {
    return false;
  }
  const blockingWorldHit = hitTest(ndcX, ndcY, maxReach);
  if (blockingWorldHit && blockingWorldHit.distance + 0.03 < hit.distance) {
    return false;
  }
  const mobId = hit.object?.userData?.mobId;
  if (!Number.isFinite(mobId)) {
    return false;
  }
  const index = hostileMobs.findIndex((mob) => mob.id === mobId);
  if (index < 0) {
    return false;
  }
  const playerDamage = getSelectedMobDamage();
  const mob = hostileMobs[index];
  mob.health -= Math.max(1, Math.floor(playerDamage));
  if (mob.health <= 0) {
    const killWeaponItemId = getSelectedItemId();
    removeHostileMobAt(index);
    rewardHostileMobDefeat(killWeaponItemId);
    markCraftPanelDirty();
    markInventoryPanelDirty();
  } else {
    state.recentAction = `Hit hostile mob (${mob.health} hp)`;
  }
  return true;
}

function isWorkbenchNearby() {
  const px = Math.floor(state.playerPos.x);
  const py = Math.floor(state.playerPos.y);
  const pz = Math.floor(state.playerPos.z);
  for (let y = py - 1; y <= py + 2; y += 1) {
    for (let z = pz - 3; z <= pz + 3; z += 1) {
      for (let x = px - 3; x <= px + 3; x += 1) {
        if (world.get(x, y, z) === CRAFTING_TABLE_BLOCK_TYPE) {
          return true;
        }
      }
    }
  }
  return false;
}

function getRecipeSpecializationLockReason(recipe) {
  if (!recipe || (recipe.requiredSpecialization !== "combat" && recipe.requiredSpecialization !== "explorer")) {
    return null;
  }
  const requiredName = formatSpecializationName(recipe.requiredSpecialization);
  if (!isCoreObjectiveChainComplete()) {
    return `Complete core objectives before ${requiredName} branch recipes`;
  }
  if (!state.specialization.selected) {
    return `Choose ${requiredName} specialization first`;
  }
  if (state.specialization.selected !== recipe.requiredSpecialization) {
    return `${requiredName} branch only`;
  }
  if (!state.specialization.completed) {
    return `Complete ${requiredName} trial first`;
  }
  return null;
}

function isFurnaceAccessible(key) {
  if (!key) {
    return false;
  }
  const { x, y, z } = fromFurnaceKey(key);
  if (world.get(x, y, z) !== FURNACE_BLOCK_TYPE) {
    return false;
  }
  const dx = x + 0.5 - state.playerPos.x;
  const dy = y + 0.5 - state.playerPos.y;
  const dz = z + 0.5 - state.playerPos.z;
  return Math.hypot(dx, dy, dz) <= FURNACE_INTERACT_RADIUS;
}

function findNearestFurnaceKey() {
  const px = Math.floor(state.playerPos.x);
  const py = Math.floor(state.playerPos.y);
  const pz = Math.floor(state.playerPos.z);
  let best = null;

  for (let y = py - 2; y <= py + 3; y += 1) {
    for (let z = pz - FURNACE_INTERACT_RADIUS; z <= pz + FURNACE_INTERACT_RADIUS; z += 1) {
      for (let x = px - FURNACE_INTERACT_RADIUS; x <= px + FURNACE_INTERACT_RADIUS; x += 1) {
        if (world.get(x, y, z) !== FURNACE_BLOCK_TYPE) {
          continue;
        }
        const dx = x + 0.5 - state.playerPos.x;
        const dy = y + 0.5 - state.playerPos.y;
        const dz = z + 0.5 - state.playerPos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > FURNACE_INTERACT_RADIUS) {
          continue;
        }
        if (!best || dist < best.dist) {
          best = { key: toFurnaceKey(x, y, z), dist };
        }
      }
    }
  }

  return best ? best.key : null;
}

function ensureActiveFurnaceKey() {
  if (state.activeFurnaceKey && isFurnaceAccessible(state.activeFurnaceKey)) {
    return state.activeFurnaceKey;
  }
  state.activeFurnaceKey = findNearestFurnaceKey();
  return state.activeFurnaceKey;
}

function loadFurnaceInput(itemId) {
  const recipe = getSmeltingRecipeByInput(itemId);
  if (!recipe) {
    state.recentAction = "Item cannot be smelted";
    return;
  }
  if (countInventoryItems(state.inventory, itemId) <= 0) {
    state.recentAction = "Missing input item";
    return;
  }

  const key = ensureActiveFurnaceKey();
  if (!key) {
    state.recentAction = "No nearby furnace";
    return;
  }
  const furnace = getFurnaceState(key, true);
  if (furnace.inputItemId && furnace.inputItemId !== itemId) {
    state.recentAction = "Furnace input slot occupied";
    return;
  }
  if (furnace.inputCount >= MAX_STACK) {
    state.recentAction = "Furnace input full";
    return;
  }
  if (!consumeItemFromInventory(state.inventory, itemId, 1)) {
    state.recentAction = "Missing input item";
    return;
  }

  furnace.inputItemId = itemId;
  furnace.inputCount += 1;
  state.recentAction = `Loaded ${getItemName(itemId)} into furnace`;
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  refreshHud();
}

function loadFurnaceFuel(itemId) {
  const fuelMs = getFuelValue(itemId);
  if (fuelMs <= 0) {
    state.recentAction = "Item is not fuel";
    return;
  }
  if (countInventoryItems(state.inventory, itemId) <= 0) {
    state.recentAction = "Missing fuel";
    return;
  }

  const key = ensureActiveFurnaceKey();
  if (!key) {
    state.recentAction = "No nearby furnace";
    return;
  }
  const furnace = getFurnaceState(key, true);
  if (!consumeItemFromInventory(state.inventory, itemId, 1)) {
    state.recentAction = "Missing fuel";
    return;
  }

  furnace.fuelBufferMs += fuelMs;
  state.recentAction = `Loaded fuel: ${getItemName(itemId)}`;
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  refreshHud();
}

function takeFurnaceOutput() {
  const key = ensureActiveFurnaceKey();
  if (!key) {
    state.recentAction = "No nearby furnace";
    return;
  }
  const furnace = getFurnaceState(key, false);
  if (!furnace || !furnace.outputItemId || furnace.outputCount <= 0) {
    state.recentAction = "No furnace output ready";
    return;
  }

  const outputItemName = getItemName(furnace.outputItemId);
  const leftover = addItemToInventory(state.inventory, furnace.outputItemId, furnace.outputCount);
  const taken = furnace.outputCount - leftover;
  if (taken <= 0) {
    state.recentAction = "Inventory full";
    return;
  }

  furnace.outputCount = leftover;
  if (furnace.outputCount <= 0) {
    furnace.outputCount = 0;
    furnace.outputItemId = null;
  }
  state.recentAction = `Took ${taken} ${outputItemName}`;
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  refreshHud();
}

const furnaceKeysToDelete = [];

function updateFurnaceSimulation(deltaMs) {
  if (furnaceStates.size === 0) {
    return;
  }

  for (const [key, furnace] of furnaceStates) {
    const { x, y, z } = fromFurnaceKey(key);
    if (world.get(x, y, z) !== FURNACE_BLOCK_TYPE) {
      furnaceKeysToDelete.push(key);
      continue;
    }

    if (furnace.inputCount <= 0 || !furnace.inputItemId) {
      furnace.inputCount = 0;
      furnace.inputItemId = null;
      furnace.progressMs = 0;
      continue;
    }

    const recipe = getSmeltingRecipeByInput(furnace.inputItemId);
    if (!recipe) {
      furnace.progressMs = 0;
      continue;
    }

    const canOutput =
      !furnace.outputItemId ||
      (furnace.outputItemId === recipe.outputItemId && furnace.outputCount < MAX_STACK);
    if (!canOutput) {
      continue;
    }

    if (furnace.fuelRemainingMs <= 0 && furnace.fuelBufferMs > 0) {
      furnace.fuelRemainingMs += furnace.fuelBufferMs;
      furnace.fuelBufferMs = 0;
    }
    if (furnace.fuelRemainingMs <= 0) {
      continue;
    }

    const burnMs = Math.min(deltaMs, furnace.fuelRemainingMs);
    furnace.fuelRemainingMs -= burnMs;
    furnace.progressMs += burnMs;

    while (furnace.progressMs >= recipe.cookTimeMs && furnace.inputCount > 0) {
      if (
        furnace.outputItemId &&
        (furnace.outputItemId !== recipe.outputItemId || furnace.outputCount >= MAX_STACK)
      ) {
        break;
      }
      furnace.progressMs -= recipe.cookTimeMs;
      furnace.inputCount -= 1;
      if (furnace.inputCount <= 0) {
        furnace.inputCount = 0;
        furnace.inputItemId = null;
        furnace.progressMs = 0;
      }
      if (!furnace.outputItemId) {
        furnace.outputItemId = recipe.outputItemId;
        furnace.outputCount = 1;
      } else {
        furnace.outputCount += 1;
      }
      markFurnacePanelDirty();
    }
  }
  if (furnaceKeysToDelete.length > 0) {
    for (const key of furnaceKeysToDelete) {
      furnaceStates.delete(key);
    }
    furnaceKeysToDelete.length = 0;
  }
}

function updateCraftPanel(force = false) {
  if (!state.craftingOpen) {
    return;
  }

  const nearWorkbench = isWorkbenchNearby();
  const specializationSignature = `${state.specialization.selected || "_"}|${state.specialization.completed ? 1 : 0}`;
  const nextSignature = `${nearWorkbench}|${specializationSignature}|${inventorySignature()}`;
  if (!force && !craftPanelNeedsRefresh && craftPanelSignature === nextSignature) {
    return;
  }
  craftPanelSignature = nextSignature;
  craftPanelNeedsRefresh = false;

  let contextText = nearWorkbench
    ? "Workbench nearby: advanced recipes enabled"
    : "No nearby workbench: basic recipes only";
  if (state.specialization.selected) {
    const status = state.specialization.completed ? "trial complete" : "trial active";
    contextText += ` | ${formatSpecializationName(state.specialization.selected)} specialization (${status})`;
  }
  craftContext.textContent = contextText;

  craftRecipes.innerHTML = "";
  for (const recipe of RECIPES) {
    const specializationName =
      recipe.requiredSpecialization === "combat" || recipe.requiredSpecialization === "explorer"
        ? ` [${formatSpecializationName(recipe.requiredSpecialization)}]`
        : "";
    const inputs = recipe.inputs.map((input) => `${input.count} ${getItemName(input.itemId)}`).join(" + ");
    const row = document.createElement("div");
    row.className = "craft-row";

    const label = document.createElement("span");
    label.textContent = `${recipe.name}${specializationName} <= ${inputs}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Craft";

    const blockedBySpecialization = getRecipeSpecializationLockReason(recipe);
    const blockedByWorkbench = recipe.requiresWorkbench && !nearWorkbench;
    if (blockedBySpecialization) {
      button.disabled = true;
      button.title = blockedBySpecialization;
    } else if (blockedByWorkbench) {
      button.disabled = true;
      button.title = "Need nearby crafting table";
    } else {
      let hasIngredients = true;
      for (const input of recipe.inputs) {
        if (countInventoryItems(state.inventory, input.itemId) < input.count) {
          hasIngredients = false;
          break;
        }
      }
      if (!hasIngredients) {
        button.disabled = true;
        button.title = "Missing ingredients";
      }
    }

    button.addEventListener("click", () => {
      const specializationLockReason = getRecipeSpecializationLockReason(recipe);
      if (specializationLockReason) {
        state.recentAction = specializationLockReason;
        refreshHud();
        return;
      }
      const result = applyRecipe(state.inventory, recipe, isWorkbenchNearby());
      if (result.ok) {
        state.recentAction = `Crafted ${recipe.name}`;
      } else {
        state.recentAction = result.reason;
      }
      markCraftPanelDirty();
      markInventoryPanelDirty();
      updateCraftPanel(true);
      updateInventoryPanel(true);
      refreshHud();
    });

    row.append(label, button);
    craftRecipes.append(row);
  }
}

function closeFurnacePanel(updateAction = true) {
  if (!state.furnaceOpen) {
    return;
  }
  state.furnaceOpen = false;
  state.activeFurnaceKey = null;
  furnacePanel.classList.add("hidden");
  furnacePanelSignature = "";
  markFurnacePanelDirty();
  if (updateAction) {
    state.recentAction = "Closed furnace";
  }
}

function updateFurnacePanel(force = false) {
  if (!state.furnaceOpen) {
    return;
  }

  ensureActiveFurnaceKey();
  const activeKey = state.activeFurnaceKey;
  const nextSignature = `${activeKey || "none"}|${furnaceStateSignature(activeKey)}|${inventorySignature()}`;
  if (!force && !furnacePanelNeedsRefresh && furnacePanelSignature === nextSignature) {
    return;
  }
  furnacePanelSignature = nextSignature;
  furnacePanelNeedsRefresh = false;

  if (!activeKey) {
    furnaceContext.textContent = "No nearby furnace in range.";
    furnaceControls.innerHTML = "";
    return;
  }

  const furnace = getFurnaceState(activeKey, true);
  const recipe = getSmeltingRecipeByInput(furnace.inputItemId);
  const progressPct = recipe && furnace.inputCount > 0 ? Math.floor((furnace.progressMs / recipe.cookTimeMs) * 100) : 0;
  const { x, y, z } = fromFurnaceKey(activeKey);
  furnaceContext.textContent = `Using furnace @ ${x},${y},${z}`;

  furnaceControls.innerHTML = "";

  const rowInput = document.createElement("div");
  rowInput.className = "furnace-row";
  rowInput.textContent = `Input: ${
    furnace.inputItemId ? `${getItemName(furnace.inputItemId)} x${furnace.inputCount}` : "Empty"
  }`;
  furnaceControls.append(rowInput);

  for (const smeltRecipe of SMELTING_RECIPES) {
    const row = document.createElement("div");
    row.className = "furnace-row";
    const label = document.createElement("span");
    label.textContent = `Load ${getItemName(smeltRecipe.inputItemId)} (inv ${countInventoryItems(
      state.inventory,
      smeltRecipe.inputItemId,
    )})`;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "load-input";
    button.dataset.itemId = smeltRecipe.inputItemId;
    button.textContent = "Load";
    const blockedByInput =
      (furnace.inputItemId && furnace.inputItemId !== smeltRecipe.inputItemId) || furnace.inputCount >= MAX_STACK;
    if (blockedByInput || countInventoryItems(state.inventory, smeltRecipe.inputItemId) <= 0) {
      button.disabled = true;
    }
    row.append(label, button);
    furnaceControls.append(row);
  }

  const fuelRow = document.createElement("div");
  fuelRow.className = "furnace-row";
  fuelRow.textContent = `Fuel: ${Math.ceil(furnace.fuelRemainingMs)}ms + buffer ${Math.ceil(furnace.fuelBufferMs)}ms`;
  furnaceControls.append(fuelRow);

  for (const itemId of Object.keys(FUEL_ITEM_MS)) {
    const fuelValue = getFuelValue(itemId);
    if (fuelValue <= 0) {
      continue;
    }
    const row = document.createElement("div");
    row.className = "furnace-row";
    const label = document.createElement("span");
    label.textContent = `Fuel ${getItemName(itemId)} (inv ${countInventoryItems(state.inventory, itemId)})`;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "load-fuel";
    button.dataset.itemId = itemId;
    button.textContent = `+${Math.floor(fuelValue)}ms`;
    if (countInventoryItems(state.inventory, itemId) <= 0) {
      button.disabled = true;
    }
    row.append(label, button);
    furnaceControls.append(row);
  }

  const progressRow = document.createElement("div");
  progressRow.className = "furnace-row";
  progressRow.textContent = `Progress: ${progressPct}%`;
  furnaceControls.append(progressRow);

  const outputRow = document.createElement("div");
  outputRow.className = "furnace-row";
  const outputLabel = document.createElement("span");
  outputLabel.textContent = `Output: ${
    furnace.outputItemId ? `${getItemName(furnace.outputItemId)} x${furnace.outputCount}` : "Empty"
  }`;
  const takeButton = document.createElement("button");
  takeButton.type = "button";
  takeButton.dataset.action = "take-output";
  takeButton.textContent = "Take";
  if (!furnace.outputItemId || furnace.outputCount <= 0) {
    takeButton.disabled = true;
  }
  outputRow.append(outputLabel, takeButton);
  furnaceControls.append(outputRow);
}

function toggleFurnacePanel() {
  if (state.furnaceOpen) {
    closeFurnacePanel(true);
    return;
  }
  if (state.inventoryOpen) {
    closeInventoryPanel(false);
  }
  if (state.craftingOpen) {
    state.craftingOpen = false;
    craftPanel.classList.add("hidden");
    craftPanelSignature = "";
  }

  state.furnaceOpen = true;
  state.activeFurnaceKey = ensureActiveFurnaceKey();
  if (state.pointerLocked && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  furnacePanel.classList.remove("hidden");
  state.keys.clear();
  state.jumpQueued = false;
  markFurnacePanelDirty();
  updateFurnacePanel(true);
  if (!state.activeFurnaceKey) {
    state.recentAction = "Opened furnace (none nearby)";
  } else {
    state.recentAction = "Opened furnace";
  }
}

function onFurnacePanelAction(action, itemId) {
  if (action === "load-input") {
    loadFurnaceInput(itemId);
  } else if (action === "load-fuel") {
    loadFurnaceFuel(itemId);
  } else if (action === "take-output") {
    takeFurnaceOutput();
  }
  updateFurnacePanel(true);
  updateInventoryPanel(true);
  updateCraftPanel(true);
}

function renderInventorySlotButton(slotIndex) {
  const slot = state.inventory[slotIndex];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inventory-slot";
  button.dataset.slotIndex = String(slotIndex);

  if (!slot) {
    button.classList.add("empty");
  }
  if (slotIndex === state.selectedSlot) {
    button.classList.add("selected-hotbar");
  }
  if (slotIndex === state.inventoryTransferIndex) {
    button.classList.add("transfer-selected");
  }

  const slotLabel = `${slotIndex + 1}`;
  if (!slot) {
    button.textContent = `${slotLabel}: Empty`;
    return button;
  }
  button.textContent = `${slotLabel}: ${getItemName(slot.itemId)} x${slot.count}`;
  return button;
}

function renderInventoryGrid(container, startIndex, endIndex) {
  container.innerHTML = "";
  for (let i = startIndex; i <= endIndex; i += 1) {
    container.append(renderInventorySlotButton(i));
  }
}

function updateInventoryPanel(force = false) {
  if (!state.inventoryOpen) {
    return;
  }

  const nextSignature = inventoryPanelStateSignature();
  if (!force && !inventoryPanelNeedsRefresh && inventoryPanelSignature === nextSignature) {
    return;
  }
  inventoryPanelSignature = nextSignature;
  inventoryPanelNeedsRefresh = false;

  if (state.inventoryTransferIndex === null) {
    inventoryHint.textContent = "Click one slot, then another slot to move or swap.";
  } else {
    inventoryHint.textContent = `Selected slot ${state.inventoryTransferIndex + 1}. Click destination slot.`;
  }

  renderInventoryGrid(inventoryHotbarGrid, 0, HOTBAR_SIZE - 1);
  renderInventoryGrid(inventoryBackpackGrid, HOTBAR_SIZE, INVENTORY_SIZE - 1);
}

function closeInventoryPanel(updateAction = true) {
  if (!state.inventoryOpen) {
    return;
  }
  state.inventoryOpen = false;
  state.inventoryTransferIndex = null;
  inventoryPanel.classList.add("hidden");
  inventoryPanelSignature = "";
  markInventoryPanelDirty();
  if (updateAction) {
    state.recentAction = "Closed inventory";
  }
}

function onInventorySlotClick(slotIndex) {
  if (!state.inventoryOpen) {
    return;
  }
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= INVENTORY_SIZE) {
    return;
  }

  const targetIndex = Math.floor(slotIndex);
  if (state.inventoryTransferIndex === null) {
    if (!state.inventory[targetIndex]) {
      state.recentAction = `Slot ${targetIndex + 1} is empty`;
      return;
    }
    state.inventoryTransferIndex = targetIndex;
    state.recentAction = `Selected slot ${targetIndex + 1}`;
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  if (state.inventoryTransferIndex === targetIndex) {
    state.inventoryTransferIndex = null;
    state.recentAction = "Cancelled transfer";
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  const fromIndex = state.inventoryTransferIndex;
  const moved = transferInventoryStack(state.inventory, fromIndex, targetIndex);
  state.inventoryTransferIndex = null;

  if (moved) {
    state.recentAction = `Moved slot ${fromIndex + 1} -> ${targetIndex + 1}`;
    markCraftPanelDirty();
    markInventoryPanelDirty();
    refreshHud();
    updateCraftPanel(true);
    updateInventoryPanel(true);
    return;
  }

  state.recentAction = "Cannot move stack";
  markInventoryPanelDirty();
  updateInventoryPanel(true);
}

function toggleInventoryPanel() {
  if (state.inventoryOpen) {
    closeInventoryPanel(true);
    return;
  }

  if (state.furnaceOpen) {
    closeFurnacePanel(false);
  }

  if (state.craftingOpen) {
    state.craftingOpen = false;
    craftPanel.classList.add("hidden");
    craftPanelSignature = "";
  }

  state.inventoryOpen = true;
  state.inventoryTransferIndex = null;
  if (state.pointerLocked && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  inventoryPanel.classList.remove("hidden");
  state.keys.clear();
  state.jumpQueued = false;
  markInventoryPanelDirty();
  updateInventoryPanel(true);
  state.recentAction = "Opened inventory";
}

function toggleCraftPanel() {
  if (state.inventoryOpen) {
    closeInventoryPanel(false);
  }
  if (state.furnaceOpen) {
    closeFurnacePanel(false);
  }
  state.craftingOpen = !state.craftingOpen;
  craftPanel.classList.toggle("hidden", !state.craftingOpen);
  if (!state.craftingOpen) {
    craftPanelSignature = "";
    return;
  }
  if (state.pointerLocked && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  state.keys.clear();
  state.jumpQueued = false;
  markCraftPanelDirty();
  updateCraftPanel(true);
}

function collectSaveSnapshot() {
  return {
    version: 3,
    savedAt: Date.now(),
    seed: world.getSeed(),
    worldTimeMs: state.timeOfDayMs,
    player: {
      x: state.playerPos.x,
      y: state.playerPos.y,
      z: state.playerPos.z,
      yaw: state.yaw,
      pitch: state.pitch,
      health: state.health,
      selectedSlot: state.selectedSlot,
    },
    inventory: serializeInventory(),
    furnaces: serializeFurnaces(),
    mobs: serializeHostileMobs(),
    objectives: serializeObjectives(),
    edits: world.exportEdits(),
  };
}

async function saveGame(reason = "manual") {
  if (saveInFlight) {
    return;
  }
  saveInFlight = true;
  try {
    const snapshot = collectSaveSnapshot();
    await putSave(SAVE_SLOT, snapshot);
    if (reason === "autosave") {
      setSaveStatus("Autosaved");
    } else {
      setSaveStatus("Saved");
    }
  } catch (error) {
    setSaveStatus("Save failed", 3200);
    console.error(error);
  } finally {
    saveInFlight = false;
  }
}

function applyPlayerSave(playerData) {
  if (!playerData) {
    return false;
  }
  const numeric = ["x", "y", "z", "yaw", "pitch"];
  for (const key of numeric) {
    if (!Number.isFinite(playerData[key])) {
      return false;
    }
  }
  state.playerPos.set(playerData.x, playerData.y, playerData.z);
  state.playerVel.set(0, 0, 0);
  state.onGround = false;
  state.yaw = playerData.yaw;
  state.pitch = THREE.MathUtils.clamp(playerData.pitch, -1.45, 1.45);
  if (Number.isFinite(playerData.health)) {
    state.health = THREE.MathUtils.clamp(playerData.health, 0, state.maxHealth);
  }
  if (Number.isFinite(playerData.selectedSlot) && playerData.selectedSlot >= 0 && playerData.selectedSlot < HOTBAR_SIZE) {
    state.selectedSlot = Math.floor(playerData.selectedSlot);
  }
  return true;
}

async function loadGame() {
  if (saveInFlight) {
    return;
  }
  saveInFlight = true;
  lastAutosaveAt = performance.now();
  try {
    const snapshot = await getSave(SAVE_SLOT);
    if (!snapshot) {
      setSaveStatus("No save found", 2800);
      return;
    }

    if (Number.isFinite(snapshot.seed)) {
      world.setSeed(snapshot.seed);
    }
    loadInventory(snapshot.inventory);
    world.importEdits(snapshot.edits);
    world.generateTerrain({ preserveEdits: true });
    deactivateTorchLights();
    loadFurnaces(snapshot.furnaces);
    loadHostileMobs(snapshot.mobs);
    loadObjectives(snapshot.objectives);
    state.activeFurnaceKey = null;
    if (Number.isFinite(snapshot.worldTimeMs)) {
      state.timeOfDayMs = normalizeTimeOfDayMs(snapshot.worldTimeMs);
    }
    markCraftPanelDirty();
    markInventoryPanelDirty();

    const appliedPlayer = applyPlayerSave(snapshot.player);
    if (!appliedPlayer) {
      respawnPlayer({ healToMax: true });
    } else {
      world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
      updateCameraTransform();
    }

    if (state.mode !== "playing") {
      startGame();
    }

    state.recentAction = "Loaded save";
    updateTargetBlockFromCenter();
    refreshHud();
    updateObjectives(0, true);
    updateCraftPanel(true);
    updateFurnacePanel(true);
    updateInventoryPanel(true);
    render();
    lastAutosaveAt = performance.now();
    setSaveStatus("Loaded");
  } catch (error) {
    setSaveStatus("Load failed", 3200);
    console.error(error);
  } finally {
    saveInFlight = false;
  }
}

function hitTest(ndcX = 0, ndcY = 0, maxDistance = worldConfig.maxReach) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const solidMeshes = world.meshGroup.children.filter(m => !m.userData.isWater);
  const hits = raycaster.intersectObjects(solidMeshes, false);
  for (const hit of hits) {
    if (hit.distance <= maxDistance) {
      return hit;
    }
  }
  return null;
}

function updateTargetBlockFromCenter() {
  const hit = hitTest(0, 0);
  if (!hit) {
    state.targetBlock = null;
    targetOutline.visible = false;
    hideCrackOverlay();
    return;
  }

  const normal = getWorldNormal(hit);
  if (!normal) {
    state.targetBlock = null;
    targetOutline.visible = false;
    hideCrackOverlay();
    return;
  }

  const coords = toBlockCoords(hit.point, normal, -1);
  const type = world.get(coords.x, coords.y, coords.z);
  if (type === 0 || type === WATER_BLOCK_TYPE) {
    state.targetBlock = null;
    targetOutline.visible = false;
    hideCrackOverlay();
    return;
  }

  state.targetBlock = {
    ...coords,
    type,
    name: blockName(type),
  };
  targetOutline.visible = true;
  targetOutline.position.set(coords.x + 0.5, coords.y + 0.5, coords.z + 0.5);
  // If we'd been mining a different block, drop the in-progress crack overlay so it
  // doesn't ghost on top of whatever the player is now aiming at.
  const targetKey = `${coords.x},${coords.y},${coords.z}`;
  if (state.breakProgress.targetKey && state.breakProgress.targetKey !== targetKey) {
    hideCrackOverlay();
  }
}

function breakBlock(ndcX = 0, ndcY = 0) {
  if (tryHitHostileMob(ndcX, ndcY)) {
    return true;
  }
  const hit = hitTest(ndcX, ndcY);
  if (!hit) {
    state.breakProgress.targetKey = null;
    state.breakProgress.amount = 0;
    return false;
  }
  const normal = getWorldNormal(hit);
  if (!normal) {
    state.breakProgress.targetKey = null;
    state.breakProgress.amount = 0;
    return false;
  }
  const coords = toBlockCoords(hit.point, normal, -1);
  if (!world.inBounds(coords.x, coords.y, coords.z)) {
    state.breakProgress.targetKey = null;
    state.breakProgress.amount = 0;
    return false;
  }
  const type = world.get(coords.x, coords.y, coords.z);
  if (type === 0 || type === WATER_BLOCK_TYPE || coords.y === 0 || type === BEDROCK_BLOCK_TYPE) {
    state.breakProgress.targetKey = null;
    state.breakProgress.amount = 0;
    return false;
  }

  const targetKey = `${coords.x},${coords.y},${coords.z}`;
  if (state.breakProgress.targetKey !== targetKey) {
    state.breakProgress.targetKey = targetKey;
    state.breakProgress.amount = 0;
  }

  const heldItemId = getSelectedItemId();
  state.breakProgress.amount += getBreakPower(heldItemId, type);
  const hardness = getBlockHardness(type);
  if (state.breakProgress.amount < hardness) {
    const pct = Math.min(99, Math.floor((state.breakProgress.amount / hardness) * 100));
    state.recentAction = `Mining ${blockName(type)} ${pct}%`;
    showCrackOverlay(coords.x, coords.y, coords.z, state.breakProgress.amount / hardness);
    return false;
  }

  const minedDeepCopper = type === COPPER_ORE_BLOCK_TYPE && isTorchPlacementInCave(coords.x, coords.y, coords.z);
  world.set(coords.x, coords.y, coords.z, 0);
  if (type === FURNACE_BLOCK_TYPE) {
    furnaceStates.delete(targetKey);
    if (state.activeFurnaceKey === targetKey) {
      state.activeFurnaceKey = null;
    }
    markFurnacePanelDirty();
  }
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  if (type === TORCH_BLOCK_TYPE) {
    markTorchLightsDirty();
  }
  if (minedDeepCopper) {
    registerDeepCopperProgress();
  }

  const dropItemId = getBlockDropItem(type);
  if (dropItemId) {
    const leftover = addItemToInventory(state.inventory, dropItemId, 1);
    if (leftover > 0) {
      state.recentAction = `Broke ${blockName(type)}, inventory full`;
    } else {
      state.recentAction = `Broke ${blockName(type)}`;
    }
    markCraftPanelDirty();
    markInventoryPanelDirty();
  } else {
    state.recentAction = `Broke ${blockName(type)}`;
  }

  state.breakProgress.targetKey = null;
  state.breakProgress.amount = 0;
  hideCrackOverlay();
  spawnBlockBreakParticles(coords.x, coords.y, coords.z, type);
  playBreakSound(type);
  updateTargetBlockFromCenter();
  return true;
}

function showCrackOverlay(x, y, z, progress01) {
  const stage = Math.min(CRACK_STAGE_COUNT - 1, Math.floor(progress01 * CRACK_STAGE_COUNT));
  if (stage !== lastCrackStage) {
    crackOverlayMaterial.map = crackTextures[stage];
    crackOverlayMaterial.needsUpdate = true;
    lastCrackStage = stage;
  }
  crackOverlay.position.set(x + 0.5, y + 0.5, z + 0.5);
  crackOverlay.visible = true;
}

function hideCrackOverlay() {
  crackOverlay.visible = false;
  lastCrackStage = -1;
}

function placeBlock(ndcX = 0, ndcY = 0) {
  const slot = getSelectedInventorySlot();
  if (!slot) {
    state.recentAction = "Selected slot empty";
    return false;
  }

  const placeType = getPlaceableBlockType(slot.itemId);
  if (!placeType) {
    state.recentAction = "Selected item not placeable";
    return false;
  }

  const hit = hitTest(ndcX, ndcY);
  if (!hit) {
    return false;
  }
  const normal = getWorldNormal(hit);
  if (!normal) {
    return false;
  }
  const coords = toBlockCoords(hit.point, normal, 1);
  if (!world.inBounds(coords.x, coords.y, coords.z)) {
    return false;
  }
  if (world.get(coords.x, coords.y, coords.z) !== 0) {
    return false;
  }
  if (playerInsideBlock(coords.x, coords.y, coords.z)) {
    return false;
  }
  world.set(coords.x, coords.y, coords.z, placeType);
  if (FALLING_BLOCK_TYPES.has(placeType)) {
    const placedPos = world.toChunkPosition(coords.x, coords.z);
    const placedChunk = world.chunks.get(placedPos.key);
    if (placedChunk) {
      placedChunk.hasFallingBlocks = true;
    }
  }
  if (placeType === FURNACE_BLOCK_TYPE) {
    const furnaceKey = toFurnaceKey(coords.x, coords.y, coords.z);
    getFurnaceState(furnaceKey, true);
    markFurnacePanelDirty();
  }
  consumeFromSlot(state.inventory, state.selectedSlot, 1);
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  if (placeType === TORCH_BLOCK_TYPE) {
    markTorchLightsDirty();
    if (isTorchPlacementInCave(coords.x, coords.y, coords.z)) {
      state.objectiveStats.caveTorchPlaced = true;
      registerCaveTorchProgress();
    }
  }
  state.recentAction = `Placed ${blockName(placeType)} @ ${coords.x},${coords.y},${coords.z}`;
  markCraftPanelDirty();
  markInventoryPanelDirty();
  playPlaceSound(placeType);
  updateTargetBlockFromCenter();
  return true;
}

function updateCameraTransform() {
  // Vertical bob is twice the frequency of lateral bob (footstep cadence vs hip sway).
  const verticalBob = Math.sin(state.bobPhase * 2) * BOB_VERTICAL_AMPLITUDE * state.bobAmplitude;
  const lateralBob = Math.sin(state.bobPhase) * BOB_LATERAL_AMPLITUDE * state.bobAmplitude;
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const rightX = cosYaw;
  const rightZ = -sinYaw;
  camera.position.set(
    state.playerPos.x + rightX * lateralBob,
    state.playerPos.y + playerConfig.eyeHeight + verticalBob,
    state.playerPos.z + rightZ * lateralBob,
  );
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
  if (Math.abs(camera.fov - state.cameraFov) > 0.05) {
    camera.fov = state.cameraFov;
    camera.updateProjectionMatrix();
  }
}

function pickSpawnPoint() {
  const spawnCenter = world.getSpawnCenter();
  const centerX = Math.floor(spawnCenter.x);
  const centerZ = Math.floor(spawnCenter.z);
  const searchRadius = world.spawnSearchRadius;
  let bestCandidate = null;

  for (let dz = -searchRadius; dz <= searchRadius; dz += 1) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const x = centerX + dx;
      const z = centerZ + dz;
      const y = world.findSurfaceY(x, z);
      const surfaceType = world.get(x, y, z);
      if (surfaceType === 0 || surfaceType === WATER_BLOCK_TYPE || surfaceType === WOOD_BLOCK_TYPE || surfaceType === LEAF_BLOCK_TYPE) {
        continue;
      }
      if (!world.isWithinVerticalBounds(y + 2)) {
        continue;
      }
      if (world.get(x, y + 1, z) !== 0 || world.get(x, y + 2, z) !== 0) {
        continue;
      }

      let openNeighbors = 0;
      for (const [nxOffset, nzOffset] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + nxOffset;
        const nz = z + nzOffset;
        const neighborY = world.findSurfaceY(nx, nz);
        if (neighborY <= y + 1 && world.get(nx, y + 1, nz) === 0) {
          openNeighbors += 1;
        }
      }
      if (openNeighbors < 2) {
        continue;
      }

      const distanceScore = Math.hypot(dx, dz);
      const heightScore = Math.abs(y - 7) * 0.12;
      const score = distanceScore + heightScore;
      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { x, z, y, score };
      }
    }
  }

  // findSurfaceY may return a water block; scan down to find the first solid surface.
  let fallbackY = world.findSurfaceY(centerX, centerZ);
  while (fallbackY > 0 && world.get(centerX, fallbackY, centerZ) === WATER_BLOCK_TYPE) {
    fallbackY -= 1;
  }
  const best = bestCandidate || { x: centerX, z: centerZ, y: fallbackY };
  let bestYaw = Math.PI;
  let bestDistance = -1;
  for (let i = 0; i < 16; i += 1) {
    const yaw = (i / 16) * Math.PI * 2;
    let freeDistance = 0;
    for (let d = 0.5; d <= 8; d += 0.5) {
      const tx = Math.floor(best.x + 0.5 + Math.sin(yaw) * d);
      const tz = Math.floor(best.z + 0.5 - Math.cos(yaw) * d);
      const ty = Math.floor(best.y + 1.2);
      if (world.get(tx, ty, tz) !== 0) {
        break;
      }
      freeDistance = d;
    }
    if (freeDistance > bestDistance) {
      bestDistance = freeDistance;
      bestYaw = yaw;
    }
  }

  return {
    x: best.x + 0.5,
    y: best.y + 1.02,
    z: best.z + 0.5,
    yaw: bestYaw,
  };
}

function respawnPlayer(options = {}) {
  const { healToMax = false } = options;
  const spawn = pickSpawnPoint();
  state.playerPos.set(spawn.x, spawn.y, spawn.z);
  state.playerVel.set(0, 0, 0);
  state.onGround = false;
  state.yaw = spawn.yaw;
  state.pitch = -0.2;
  if (healToMax) {
    state.health = state.maxHealth;
  }
  state.breakProgress.targetKey = null;
  state.breakProgress.amount = 0;
  for (const mob of hostileMobs) {
    mob.chasing = false;
    mob.mode = "wander";
    mob.attackCooldownMs = 0;
    mob.wanderTimerMs = 0;
  }
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  updateCameraTransform();
}

function takeDamage(amount, reason) {
  if (state.mode !== "playing") {
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const damage = Math.max(1, Math.floor(amount));
  state.health = Math.max(0, state.health - damage);
  if (state.health <= 0) {
    respawnPlayer({ healToMax: true });
    state.recentAction = `Died (${reason}), respawned`;
    markCraftPanelDirty();
    triggerDamageFlash();
    return;
  }
  state.recentAction = `Took ${damage} damage (${reason})`;
  triggerDamageFlash();
}

function triggerDamageFlash() {
  if (!damageFlashEl) return;
  // Cancel any in-progress animation by resetting, then re-triggering.
  damageFlashEl.style.transition = "none";
  damageFlashEl.style.opacity = "1";
  // Force a reflow so the browser registers the opacity=1 before we start fading.
  void damageFlashEl.offsetWidth;
  damageFlashEl.style.transition = "opacity 0.65s ease-out";
  damageFlashEl.style.opacity = "0";
}

function regenerateWorld() {
  world.generateTerrain();
  deactivateTorchLights();
  furnaceStates.clear();
  clearHostileMobs();
  resetObjectives();
  state.activeFurnaceKey = null;
  state.timeOfDayMs = normalizeTimeOfDayMs(simConfig.initialTimeOfDayMs);
  respawnPlayer({ healToMax: true });
  state.recentAction = "Regenerated terrain";
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  updateObjectives(0, true);
  updateCraftPanel(true);
  updateFurnacePanel(true);
  updateInventoryPanel(true);
}

async function createNewWorld() {
  const seed = randomSeed();
  world.setSeed(seed);
  world.generateTerrain();
  deactivateTorchLights();
  furnaceStates.clear();
  clearHostileMobs();
  resetObjectives();
  state.activeFurnaceKey = null;
  state.timeOfDayMs = normalizeTimeOfDayMs(simConfig.initialTimeOfDayMs);
  state.inventory = createStartingInventory();
  state.selectedSlot = 0;
  respawnPlayer({ healToMax: true });
  state.recentAction = `New world seed ${seed}`;
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  await removeSave(SAVE_SLOT).catch(() => {});
  lastAutosaveAt = performance.now();
  updateObjectives(0, true);
  updateCraftPanel(true);
  updateFurnacePanel(true);
  updateInventoryPanel(true);
  setSaveStatus("New world");
}

function clampPlayer() {
  if (state.playerPos.y < simConfig.outOfBoundsY) {
    takeDamage(state.maxHealth, "void");
  }
}

function collectNearbyBlocks() {
  const results = [];
  const cx = Math.floor(state.playerPos.x);
  const cy = Math.floor(state.playerPos.y);
  const cz = Math.floor(state.playerPos.z);

  for (let y = cy - 1; y <= cy + 2; y += 1) {
    for (let z = cz - 2; z <= cz + 2; z += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        const type = world.get(x, y, z);
        if (type === 0) {
          continue;
        }
        results.push({ x, y, z, type });
        if (results.length >= simConfig.maxNearbyBlocks) {
          return results;
        }
      }
    }
  }
  return results;
}

function updateSimulation(dtSeconds) {
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  const deltaMs = dtSeconds * 1000;
  updateDayNight(deltaMs);

  if (state.mode !== "playing") {
    updateHostileMobs(deltaMs);
    updateTorchLights(deltaMs);
    updateObjectives(deltaMs);
    updateCameraTransform();
    updateTargetBlockFromCenter();
    refreshHud();
    updateFurnacePanel();
    return;
  }

  const turnInput = (state.keys.has("ArrowRight") ? 1 : 0) - (state.keys.has("ArrowLeft") ? 1 : 0);
  state.yaw += turnInput * playerConfig.turnSpeed * dtSeconds;

  let forwardInput = 0;
  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) {
    forwardInput += 1;
  }
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) {
    forwardInput -= 1;
  }

  let strafeInput = 0;
  if (state.keys.has("KeyD")) {
    strafeInput += 1;
  }
  if (state.keys.has("KeyA")) {
    strafeInput -= 1;
  }

  const inputLength = Math.hypot(forwardInput, strafeInput);
  if (inputLength > 0) {
    forwardInput /= inputLength;
    strafeInput /= inputLength;
  }

  // Sprint: hold Shift while pressing forward (Minecraft-style — backwards/strafing
  // doesn't sprint). Only effective when on ground; jumping mid-sprint keeps the bump
  // until release, but landing without forward held drops it.
  const sprintHeld = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
  state.isSprinting = sprintHeld && forwardInput > 0;

  // Camera at rotation.y = yaw (with default looking -Z) faces (-sin yaw, 0, -cos yaw).
  // The camera-local +X (screen-right) axis is (cos yaw, 0, -sin yaw).
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const forwardX = -sinYaw;
  const forwardZ = -cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;
  const moveSpeed = getCurrentMoveSpeed();

  // --- Water submersion test ---
  // Sample the block at the player's body center (waist) and eye to detect water.
  const bodyTestY  = Math.floor(state.playerPos.y + playerConfig.height * 0.4);
  const eyeTestX   = Math.floor(state.playerPos.x);
  const eyeTestY   = Math.floor(state.playerPos.y + playerConfig.eyeHeight);
  const eyeTestZ   = Math.floor(state.playerPos.z);
  const bodyBlock  = world.get(eyeTestX, bodyTestY, eyeTestZ);
  const eyeBlock   = world.get(eyeTestX, eyeTestY,  eyeTestZ);
  state.inWater    = bodyBlock === WATER_BLOCK_TYPE;
  state.eyeInWater = eyeBlock  === WATER_BLOCK_TYPE;

  // Water movement constants
  const WATER_SWIM_SPEED        = moveSpeed * 0.55;
  const WATER_BUOYANCY_VEL      = 6.0;
  const WATER_GRAVITY_FACTOR    = 0.18;
  // Exponential vertical damping: half-life ~0.17s → terminal sink ~2-3 m/s.
  const WATER_VERTICAL_DAMP     = 4.0;
  const WATER_MAX_SINK          = 3.0;

  if (state.inWater) {
    // --- IN WATER: buoyancy + swim physics ---
    state.playerVel.x = (forwardX * forwardInput + rightX * strafeInput) * WATER_SWIM_SPEED;
    state.playerVel.z = (forwardZ * forwardInput + rightZ * strafeInput) * WATER_SWIM_SPEED;

    // Space swims upward regardless of onGround state.
    if (state.jumpQueued) {
      state.playerVel.y = WATER_BUOYANCY_VEL;
    } else {
      state.playerVel.y += playerConfig.gravity * WATER_GRAVITY_FACTOR * dtSeconds;
    }
    state.jumpQueued = false;

    // Exponential vertical damping + hard sink-speed cap.
    state.playerVel.y *= Math.exp(-WATER_VERTICAL_DAMP * dtSeconds);
    state.playerVel.y = Math.max(state.playerVel.y, -WATER_MAX_SINK);

    state.onGround = false;
    resolveAxis({
      axis: "x",
      delta: state.playerVel.x * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
    });
    resolveAxis({
      axis: "y",
      delta: state.playerVel.y * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
    });
    resolveAxis({
      axis: "z",
      delta: state.playerVel.z * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
    });
    // No fall damage when landing in water. Clamp downward velocity against floor.
    if (state.onGround && state.playerVel.y < 0) {
      state.playerVel.y = 0;
    }
  } else {
    // --- ON LAND: original physics (unchanged) ---
    state.playerVel.x = (forwardX * forwardInput + rightX * strafeInput) * moveSpeed;
    state.playerVel.z = (forwardZ * forwardInput + rightZ * strafeInput) * moveSpeed;
    state.playerVel.y += playerConfig.gravity * dtSeconds;
    const wasOnGround = state.onGround;
    const impactVelocityY = state.playerVel.y;
    let jumpedThisFrame = false;

    if (state.jumpQueued && state.onGround) {
      state.playerVel.y = playerConfig.jumpSpeed;
      state.onGround = false;
      state.recentAction = "Jumped";
      jumpedThisFrame = true;
      playJumpSound();
    }
    state.jumpQueued = false;

    state.onGround = false;
    const allowStepUp = wasOnGround && !jumpedThisFrame && playerConfig.stepHeight > 0;
    resolveAxis({
      axis: "x",
      delta: state.playerVel.x * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
      allowStepUp,
      stepHeight: playerConfig.stepHeight,
    });
    resolveAxis({
      axis: "y",
      delta: state.playerVel.y * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
    });
    resolveAxis({
      axis: "z",
      delta: state.playerVel.z * dtSeconds,
      state,
      world,
      playerRadius: playerConfig.radius,
      playerHeight: playerConfig.height,
      epsilon: simConfig.epsilon,
      allowStepUp,
      stepHeight: playerConfig.stepHeight,
    });

    if (!wasOnGround && state.onGround && impactVelocityY < -playerConfig.fallDamageSafeSpeed) {
      const overSpeed = Math.abs(impactVelocityY) - playerConfig.fallDamageSafeSpeed;
      const damage = overSpeed * playerConfig.fallDamageMultiplier;
      takeDamage(damage, "fall");
    }

    if (state.onGround && state.playerVel.y < 0) {
      state.playerVel.y = 0;
    }
  }

  // --- Underwater fog override ---
  // updateDayNight already set scene.fog to the sky/night color. If the camera eye
  // is inside water, override fog to a deep-blue tint and pull the draw distance in.
  // Restore normal fog as soon as the eye leaves water.
  if (state.eyeInWater) {
    scene.fog.color.copy(underwaterFogColor);
    scene.fog.near = UNDERWATER_FOG_NEAR;
    scene.fog.far  = UNDERWATER_FOG_FAR;
    scene.background.copy(underwaterFogColor);
  } else {
    // Restore normal fog distances (color was already set by updateDayNight).
    scene.fog.near = renderConfig.fogNear;
    scene.fog.far  = renderConfig.fogFar;
  }

  // FOV lerp toward sprint target. Fast enough to feel responsive but not snappy.
  state.targetFov = renderConfig.fov + (state.isSprinting ? SPRINT_FOV_BUMP : 0);
  const fovLerpAlpha = 1 - Math.exp(-FOV_LERP_RATE * dtSeconds);
  state.cameraFov += (state.targetFov - state.cameraFov) * fovLerpAlpha;

  // View bob advances proportional to ground speed; only while on the ground.
  const horizontalSpeed = Math.hypot(state.playerVel.x, state.playerVel.z);
  if (state.onGround && horizontalSpeed > 0.4) {
    const prevPhase = state.bobPhase;
    state.bobPhase += dtSeconds * BOB_BASE_FREQUENCY * (horizontalSpeed / playerConfig.moveSpeed);
    const targetAmp = Math.min(1, horizontalSpeed / playerConfig.moveSpeed);
    state.bobAmplitude += (targetAmp - state.bobAmplitude) * Math.min(1, dtSeconds * 12);
    // Footstep on each peak of the doubled-frequency vertical bob (sin(phase*2)
    // crosses zero positively every PI / 2 of bobPhase).
    const stepPeriod = Math.PI / 2;
    if (Math.floor(state.bobPhase / stepPeriod) !== Math.floor(prevPhase / stepPeriod)) {
      playStepSound();
    }
  } else {
    state.bobAmplitude += (0 - state.bobAmplitude) * Math.min(1, dtSeconds * 14);
  }

  clampPlayer();
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  updateFurnaceSimulation(deltaMs);
  updateHostileMobs(deltaMs);
  updateTorchLights(deltaMs);
  updateParticles(deltaMs);
  updateFallingBlocks();
  updateBranchEncounterState();
  updateObjectives(deltaMs);
  updateCameraTransform();
  updateTargetBlockFromCenter();
  refreshHud();
  updateCraftPanel();
  updateFurnacePanel();
  updateInventoryPanel();

  const now = performance.now();
  const autosaveDue = !isAutomationSession && now - lastAutosaveAt >= simConfig.autosaveIntervalMs;
  // Skip autosave while a save/load is in flight (race) or while the player is mid-break (would lose progress).
  if (autosaveDue && !saveInFlight && !state.breakProgress.targetKey) {
    lastAutosaveAt = now;
    saveGame("autosave");
  }
}

function render() {
  renderer.render(scene, camera);
}

function startGame() {
  if (state.mode === "playing") {
    return;
  }
  // Lazily create the AudioContext on the user gesture that starts the game so
  // browsers don't suspend it. Failing this just leaves audio silent — non-fatal.
  ensureAudio();
  state.mode = "playing";
  menu.classList.add("hidden");
  hud.classList.remove("hidden");
  saveControls.classList.remove("hidden");
  state.craftingOpen = false;
  state.furnaceOpen = false;
  state.activeFurnaceKey = null;
  state.inventoryOpen = false;
  state.inventoryTransferIndex = null;
  craftPanel.classList.add("hidden");
  furnacePanel.classList.add("hidden");
  inventoryPanel.classList.add("hidden");
  craftPanelSignature = "";
  furnacePanelSignature = "";
  inventoryPanelSignature = "";
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  state.keys.clear();
  state.jumpQueued = false;
  renderer.domElement.focus();
  state.recentAction = "Started game";
  updateObjectives(0, true);
  lastAutosaveAt = performance.now();
}

function togglePointerLock() {
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
    return;
  }
  if (renderer.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  if (app.requestFullscreen) {
    app.requestFullscreen().catch(() => {
      state.recentAction = "Fullscreen request blocked";
    });
  }
}

setupControls({
  windowObj: window,
  documentObj: document,
  renderer,
  startButton,
  state,
  hotbarSize: HOTBAR_SIZE,
  startGame,
  toggleFullscreen,
  regenerateWorld,
  togglePointerLock,
  onSelectHotbar: (slotIndex) => {
    state.selectedSlot = slotIndex;
    state.recentAction = `Selected ${getSelectedItemName()}`;
    markInventoryPanelDirty();
  },
  toggleCraftPanel,
  toggleInventoryPanel,
  toggleFurnacePanel,
  breakBlockAt: breakBlock,
  placeBlockAt: placeBlock,
  toNdc,
});

saveButton.addEventListener("click", () => {
  saveGame("manual");
});

loadButton.addEventListener("click", () => {
  loadGame();
});

newWorldButton.addEventListener("click", () => {
  createNewWorld();
});

inventoryPanel.addEventListener("click", (event) => {
  const slotButton = event.target.closest("[data-slot-index]");
  if (!slotButton) {
    return;
  }
  const slotIndex = Number(slotButton.dataset.slotIndex);
  onInventorySlotClick(slotIndex);
});

furnacePanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const itemId = button.dataset.itemId || null;
  onFurnacePanelAction(action, itemId);
});

window.addEventListener("pagehide", () => {
  saveGame("autosave");
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

let lastFrame = Number.NaN;

window.advanceTime = async (ms) => {
  useExternalTimeStep = true;
  const steps = Math.max(1, Math.round(ms / simConfig.fixedStepMs));
  const stepSeconds = ms / steps / 1000;
  for (let i = 0; i < steps; i += 1) {
    updateSimulation(stepSeconds);
  }
  render();
};

window.render_game_to_text = () => {
  const activeFurnace = state.activeFurnaceKey ? getFurnaceState(state.activeFurnaceKey, false) : null;
  const nearbyBlocks = collectNearbyBlocks();
  const nearbyCopperOre = nearbyBlocks.filter((entry) => entry.type === COPPER_ORE_BLOCK_TYPE).length;
  const specializationBonuses = getSpecializationBonuses();
  const itemBonuses = getSpecialItemBonuses();
  const combinedBonuses = getCombinedBonuses();
  const payload = {
    mode: state.mode,
    coordinates: "origin (0,0,0) at world corner; +x east/right, +y up, +z south/back",
    player: {
      x: Number(state.playerPos.x.toFixed(3)),
      y: Number(state.playerPos.y.toFixed(3)),
      z: Number(state.playerPos.z.toFixed(3)),
      vx: Number(state.playerVel.x.toFixed(3)),
      vy: Number(state.playerVel.y.toFixed(3)),
      vz: Number(state.playerVel.z.toFixed(3)),
      onGround: state.onGround,
      inWater: state.inWater,
      eyeInWater: state.eyeInWater,
      health: Number(state.health.toFixed(2)),
      maxHealth: state.maxHealth,
      moveSpeed: Number(getCurrentMoveSpeed().toFixed(3)),
    },
    view: {
      yaw: Number(state.yaw.toFixed(3)),
      pitch: Number(state.pitch.toFixed(3)),
      pointerLocked: state.pointerLocked,
    },
    dayNight: {
      cycleMs: simConfig.dayNightCycleMs,
      timeOfDayMs: Math.floor(state.timeOfDayMs),
      dayFactor: Number(state.dayFactor.toFixed(3)),
    },
    selectedBlock: getSelectedItemName(),
    selectedSlot: state.selectedSlot,
    hotbar: state.inventory.slice(0, HOTBAR_SIZE).map((slot) => (slot ? { ...slot } : null)),
    inventory: {
      open: state.inventoryOpen,
      transferIndex: state.inventoryTransferIndex,
      slots: state.inventory.map((slot) => (slot ? { ...slot } : null)),
    },
    crafting: {
      open: state.craftingOpen,
      nearWorkbench: isWorkbenchNearby(),
    },
    furnace: {
      open: state.furnaceOpen,
      activeKey: state.activeFurnaceKey,
      active: activeFurnace
        ? {
            inputItemId: activeFurnace.inputItemId,
            inputCount: activeFurnace.inputCount,
            fuelRemainingMs: Math.floor(activeFurnace.fuelRemainingMs),
            fuelBufferMs: Math.floor(activeFurnace.fuelBufferMs),
            progressMs: Math.floor(activeFurnace.progressMs),
            outputItemId: activeFurnace.outputItemId,
            outputCount: activeFurnace.outputCount,
          }
        : null,
      count: furnaceStates.size,
    },
    hostileMobs: {
      enabled: isHostileMobEnabled(),
      count: hostileMobs.length,
      entries: hostileMobs.map((mob) => ({
        id: mob.id,
        x: Number(mob.pos.x.toFixed(3)),
        y: Number(mob.pos.y.toFixed(3)),
        z: Number(mob.pos.z.toFixed(3)),
        health: mob.health,
        mode: mob.mode,
        chasing: mob.chasing,
      })),
      spawnDayFactorThreshold: hostileMobConfig.spawnDayFactorThreshold,
      dayFactor: Number(state.dayFactor.toFixed(3)),
    },
    combat: {
      baseMobDamage: playerBaseMobDamage + combinedBonuses.mobDamageBonus,
      selectedMobDamage: getSelectedMobDamage(),
      bestInventoryMobDamage: getBestMobDamageInInventory(),
      selectedItemId: getSelectedItemId(),
    },
    progression: {
      resources: {
        boneShard: countInventoryItem("bone_shard"),
        copperOre: countInventoryItem("copper_ore"),
        copperIngot: countInventoryItem("copper_ingot"),
      },
      hasTorch: countInventoryItem("torch") > 0,
      hasBladeUpgrade: countInventoryItem("copper_blade") > 0 || countInventoryItem("bone_blade") > 0,
      nearbyCopperOre,
      specialItems: {
        wardenTotem: countInventoryItem(SPECIAL_ITEM_WARDEN_TOTEM) > 0,
        spelunkerCompass: countInventoryItem(SPECIAL_ITEM_SPELUNKER_COMPASS) > 0,
        vanguardBlade: countInventoryItem("vanguard_blade") > 0,
        deepDelverPickaxe: countInventoryItem("deep_delver_pickaxe") > 0,
      },
    },
    bonuses: {
      specialization: { ...specializationBonuses },
      items: { ...itemBonuses },
      total: { ...combinedBonuses },
    },
    objectives: buildObjectivePayload(),
    torchLighting: {
      enabled: torchLightsEnabled,
      activeLights: activeTorchLights,
      torchBlocksNearby: activeTorchLights,
      scanRadius:
        (Number.isFinite(torchLightConfig.scanRadius) ? Math.max(1, Math.floor(torchLightConfig.scanRadius)) : 10) +
        combinedBonuses.torchScanRadiusBonus,
    },
    targetBlock: state.targetBlock,
    world: {
      seed: world.getSeed(),
      chunkSize: world.chunkSize,
      worldHeight: world.height,
      seaLevel: worldConfig.generation.seaLevel,
      activeRadius: world.activeRadius,
      loadedChunks: world.getLoadedChunkCount(),
      generatedChunks: world.getGeneratedChunkCount(),
      solidBlocks: world.getLoadedSolidBlocks(),
      editCount: world.getEditCount(),
    },
    nearbyBlocks,
    recentAction: state.recentAction,
  };
  return JSON.stringify(payload);
};

window.__exoCraftDebug = {
  ...(window.__exoCraftDebug || {}),
  spawnHostileMobNearPlayer: (distance = 2.2) => Boolean(spawnHostileMobNearPlayer(distance)),
  grantInventoryItem: (itemId, count = 1) => {
    if (typeof itemId !== "string" || !ITEM_DEFS[itemId]) {
      return 0;
    }
    const amount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
    const leftover = addItemToInventory(state.inventory, itemId, amount);
    const granted = amount - leftover;
    if (granted > 0) {
      markCraftPanelDirty();
      markFurnacePanelDirty();
      markInventoryPanelDirty();
      updateObjectives(0, true);
      refreshHud();
    }
    return granted;
  },
  clearHostileMobs: () => {
    clearHostileMobs();
    updateObjectives(0, true);
    return true;
  },
  defeatNearestHostileMob: (weaponItemId = getSelectedItemId()) => {
    if (hostileMobs.length <= 0) {
      return false;
    }
    removeHostileMobAt(0);
    rewardHostileMobDefeat(weaponItemId);
    markCraftPanelDirty();
    markInventoryPanelDirty();
    updateObjectives(0, true);
    return true;
  },
  setTimeOfDayMs: (timeMs) => {
    state.timeOfDayMs = normalizeTimeOfDayMs(timeMs);
    updateDayNight(0);
    updateObjectives(0, true);
    return state.timeOfDayMs;
  },
  scanExplorationStructures: (radius = 18) => scanExplorationStructures(radius),
  findNearestCopperOre: (radius = 26) => {
    const ore = findNearestCopperOre(radius);
    return ore
      ? { x: ore.x, y: ore.y, z: ore.z, distance: Number(Math.sqrt(ore.distanceSq).toFixed(3)) }
      : null;
  },
  findNearestDeepCopperOre: (radius = 26) => {
    const ore = findNearestDeepCopperOre(radius);
    return ore
      ? { x: ore.x, y: ore.y, z: ore.z, distance: Number(Math.sqrt(ore.distanceSq).toFixed(3)) }
      : null;
  },
  findNearestCavePocket: (radius = 24) => {
    const cave = findNearestCavePocket(radius);
    return cave
      ? { x: cave.x, y: cave.y, z: cave.z, roofY: cave.roofY, distance: Number(Math.sqrt(cave.distanceSq).toFixed(3)) }
      : null;
  },
  markCaveTorchPlacement: (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const tz = Math.floor(z);
    if (!isTorchPlacementInCave(tx, ty, tz)) {
      return false;
    }
    state.objectiveStats.caveTorchPlaced = true;
    registerCaveTorchProgress();
    updateObjectives(0, true);
    return true;
  },
  markDeepCopperMine: (x, y, z) => {
    let tx = Number.isFinite(x) ? Math.floor(x) : null;
    let ty = Number.isFinite(y) ? Math.floor(y) : null;
    let tz = Number.isFinite(z) ? Math.floor(z) : null;
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
      const ore = findNearestDeepCopperOre(42);
      if (!ore) {
        return false;
      }
      tx = ore.x;
      ty = ore.y;
      tz = ore.z;
    }
    if (world.get(tx, ty, tz) !== COPPER_ORE_BLOCK_TYPE || !isTorchPlacementInCave(tx, ty, tz)) {
      return false;
    }
    world.set(tx, ty, tz, 0);
    world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
    updateTargetBlockFromCenter();
    registerDeepCopperProgress();
    updateObjectives(0, true);
    return true;
  },
  completeCoreObjectives: () => {
    state.objectiveStats.copperOreCollected = true;
    state.objectiveStats.copperIngotSmelted = true;
    state.objectiveStats.copperBladeCrafted = true;
    state.objectiveStats.caveTorchPlaced = true;
    state.objectiveStats.copperBladeKills = Math.max(1, state.objectiveStats.copperBladeKills);
    updateObjectives(0, true);
    return buildObjectivePayload();
  },
  getBranchEncounter: () => {
    const site = ensureBranchEncounterSite(false);
    const encounter = getBranchEncounterState();
    return {
      type: encounter.type,
      stage: encounter.stage,
      site: site ? { ...site } : null,
    };
  },
  startBranchEncounter: (path = state.specialization.selected) => {
    if (path !== "combat" && path !== "explorer") {
      return false;
    }
    if (state.specialization.selected !== path || !state.specialization.completed) {
      return false;
    }
    const site = ensureBranchEncounterSite(false);
    if (!site) {
      return false;
    }
    state.playerPos.set(site.x, site.y, site.z);
    state.playerVel.set(0, 0, 0);
    const encounter = getBranchEncounterState();
    encounter.type = path;
    encounter.stage = "active";
    if (path === "combat") {
      let spawned = 0;
      while (spawned < BRANCH_LOOP_COMBAT_KILLS_REQUIRED) {
        const mob = spawnHostileMobAroundSite(site, 2.4 + spawned * 0.25) || spawnHostileMobNearPlayer(2.1 + spawned * 0.2);
        if (!mob) {
          break;
        }
        spawned += 1;
      }
    }
    updateCameraTransform();
    updateTargetBlockFromCenter();
    markTorchLightsDirty();
    updateTorchLights();
    updateObjectives(0, true);
    return true;
  },
  teleportPlayer: (x, y, z, yaw = state.yaw) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    state.playerPos.set(x, y, z);
    state.playerVel.set(0, 0, 0);
    state.onGround = false;
    if (Number.isFinite(yaw)) {
      state.yaw = yaw;
    }
    world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
    updateCameraTransform();
    updateTargetBlockFromCenter();
    markTorchLightsDirty();
    updateTorchLights();
    updateObjectives(0, true);
    return true;
  },
  setBlock: (x, y, z, type) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const tz = Math.floor(z);
    const result = world.set(tx, ty, tz, type);
    if (result) {
      world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
      updateTargetBlockFromCenter();
      updateTorchLights();
      if (type === FURNACE_BLOCK_TYPE) {
        getFurnaceState(toFurnaceKey(tx, ty, tz), true);
      }
      updateObjectives(0, true);
    }
    return result;
  },
  ensureWorkbenchNearby: () => {
    if (isWorkbenchNearby()) {
      return true;
    }
    const px = Math.floor(state.playerPos.x);
    const py = Math.floor(state.playerPos.y);
    const pz = Math.floor(state.playerPos.z);
    for (let y = py - 1; y <= py + 1; y += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dz === 0) {
            continue;
          }
          const x = px + dx;
          const z = pz + dz;
          if (world.get(x, y, z) !== 0) {
            continue;
          }
          if (world.get(x, y - 1, z) === 0) {
            continue;
          }
          if (playerInsideBlock(x, y, z)) {
            continue;
          }
          if (!world.set(x, y, z, CRAFTING_TABLE_BLOCK_TYPE)) {
            continue;
          }
          world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
          updateTargetBlockFromCenter();
          updateObjectives(0, true);
          markCraftPanelDirty();
          return true;
        }
      }
    }
    return false;
  },
  setSpecialization: (path) => {
    const selected = path === "combat" || path === "explorer" ? path : null;
    if (!selected) {
      return false;
    }
    const changed = selectSpecialization(selected);
    updateObjectives(0, true);
    return changed || state.specialization.selected === selected;
  },
  getObjectives: () => buildObjectivePayload(),
};

function frame(now) {
  if (useExternalTimeStep) {
    lastFrame = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Number.isFinite(lastFrame) ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  updateSimulation(dt);
  render();
  requestAnimationFrame(frame);
}

respawnPlayer({ healToMax: true });
updateSimulation(0);
render();
requestAnimationFrame(frame);
