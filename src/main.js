import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { createGameConfig } from "./game/config";
import { Sky } from "./game/sky";
import { setupControls } from "./game/controls";
import { updateHud, updateF3Overlay } from "./game/hud";
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
  rollExtraDrops,
  getFuelValue,
  getBlockHardness,
  getBreakPower,
  getItemName,
  getMobDamage,
  getPlaceableBlockType,
  getSelectedSlot,
  getSmeltingRecipeByInput,
  transferInventoryStack,
  getFoodDef,
  decrementDurability,
  hasDurability,
  TOOL_MAX_DURABILITY,
  // Wave 8 — harvest-level gating
  ORE_HARVEST_LEVEL,
  getToolTier,
  // Wave 10 — shaped crafting + armor
  matchGridRecipe,
  ARMOR_SLOTS,
  getArmorSlot,
  getTotalDefense,
  ARMOR_DEFENSE,
} from "./game/survival";
import { MAX_HUNGER, MAX_SATURATION, tickHunger, applyFood, JUMP_HUNGER_COST } from "./game/hunger";
import { createBlockMaterials, VoxelWorld, dayFactorUniform } from "./game/world";
import {
  MOB_TYPES,
  pickRandomMobType,
  getMobTypeDef,
  rollMobDrops,
  createArrowMesh,
} from "./game/mobs";
import {
  PASSIVE_MOB_TYPES,
  pickRandomPassiveMobType,
  getPassiveMobTypeDef,
  rollPassiveMobDrops,
} from "./game/passiveMobs";
import {
  createAtlasTexture,
  createCrackTextures,
  CRACK_STAGE_COUNT,
  createSunTexture,
  createMoonTexture,
  FLORA_BLOCK_IDS,
} from "./game/textures";
import {
  ensureAudio as _ensureAudioModule,
  playBreakSound,
  playPlaceSound,
  playStepSoundForBlock,
  playJumpSound,
  playHurtSound,
  updateAudio,
  setMusicEnabled,
} from "./game/audio";

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
// Wave 8 block type ids
const COAL_ORE_BLOCK_TYPE     = 16;
const IRON_ORE_BLOCK_TYPE     = 17;
const GOLD_ORE_BLOCK_TYPE     = 18;
const DIAMOND_ORE_BLOCK_TYPE  = 19;
const REDSTONE_ORE_BLOCK_TYPE = 20;
const LAVA_BLOCK_TYPE         = 21;
// Wave 10 — chest
const CHEST_BLOCK_TYPE        = 22;
const CHEST_SIZE              = 27;
// Wave 11 — flora (cross-quad, passable, no collision)
const TALL_GRASS_BLOCK_TYPE   = 23;
const FLOWER_BLOCK_TYPE       = 24;
const SAPLING_BLOCK_TYPE      = 25;
const CHEST_INTERACT_RADIUS   = 6;
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
// Wave 10 — chest state: key → 27-slot inventory array
const chestStates = new Map();

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
const inventoryArmorSlotsEl = document.querySelector("#inventory-armor-slots");
const inventoryHotbarGrid = document.querySelector("#inventory-hotbar-grid");
const inventoryBackpackGrid = document.querySelector("#inventory-backpack-grid");
const damageFlashEl = document.querySelector("#damage-flash");
// Wave 10 — crafting grid elements
const craftGridEl = document.querySelector("#craft-grid");
const craftResultSlotEl = document.querySelector("#craft-result-slot");
const craftInvGridEl = document.querySelector("#craft-inv-grid");
// Wave 10 — chest panel elements
const chestPanel = document.querySelector("#chest-panel");
const chestContext = document.querySelector("#chest-context");
const chestStorageEl = document.querySelector("#chest-storage");
const chestInvGridEl = document.querySelector("#chest-inv-grid");

const renderer = new THREE.WebGLRenderer({ antialias: false }); // MSAA off — FXAA post handles AA
renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderConfig.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
// Tone mapping: ACES Filmic at exposure 1.0 gives a natural film response without
// blowing out the bright daytime sky or crushing night/caves. OutputPass in the
// composer chain applies this alongside the sRGB conversion.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// Leave outputColorSpace at Three's default (SRGBColorSpace). OutputPass keys its
// sRGB gamma-encoding transfer (SRGB_TRANSFER define) off this property, so setting
// it to LinearSRGBColorSpace would skip the encoding and write linear light to the
// display — causing a dark, washed-out image. Render targets stay linear via
// ColorManagement.workingColorSpace + the composer's HalfFloat targets regardless.
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
// Wave 8: lava fog — orange-red tint, very short visibility.
const lavaFogColor = new THREE.Color(0x8b1a00);
const LAVA_FOG_NEAR = 0.5;
const LAVA_FOG_FAR  = 4;
// Lava damage: 2 HP per second (4× lava ticks per second at 60fps).
const LAVA_DAMAGE_PER_SECOND = 2;
// Accumulator for lava damage (fractional damage per tick).
let lavaAccumSec = 0;
const dayGroundColor = new THREE.Color(lightingConfig.hemisphere.groundColor);
const nightGroundColor = new THREE.Color(0x1b2029);
const daySunColor = new THREE.Color(lightingConfig.sun.color);
const nightSunColor = new THREE.Color(0x516a91);
const dayHemiSkyColor = new THREE.Color(lightingConfig.hemisphere.skyColor);
const nightHemiSkyColor = new THREE.Color(0x304464);

const camera = new THREE.PerspectiveCamera(renderConfig.fov, window.innerWidth / window.innerHeight, renderConfig.near, renderConfig.far);
camera.rotation.order = "YXZ";

// ── Post-processing chain ────────────────────────────────────────────────────
// RenderPass → UnrealBloomPass (runs at half screen res internally) → OutputPass (ACES+sRGB) → ShaderPass(FXAA)
//
// Order rationale:
//   • UnrealBloomPass runs in linear HDR space (before tone mapping) so its
//     luminance threshold correctly isolates only emissive/very-bright pixels.
//     At threshold=0.92 only the sun disc, lava, and torch halos exceed the
//     cutoff; lit daytime terrain (~0.3–0.6 luma) is untouched.
//   • OutputPass converts linear HDR → ACES Filmic → sRGB in one pass.
//   • FXAAShader runs last on the sRGB image (it needs perceptual luma).
//     It's tuned conservatively (resolution uniform set to 1/size) so block
//     edges smooth slightly without blurring pixel-art textures into mush.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom: UnrealBloomPass internally halves the supplied resolution, so pass the full
// screen size here. This matches what composer.setSize feeds on resize, giving a
// consistent half-screen bloom resolution from first load onwards.
// threshold=0.92 means only things above ~92% of max luminance bloom.
// strength=0.28 and radius=0.45 give a soft halo without washing out the scene.
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.28, 0.45, 0.92,
);
composer.addPass(bloomPass);

// OutputPass: applies renderer.toneMapping (ACES Filmic) + sRGB color space conversion.
// Must come before FXAA because FXAA expects sRGB input for correct luma detection.
composer.addPass(new OutputPass());

// FXAA: mild antialiasing on the final sRGB frame. Resolution uniforms tell the
// shader the reciprocal pixel size so it samples neighbours correctly.
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms["resolution"].value.set(
  1 / (window.innerWidth * renderer.getPixelRatio()),
  1 / (window.innerHeight * renderer.getPixelRatio()),
);
composer.addPass(fxaaPass);
// ────────────────────────────────────────────────────────────────────────────

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

// Wave 6: gradient skydome + stars + clouds.
const sky = new Sky(scene);

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

// Wave 9 — passive animal group
const passiveMobGroup = new THREE.Group();
scene.add(passiveMobGroup);

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

