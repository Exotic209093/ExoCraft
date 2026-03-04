import "./style.css";
import * as THREE from "three";

const WORLD_SIZE = { x: 48, y: 24, z: 48 };
const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 6.2;
const TURN_SPEED = 2.3;
const GRAVITY = -28;
const JUMP_SPEED = 10.5;
const MAX_REACH = 6;
const FIXED_STEP_MS = 1000 / 60;
const EPSILON = 1e-4;
const MAX_NEARBY_BLOCKS = 20;

const BLOCK_TYPES = [
  { id: 1, name: "Grass", color: 0x76cc58 },
  { id: 2, name: "Dirt", color: 0x8b613d },
  { id: 3, name: "Stone", color: 0x80878f },
  { id: 4, name: "Wood", color: 0x9a6a3b },
  { id: 5, name: "Leaf", color: 0x61b76a },
];

const BLOCK_BY_ID = new Map(BLOCK_TYPES.map((block) => [block.id, block]));

const app = document.querySelector("#app");
const menu = document.querySelector("#menu");
const startButton = document.querySelector("#start-btn");
const hud = document.querySelector("#hud");
const hotbarEl = document.querySelector("#hotbar");
const statsEl = document.querySelector("#stats");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.tabIndex = 1;
renderer.domElement.setAttribute("aria-label", "ExoCraft canvas");
app.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c8ff);
scene.fog = new THREE.Fog(0x86c8ff, 24, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
camera.rotation.order = "YXZ";

const hemiLight = new THREE.HemisphereLight(0xb6e0ff, 0x4f4638, 1.22);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff4d7, 1.12);
sun.position.set(30, 48, 24);
scene.add(sun);

const blockMaterials = new Map(
  BLOCK_TYPES.map((block) => [
    block.id,
    new THREE.MeshLambertMaterial({
      color: block.color,
    }),
  ]),
);

const CARDINAL_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

class VoxelWorld {
  constructor(size, materials) {
    this.size = size;
    this.materials = materials;
    this.blocks = new Uint8Array(size.x * size.y * size.z);
    this.totalSolid = 0;
    this.meshGroup = new THREE.Group();
    this.meshes = [];
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.tempMatrix = new THREE.Matrix4();
    this.dirty = true;
  }