// ----- Audio (Wave 11): delegated to game/audio.js -----
// The module handles ensureAudio / context creation internally.
// We re-export ensureAudio under the old name so startGame() still works.
function ensureAudio() {
  return _ensureAudioModule();
}
// playBreakSound, playPlaceSound, playJumpSound, playHurtSound — imported from audio.js above.
// playStepSound alias kept for any legacy call sites:
function playStepSound() {
  playStepSoundForBlock(0);
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
  // Wave 10 — crafting grid (9 slots, 3x3; 2x2 limit enforced when no workbench)
  craftingGrid: new Array(9).fill(null),
  // Wave 10 — worn armor: { head, chest, legs, feet } each null or itemId string
  wornArmor: { head: null, chest: null, legs: null, feet: null },
  // Wave 10 — chest UI
  chestOpen: false,
  activeChestKey: null,
  // transferContext tracks which panel a pending transfer originated from.
  // Values: null | 'inventory' | 'grid' | 'armor' | 'chest-storage' | 'chest-inv'
  transferContext: null,
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
  // Wave 7 — hunger / saturation / starvation accumulator
  hunger: MAX_HUNGER,
  maxHunger: MAX_HUNGER,
  saturation: 5,          // start with a little saturation (like Minecraft)
  starveAccumSec: 0,
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
  // Wave 8: lava submersion state
  inLava: false,        // true when player body is in lava
  eyeInLava: false,     // true when the camera eye voxel is lava
  // Wave 11 — combat weight
  playerSwingCooldownRemaining: 0, // seconds remaining before next swing is allowed
  // Wave 11 — player knockback timer: while > 0, input doesn't overwrite horizontal vel
  playerKnockbackRemaining: 0,
  // Wave 11 — F3 debug overlay
  f3Visible: false,
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
// Wave 10
let chestPanelSignature = "";
let chestPanelNeedsRefresh = true;
let mobSpawnAccumulatorMs = 0;
let hostileMobIdCounter = 1;
const hostileMobs = [];

// Wave 9 — passive animals
let passiveMobIdCounter = 1;
const passiveMobs = [];
let passiveSpawnAccumulatorMs = 0;
const PASSIVE_MOB_MAX_COUNT = 12;
const PASSIVE_MOB_SPAWN_INTERVAL_MS = 3200;
const PASSIVE_MOB_SPAWN_CHANCE = 0.55;
const PASSIVE_MOB_SPAWN_MIN_DIST = 10;
const PASSIVE_MOB_SPAWN_MAX_DIST = 26;
const PASSIVE_MOB_SPAWN_DAY_THRESHOLD = 0.30;  // only spawn when dayFactor > this
const PASSIVE_MOB_DESPAWN_DISTANCE = 40;

// Wave 9 — arrow projectiles (skeleton ranged attack)
const arrowProjectiles = [];     // { mesh, pos, dir, speed, damage, lifeMs }
const ARROW_SPEED = 14;          // blocks/sec
const ARROW_DAMAGE = 2;
const ARROW_MAX_LIFE_MS = 3000;
const ARROW_HIT_RADIUS = 0.5;
const SKELETON_SHOOT_RANGE = 14;
const SKELETON_SHOOT_COOLDOWN_MS = 2800;
const SKELETON_MIN_DISTANCE = 5;  // skeleton backs away if player is closer than this

// Wave 9 — creeper explosion state (per mob, stored in mob.creeperState)
const CREEPER_FUSE_RANGE = 3.0;       // start fuse when within this distance
const CREEPER_EXPLOSION_DELAY_MS = 1800;
const CREEPER_EXPLOSION_RADIUS = 3;   // blast block radius
const CREEPER_EXPLOSION_DAMAGE = 8;
const CREEPER_FLASH_INTERVAL_MS = 200;
let objectiveHudSignature = "";
let objectiveWaypointNeedsRefresh = true;
let objectiveWaypointScanAccumulatorMs = OBJECTIVE_WAYPOINT_RESCAN_MS;
let objectiveMarkerAnimMs = 0;

function blockName(type) {
  return BLOCK_BY_ID.get(type)?.name || `Block ${type}`;
}

function refreshHud() {
  updateHud({ state, world, statsEl, hotbarEl });
  // Wave 11 — F3 debug overlay (no-op when f3Visible=false, cheap signature guard inside).
  // Wave 12 — pass current biome so F3 displays it without a redundant biomeAt call inside hud.
  const _f3Biome = typeof world.biomeAt === "function"
    ? world.biomeAt(Math.floor(state.playerPos.x), Math.floor(state.playerPos.z))
    : null;
  updateF3Overlay({ state, world, fps: _fpsEma, chunkSize: worldConfig.chunk.size, biome: _f3Biome });
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

  // Wave 6: update sky dome, stars, and clouds. eyeInWater is read here so the
  // sky hides itself whenever wave-5 underwater fog takes over.
  sky.update(dayFactor, state.timeOfDayMs, camera.position, state.eyeInWater);
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
  const armor = ARMOR_SLOTS.map((s) => state.wornArmor[s] || "_").join("|");
  const ctx = state.transferContext ?? "-";
  return `${state.selectedSlot}|${transfer}|${ctx}|${inventoryMutationCounter}|${armor}`;
}

function craftingGridSignature() {
  return state.craftingGrid.map((s) => (s ? `${s.itemId}x${s.count}` : "_")).join("|");
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
  chestPanelNeedsRefresh = true;
  inventoryMutationCounter += 1;
  invalidateBonusCache();
}

function markChestPanelDirty() {
  chestPanelNeedsRefresh = true;
}

function serializeInventory() {
  return state.inventory.map((slot) => {
    if (!slot) return null;
    const entry = { itemId: slot.itemId, count: slot.count };
    // Persist durability for tool items.
    if (hasDurability(slot.itemId) && Number.isFinite(slot.durability)) {
      entry.durability = slot.durability;
    }
    return entry;
  });
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
    const entry = { itemId: slot.itemId, count: Math.min(MAX_STACK, Math.floor(slot.count)) };
    // Restore durability for tool items; default to max if missing (forward-compat).
    if (hasDurability(slot.itemId)) {
      entry.count = 1; // tools are always count:1
      const maxDur = TOOL_MAX_DURABILITY[slot.itemId] ?? 1;
      entry.durability = Number.isFinite(slot.durability) && slot.durability > 0
        ? Math.min(maxDur, slot.durability)
        : maxDur;
    }
    state.inventory[i] = entry;
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

// ---------------------------------------------------------------------------
// Wave 10 — Chest state helpers
// ---------------------------------------------------------------------------

function toChestKey(x, y, z) {
  return `${x},${y},${z}`;
}

function fromChestKey(key) {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

function createDefaultChestInventory() {
  return new Array(CHEST_SIZE).fill(null);
}

function getChestState(key, createIfMissing = true) {
  let chest = chestStates.get(key);
  if (!chest && createIfMissing) {
    chest = createDefaultChestInventory();
    chestStates.set(key, chest);
  }
  return chest || null;
}

function serializeChests() {
  const serialized = [];
  for (const [key, slots] of chestStates.entries()) {
    const { x, y, z } = fromChestKey(key);
    if (world.get(x, y, z) !== CHEST_BLOCK_TYPE) {
      continue;
    }
    serialized.push({
      x, y, z,
      slots: slots.map((slot) => {
        if (!slot) return null;
        const entry = { itemId: slot.itemId, count: slot.count };
        if (hasDurability(slot.itemId) && Number.isFinite(slot.durability)) {
          entry.durability = slot.durability;
        }
        return entry;
      }),
    });
  }
  return serialized;
}

function loadChests(serializedChests) {
  chestStates.clear();
  if (!Array.isArray(serializedChests)) {
    return;
  }
  for (const raw of serializedChests) {
    if (
      !raw ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y) ||
      !Number.isFinite(raw.z) ||
      world.get(raw.x, raw.y, raw.z) !== CHEST_BLOCK_TYPE
    ) {
      continue;
    }
    const slots = createDefaultChestInventory();
    if (Array.isArray(raw.slots)) {
      for (let i = 0; i < CHEST_SIZE && i < raw.slots.length; i += 1) {
        const slot = raw.slots[i];
        if (!slot || typeof slot.itemId !== "string" || !ITEM_DEFS[slot.itemId] || !Number.isFinite(slot.count) || slot.count <= 0) {
          continue;
        }
        const entry = { itemId: slot.itemId, count: Math.min(MAX_STACK, Math.floor(slot.count)) };
        if (hasDurability(slot.itemId)) {
          entry.count = 1;
          const maxDur = TOOL_MAX_DURABILITY[slot.itemId] ?? 1;
          entry.durability = Number.isFinite(slot.durability) && slot.durability > 0
            ? Math.min(maxDur, slot.durability)
            : maxDur;
        }
        slots[i] = entry;
      }
    }
    chestStates.set(toChestKey(raw.x, raw.y, raw.z), slots);
  }
}

function isChestAccessible(key) {
  if (!key) return false;
  const { x, y, z } = fromChestKey(key);
  if (world.get(x, y, z) !== CHEST_BLOCK_TYPE) return false;
  const dx = x + 0.5 - state.playerPos.x;
  const dy = y + 0.5 - state.playerPos.y;
  const dz = z + 0.5 - state.playerPos.z;
  return Math.hypot(dx, dy, dz) <= CHEST_INTERACT_RADIUS;
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

function createHostileMob(position, saved = null, forcedType = null) {
  // Wave 9: pick type — from save, forced arg, or random weighted
  const typeId = (typeof saved?.mobType === "string" && MOB_TYPES[saved.mobType])
    ? saved.mobType
    : (typeof forcedType === "string" && MOB_TYPES[forcedType])
      ? forcedType
      : pickRandomMobType();

  const typeDef = getMobTypeDef(typeId);
  const mesh = typeDef.createMesh();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  hostileMobGroup.add(mesh);

  const id = Number.isFinite(saved?.id) ? Math.max(1, Math.floor(saved.id)) : hostileMobIdCounter;
  hostileMobIdCounter = Math.max(hostileMobIdCounter, id + 1);

  const mob = {
    id,
    mobType: typeId,
    health: Number.isFinite(saved?.health) ? Math.max(1, Math.floor(saved.health)) : typeDef.maxHealth,
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
    // Per-type extra state
    skeletonShootCooldownMs: 0,
    creeperState: null,   // null | { fuseMs, flashing }
  };
  // Tag every child mesh with this mob's id so raycaster can find it
  mesh.traverse((child) => { if (child.isMesh) child.userData.mobId = id; });
  mesh.userData.mobId = id;
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
    mobType: mob.mobType || "zombie",
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
  const configStep = Number.isFinite(hostileMobConfig.maxStepHeight) ? hostileMobConfig.maxStepHeight : 1.1;
  return tryMoveHostileMobWithStep(mob, dirX, dirZ, moveDistance, configStep);
}

function tryMoveHostileMobWithStep(mob, dirX, dirZ, moveDistance, maxStep) {
  if (moveDistance <= 0) {
    return false;
  }
  const nextX = mob.pos.x + dirX * moveDistance;
  const nextZ = mob.pos.z + dirZ * moveDistance;
  const walkY = isMobSpawnColumnWalkable(nextX, nextZ);
  if (!Number.isFinite(walkY)) {
    return false;
  }
  if (Math.abs(walkY - mob.pos.y) > maxStep) {
    return false;
  }
  mob.pos.x = nextX;
  mob.pos.z = nextZ;
  mob.pos.y = walkY;
  return true;
}

// ---------------------------------------------------------------------------
// Wave 9 — Arrow projectiles (skeleton ranged attack)
// ---------------------------------------------------------------------------

function spawnArrow(originPos, dirX, dirZ) {
  const mesh = createArrowMesh();
  // Aim slightly upward (parabola approximation: just flat for short range)
  mesh.position.set(originPos.x, originPos.y + 0.6, originPos.z);
  // Rotate mesh to face direction
  mesh.rotation.y = Math.atan2(dirX, dirZ);
  scene.add(mesh);
  arrowProjectiles.push({
    mesh,
    pos: new THREE.Vector3(originPos.x, originPos.y + 0.6, originPos.z),
    dirX,
    dirZ,
    speed: ARROW_SPEED,
    damage: ARROW_DAMAGE,
    lifeMs: ARROW_MAX_LIFE_MS,
  });
}

function updateArrowProjectiles(deltaMs) {
  const dtSeconds = deltaMs / 1000;
  for (let i = arrowProjectiles.length - 1; i >= 0; i -= 1) {
    const arrow = arrowProjectiles[i];
    arrow.lifeMs -= deltaMs;
    if (arrow.lifeMs <= 0) {
      scene.remove(arrow.mesh);
      arrowProjectiles.splice(i, 1);
      continue;
    }
    const travel = arrow.speed * dtSeconds;
    arrow.pos.x += arrow.dirX * travel;
    arrow.pos.z += arrow.dirZ * travel;
    // Check hit with player
    const dx = arrow.pos.x - state.playerPos.x;
    const dz = arrow.pos.z - state.playerPos.z;
    const dy = arrow.pos.y - (state.playerPos.y + 0.9);
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= ARROW_HIT_RADIUS * ARROW_HIT_RADIUS) {
      takeDamage(arrow.damage, "skeleton arrow", arrow.pos);
      scene.remove(arrow.mesh);
      arrowProjectiles.splice(i, 1);
      continue;
    }
    // Check block collision
    const bx = Math.floor(arrow.pos.x);
    const by = Math.floor(arrow.pos.y);
    const bz = Math.floor(arrow.pos.z);
    if (world.get(bx, by, bz) !== 0) {
      scene.remove(arrow.mesh);
      arrowProjectiles.splice(i, 1);
      continue;
    }
    arrow.mesh.position.copy(arrow.pos);
  }
}

// ---------------------------------------------------------------------------
// Wave 9 — Creeper explosion
// ---------------------------------------------------------------------------

// Throttle block edits: collect positions then apply in small batches so we
// don't stall the frame.  The blast is small (r=3, ~113 blocks max) so we
// apply all at once — the existing world.set path handles markDirty + edits.
function triggerCreeperExplosion(mob) {
  const cx = Math.floor(mob.pos.x);
  const cy = Math.floor(mob.pos.y);
  const cz = Math.floor(mob.pos.z);
  const r = CREEPER_EXPLOSION_RADIUS;
  const rSq = r * r;

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx * dx + dy * dy + dz * dz > rSq) continue;
        const bx = cx + dx;
        const by = cy + dy;
        const bz = cz + dz;
        const type = world.get(bx, by, bz);
        // Don't remove bedrock, liquids (water=15, lava=21), or out-of-bounds
        if (type === 0 || type === 13 || type === 15 || type === 21 || !world.isWithinVerticalBounds(by)) continue;
        world.set(bx, by, bz, 0);
      }
    }
  }

  // Radial damage to player
  const pdx = state.playerPos.x - mob.pos.x;
  const pdy = state.playerPos.y - mob.pos.y;
  const pdz = state.playerPos.z - mob.pos.z;
  const playerDistSq = pdx * pdx + pdy * pdy + pdz * pdz;
  const blastRadiusSq = (r + 1.5) * (r + 1.5);
  if (playerDistSq <= blastRadiusSq) {
    const falloff = 1 - Math.sqrt(playerDistSq) / (r + 1.5);
    takeDamage(Math.max(1, Math.floor(CREEPER_EXPLOSION_DAMAGE * falloff)), "creeper explosion", mob.pos);
  }

  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  state.recentAction = "Creeper exploded!";
}

// ---------------------------------------------------------------------------
// Wave 9 — Passive animal system
// ---------------------------------------------------------------------------

function createPassiveMob(position, saved = null, forcedType = null) {
  const typeId = (typeof saved?.mobType === "string" && PASSIVE_MOB_TYPES[saved.mobType])
    ? saved.mobType
    : (typeof forcedType === "string" && PASSIVE_MOB_TYPES[forcedType])
      ? forcedType
      : pickRandomPassiveMobType();

  const typeDef = getPassiveMobTypeDef(typeId);
  const mesh = typeDef.createMesh();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  passiveMobGroup.add(mesh);

  const id = Number.isFinite(saved?.id) ? Math.max(1, Math.floor(saved.id)) : passiveMobIdCounter;
  passiveMobIdCounter = Math.max(passiveMobIdCounter, id + 1);

  const mob = {
    id,
    mobType: typeId,
    health: Number.isFinite(saved?.health) ? Math.max(1, Math.floor(saved.health)) : typeDef.maxHealth,
    pos: new THREE.Vector3(position.x, position.y, position.z),
    mesh,
    wanderAngle: Number.isFinite(saved?.wanderAngle) ? saved.wanderAngle : Math.random() * Math.PI * 2,
    wanderTimerMs: Number.isFinite(saved?.wanderTimerMs)
      ? Math.max(0, saved.wanderTimerMs)
      : 800 + Math.random() * 2400,
  };
  mesh.traverse((child) => { if (child.isMesh) child.userData.passiveMobId = id; });
  mesh.userData.passiveMobId = id;
  mesh.position.copy(mob.pos);
  passiveMobs.push(mob);
  return mob;
}

function removePassiveMobAt(index) {
  if (index < 0 || index >= passiveMobs.length) return null;
  const [mob] = passiveMobs.splice(index, 1);
  if (mob) passiveMobGroup.remove(mob.mesh);
  return mob || null;
}

function clearPassiveMobs() {
  while (passiveMobs.length > 0) {
    const mob = passiveMobs.pop();
    passiveMobGroup.remove(mob.mesh);
  }
  passiveMobIdCounter = 1;
  passiveSpawnAccumulatorMs = 0;
}