  index(x, y, z) {
    return x + this.size.x * (z + this.size.z * y);
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.size.x && y >= 0 && y < this.size.y && z >= 0 && z < this.size.z;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) {
      return 0;
    }
    return this.blocks[this.index(x, y, z)];
  }

  set(x, y, z, type, markDirty = true) {
    if (!this.inBounds(x, y, z)) {
      return false;
    }
    const idx = this.index(x, y, z);
    const previous = this.blocks[idx];
    if (previous === type) {
      return false;
    }
    if (previous > 0) {
      this.totalSolid -= 1;
    }
    if (type > 0) {
      this.totalSolid += 1;
    }
    this.blocks[idx] = type;
    if (markDirty) {
      this.dirty = true;
    }
    return true;
  }

  noise2(x, z) {
    const raw = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return raw - Math.floor(raw);
  }

  surfaceHeight(x, z) {
    const h1 = Math.sin(x * 0.17) * 1.7;
    const h2 = Math.cos(z * 0.13) * 1.4;
    const h3 = Math.sin((x + z) * 0.11) * 1.2;
    const h4 = (this.noise2(x, z) - 0.5) * 2.2;
    const value = Math.floor(7 + h1 + h2 + h3 + h4);
    return THREE.MathUtils.clamp(value, 2, this.size.y - 6);
  }

  generateTerrain() {
    this.blocks.fill(0);
    this.totalSolid = 0;
    this.dirty = true;

    for (let x = 0; x < this.size.x; x += 1) {
      for (let z = 0; z < this.size.z; z += 1) {
        const topY = this.surfaceHeight(x, z);
        for (let y = 0; y <= topY; y += 1) {
          let type = 3;
          if (y === topY) {
            type = 1;
          } else if (y >= topY - 2) {
            type = 2;
          }
          this.set(x, y, z, type, false);
        }

        const treeNoise = this.noise2(x * 3 + 11, z * 3 + 17);
        if (treeNoise > 0.985 && topY + 4 < this.size.y) {
          const trunkHeight = 3 + Math.floor(this.noise2(x + 91, z + 47) * 2);
          for (let y = 1; y <= trunkHeight; y += 1) {
            this.set(x, topY + y, z, 4, false);
          }

          const leafBase = topY + trunkHeight;
          for (let lx = x - 1; lx <= x + 1; lx += 1) {
            for (let lz = z - 1; lz <= z + 1; lz += 1) {
              for (let ly = leafBase - 1; ly <= leafBase + 1; ly += 1) {
                if (!this.inBounds(lx, ly, lz)) {
                  continue;
                }
                const distance = Math.abs(lx - x) + Math.abs(lz - z) + Math.abs(ly - leafBase);
                if (distance > 2) {
                  continue;
                }
                if (this.get(lx, ly, lz) === 0) {
                  this.set(lx, ly, lz, 5, false);
                }
              }
            }
          }
        }
      }
    }
  }

  hasExposedFace(x, y, z) {
    for (const [dx, dy, dz] of CARDINAL_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!this.inBounds(nx, ny, nz) || this.get(nx, ny, nz) === 0) {
        return true;
      }
    }
    return false;
  }

  findSurfaceY(x, z) {
    for (let y = this.size.y - 1; y >= 0; y -= 1) {
      if (this.get(x, y, z) > 0) {
        return y;
      }
    }
    return 0;
  }

  rebuildMeshes() {
    for (const mesh of this.meshes) {
      this.meshGroup.remove(mesh);
      if (typeof mesh.dispose === "function") {
        mesh.dispose();
      }
    }
    this.meshes.length = 0;

    const visiblePositions = new Map(BLOCK_TYPES.map((block) => [block.id, []]));
    for (let y = 0; y < this.size.y; y += 1) {
      for (let z = 0; z < this.size.z; z += 1) {
        for (let x = 0; x < this.size.x; x += 1) {
          const type = this.get(x, y, z);
          if (type === 0 || !this.hasExposedFace(x, y, z)) {
            continue;
          }
          visiblePositions.get(type).push(x, y, z);
        }
      }
    }

    for (const blockType of BLOCK_TYPES) {
      const points = visiblePositions.get(blockType.id);
      if (!points || points.length === 0) {
        continue;
      }
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials.get(blockType.id), points.length / 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < points.length; i += 3) {
        this.tempMatrix.makeTranslation(points[i] + 0.5, points[i + 1] + 0.5, points[i + 2] + 0.5);
        mesh.setMatrixAt(i / 3, this.tempMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
      this.meshGroup.add(mesh);
    }

    this.dirty = false;
  }
}

const world = new VoxelWorld(WORLD_SIZE, blockMaterials);
world.generateTerrain();
world.rebuildMeshes();
scene.add(world.meshGroup);

const targetOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);
targetOutline.visible = false;
scene.add(targetOutline);

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();

const state = {
  mode: "menu",
  keys: new Set(),
  playerPos: new THREE.Vector3(),
  playerVel: new THREE.Vector3(),
  yaw: Math.PI,
  pitch: -0.12,
  onGround: false,
  jumpQueued: false,
  selectedBlock: 1,
  pointerLocked: false,
  targetBlock: null,
  recentAction: "Spawned",
};

// Automation runs should advance only through window.advanceTime().
const isAutomationSession = typeof window.__drainVirtualTimePending === "function";
let useExternalTimeStep = isAutomationSession;

function playerAABBAt(position) {
  return {
    minX: position.x - PLAYER_RADIUS,
    maxX: position.x + PLAYER_RADIUS,
    minY: position.y,
    maxY: position.y + PLAYER_HEIGHT,
    minZ: position.z - PLAYER_RADIUS,
    maxZ: position.z + PLAYER_RADIUS,
  };
}