function serializePassiveMobs() {
  return passiveMobs.slice(0, 20).map((mob) => ({
    id: mob.id,
    mobType: mob.mobType,
    x: Number(mob.pos.x.toFixed(3)),
    y: Number(mob.pos.y.toFixed(3)),
    z: Number(mob.pos.z.toFixed(3)),
    health: mob.health,
    wanderAngle: Number(mob.wanderAngle.toFixed(4)),
    wanderTimerMs: Math.floor(mob.wanderTimerMs),
  }));
}

function loadPassiveMobs(serializedMobs) {
  clearPassiveMobs();
  if (!Array.isArray(serializedMobs)) return;
  for (const raw of serializedMobs) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) continue;
    if (passiveMobs.length >= PASSIVE_MOB_MAX_COUNT) break;
    const y = isMobSpawnColumnWalkable(raw.x, raw.z);
    if (!Number.isFinite(y)) continue;
    createPassiveMob({ x: raw.x, y, z: raw.z }, raw);
  }
}

function maybeSpawnPassiveMob() {
  if (state.dayFactor < PASSIVE_MOB_SPAWN_DAY_THRESHOLD) return;
  if (passiveMobs.length >= PASSIVE_MOB_MAX_COUNT) return;
  if (Math.random() > PASSIVE_MOB_SPAWN_CHANCE) return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = PASSIVE_MOB_SPAWN_MIN_DIST + Math.random() * (PASSIVE_MOB_SPAWN_MAX_DIST - PASSIVE_MOB_SPAWN_MIN_DIST);
    const x = state.playerPos.x + Math.sin(angle) * dist;
    const z = state.playerPos.z - Math.cos(angle) * dist;
    const y = isMobSpawnColumnWalkable(x, z);
    if (!Number.isFinite(y)) continue;
    // Must land on grass (block type 1)
    const groundType = world.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z));
    if (groundType !== 1) continue;
    let tooClose = false;
    for (const mob of passiveMobs) {
      const dx = mob.pos.x - x; const dz = mob.pos.z - z;
      if (dx * dx + dz * dz < 4) { tooClose = true; break; }
    }
    if (tooClose) continue;
    createPassiveMob({ x, y, z });
    return;
  }
}

function updatePassiveMobs(deltaMs) {
  if (state.mode !== "playing") return;
  if (deltaMs <= 0) return;

  // Spawn check
  passiveSpawnAccumulatorMs += deltaMs;
  while (passiveSpawnAccumulatorMs >= PASSIVE_MOB_SPAWN_INTERVAL_MS) {
    passiveSpawnAccumulatorMs -= PASSIVE_MOB_SPAWN_INTERVAL_MS;
    maybeSpawnPassiveMob();
  }

  const dtSeconds = deltaMs / 1000;
  for (let i = passiveMobs.length - 1; i >= 0; i -= 1) {
    const mob = passiveMobs[i];

    // Despawn if far away
    const dx = mob.pos.x - state.playerPos.x;
    const dz = mob.pos.z - state.playerPos.z;
    if (dx * dx + dz * dz > PASSIVE_MOB_DESPAWN_DISTANCE * PASSIVE_MOB_DESPAWN_DISTANCE) {
      removePassiveMobAt(i);
      continue;
    }

    // Despawn at night
    if (state.dayFactor < 0.20 && Math.random() < 0.004 * dtSeconds * 60) {
      removePassiveMobAt(i);
      continue;
    }

    // Wander
    const typeDef = getPassiveMobTypeDef(mob.mobType);
    const speed = typeDef.speed ?? 1.2;
    mob.wanderTimerMs -= deltaMs;
    if (mob.wanderTimerMs <= 0) {
      mob.wanderTimerMs = 600 + Math.random() * 2200;
      mob.wanderAngle = Math.random() * Math.PI * 2;
    }
    const dirX = Math.sin(mob.wanderAngle);
    const dirZ = -Math.cos(mob.wanderAngle);
    const moved = tryMoveHostileMobWithStep(mob, dirX, dirZ, speed * dtSeconds, 1.1);
    if (!moved) mob.wanderTimerMs = 0;

    mob.mesh.position.copy(mob.pos);
  }
}