function aabbIntersectsBlock(aabb, x, y, z) {
  return (
    aabb.maxX > x &&
    aabb.minX < x + 1 &&
    aabb.maxY > y &&
    aabb.minY < y + 1 &&
    aabb.maxZ > z &&
    aabb.minZ < z + 1
  );
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
  const aabb = playerAABBAt(state.playerPos);
  return aabbIntersectsBlock(aabb, x, y, z);
}

function toNdc(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

function hitTest(ndcX = 0, ndcY = 0, maxDistance = MAX_REACH) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(world.meshGroup.children, false);
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
    return;
  }

  const normal = getWorldNormal(hit);
  if (!normal) {
    state.targetBlock = null;
    targetOutline.visible = false;
    return;
  }

  const coords = toBlockCoords(hit.point, normal, -1);
  const type = world.get(coords.x, coords.y, coords.z);
  if (type === 0) {
    state.targetBlock = null;
    targetOutline.visible = false;
    return;
  }

  state.targetBlock = {
    ...coords,
    type,
    name: BLOCK_BY_ID.get(type).name,
  };
  targetOutline.visible = true;
  targetOutline.position.set(coords.x + 0.5, coords.y + 0.5, coords.z + 0.5);
}

function breakBlock(ndcX = 0, ndcY = 0) {
  const hit = hitTest(ndcX, ndcY);
  if (!hit) {
    return false;
  }
  const normal = getWorldNormal(hit);
  if (!normal) {
    return false;
  }
  const coords = toBlockCoords(hit.point, normal, -1);
  if (!world.inBounds(coords.x, coords.y, coords.z)) {
    return false;
  }
  const type = world.get(coords.x, coords.y, coords.z);
  if (type === 0 || coords.y === 0) {
    return false;
  }
  world.set(coords.x, coords.y, coords.z, 0);
  if (world.dirty) {
    world.rebuildMeshes();
  }
  state.recentAction = `Broke ${BLOCK_BY_ID.get(type).name} @ ${coords.x},${coords.y},${coords.z}`;
  updateTargetBlockFromCenter();
  return true;
}

function placeBlock(ndcX = 0, ndcY = 0) {
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
  world.set(coords.x, coords.y, coords.z, state.selectedBlock);
  if (world.dirty) {
    world.rebuildMeshes();
  }
  state.recentAction = `Placed ${BLOCK_BY_ID.get(state.selectedBlock).name} @ ${coords.x},${coords.y},${coords.z}`;
  updateTargetBlockFromCenter();
  return true;
}