function tryHitPassiveMob(ndcX = 0, ndcY = 0) {
  if (passiveMobs.length === 0) return false;
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(passiveMobGroup.children, true);
  if (hits.length === 0) return false;
  const maxReach = Number.isFinite(worldConfig.maxReach) ? worldConfig.maxReach : 6;
  const hit = hits.find((e) => e.distance <= maxReach);
  if (!hit) return false;
  const blockingHit = hitTest(ndcX, ndcY, maxReach);
  if (blockingHit && blockingHit.distance + 0.03 < hit.distance) return false;
  const passiveMobId = hit.object?.userData?.passiveMobId;
  if (!Number.isFinite(passiveMobId)) return false;
  const index = passiveMobs.findIndex((m) => m.id === passiveMobId);
  if (index < 0) return false;
  const playerDamage = getSelectedMobDamage();
  const mob = passiveMobs[index];
  mob.health -= Math.max(1, Math.floor(playerDamage));
  decrementDurability(state.inventory, state.selectedSlot, 1);
  if (mob.health <= 0) {
    const mobTypeId = mob.mobType;
    removePassiveMobAt(index);
    // Award drops
    const drops = rollPassiveMobDrops(mobTypeId);
    const granted = [];
    for (const drop of drops) {
      const leftover = addItemToInventory(state.inventory, drop.itemId, drop.count);
      const got = drop.count - leftover;
      if (got > 0) granted.push(`${got} ${getItemName(drop.itemId)}`);
    }
    state.recentAction = granted.length > 0
      ? `Defeated ${mobTypeId} +${granted.join(", ")}`
      : `Defeated ${mobTypeId}`;
    markCraftPanelDirty();
    markInventoryPanelDirty();
  } else {
    state.recentAction = `Hit ${mob.mobType} (${mob.health} hp)`;
    markInventoryPanelDirty();
  }
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

    // --- Zombie: burn in direct daylight ---
    if (mob.mobType === "zombie" && state.dayFactor > 0.7) {
      const bx = Math.floor(mob.pos.x);
      const by = Math.floor(mob.pos.y);
      const bz = Math.floor(mob.pos.z);
      // Check that sky is unobstructed above
      let exposed = true;
      for (let sy = by + 1; sy < Math.min(world.height, by + 20); sy += 1) {
        if (world.get(bx, sy, bz) !== 0) { exposed = false; break; }
      }
      if (exposed) {
        mob.health -= (1.5 * dtSeconds);
        if (mob.health <= 0) {
          const killWeapon = "zombie_burn";
          removeHostileMobAt(i);
          rewardHostileMobDefeat(killWeapon, "zombie");
          markCraftPanelDirty();
          markInventoryPanelDirty();
          continue;
        }
      }
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

    // --- Per-type speed overrides ---
    const typeDef = getMobTypeDef(mob.mobType);
    const typeWanderSpeed = typeDef.speed?.wander ?? wanderSpeed;
    const typeChaseSpeed  = typeDef.speed?.chase  ?? chaseSpeed;

    let dirX = 0;
    let dirZ = 0;
    let speed = typeWanderSpeed;

    // --- Creeper: special approach/fuse/explode AI ---
    if (mob.mobType === "creeper") {
      if (mob.creeperState) {
        // Fuse is lit — count down, keep approaching slowly
        mob.creeperState.fuseMs -= deltaMs;
        mob.creeperState.flashTimer = (mob.creeperState.flashTimer || 0) + deltaMs;
        // Visual flash: toggle emissive intensity on all child meshes
        if (mob.creeperState.flashTimer > CREEPER_FLASH_INTERVAL_MS) {
          mob.creeperState.flashTimer = 0;
          mob.creeperState.flashing = !mob.creeperState.flashing;
          mob.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material.emissiveIntensity = mob.creeperState.flashing ? 0.8 : 0.1;
            }
          });
        }
        // Explode
        if (mob.creeperState.fuseMs <= 0) {
          triggerCreeperExplosion(mob);
          removeHostileMobAt(i);
          continue;
        }
        // If player moves away reset fuse
        if (planarDistance > CREEPER_FUSE_RANGE + 1.5) {
          mob.creeperState = null;
          mob.mesh.traverse((child) => {
            if (child.isMesh && child.material) child.material.emissiveIntensity = 0.1;
          });
        }
        // Still approach but slower
        if (planarDistance > 0.001) {
          dirX = toPlayerX / planarDistance;
          dirZ = toPlayerZ / planarDistance;
          speed = typeChaseSpeed * 0.5;
          mob.mode = "chase";
        }
      } else if (mob.chasing && planarDistance <= CREEPER_FUSE_RANGE) {
        // Ignite fuse
        mob.creeperState = { fuseMs: CREEPER_EXPLOSION_DELAY_MS, flashing: false, flashTimer: 0 };
        mob.mode = "fuse";
        dirX = 0;
        dirZ = 0;
        speed = 0;
      } else {
        // Normal approach
        if (mob.chasing && planarDistance > 0.001) {
          dirX = toPlayerX / planarDistance;
          dirZ = toPlayerZ / planarDistance;
          speed = typeChaseSpeed;
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
      }
    } else if (mob.mobType === "skeleton") {
      // --- Skeleton: keep distance, shoot arrows ---
      mob.skeletonShootCooldownMs = Math.max(0, (mob.skeletonShootCooldownMs || 0) - deltaMs);
      if (mob.chasing) {
        if (planarDistance < SKELETON_MIN_DISTANCE) {
          // Back away
          dirX = -toPlayerX / planarDistance;
          dirZ = -toPlayerZ / planarDistance;
          speed = typeWanderSpeed;
          mob.mode = "retreat";
        } else if (planarDistance <= SKELETON_SHOOT_RANGE) {
          // Stand and shoot
          dirX = 0; dirZ = 0; speed = 0;
          mob.mode = "shoot";
          if (mob.skeletonShootCooldownMs <= 0 && planarDistance > 0.001) {
            mob.skeletonShootCooldownMs = SKELETON_SHOOT_COOLDOWN_MS;
            spawnArrow(mob.pos, toPlayerX / planarDistance, toPlayerZ / planarDistance);
          }
        } else {
          // Close in
          dirX = toPlayerX / planarDistance;
          dirZ = toPlayerZ / planarDistance;
          speed = typeChaseSpeed;
          mob.mode = "chase";
          mob.wanderTimerMs = 0;
        }
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
    } else {
      // --- Default melee AI (zombie + spider) ---
      if (mob.chasing && planarDistance > 0.001) {
        dirX = toPlayerX / planarDistance;
        dirZ = toPlayerZ / planarDistance;
        speed = typeChaseSpeed;
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
    }

    if (speed > 0) {
      // Spider: can climb up slightly more aggressively (extra step tolerance)
      const maxStep = mob.mobType === "spider" ? 2.1 : (Number.isFinite(hostileMobConfig.maxStepHeight) ? hostileMobConfig.maxStepHeight : 1.1);
      const moved = tryMoveHostileMobWithStep(mob, dirX, dirZ, speed * dtSeconds, maxStep);
      if (!moved && !mob.chasing) {
        mob.wanderTimerMs = 0;
      }
    }

    // Melee contact damage (skeleton does no contact damage — arrow only)
    const mobContactDamage = typeDef.contactDamage ?? attackDamage;
    if (mobContactDamage > 0 && planarDistance <= attackRange && mob.attackCooldownMs <= 0) {
      mob.attackCooldownMs = attackCooldownMs;
      takeDamage(mobContactDamage, mob.mobType || "hostile", mob.pos);
    }

    // Wave 11 — apply knockback velocity to mob (decays quickly with gravity).
    if (mob.vel && (Math.abs(mob.vel.x) > 0.01 || Math.abs(mob.vel.y) > 0.01 || Math.abs(mob.vel.z) > 0.01)) {
      // Route horizontal displacement through the collision-aware step mover so mobs
      // can't tunnel through walls during knockback.
      const hSpeed = Math.hypot(mob.vel.x, mob.vel.z);
      if (hSpeed > 0.001) {
        const maxStep = Number.isFinite(hostileMobConfig.maxStepHeight) ? hostileMobConfig.maxStepHeight : 1.1;
        tryMoveHostileMobWithStep(mob, mob.vel.x / hSpeed, mob.vel.z / hSpeed, hSpeed * dtSeconds, maxStep);
      }
      // Vertical: integrate gravity, then clamp against the actual block below the mob
      // (not findSurfaceY which ignores caves/overhangs and can snap to open-sky surface).
      mob.pos.y += mob.vel.y * dtSeconds;
      mob.vel.y += -28 * dtSeconds;           // gravity
      const belowX = Math.floor(mob.pos.x);
      const belowZ = Math.floor(mob.pos.z);
      // Find the highest solid block in the column at mob position, up to mob's current Y.
      // Walk down from mob foot; if the block below is solid, floor is there.
      const mobFoot = Math.floor(mob.pos.y);
      const blockBelow = world.get(belowX, mobFoot - 1, belowZ);
      if (blockBelow && blockBelow !== 0 && mob.vel.y <= 0) {
        mob.pos.y = mobFoot;
        mob.vel.y = 0;
      }
      // Safety: never fall below world bottom.
      if (mob.pos.y < 0) {
        mob.pos.y = 0;
        mob.vel.y = 0;
      }
      mob.vel.x *= Math.pow(0.12, dtSeconds); // fast horizontal decay
      mob.vel.z *= Math.pow(0.12, dtSeconds);
    }

    mob.mesh.position.copy(mob.pos);
  }

  // --- Update arrow projectiles ---
  updateArrowProjectiles(deltaMs);

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

function rewardHostileMobDefeat(weaponItemId = getSelectedItemId(), mobTypeId = "zombie") {
  registerHostileMobDefeat(weaponItemId);
  // Wave 9: per-type drops from mobs.js registry
  const drops = rollMobDrops(mobTypeId);
  const granted = [];
  for (const drop of drops) {
    const leftover = addItemToInventory(state.inventory, drop.itemId, drop.count);
    const got = drop.count - leftover;
    if (got > 0) granted.push(`${got} ${getItemName(drop.itemId)}`);
  }
  if (granted.length === 0) {
    state.recentAction = `Defeated ${mobTypeId}`;
  } else {
    state.recentAction = `Defeated ${mobTypeId} +${granted.join(", ")}`;
  }
}

function tryHitHostileMob(ndcX = 0, ndcY = 0) {
  if (!isHostileMobEnabled() || hostileMobs.length === 0) {
    return false;
  }
  // Wave 11 — swing cooldown: gate melee to ~0.4s between swings.
  if (state.playerSwingCooldownRemaining > 0) {
    return false;
  }
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(hostileMobGroup.children, true);
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
  // Start cooldown timer
  const swingCooldownSec = Number.isFinite(hostileMobConfig.playerSwingCooldownSec)
    ? hostileMobConfig.playerSwingCooldownSec
    : 0.4;
  state.playerSwingCooldownRemaining = swingCooldownSec;

  const playerDamage = getSelectedMobDamage();
  const mob = hostileMobs[index];
  mob.health -= Math.max(1, Math.floor(playerDamage));
  // Decrement weapon durability on hit.
  decrementDurability(state.inventory, state.selectedSlot, 1);

  // Wave 11 — knockback: push the mob away from the player.
  const knockbackSpeed = Number.isFinite(hostileMobConfig.mobKnockbackSpeed)
    ? hostileMobConfig.mobKnockbackSpeed
    : 8.0;
  const kbDx = mob.pos.x - state.playerPos.x;
  const kbDz = mob.pos.z - state.playerPos.z;
  const kbLen = Math.hypot(kbDx, kbDz);
  if (kbLen > 0.001) {
    mob.vel = mob.vel || new THREE.Vector3();
    mob.vel.x = (kbDx / kbLen) * knockbackSpeed;
    mob.vel.y = 3.5;
    mob.vel.z = (kbDz / kbLen) * knockbackSpeed;
  }

  if (mob.health <= 0) {
    const killWeaponItemId = getSelectedItemId();
    const mobTypeId = mob.mobType || "zombie";
    removeHostileMobAt(index);
    rewardHostileMobDefeat(killWeaponItemId, mobTypeId);
    markCraftPanelDirty();
    markInventoryPanelDirty();
  } else {
    state.recentAction = `Hit ${mob.mobType || "hostile mob"} (${mob.health} hp)`;
    markInventoryPanelDirty();
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

// ---------------------------------------------------------------------------
// Wave 10 — crafting grid transfer state helpers
// ---------------------------------------------------------------------------

// Unified transfer state: context + index where context is which panel area
// the first-click came from.
function clearTransfer() {
  state.inventoryTransferIndex = null;
  state.transferContext = null;
}

// Return the item at a transfer address { context, index }
function getTransferSlot(context, index) {
  if (context === "inventory" || context === "grid-inv") {
    return state.inventory[index] ?? null;
  }
  if (context === "grid") {
    return state.craftingGrid[index] ?? null;
  }
  if (context === "armor") {
    const slot = ARMOR_SLOTS[index];
    const itemId = state.wornArmor[slot];
    return itemId ? { itemId, count: 1 } : null;
  }
  if (context === "chest-storage") {
    const chest = getChestState(state.activeChestKey, false);
    return chest ? (chest[index] ?? null) : null;
  }
  if (context === "chest-inv") {
    return state.inventory[index] ?? null;
  }
  return null;
}

// Attempt to move/swap between (fromCtx, fromIdx) and (toCtx, toIdx).
// Returns true on success.
function executeTransfer(fromCtx, fromIdx, toCtx, toIdx) {
  // Resolve the two backing arrays / special slots
  const getArr = (ctx) => {
    if (ctx === "inventory" || ctx === "grid-inv" || ctx === "chest-inv") return state.inventory;
    if (ctx === "grid") return state.craftingGrid;
    return null; // armor + chest-storage handled specially
  };

  // Handle armor slots specially (must be correct armor type, always count:1)
  if (toCtx === "armor") {
    const fromSlot = getTransferSlot(fromCtx, fromIdx);
    if (!fromSlot) return false;
    const targetSlot = ARMOR_SLOTS[toIdx];
    const armorSlot = getArmorSlot(fromSlot.itemId);
    if (armorSlot !== targetSlot) return false;

    const currentWorn = state.wornArmor[targetSlot];
    const fromArr = getArr(fromCtx);

    // Equip one piece from the source stack (never consume the whole stack).
    state.wornArmor[targetSlot] = fromSlot.itemId;
    if (fromArr) {
      fromArr[fromIdx] = fromSlot.count > 1 ? { itemId: fromSlot.itemId, count: fromSlot.count - 1 } : null;
      // If there was already a worn piece, return it: prefer the now-freed source
      // slot (it may have just become null), otherwise spill into inventory.
      if (currentWorn) {
        if (fromArr[fromIdx] === null) {
          fromArr[fromIdx] = { itemId: currentWorn, count: 1 };
        } else {
          addItemToInventory(state.inventory, currentWorn, 1);
        }
      }
    } else if (currentWorn) {
      // Source was a non-array context (shouldn't happen for armor→armor equip, but guard anyway)
      addItemToInventory(state.inventory, currentWorn, 1);
    }
    return true;
  }

  if (fromCtx === "armor") {
    const armorSlot = ARMOR_SLOTS[fromIdx];
    const wornId = state.wornArmor[armorSlot];
    if (!wornId) return false;
    const toArr = getArr(toCtx);
    if (toCtx === "chest-storage") {
      const chest = getChestState(state.activeChestKey, false);
      if (!chest) return false;
      if (chest[toIdx]) {
        // swap
        const tmp = chest[toIdx];
        chest[toIdx] = { itemId: wornId, count: 1 };
        const aSlot2 = getArmorSlot(tmp.itemId);
        if (aSlot2 === armorSlot) {
          state.wornArmor[armorSlot] = tmp.itemId;
        } else {
          // can't swap armor type mismatch into armor slot; put in inventory instead
          addItemToInventory(state.inventory, tmp.itemId, tmp.count);
          state.wornArmor[armorSlot] = null;
        }
      } else {
        chest[toIdx] = { itemId: wornId, count: 1 };
        state.wornArmor[armorSlot] = null;
      }
      return true;
    }
    if (toArr) {
      if (toArr[toIdx]) {
        const tmp = toArr[toIdx];
        const aSlot2 = getArmorSlot(tmp.itemId);
        if (aSlot2 === armorSlot) {
          state.wornArmor[armorSlot] = tmp.itemId;
        } else {
          // can't put non-armor back; just add to inventory
          addItemToInventory(state.inventory, tmp.itemId, tmp.count);
          state.wornArmor[armorSlot] = null;
        }
        toArr[toIdx] = { itemId: wornId, count: 1 };
      } else {
        toArr[toIdx] = { itemId: wornId, count: 1 };
        state.wornArmor[armorSlot] = null;
      }
      return true;
    }
    return false;
  }

  // Handle chest-storage as source
  if (fromCtx === "chest-storage") {
    const chest = getChestState(state.activeChestKey, false);
    if (!chest) return false;
    if (toCtx === "chest-storage") {
      return transferInventoryStack(chest, fromIdx, toIdx);
    }
    if (toCtx === "armor") {
      // Already handled above
      return false;
    }
    const toArr = getArr(toCtx);
    if (!toArr) return false;
    // Build a fake combined array for transferInventoryStack... just do it manually
    const fromSlot = chest[fromIdx];
    if (!fromSlot) return false;
    const toSlot = toArr[toIdx];
    if (!toSlot) {
      toArr[toIdx] = { ...fromSlot };
      chest[fromIdx] = null;
      return true;
    }
    // Merge or swap
    if (!hasDurability(fromSlot.itemId) && toSlot.itemId === fromSlot.itemId && toSlot.count < MAX_STACK) {
      const moved = Math.min(MAX_STACK - toSlot.count, fromSlot.count);
      if (moved <= 0) return false;
      toSlot.count += moved;
      fromSlot.count -= moved;
      if (fromSlot.count <= 0) chest[fromIdx] = null;
      return true;
    }
    chest[fromIdx] = toSlot;
    toArr[toIdx] = { ...fromSlot };
    return true;
  }

  // Handle destination as chest-storage
  if (toCtx === "chest-storage") {
    const chest = getChestState(state.activeChestKey, false);
    if (!chest) return false;
    const fromArr = getArr(fromCtx);
    if (!fromArr) return false;
    const fromSlot = fromArr[fromIdx];
    if (!fromSlot) return false;
    const toSlot = chest[toIdx];
    if (!toSlot) {
      chest[toIdx] = { ...fromSlot };
      fromArr[fromIdx] = null;
      return true;
    }
    if (!hasDurability(fromSlot.itemId) && toSlot.itemId === fromSlot.itemId && toSlot.count < MAX_STACK) {
      const moved = Math.min(MAX_STACK - toSlot.count, fromSlot.count);
      if (moved <= 0) return false;
      toSlot.count += moved;
      fromSlot.count -= moved;
      if (fromSlot.count <= 0) fromArr[fromIdx] = null;
      return true;
    }
    chest[toIdx] = { ...fromSlot };
    fromArr[fromIdx] = toSlot;
    return true;
  }

  // Both are regular array-backed slots
  const fromArr = getArr(fromCtx);
  const toArr = getArr(toCtx);
  if (!fromArr || !toArr) return false;

  if (fromArr === toArr) {
    return transferInventoryStack(fromArr, fromIdx, toIdx);
  }

  // Cross-array (e.g. grid → inventory): manual move/swap
  const fromSlot = fromArr[fromIdx];
  if (!fromSlot) return false;
  const toSlot = toArr[toIdx];
  if (!toSlot) {
    toArr[toIdx] = { ...fromSlot };
    fromArr[fromIdx] = null;
    return true;
  }
  if (!hasDurability(fromSlot.itemId) && toSlot.itemId === fromSlot.itemId && toSlot.count < MAX_STACK) {
    const moved = Math.min(MAX_STACK - toSlot.count, fromSlot.count);
    if (moved <= 0) return false;
    toSlot.count += moved;
    fromSlot.count -= moved;
    if (fromSlot.count <= 0) fromArr[fromIdx] = null;
    return true;
  }
  fromArr[fromIdx] = toSlot;
  toArr[toIdx] = { ...fromSlot };
  return true;
}

// ---------------------------------------------------------------------------
// Wave 10 — crafting grid logic
// ---------------------------------------------------------------------------

/**
 * Return the recipe currently matched by the crafting grid, or null.
 */
function getCurrentGridRecipe() {
  const needsWorkbench = isWorkbenchNearby();
  return matchGridRecipe(state.craftingGrid, RECIPES, needsWorkbench);
}

/**
 * Take the crafting result: consume exactly one of each ingredient from the grid,
 * add the output to inventory.
 */
function takeCraftingResult() {
  const recipe = getCurrentGridRecipe();
  if (!recipe) {
    state.recentAction = "Nothing to craft";
    return;
  }
  if (recipe.requiredSpecialization) {
    const lockReason = getRecipeSpecializationLockReason(recipe);
    if (lockReason) {
      state.recentAction = lockReason;
      return;
    }
  }

  // Check inventory room before committing. Clone the inventory, try to add
  // the output, and abort if any leftover remains so the grid is never consumed
  // when the output would be silently destroyed.
  const inventoryClone = state.inventory.map((s) => (s ? { ...s } : null));
  const leftoverCheck = addItemToInventory(inventoryClone, recipe.output.itemId, recipe.output.count);
  if (leftoverCheck > 0) {
    state.recentAction = "Inventory full";
    markCraftPanelDirty();
    updateCraftPanel(true);
    return;
  }

  // For shaped recipes consume one per grid cell (already validated by match).
  // For shapeless, consume one per required ingredient.
  if (recipe.pattern) {
    // Consume one item from each non-empty matched cell.
    for (let i = 0; i < 9; i += 1) {
      if (state.craftingGrid[i]) {
        state.craftingGrid[i].count -= 1;
        if (state.craftingGrid[i].count <= 0) {
          state.craftingGrid[i] = null;
        }
      }
    }
  } else {
    // Shapeless: consume exact required counts from grid cells
    const needed = new Map(recipe.inputs.map((inp) => [inp.itemId, inp.count]));
    for (let i = 0; i < 9; i += 1) {
      const slot = state.craftingGrid[i];
      if (!slot) continue;
      const rem = needed.get(slot.itemId);
      if (rem && rem > 0) {
        const take = Math.min(slot.count, rem);
        needed.set(slot.itemId, rem - take);
        slot.count -= take;
        if (slot.count <= 0) state.craftingGrid[i] = null;
      }
    }
  }

  addItemToInventory(state.inventory, recipe.output.itemId, recipe.output.count);
  {
    state.recentAction = `Crafted ${recipe.name}`;
  }
  markCraftPanelDirty();
  markInventoryPanelDirty();
  updateCraftPanel(true);
  updateInventoryPanel(true);
  refreshHud();
}

function onCraftGridSlotClick(gridIndex) {
  if (!state.craftingOpen) return;
  if (gridIndex < 0 || gridIndex >= 9) return;

  // Enforce 2x2 restriction: no workbench means col 2 and row 2 are off-limits
  if (!isWorkbenchNearby()) {
    const col = gridIndex % 3;
    const row = Math.floor(gridIndex / 3);
    if (col === 2 || row === 2) {
      state.recentAction = "Need crafting table for 3x3 grid";
      return;
    }
  }

  if (state.transferContext === null) {
    if (!state.craftingGrid[gridIndex]) {
      state.recentAction = "Grid slot is empty";
      return;
    }
    state.inventoryTransferIndex = gridIndex;
    state.transferContext = "grid";
    state.recentAction = `Selected grid slot ${gridIndex + 1}`;
    markCraftPanelDirty();
    updateCraftPanel(true);
    return;
  }

  if (state.transferContext === "grid" && state.inventoryTransferIndex === gridIndex) {
    clearTransfer();
    state.recentAction = "Cancelled";
    markCraftPanelDirty();
    updateCraftPanel(true);
    return;
  }

  // Clicking an inventory slot first then a grid slot: handled from inventory side
  // But if we're clicking grid->grid or grid->inventory we route here
  const fromCtx = state.transferContext;
  const fromIdx = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIdx, "grid", gridIndex);
  if (moved) {
    state.recentAction = "Placed in grid";
    markCraftPanelDirty();
    markInventoryPanelDirty();
    updateCraftPanel(true);
    updateInventoryPanel(true);
    refreshHud();
  } else {
    state.recentAction = "Cannot place there";
    markCraftPanelDirty();
    updateCraftPanel(true);
  }
}

/**
 * Handle a click on the player inventory grid rendered inside the craft panel.
 * Works like onChestInvClick but uses the "grid-inv" transfer context so that
 * a subsequent click on a grid cell routes correctly through executeTransfer.
 */
function onCraftInvClick(slotIndex) {
  if (!state.craftingOpen) return;
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= INVENTORY_SIZE) return;

  if (state.transferContext === null) {
    if (!state.inventory[slotIndex]) {
      state.recentAction = `Slot ${slotIndex + 1} is empty`;
      return;
    }
    state.inventoryTransferIndex = slotIndex;
    state.transferContext = "grid-inv";
    state.recentAction = `Selected slot ${slotIndex + 1}`;
    markCraftPanelDirty();
    updateCraftPanel(true);
    return;
  }

  if (state.transferContext === "grid-inv" && state.inventoryTransferIndex === slotIndex) {
    clearTransfer();
    state.recentAction = "Cancelled transfer";
    markCraftPanelDirty();
    updateCraftPanel(true);
    return;
  }

  const fromCtx = state.transferContext;
  const fromIdx = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIdx, "grid-inv", slotIndex);
  if (moved) {
    state.recentAction = "Moved item";
    markCraftPanelDirty();
    markInventoryPanelDirty();
    updateCraftPanel(true);
    updateInventoryPanel(true);
    refreshHud();
  } else {
    state.recentAction = "Cannot move item";
    markCraftPanelDirty();
    updateCraftPanel(true);
  }
}