function updateCameraTransform() {
  camera.position.set(state.playerPos.x, state.playerPos.y + EYE_HEIGHT, state.playerPos.z);
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function pickSpawnPoint() {
  const centerX = Math.floor(world.size.x / 2);
  const centerZ = Math.floor(world.size.z / 2);
  let bestCandidate = null;

  for (let dz = -14; dz <= 14; dz += 1) {
    for (let dx = -14; dx <= 14; dx += 1) {
      const x = centerX + dx;
      const z = centerZ + dz;
      if (!world.inBounds(x, 1, z)) {
        continue;
      }
      const y = world.findSurfaceY(x, z);
      const surfaceType = world.get(x, y, z);
      if (surfaceType === 0 || surfaceType === 4 || surfaceType === 5) {
        continue;
      }
      if (!world.inBounds(x, y + 2, z)) {
        continue;
      }
      if (world.get(x, y + 1, z) !== 0 || world.get(x, y + 2, z) !== 0) {
        continue;
      }
      let openNeighbors = 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!world.inBounds(nx, 1, nz)) {
          continue;
        }
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

  const best = bestCandidate || { x: centerX, z: centerZ, y: 3 };
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

function respawnPlayer() {
  const spawn = pickSpawnPoint();
  state.playerPos.set(spawn.x, spawn.y, spawn.z);
  state.playerVel.set(0, 0, 0);
  state.onGround = false;
  state.yaw = spawn.yaw;
  state.pitch = -0.12;
  updateCameraTransform();
}

function regenerateWorld() {
  world.generateTerrain();
  world.rebuildMeshes();
  respawnPlayer();
  state.recentAction = "Regenerated terrain";
}

function resolveAxis(axis, delta) {
  if (delta === 0) {
    return;
  }

  state.playerPos[axis] += delta;
  let aabb = playerAABBAt(state.playerPos);

  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX - EPSILON);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY - EPSILON);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ - EPSILON);

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (world.get(x, y, z) === 0) {
          continue;
        }
        if (!aabbIntersectsBlock(aabb, x, y, z)) {
          continue;
        }

        if (axis === "x") {
          if (delta > 0) {
            state.playerPos.x = x - PLAYER_RADIUS - EPSILON;
          } else {
            state.playerPos.x = x + 1 + PLAYER_RADIUS + EPSILON;
          }
          state.playerVel.x = 0;
        } else if (axis === "y") {
          if (delta > 0) {
            state.playerPos.y = y - PLAYER_HEIGHT - EPSILON;
          } else {
            state.playerPos.y = y + 1 + EPSILON;
            state.onGround = true;
          }
          state.playerVel.y = 0;
        } else if (axis === "z") {
          if (delta > 0) {
            state.playerPos.z = z - PLAYER_RADIUS - EPSILON;
          } else {
            state.playerPos.z = z + 1 + PLAYER_RADIUS + EPSILON;
          }
          state.playerVel.z = 0;
        }
        aabb = playerAABBAt(state.playerPos);
      }
    }
  }
}

function clampPlayer() {
  state.playerPos.x = THREE.MathUtils.clamp(state.playerPos.x, PLAYER_RADIUS + 0.01, world.size.x - PLAYER_RADIUS - 0.01);
  state.playerPos.z = THREE.MathUtils.clamp(state.playerPos.z, PLAYER_RADIUS + 0.01, world.size.z - PLAYER_RADIUS - 0.01);
  if (state.playerPos.y < -5) {
    respawnPlayer();
    state.recentAction = "Respawned";
  }
}

function updateHud() {
  const x = state.playerPos.x.toFixed(1);
  const y = state.playerPos.y.toFixed(1);
  const z = state.playerPos.z.toFixed(1);
  const lockState = state.pointerLocked ? "look:locked" : "look:free";
  statsEl.textContent = `XYZ ${x}, ${y}, ${z} | solid ${world.totalSolid} | ${lockState}`;

  hotbarEl.textContent = BLOCK_TYPES.map((block, index) => {
    const label = `${index + 1}:${block.name}`;
    return state.selectedBlock === block.id ? `[${label}]` : label;
  }).join("  ");
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
        if (results.length >= MAX_NEARBY_BLOCKS) {
          return results;
        }
      }
    }
  }
  return results;
}

function updateSimulation(dtSeconds) {
  if (state.mode !== "playing") {
    updateCameraTransform();
    updateTargetBlockFromCenter();
    updateHud();
    return;
  }

  const turnInput = (state.keys.has("ArrowRight") ? 1 : 0) - (state.keys.has("ArrowLeft") ? 1 : 0);
  state.yaw += turnInput * TURN_SPEED * dtSeconds;

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

  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const forwardX = sinYaw;
  const forwardZ = -cosYaw;
  const rightX = cosYaw;
  const rightZ = sinYaw;

  state.playerVel.x = (forwardX * forwardInput + rightX * strafeInput) * MOVE_SPEED;
  state.playerVel.z = (forwardZ * forwardInput + rightZ * strafeInput) * MOVE_SPEED;
  state.playerVel.y += GRAVITY * dtSeconds;

  if (state.jumpQueued && state.onGround) {
    state.playerVel.y = JUMP_SPEED;
    state.onGround = false;
    state.recentAction = "Jumped";
  }
  state.jumpQueued = false;

  state.onGround = false;
  resolveAxis("x", state.playerVel.x * dtSeconds);
  resolveAxis("y", state.playerVel.y * dtSeconds);
  resolveAxis("z", state.playerVel.z * dtSeconds);

  if (state.onGround && state.playerVel.y < 0) {
    state.playerVel.y = 0;
  }

  clampPlayer();
  updateCameraTransform();
  updateTargetBlockFromCenter();
  updateHud();
}

function render() {
  renderer.render(scene, camera);
}

function startGame() {
  if (state.mode === "playing") {
    return;
  }
  state.mode = "playing";
  menu.classList.add("hidden");
  hud.classList.remove("hidden");
  state.keys.clear();
  state.jumpQueued = false;
  renderer.domElement.focus();
  state.recentAction = "Started game";
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

window.addEventListener("keydown", (event) => {
  const { code } = event;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
    event.preventDefault();
  }

  if (code === "Enter" && state.mode === "menu") {
    startGame();
    return;
  }

  if (state.mode !== "playing") {
    return;
  }

  const isRepeat = event.repeat;

  if (code === "Space") {
    state.jumpQueued = true;
  }
  if (code === "KeyF" && !isRepeat) {
    toggleFullscreen();
  }
  if (code === "KeyR" && !isRepeat) {
    regenerateWorld();
  }
  if (code === "KeyL" && !isRepeat) {
    togglePointerLock();
  }
  if (code.startsWith("Digit") && !isRepeat) {
    const slot = Number(code.replace("Digit", ""));
    if (slot >= 1 && slot <= BLOCK_TYPES.length) {
      state.selectedBlock = BLOCK_TYPES[slot - 1].id;
      state.recentAction = `Selected ${BLOCK_BY_ID.get(state.selectedBlock).name}`;
    }
  }

  state.keys.add(code);
});

window.addEventListener("keyup", (event) => {
  state.keys.delete(event.code);
});

window.addEventListener("blur", () => {
  state.keys.clear();
  state.jumpQueued = false;
});

document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === renderer.domElement;
});

window.addEventListener("mousemove", (event) => {
  if (state.mode !== "playing" || !state.pointerLocked) {
    return;
  }
  state.yaw -= event.movementX * 0.0024;
  state.pitch -= event.movementY * 0.002;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.45, 1.45);
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

renderer.domElement.addEventListener("mousedown", (event) => {
  if (state.mode !== "playing") {
    return;
  }
  renderer.domElement.focus();

  if (event.button === 1) {
    togglePointerLock();
    return;
  }

  const ndc = state.pointerLocked ? { x: 0, y: 0 } : toNdc(event.clientX, event.clientY);
  if (event.button === 0) {
    breakBlock(ndc.x, ndc.y);
  } else if (event.button === 2) {
    placeBlock(ndc.x, ndc.y);
  }
});

startButton.addEventListener("click", () => {
  startGame();
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

window.advanceTime = async (ms) => {
  useExternalTimeStep = true;
  const steps = Math.max(1, Math.round(ms / FIXED_STEP_MS));
  const stepSeconds = ms / steps / 1000;
  for (let i = 0; i < steps; i += 1) {
    updateSimulation(stepSeconds);
  }
  lastFrame = performance.now();
  render();
};

window.render_game_to_text = () => {
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
    },
    view: {
      yaw: Number(state.yaw.toFixed(3)),
      pitch: Number(state.pitch.toFixed(3)),
      pointerLocked: state.pointerLocked,
    },
    selectedBlock: BLOCK_BY_ID.get(state.selectedBlock).name,
    targetBlock: state.targetBlock,
    world: {
      size: WORLD_SIZE,
      solidBlocks: world.totalSolid,
    },
    nearbyBlocks: collectNearbyBlocks(),
    recentAction: state.recentAction,
  };
  return JSON.stringify(payload);
};

let lastFrame = performance.now();
function frame(now) {
  if (useExternalTimeStep) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateSimulation(dt);
  render();
  requestAnimationFrame(frame);
}

respawnPlayer();
updateSimulation(0);
render();
requestAnimationFrame(frame);