/**
 * Return all items in the crafting grid to the player inventory on close.
 */
function returnCraftingGridToInventory() {
  for (let i = 0; i < 9; i += 1) {
    const slot = state.craftingGrid[i];
    if (slot) {
      const leftover = addItemToInventory(state.inventory, slot.itemId, slot.count);
      if (leftover > 0) {
        // Inventory couldn't absorb everything; keep the remainder in the grid slot
        state.craftingGrid[i] = { itemId: slot.itemId, count: leftover };
      } else {
        state.craftingGrid[i] = null;
      }
    }
  }
}

function updateCraftPanel(force = false) {
  if (!state.craftingOpen) {
    return;
  }

  const nearWorkbench = isWorkbenchNearby();
  const specializationSignature = `${state.specialization.selected || "_"}|${state.specialization.completed ? 1 : 0}`;
  const gridSig = craftingGridSignature();
  const nextSignature = `${nearWorkbench}|${specializationSignature}|${inventorySignature()}|${gridSig}`;
  if (!force && !craftPanelNeedsRefresh && craftPanelSignature === nextSignature) {
    return;
  }
  craftPanelSignature = nextSignature;
  craftPanelNeedsRefresh = false;

  let contextText = nearWorkbench
    ? "Workbench nearby: 3x3 grid + advanced recipes"
    : "No workbench: 2x2 area only, basic recipes";
  if (state.specialization.selected) {
    const status = state.specialization.completed ? "trial complete" : "trial active";
    contextText += ` | ${formatSpecializationName(state.specialization.selected)} specialization (${status})`;
  }
  craftContext.textContent = contextText;

  // ----- Crafting grid -----
  if (craftGridEl) {
    craftGridEl.innerHTML = "";
    for (let i = 0; i < 9; i += 1) {
      const slot = state.craftingGrid[i];

      // In 2x2 mode (no workbench), grey out the 3rd column and bottom row
      const col = i % 3;
      const row = Math.floor(i / 3);
      const is2x2Locked = !nearWorkbench && (col === 2 || row === 2);

      const btn = document.createElement("div");
      btn.className = "craft-slot" + (slot ? "" : " empty");
      if (state.transferContext === "grid" && state.inventoryTransferIndex === i) {
        btn.classList.add("transfer-selected");
      }
      if (is2x2Locked) {
        btn.style.opacity = "0.25";
        btn.style.pointerEvents = "none";
      }
      btn.dataset.gridIndex = String(i);
      btn.textContent = slot ? `${getItemName(slot.itemId)} x${slot.count}` : "·";
      craftGridEl.appendChild(btn);
    }
  }

  // ----- Result slot -----
  const matchedRecipe = getCurrentGridRecipe();
  if (craftResultSlotEl) {
    if (matchedRecipe) {
      craftResultSlotEl.className = "craft-slot craft-result";
      craftResultSlotEl.textContent = `${getItemName(matchedRecipe.output.itemId)} x${matchedRecipe.output.count}`;
    } else {
      craftResultSlotEl.className = "craft-slot craft-result empty";
      craftResultSlotEl.textContent = "Empty";
    }
  }

  // ----- Player inventory (mirroring chest panel so items can be moved to/from grid) -----
  if (craftInvGridEl) {
    craftInvGridEl.innerHTML = "";
    for (let i = 0; i < INVENTORY_SIZE; i += 1) {
      const slot = state.inventory[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inventory-slot" + (slot ? "" : " empty");
      if (state.transferContext === "grid-inv" && state.inventoryTransferIndex === i) {
        btn.classList.add("transfer-selected");
      }
      btn.dataset.craftInvIndex = String(i);
      const label = `${i + 1}`;
      btn.textContent = slot ? `${label}: ${getItemName(slot.itemId)} x${slot.count}` : `${label}: Empty`;
      craftInvGridEl.appendChild(btn);
    }
  }

  // ----- Recipe list (shapeless shortcut buttons still useful) -----
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
    closeCraftPanel(false);
  }
  if (state.chestOpen) {
    closeChestPanel(false);
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

// ---------------------------------------------------------------------------
// Wave 10 — Chest panel
// ---------------------------------------------------------------------------

function closeChestPanel(updateAction = true) {
  if (!state.chestOpen) return;
  state.chestOpen = false;
  state.activeChestKey = null;
  if (chestPanel) chestPanel.classList.add("hidden");
  chestPanelSignature = "";
  clearTransfer();
  markChestPanelDirty();
  if (updateAction) {
    state.recentAction = "Closed chest";
  }
}

function openChestPanel(key) {
  if (state.craftingOpen) closeCraftPanel(false);
  if (state.furnaceOpen) closeFurnacePanel(false);
  if (state.inventoryOpen) closeInventoryPanel(false);
  if (state.chestOpen && state.activeChestKey === key) {
    closeChestPanel(true);
    return;
  }
  if (state.chestOpen) closeChestPanel(false);

  state.chestOpen = true;
  state.activeChestKey = key;
  getChestState(key, true); // ensure initialized
  if (state.pointerLocked && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  if (chestPanel) chestPanel.classList.remove("hidden");
  state.keys.clear();
  state.jumpQueued = false;
  clearTransfer();
  markChestPanelDirty();
  updateChestPanel(true);
  state.recentAction = "Opened chest";
}

function updateChestPanel(force = false) {
  if (!state.chestOpen) return;

  const key = state.activeChestKey;
  if (!key || !isChestAccessible(key)) {
    if (state.chestOpen) {
      closeChestPanel(true);
    }
    return;
  }

  const chestSig = `${key}|${inventorySignature()}|${state.transferContext ?? "-"}|${state.inventoryTransferIndex ?? "-"}`;
  if (!force && !chestPanelNeedsRefresh && chestPanelSignature === chestSig) return;
  chestPanelSignature = chestSig;
  chestPanelNeedsRefresh = false;

  const { x, y, z } = fromChestKey(key);
  if (chestContext) chestContext.textContent = `Chest @ ${x},${y},${z}`;

  const chest = getChestState(key, true);

  // Chest storage grid (27 slots, 9 per row)
  if (chestStorageEl) {
    chestStorageEl.innerHTML = "";
    for (let i = 0; i < CHEST_SIZE; i += 1) {
      const slot = chest[i];
      const btn = document.createElement("div");
      btn.className = "chest-slot" + (slot ? "" : " empty");
      if (state.transferContext === "chest-storage" && state.inventoryTransferIndex === i) {
        btn.classList.add("transfer-selected");
      }
      btn.dataset.chestSlot = String(i);
      btn.textContent = slot ? `${getItemName(slot.itemId)}\nx${slot.count}` : "·";
      chestStorageEl.appendChild(btn);
    }
  }

  // Player inventory grid below chest
  if (chestInvGridEl) {
    chestInvGridEl.innerHTML = "";
    for (let i = 0; i < INVENTORY_SIZE; i += 1) {
      const slot = state.inventory[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inventory-slot" + (slot ? "" : " empty");
      if (state.transferContext === "chest-inv" && state.inventoryTransferIndex === i) {
        btn.classList.add("transfer-selected");
      }
      btn.dataset.chestInvIndex = String(i);
      const label = `${i + 1}`;
      btn.textContent = slot ? `${label}: ${getItemName(slot.itemId)} x${slot.count}` : `${label}: Empty`;
      chestInvGridEl.appendChild(btn);
    }
  }
}

function onChestStorageClick(slotIndex) {
  if (!state.chestOpen || !state.activeChestKey) return;

  if (state.transferContext === null) {
    const chest = getChestState(state.activeChestKey, false);
    if (!chest || !chest[slotIndex]) {
      state.recentAction = "Chest slot empty";
      return;
    }
    state.inventoryTransferIndex = slotIndex;
    state.transferContext = "chest-storage";
    state.recentAction = `Selected chest slot ${slotIndex + 1}`;
    markChestPanelDirty();
    updateChestPanel(true);
    return;
  }

  if (state.transferContext === "chest-storage" && state.inventoryTransferIndex === slotIndex) {
    clearTransfer();
    state.recentAction = "Cancelled transfer";
    markChestPanelDirty();
    updateChestPanel(true);
    return;
  }

  const fromCtx = state.transferContext;
  const fromIdx = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIdx, "chest-storage", slotIndex);
  if (moved) {
    state.recentAction = "Moved item";
    markInventoryPanelDirty();
    markChestPanelDirty();
    updateChestPanel(true);
    updateInventoryPanel(true);
  } else {
    state.recentAction = "Cannot move item";
    markChestPanelDirty();
    updateChestPanel(true);
  }
}

function onChestInvClick(slotIndex) {
  if (!state.chestOpen) return;

  if (state.transferContext === null) {
    if (!state.inventory[slotIndex]) {
      state.recentAction = `Slot ${slotIndex + 1} is empty`;
      return;
    }
    state.inventoryTransferIndex = slotIndex;
    state.transferContext = "chest-inv";
    state.recentAction = `Selected slot ${slotIndex + 1}`;
    markChestPanelDirty();
    updateChestPanel(true);
    return;
  }

  if (state.transferContext === "chest-inv" && state.inventoryTransferIndex === slotIndex) {
    clearTransfer();
    state.recentAction = "Cancelled transfer";
    markChestPanelDirty();
    updateChestPanel(true);
    return;
  }

  const fromCtx = state.transferContext;
  const fromIdx = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIdx, "chest-inv", slotIndex);
  if (moved) {
    state.recentAction = "Moved item";
    markInventoryPanelDirty();
    markChestPanelDirty();
    updateChestPanel(true);
    updateInventoryPanel(true);
  } else {
    state.recentAction = "Cannot move item";
    markChestPanelDirty();
    updateChestPanel(true);
  }
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

  if (state.transferContext === null) {
    inventoryHint.textContent = "Click one slot, then another slot to move or swap. Click an armor slot from inventory to equip.";
  } else {
    const ctxLabel = state.transferContext === "armor" ? "armor slot" : `slot ${(state.inventoryTransferIndex ?? 0) + 1}`;
    inventoryHint.textContent = `Selected ${ctxLabel}. Click destination slot.`;
  }

  // Armor equip slots
  if (inventoryArmorSlotsEl) {
    inventoryArmorSlotsEl.innerHTML = "";
    for (let i = 0; i < ARMOR_SLOTS.length; i += 1) {
      const slotName = ARMOR_SLOTS[i];
      const worn = state.wornArmor[slotName];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "armor-slot" + (worn ? "" : " empty");
      if (state.transferContext === "armor" && state.inventoryTransferIndex === i) {
        btn.classList.add("transfer-selected");
      }
      btn.dataset.armorSlot = String(i);
      btn.textContent = worn ? `${slotName}: ${getItemName(worn)}` : `${slotName}: Empty`;
      btn.title = worn ? `Defense: +${ARMOR_DEFENSE[worn] ?? 0}` : `Equip ${slotName} armor`;
      inventoryArmorSlotsEl.appendChild(btn);
    }
  }

  renderInventoryGrid(inventoryHotbarGrid, 0, HOTBAR_SIZE - 1);
  renderInventoryGrid(inventoryBackpackGrid, HOTBAR_SIZE, INVENTORY_SIZE - 1);
}

function closeInventoryPanel(updateAction = true) {
  if (!state.inventoryOpen) {
    return;
  }
  state.inventoryOpen = false;
  clearTransfer();
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

  if (state.transferContext === null) {
    if (!state.inventory[targetIndex]) {
      state.recentAction = `Slot ${targetIndex + 1} is empty`;
      return;
    }
    state.inventoryTransferIndex = targetIndex;
    state.transferContext = "inventory";
    state.recentAction = `Selected slot ${targetIndex + 1}`;
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  if (state.transferContext === "inventory" && state.inventoryTransferIndex === targetIndex) {
    clearTransfer();
    state.recentAction = "Cancelled transfer";
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  const fromCtx = state.transferContext;
  const fromIndex = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIndex, "inventory", targetIndex);

  if (moved) {
    state.recentAction = `Moved item`;
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

function onArmorSlotClick(slotIndex) {
  if (!state.inventoryOpen) return;
  if (slotIndex < 0 || slotIndex >= 4) return;
  const armorSlotName = ARMOR_SLOTS[slotIndex];

  if (state.transferContext === null) {
    // Select this armor slot only if it has something worn
    if (!state.wornArmor[armorSlotName]) {
      // Try to auto-equip if something in inventory matches
      state.recentAction = `${armorSlotName} slot is empty`;
      return;
    }
    state.inventoryTransferIndex = slotIndex;
    state.transferContext = "armor";
    state.recentAction = `Selected ${armorSlotName} armor`;
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  if (state.transferContext === "armor" && state.inventoryTransferIndex === slotIndex) {
    clearTransfer();
    state.recentAction = "Cancelled";
    markInventoryPanelDirty();
    updateInventoryPanel(true);
    return;
  }

  const fromCtx = state.transferContext;
  const fromIdx = state.inventoryTransferIndex;
  clearTransfer();
  const moved = executeTransfer(fromCtx, fromIdx, "armor", slotIndex);
  if (moved) {
    state.recentAction = `Equipped armor`;
    markInventoryPanelDirty();
    refreshHud();
    updateInventoryPanel(true);
  } else {
    state.recentAction = `Cannot equip there`;
    markInventoryPanelDirty();
    updateInventoryPanel(true);
  }
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
    closeCraftPanel(false);
  }
  if (state.chestOpen) {
    closeChestPanel(false);
  }

  state.inventoryOpen = true;
  clearTransfer();
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

function closeCraftPanel(returnItems = true) {
  if (!state.craftingOpen) return;
  state.craftingOpen = false;
  craftPanel.classList.add("hidden");
  craftPanelSignature = "";
  clearTransfer();
  if (returnItems) {
    returnCraftingGridToInventory();
    markInventoryPanelDirty();
  }
  markCraftPanelDirty();
}

function toggleCraftPanel() {
  if (state.inventoryOpen) {
    closeInventoryPanel(false);
  }
  if (state.furnaceOpen) {
    closeFurnacePanel(false);
  }
  if (state.chestOpen) {
    closeChestPanel(false);
  }
  if (state.craftingOpen) {
    closeCraftPanel(true);
    return;
  }
  craftPanel.classList.remove("hidden");
  state.craftingOpen = true;
  if (state.pointerLocked && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  state.keys.clear();
  state.jumpQueued = false;
  markCraftPanelDirty();
  updateCraftPanel(true);
}

function serializeWornArmor() {
  return {
    head: state.wornArmor.head || null,
    chest: state.wornArmor.chest || null,
    legs: state.wornArmor.legs || null,
    feet: state.wornArmor.feet || null,
  };
}

function loadWornArmor(raw) {
  state.wornArmor = { head: null, chest: null, legs: null, feet: null };
  if (!raw || typeof raw !== "object") return;
  for (const slot of ARMOR_SLOTS) {
    const itemId = raw[slot];
    if (typeof itemId === "string" && ITEM_DEFS[itemId] && ITEM_DEFS[itemId].armor?.slot === slot) {
      state.wornArmor[slot] = itemId;
    }
  }
}

function collectSaveSnapshot() {
  // Flush grid contents to inventory before snapshotting so nothing is lost on
  // reload (the grid is treated as transient state). Any items that don't fit
  // remain in the grid — they'll be visible if the player re-opens the panel.
  if (state.craftingOpen) {
    returnCraftingGridToInventory();
    markCraftPanelDirty();
    markInventoryPanelDirty();
  }
  return {
    version: 5, // Wave 10: chests + armor
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
      hunger: state.hunger,
      saturation: state.saturation,
      selectedSlot: state.selectedSlot,
      wornArmor: serializeWornArmor(),
    },
    inventory: serializeInventory(),
    furnaces: serializeFurnaces(),
    chests: serializeChests(),
    mobs: serializeHostileMobs(),
    passiveMobs: serializePassiveMobs(),
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
  // Wave 7 — hunger/saturation; forward-default old saves.
  state.hunger = Number.isFinite(playerData.hunger)
    ? THREE.MathUtils.clamp(playerData.hunger, 0, state.maxHunger)
    : state.maxHunger;
  state.saturation = Number.isFinite(playerData.saturation)
    ? THREE.MathUtils.clamp(playerData.saturation, 0, MAX_SATURATION)
    : 5;
  state.starveAccumSec = 0;
  // Wave 10 — worn armor; forward-default old saves (no armor).
  loadWornArmor(playerData.wornArmor ?? null);
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
    loadChests(snapshot.chests);
    loadHostileMobs(snapshot.mobs);
    loadPassiveMobs(snapshot.passiveMobs);
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
    updateChestPanel(true);
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
  // Exclude water and lava from raycast — neither can be targeted/broken by the player.
  const solidMeshes = world.meshGroup.children.filter(m => !m.userData.isWater && !m.userData.isLava);
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
  if (type === 0 || type === WATER_BLOCK_TYPE || type === LAVA_BLOCK_TYPE) {
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
  if (state.chestOpen) return false;
  if (tryHitHostileMob(ndcX, ndcY)) {
    return true;
  }
  if (tryHitPassiveMob(ndcX, ndcY)) {
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
  if (type === 0 || type === WATER_BLOCK_TYPE || type === LAVA_BLOCK_TYPE || coords.y === 0 || type === BEDROCK_BLOCK_TYPE) {
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
  if (type === CHEST_BLOCK_TYPE) {
    // Drop all contents into inventory, then remove state
    const chestSlots = chestStates.get(targetKey);
    if (chestSlots) {
      for (const slot of chestSlots) {
        if (slot) {
          addItemToInventory(state.inventory, slot.itemId, slot.count);
        }
      }
      chestStates.delete(targetKey);
    }
    if (state.activeChestKey === targetKey) {
      state.activeChestKey = null;
      state.chestOpen = false;
      if (chestPanel) chestPanel.classList.add("hidden");
    }
    markChestPanelDirty();
  }
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  if (type === TORCH_BLOCK_TYPE) {
    markTorchLightsDirty();
  }
  if (minedDeepCopper) {
    registerDeepCopperProgress();
  }

  // Decrement durability on the held tool before picking up drops.
  const heldSlotIndex = state.selectedSlot;
  const toolBroke = decrementDurability(state.inventory, heldSlotIndex, 1);
  if (toolBroke) {
    state.recentAction = `Tool broke!`;
    markCraftPanelDirty();
    markInventoryPanelDirty();
  }

  // Wave 8: harvest-level gating. If the block has a minimum tier requirement and the
  // held tool is below that tier, suppress the drop (block breaks but yields nothing).
  const requiredTier = ORE_HARVEST_LEVEL[type];
  const heldTier = getToolTier(heldItemId);
  const dropSuppressed = requiredTier !== undefined && heldTier < requiredTier;

  const dropItemId = dropSuppressed ? null : getBlockDropItem(type);
  if (dropItemId) {
    const leftover = addItemToInventory(state.inventory, dropItemId, 1);
    if (leftover > 0) {
      state.recentAction = toolBroke ? `Tool broke, ${blockName(type)} dropped (inv full)` : `Broke ${blockName(type)}, inventory full`;
    } else {
      state.recentAction = toolBroke ? `Tool broke! Got ${blockName(type)}` : `Broke ${blockName(type)}`;
    }
    markCraftPanelDirty();
    markInventoryPanelDirty();
  } else if (dropSuppressed) {
    state.recentAction = `Need better tool for ${blockName(type)}`;
  } else if (!toolBroke) {
    state.recentAction = `Broke ${blockName(type)}`;
  }

  // Roll extra probabilistic drops (e.g. apple from leaves).
  const extraDrops = rollExtraDrops(type);
  for (const extraItemId of extraDrops) {
    addItemToInventory(state.inventory, extraItemId, 1);
    markCraftPanelDirty();
    markInventoryPanelDirty();
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

function eatSelectedFood() {
  const slot = getSelectedInventorySlot();
  if (!slot) return false;
  const foodDef = getFoodDef(slot.itemId);
  if (!foodDef) return false;
  // Can only eat when not at full hunger.
  if (state.hunger >= state.maxHunger) {
    state.recentAction = "Not hungry";
    return false;
  }
  const result = applyFood(state.hunger, state.saturation, foodDef);
  state.hunger = result.hunger;
  state.saturation = result.saturation;
  consumeFromSlot(state.inventory, state.selectedSlot, 1);
  state.recentAction = `Ate ${getItemName(slot.itemId)} (hunger ${Math.ceil(state.hunger)}/${state.maxHunger})`;
  markCraftPanelDirty();
  markInventoryPanelDirty();
  refreshHud();
  return true;
}

function placeBlock(ndcX = 0, ndcY = 0) {
  if (state.chestOpen) return false;
  // Wave 10 — check if player is right-clicking a chest block (before item logic)
  {
    const chestHit = hitTest(ndcX, ndcY);
    if (chestHit) {
      const normal = getWorldNormal(chestHit);
      if (normal) {
        const coords = toBlockCoords(chestHit.point, normal, -1);
        if (world.get(coords.x, coords.y, coords.z) === CHEST_BLOCK_TYPE) {
          const key = toChestKey(coords.x, coords.y, coords.z);
          if (isChestAccessible(key)) {
            openChestPanel(key);
            return true;
          }
        }
      }
    }
  }

  const slot = getSelectedInventorySlot();
  if (!slot) {
    state.recentAction = "Selected slot empty";
    return false;
  }

  // Food items: eat before attempting block placement.
  if (getFoodDef(slot.itemId)) {
    return eatSelectedFood();
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
  if (placeType === CHEST_BLOCK_TYPE) {
    const chestKey = toChestKey(coords.x, coords.y, coords.z);
    getChestState(chestKey, true);
    markChestPanelDirty();
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
      // Wave 12: also reject birch/spruce log tops and leaf blocks as spawn surfaces.
      const BIRCH_LOG_TYPE = 26;
      const SPRUCE_LOG_TYPE = 28;
      const BIRCH_LEAF_TYPE = 27;
      const SPRUCE_LEAF_TYPE = 29;
      if (surfaceType === 0 || surfaceType === WATER_BLOCK_TYPE || surfaceType === WOOD_BLOCK_TYPE || surfaceType === LEAF_BLOCK_TYPE
          || surfaceType === BIRCH_LOG_TYPE || surfaceType === SPRUCE_LOG_TYPE
          || surfaceType === BIRCH_LEAF_TYPE || surfaceType === SPRUCE_LEAF_TYPE) {
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
    // Reset hunger on respawn (like Minecraft).
    state.hunger = state.maxHunger;
    state.saturation = 5;
    state.starveAccumSec = 0;
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

function takeDamage(amount, reason, attackerPos = null) {
  if (state.mode !== "playing") {
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  let damage = Math.max(1, Math.floor(amount));

  // Wave 10 — armor reduces physical damage (not starvation or void).
  // Starvation, void, lava deal full damage regardless.
  const bypassArmor = reason === "starvation" || reason === "void";
  if (!bypassArmor) {
    const defense = getTotalDefense(state.wornArmor);
    if (defense > 0) {
      // Minecraft formula: damage * (1 - defense/25) but min 4% of original
      const reduction = Math.min(0.96, defense / 25);
      damage = Math.max(1, Math.floor(damage * (1 - reduction)));
    }
  }

  // Wave 11 — player knockback: push player away from attacker (mob/explosion only).
  // Starvation, void, lava, fall don't knock the player.
  const hasPhysicalSource = attackerPos && !bypassArmor && reason !== "fall" && reason !== "lava";
  if (hasPhysicalSource) {
    const kbSpeed = Number.isFinite(hostileMobConfig.playerKnockbackSpeed)
      ? hostileMobConfig.playerKnockbackSpeed
      : 5.5;
    const kbDx = state.playerPos.x - attackerPos.x;
    const kbDz = state.playerPos.z - attackerPos.z;
    const kbLen = Math.hypot(kbDx, kbDz);
    if (kbLen > 0.001) {
      state.playerVel.x = (kbDx / kbLen) * kbSpeed;
      state.playerVel.z = (kbDz / kbLen) * kbSpeed;
      state.playerVel.y = 3.0;
      // Protect the horizontal vel from being overwritten by input for ~0.25 s
      // so resolveAxis can integrate it before the next movement frame zeros it.
      state.playerKnockbackRemaining = 0.25;
    }
  }

  // Wave 11 — hurt sound
  playHurtSound();

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
  chestStates.clear();
  clearHostileMobs();
  clearPassiveMobs();
  resetObjectives();
  state.activeFurnaceKey = null;
  state.activeChestKey = null;
  state.chestOpen = false;
  state.wornArmor = { head: null, chest: null, legs: null, feet: null };
  if (chestPanel) chestPanel.classList.add("hidden");
  state.timeOfDayMs = normalizeTimeOfDayMs(simConfig.initialTimeOfDayMs);
  respawnPlayer({ healToMax: true });
  state.recentAction = "Regenerated terrain";
  markCraftPanelDirty();
  markFurnacePanelDirty();
  markInventoryPanelDirty();
  markChestPanelDirty();
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
  chestStates.clear();
  clearHostileMobs();
  clearPassiveMobs();
  resetObjectives();
  state.activeFurnaceKey = null;
  state.activeChestKey = null;
  state.chestOpen = false;
  state.wornArmor = { head: null, chest: null, legs: null, feet: null };
  state.craftingGrid = new Array(9).fill(null);
  if (chestPanel) chestPanel.classList.add("hidden");
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

  // Compute eyeInWater BEFORE updateDayNight so sky.update() and the fog override
  // both see the same value on the frame the eye enters or exits water.
  // Only meaningful in playing mode; in other modes state.eyeInWater stays as-is
  // (safe: non-playing paths don't do underwater fog override).
  if (state.mode === "playing") {
    const _eyeTestX = Math.floor(state.playerPos.x);
    const _eyeTestY = Math.floor(state.playerPos.y + playerConfig.eyeHeight);
    const _eyeTestZ = Math.floor(state.playerPos.z);
    state.eyeInWater = world.get(_eyeTestX, _eyeTestY, _eyeTestZ) === WATER_BLOCK_TYPE;
  }

  updateDayNight(deltaMs);

  if (state.mode !== "playing") {
    updateHostileMobs(deltaMs);
    updatePassiveMobs(deltaMs);
    updateTorchLights(deltaMs);
    updateObjectives(deltaMs);
    updateCameraTransform();
    updateTargetBlockFromCenter();
    refreshHud();
    updateFurnacePanel();
    updateChestPanel();
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

  // --- Water / lava submersion test ---
  // Sample the block at the player's body center (waist) and eye to detect water or lava.
  const bodyTestY  = Math.floor(state.playerPos.y + playerConfig.height * 0.4);
  const eyeTestX   = Math.floor(state.playerPos.x);
  const eyeTestY   = Math.floor(state.playerPos.y + playerConfig.eyeHeight);
  const eyeTestZ   = Math.floor(state.playerPos.z);
  const bodyBlock  = world.get(eyeTestX, bodyTestY, eyeTestZ);
  const eyeBlock   = world.get(eyeTestX, eyeTestY,  eyeTestZ);
  state.inWater    = bodyBlock === WATER_BLOCK_TYPE;
  state.eyeInWater = eyeBlock  === WATER_BLOCK_TYPE;
  // Wave 8: lava submersion (body in lava = damage + slow; eye in lava = orange fog).
  state.inLava     = bodyBlock === LAVA_BLOCK_TYPE;
  state.eyeInLava  = eyeBlock  === LAVA_BLOCK_TYPE;

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
    // --- ON LAND (or in lava): original physics with lava slowdown ---
    // Wave 8: lava halves movement speed (same as Minecraft's lava drag).
    const effectiveMoveSpeed = state.inLava ? moveSpeed * 0.5 : moveSpeed;
    const inputVelX = (forwardX * forwardInput + rightX * strafeInput) * effectiveMoveSpeed;
    const inputVelZ = (forwardZ * forwardInput + rightZ * strafeInput) * effectiveMoveSpeed;
    if (state.playerKnockbackRemaining > 0) {
      // Knockback window: add input to existing vel so the player can nudge themselves
      // but the horizontal push is not zeroed before resolveAxis integrates it.
      state.playerVel.x += inputVelX;
      state.playerVel.z += inputVelZ;
    } else {
      state.playerVel.x = inputVelX;
      state.playerVel.z = inputVelZ;
    }
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
      // Jumping costs a small amount of hunger (saturation absorbs first).
      if (state.saturation > 0) {
        state.saturation = Math.max(0, state.saturation - JUMP_HUNGER_COST);
      } else {
        state.hunger = Math.max(0, state.hunger - JUMP_HUNGER_COST);
      }
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

  // --- Underwater / lava fog override ---
  // updateDayNight already set scene.fog to the sky/night color. Override when the camera
  // eye is inside water (deep blue) or lava (orange-red). Lava takes priority over water.
  if (state.eyeInLava) {
    // Wave 8: lava fog — very short visibility with orange-red tint.
    scene.fog.color.copy(lavaFogColor);
    scene.fog.near = LAVA_FOG_NEAR;
    scene.fog.far  = LAVA_FOG_FAR;
    scene.background.copy(lavaFogColor);
  } else if (state.eyeInWater) {
    scene.fog.color.copy(underwaterFogColor);
    scene.fog.near = UNDERWATER_FOG_NEAR;
    scene.fog.far  = UNDERWATER_FOG_FAR;
    scene.background.copy(underwaterFogColor);
  } else {
    // Restore normal fog distances (color was already set by updateDayNight).
    scene.fog.near = renderConfig.fogNear;
    scene.fog.far  = renderConfig.fogFar;
  }

  // Wave 8: lava damage — 2 HP/s when the player body is in lava.
  if (state.inLava && state.mode === "playing") {
    lavaAccumSec += dtSeconds;
    if (lavaAccumSec >= 0.5) {
      // Deliver damage in 0.5-second chunks so it feels punchy even at low frame rates.
      const chunks = Math.floor(lavaAccumSec / 0.5);
      takeDamage(LAVA_DAMAGE_PER_SECOND * 0.5 * chunks, "lava");
      lavaAccumSec -= chunks * 0.5;
    }
  } else {
    lavaAccumSec = 0;
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
      // Wave 11: per-surface footstep — sample block underfoot.
      const footX = Math.floor(state.playerPos.x);
      const footY = Math.floor(state.playerPos.y) - 1;
      const footZ = Math.floor(state.playerPos.z);
      const footBlock = world ? world.get(footX, footY, footZ) : 0;
      playStepSoundForBlock(footBlock);
    }
  } else {
    state.bobAmplitude += (0 - state.bobAmplitude) * Math.min(1, dtSeconds * 14);
  }

  // Wave 7 — hunger tick (playing mode only; skip in menu/dead states).
  {
    const hungerResult = tickHunger({
      hunger: state.hunger,
      saturation: state.saturation,
      starveAccumSec: state.starveAccumSec,
      health: state.health,
      maxHealth: state.maxHealth,
      dtSeconds,
      isSprinting: state.isSprinting && state.onGround,
    });
    state.hunger = hungerResult.hunger;
    state.saturation = hungerResult.saturation;
    state.starveAccumSec = hungerResult.starveAccumSec;
    if (hungerResult.regenHp > 0) {
      state.health = Math.min(state.maxHealth, state.health + hungerResult.regenHp);
    }
    if (hungerResult.starveHp > 0) {
      takeDamage(hungerResult.starveHp, "starvation");
    }
  }

  // Wave 11 — swing cooldown countdown.
  if (state.playerSwingCooldownRemaining > 0) {
    state.playerSwingCooldownRemaining = Math.max(0, state.playerSwingCooldownRemaining - dtSeconds);
  }
  // Wave 11 — knockback timer: counts down each tick so the horizontal vel survives long
  // enough to be picked up by resolveAxis (see land-movement branch below).
  if (state.playerKnockbackRemaining > 0) {
    state.playerKnockbackRemaining = Math.max(0, state.playerKnockbackRemaining - dtSeconds);
  }

  clampPlayer();
  world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
  updateFurnaceSimulation(deltaMs);
  updateHostileMobs(deltaMs);
  updatePassiveMobs(deltaMs);
  updateTorchLights(deltaMs);
  updateParticles(deltaMs);
  updateFallingBlocks();
  updateBranchEncounterState();
  updateObjectives(deltaMs);
  updateCameraTransform();
  updateTargetBlockFromCenter();
  // Wave 11 — audio tick (ambience, mob proximity growl, music).
  updateAudio(state, world, hostileMobs, worldConfig.generation.seaLevel || 38);
  refreshHud();
  updateCraftPanel();
  updateFurnacePanel();
  updateInventoryPanel();
  updateChestPanel();

  const now = performance.now();
  const autosaveDue = !isAutomationSession && now - lastAutosaveAt >= simConfig.autosaveIntervalMs;
  // Skip autosave while a save/load is in flight (race) or while the player is mid-break (would lose progress).
  if (autosaveDue && !saveInFlight && !state.breakProgress.targetKey) {
    lastAutosaveAt = now;
    saveGame("autosave");
  }
}

function render() {
  composer.render();
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
  closeChestPanel,
  breakBlockAt: breakBlock,
  placeBlockAt: placeBlock,
  toNdc,
  toggleF3Overlay: () => {
    state.f3Visible = !state.f3Visible;
  },
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
  // Armor slot click
  const armorBtn = event.target.closest("[data-armor-slot]");
  if (armorBtn) {
    const slotIndex = Number(armorBtn.dataset.armorSlot);
    onArmorSlotClick(slotIndex);
    return;
  }
  // Inventory slot click
  const slotButton = event.target.closest("[data-slot-index]");
  if (!slotButton) {
    return;
  }
  const slotIndex = Number(slotButton.dataset.slotIndex);
  onInventorySlotClick(slotIndex);
});

// Wave 10 — craft panel grid + result slot + inventory clicks
if (craftPanel) {
  craftPanel.addEventListener("click", (event) => {
    // Grid slot click
    const gridCell = event.target.closest("[data-grid-index]");
    if (gridCell) {
      const gridIndex = Number(gridCell.dataset.gridIndex);
      onCraftGridSlotClick(gridIndex);
      return;
    }
    // Result slot click
    if (event.target.closest("#craft-result-slot")) {
      takeCraftingResult();
      return;
    }
    // Player inventory grid inside craft panel
    const invBtn = event.target.closest("[data-craft-inv-index]");
    if (invBtn) {
      onCraftInvClick(Number(invBtn.dataset.craftInvIndex));
      return;
    }
    // Recipe craft button (existing)
    const button = event.target.closest("button");
    if (button && button.closest("#craft-recipes")) {
      // recipe buttons have their own listeners added dynamically in updateCraftPanel
    }
  });
}

// Wave 10 — chest panel clicks
if (chestPanel) {
  chestPanel.addEventListener("click", (event) => {
    const chestCell = event.target.closest("[data-chest-slot]");
    if (chestCell) {
      onChestStorageClick(Number(chestCell.dataset.chestSlot));
      return;
    }
    const invBtn = event.target.closest("[data-chest-inv-index]");
    if (invBtn) {
      onChestInvClick(Number(invBtn.dataset.chestInvIndex));
      return;
    }
  });
}

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
  composer.setSize(width, height); // also calls bloomPass.setSize internally
  fxaaPass.material.uniforms["resolution"].value.set(
    1 / (width * renderer.getPixelRatio()),
    1 / (height * renderer.getPixelRatio()),
  );
});

let lastFrame = Number.NaN;
// Wave 11 — rolling FPS counter (exponential moving average).
let _fpsEma = 60;

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
      inLava: state.inLava,
      eyeInLava: state.eyeInLava,
      health: Number(state.health.toFixed(2)),
      maxHealth: state.maxHealth,
      hunger: Number(state.hunger.toFixed(2)),
      maxHunger: state.maxHunger,
      saturation: Number(state.saturation.toFixed(2)),
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
    hotbar: state.inventory.slice(0, HOTBAR_SIZE).map((slot) => {
      if (!slot) return null;
      const entry = { itemId: slot.itemId, count: slot.count };
      if (hasDurability(slot.itemId)) {
        entry.durability = slot.durability ?? TOOL_MAX_DURABILITY[slot.itemId] ?? 0;
        entry.maxDurability = TOOL_MAX_DURABILITY[slot.itemId] ?? 0;
      }
      return entry;
    }),
    inventory: {
      open: state.inventoryOpen,
      transferIndex: state.inventoryTransferIndex,
      slots: state.inventory.map((slot) => {
        if (!slot) return null;
        const entry = { itemId: slot.itemId, count: slot.count };
        if (hasDurability(slot.itemId)) {
          entry.durability = slot.durability ?? TOOL_MAX_DURABILITY[slot.itemId] ?? 0;
          entry.maxDurability = TOOL_MAX_DURABILITY[slot.itemId] ?? 0;
        }
        return entry;
      }),
    },
    crafting: {
      open: state.craftingOpen,
      nearWorkbench: isWorkbenchNearby(),
      grid: state.craftingGrid.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
      result: (() => { const r = getCurrentGridRecipe(); return r ? { itemId: r.output.itemId, count: r.output.count } : null; })(),
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
        type: mob.mobType || "zombie",
        x: Number(mob.pos.x.toFixed(3)),
        y: Number(mob.pos.y.toFixed(3)),
        z: Number(mob.pos.z.toFixed(3)),
        health: mob.health,
        mode: mob.mode,
        chasing: mob.chasing,
        creeperFuseMs: mob.creeperState ? Math.floor(mob.creeperState.fuseMs) : null,
      })),
      spawnDayFactorThreshold: hostileMobConfig.spawnDayFactorThreshold,
      dayFactor: Number(state.dayFactor.toFixed(3)),
    },
    passiveMobs: {
      count: passiveMobs.length,
      entries: passiveMobs.map((mob) => ({
        id: mob.id,
        type: mob.mobType,
        x: Number(mob.pos.x.toFixed(3)),
        y: Number(mob.pos.y.toFixed(3)),
        z: Number(mob.pos.z.toFixed(3)),
        health: mob.health,
      })),
    },
    arrowProjectiles: {
      count: arrowProjectiles.length,
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
    armor: {
      worn: { ...state.wornArmor },
      totalDefense: getTotalDefense(state.wornArmor),
    },
    chests: {
      count: chestStates.size,
      sample: (() => {
        const first = chestStates.entries().next().value;
        if (!first) return null;
        const [key, slots] = first;
        return { key, slotCount: slots.filter(Boolean).length };
      })(),
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
      // Wave 12 — current biome at player position
      biome: typeof world.biomeAt === "function"
        ? world.biomeAt(Math.floor(state.playerPos.x), Math.floor(state.playerPos.z))?.name ?? "unknown"
        : "unknown",
    },
    nearbyBlocks,
    recentAction: state.recentAction,
  };
  return JSON.stringify(payload);
};

window.__exoCraftDebug = {
  ...(window.__exoCraftDebug || {}),
  // Wave 7 debug hooks
  setHunger: (n) => {
    state.hunger = Math.max(0, Math.min(state.maxHunger, Number(n) || 0));
    state.saturation = 0;
    state.starveAccumSec = 0;
    refreshHud();
    return state.hunger;
  },
  eatSelected: () => eatSelectedFood(),
  spawnHostileMobNearPlayer: (distance = 2.2) => Boolean(spawnHostileMobNearPlayer(distance)),
  // Wave 9 debug hooks
  spawnMob: (type = "zombie", dist = 4) => {
    if (!MOB_TYPES[type]) {
      return `Unknown type: ${type}. Valid: ${Object.keys(MOB_TYPES).join(", ")}`;
    }
    const angle = Math.random() * Math.PI * 2;
    const x = state.playerPos.x + Math.sin(angle) * dist;
    const z = state.playerPos.z - Math.cos(angle) * dist;
    const y = isMobSpawnColumnWalkable(x, z) ?? state.playerPos.y;
    const mob = createHostileMob({ x, y, z }, null, type);
    return mob ? { id: mob.id, type: mob.mobType } : false;
  },
  spawnPassive: (type = "cow", dist = 4) => {
    if (!PASSIVE_MOB_TYPES[type]) {
      return `Unknown type: ${type}. Valid: ${Object.keys(PASSIVE_MOB_TYPES).join(", ")}`;
    }
    const angle = Math.random() * Math.PI * 2;
    const x = state.playerPos.x + Math.sin(angle) * dist;
    const z = state.playerPos.z - Math.cos(angle) * dist;
    const y = isMobSpawnColumnWalkable(x, z) ?? state.playerPos.y;
    const mob = createPassiveMob({ x, y, z }, null, type);
    return mob ? { id: mob.id, type: mob.mobType } : false;
  },
  explodeNearestCreeper: () => {
    const creeper = hostileMobs.find((m) => m.mobType === "creeper");
    if (!creeper) return "No creeper in world";
    const idx = hostileMobs.indexOf(creeper);
    triggerCreeperExplosion(creeper);
    removeHostileMobAt(idx);
    return "Exploded!";
  },
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
    const mobTypeId = hostileMobs[0].mobType || "zombie";
    removeHostileMobAt(0);
    rewardHostileMobDefeat(weaponItemId, mobTypeId);
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
      if (type === CHEST_BLOCK_TYPE) {
        getChestState(toChestKey(tx, ty, tz), true);
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
  // Wave 10 — armor, chest, and crafting debug hooks
  equipArmor: (itemId) => {
    if (typeof itemId !== "string" || !ITEM_DEFS[itemId]) {
      return `Unknown item: ${itemId}`;
    }
    const armorSlot = getArmorSlot(itemId);
    if (!armorSlot) {
      return `${itemId} is not an armor item`;
    }
    state.wornArmor[armorSlot] = itemId;
    markInventoryPanelDirty();
    refreshHud();
    return { slot: armorSlot, itemId, defense: ARMOR_DEFENSE[itemId] ?? 0 };
  },
  hurtPlayer: (amount = 5) => {
    const dmg = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 5;
    takeDamage(dmg, "debug");
    return { health: state.health, maxHealth: state.maxHealth };
  },
  openChestAt: (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const tz = Math.floor(z);
    if (world.get(tx, ty, tz) !== CHEST_BLOCK_TYPE) {
      // Place a chest block for testing
      world.set(tx, ty, tz, CHEST_BLOCK_TYPE);
      world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
      updateTargetBlockFromCenter();
    }
    const key = toChestKey(tx, ty, tz);
    getChestState(key, true);
    openChestPanel(key);
    return { key, accessible: isChestAccessible(key) };
  },
  giveChestItem: (itemId, count = 1, chestKey = null) => {
    const key = chestKey ?? (chestStates.size > 0 ? chestStates.keys().next().value : null);
    if (!key) return "No chest found — use openChestAt() first";
    if (typeof itemId !== "string" || !ITEM_DEFS[itemId]) return `Unknown item: ${itemId}`;
    const chest = getChestState(key, true);
    const leftover = addItemToInventory(chest, itemId, count);
    markChestPanelDirty();
    updateChestPanel(true);
    return { added: count - leftover, leftover };
  },
  getArmorStats: () => ({
    worn: { ...state.wornArmor },
    totalDefense: getTotalDefense(state.wornArmor),
    maxPossible: 20,
  }),
  // Wave 12 — biome debug: find a column in the biome and teleport just above its surface.
  // Usage: __exoCraftDebug.findBiome("forest") — returns {x,z,y,biome} and teleports player.
  // Searches in a spiral out from the player's current position.
  findBiome: (biomeName) => {
    if (typeof world.biomeAt !== "function") {
      return { error: "biomeAt not available" };
    }
    const targetName = typeof biomeName === "string" ? biomeName.toLowerCase() : "";
    const searchRadius = 512; // world units
    const step = 8;           // sample every 8 blocks for speed
    const px = Math.floor(state.playerPos.x);
    const pz = Math.floor(state.playerPos.z);

    let bestX = null;
    let bestZ = null;
    let bestDist = Infinity;

    for (let dz = -searchRadius; dz <= searchRadius; dz += step) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
        const wx = px + dx;
        const wz = pz + dz;
        const b = world.biomeAt(wx, wz);
        if (b && b.name === targetName) {
          const d = dx * dx + dz * dz;
          if (d < bestDist) {
            bestDist = d;
            bestX = wx;
            bestZ = wz;
          }
        }
      }
    }

    if (bestX === null) {
      return { found: false, searched: `${searchRadius * 2}x${searchRadius * 2}` };
    }

    // Teleport player just above the surface.
    const surfY = world.surfaceHeight(bestX, bestZ);
    const teleportY = surfY + 2.5;
    state.playerPos.set(bestX + 0.5, teleportY, bestZ + 0.5);
    state.playerVel.set(0, 0, 0);
    state.onGround = false;
    world.ensureActiveChunksAround(state.playerPos.x, state.playerPos.z);
    updateCameraTransform();
    updateTargetBlockFromCenter();
    markTorchLightsDirty();
    updateTorchLights();
    updateObjectives(0, true);

    return {
      found: true,
      biome: targetName,
      x: bestX,
      z: bestZ,
      y: teleportY,
      distance: Number(Math.sqrt(bestDist).toFixed(1)),
    };
  },
};

function frame(now) {
  if (useExternalTimeStep) {
    lastFrame = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Number.isFinite(lastFrame) ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  // Wave 11 — update rolling FPS estimate.
  if (dt > 0) {
    _fpsEma = _fpsEma * 0.9 + (1 / dt) * 0.1;
  }
  updateSimulation(dt);
  render();
  requestAnimationFrame(frame);
}

respawnPlayer({ healToMax: true });
updateSimulation(0);
render();
requestAnimationFrame(frame);
