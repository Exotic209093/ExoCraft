import { SLAB_BLOCK_IDS, STAIR_BLOCK_IDS } from "./textures";

export function playerAABBAt(position, playerRadius, playerHeight) {
  return {
    minX: position.x - playerRadius,
    maxX: position.x + playerRadius,
    minY: position.y,
    maxY: position.y + playerHeight,
    minZ: position.z - playerRadius,
    maxZ: position.z + playerRadius,
  };
}

export function aabbIntersectsBlock(aabb, x, y, z) {
  return (
    aabb.maxX > x &&
    aabb.minX < x + 1 &&
    aabb.maxY > y &&
    aabb.minY < y + 1 &&
    aabb.maxZ > z &&
    aabb.minZ < z + 1
  );
}

// Wave F4 — block-height-aware AABB test.
// Slabs occupy the lower half of the cell; everything else is full-height.
function getBlockTopY(blockType) {
  return SLAB_BLOCK_IDS.has(blockType) ? 0.5 : 1.0;
}

function aabbIntersectsBlockH(aabb, x, y, z, topFrac) {
  return (
    aabb.maxX > x &&
    aabb.minX < x + 1 &&
    aabb.maxY > y &&
    aabb.minY < y + topFrac &&
    aabb.maxZ > z &&
    aabb.minZ < z + 1
  );
}

// Returns the stair orientation (0=N,1=E,2=S,3=W) from the block id.
// Stair material groups: 34-37 (stone), 38-41 (cobble), 42-45 (plank).
function stairOrient(blockType) {
  if (blockType >= 34 && blockType <= 37) return blockType - 34;
  if (blockType >= 38 && blockType <= 41) return blockType - 38;
  if (blockType >= 42 && blockType <= 45) return blockType - 42;
  return 0;
}

// Test player AABB against a stair cell's two-box collision profile.
// Bottom slab: full footprint (x, y, z) -> (x+1, y+0.5, z+1).
// Upper step:  half footprint on the tall side, (y+0.5..y+1.0).
//   orient 0 (North, tall step on -Z half): x full, z = [z, z+0.5]
//   orient 1 (East,  tall step on +X half): x = [x+0.5, x+1], z full
//   orient 2 (South, tall step on +Z half): x full, z = [z+0.5, z+1]
//   orient 3 (West,  tall step on -X half): x = [x, x+0.5], z full
// These boxes mirror exactly the emitBox calls in world.js ~lines 2008-2027.
function aabbIntersectsStair(aabb, x, y, z, orient) {
  // Bottom slab — full footprint, half height.
  const hitsBottom = (
    aabb.maxX > x && aabb.minX < x + 1 &&
    aabb.maxY > y && aabb.minY < y + 0.5 &&
    aabb.maxZ > z && aabb.minZ < z + 1
  );
  if (hitsBottom) return true;

  // Upper step — orientation-dependent half footprint, upper half.
  let sx0 = x, sx1 = x + 1, sz0 = z, sz1 = z + 1;
  switch (orient) {
    case 0: sz1 = z + 0.5; break; // North: tall step on -Z half
    case 1: sx0 = x + 0.5; break; // East:  tall step on +X half
    case 2: sz0 = z + 0.5; break; // South: tall step on +Z half
    case 3: sx1 = x + 0.5; break; // West:  tall step on -X half
  }
  return (
    aabb.maxX > sx0 && aabb.minX < sx1 &&
    aabb.maxY > y + 0.5 && aabb.minY < y + 1.0 &&
    aabb.maxZ > sz0 && aabb.minZ < sz1
  );
}

// Returns the effective top-Y fraction for the stair box that the player is
// standing on (used by the Y-axis resolver to land the player at the right height).
// If the player overlaps the upper step sub-box, they land at 1.0; otherwise
// they're on the bottom slab and land at 0.5.
function stairTopFracForAabb(aabb, x, y, z, orient) {
  let sx0 = x, sx1 = x + 1, sz0 = z, sz1 = z + 1;
  switch (orient) {
    case 0: sz1 = z + 0.5; break;
    case 1: sx0 = x + 0.5; break;
    case 2: sz0 = z + 0.5; break;
    case 3: sx1 = x + 0.5; break;
  }
  const upperStepOverlap = (
    aabb.maxX > sx0 && aabb.minX < sx1 &&
    aabb.maxZ > sz0 && aabb.minZ < sz1
  );
  return upperStepOverlap ? 1.0 : 0.5;
}

// Block ids that the player can move through (passable for collision purposes).
// Water is passable — the player enters and swims; buoyancy is handled in main.js.
// Lava is also passable — damage and movement slowdown handled in main.js (Wave 8).
// Flora (Wave 11) — cross-quad, no collision; player walks through freely.
const PASSABLE_BLOCKS = new Set([
  15, // water
  21, // lava (Wave 8)
  23, // tall grass (Wave 11)
  24, // flower (Wave 11)
  25, // sapling (Wave 11)
]);

function isPassable(blockType) {
  return blockType === 0 || PASSABLE_BLOCKS.has(blockType);
}

function aabbCollidesWorld(aabb, world, epsilon) {
  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX - epsilon);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY - epsilon);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ - epsilon);

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const bt = world.get(x, y, z);
        if (isPassable(bt)) {
          continue;
        }
        if (STAIR_BLOCK_IDS.has(bt)) {
          if (aabbIntersectsStair(aabb, x, y, z, stairOrient(bt))) return true;
        } else if (aabbIntersectsBlockH(aabb, x, y, z, getBlockTopY(bt))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function resolveAxis({
  axis,
  delta,
  state,
  world,
  playerRadius,
  playerHeight,
  epsilon,
  allowStepUp = false,
  stepHeight = 0,
}) {
  if (delta === 0) {
    return;
  }

  state.playerPos[axis] += delta;
  let aabb = playerAABBAt(state.playerPos, playerRadius, playerHeight);

  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX - epsilon);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY - epsilon);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ - epsilon);

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const bt = world.get(x, y, z);
        if (isPassable(bt)) {
          continue;
        }
        const isStair = STAIR_BLOCK_IDS.has(bt);
        const orient = isStair ? stairOrient(bt) : 0;
        if (isStair) {
          if (!aabbIntersectsStair(aabb, x, y, z, orient)) continue;
        } else {
          const topFrac = getBlockTopY(bt);
          if (!aabbIntersectsBlockH(aabb, x, y, z, topFrac)) continue;
        }

        if (axis === "x") {
          if (allowStepUp && stepHeight > 0) {
            const originalY = state.playerPos.y;
            state.playerPos.y = originalY + stepHeight;
            const steppedAabb = playerAABBAt(state.playerPos, playerRadius, playerHeight);
            if (!aabbCollidesWorld(steppedAabb, world, epsilon)) {
              state.playerVel.y = Math.max(0, state.playerVel.y);
              state.onGround = true;
              aabb = steppedAabb;
              continue;
            }
            state.playerPos.y = originalY;
          }
          if (delta > 0) {
            state.playerPos.x = x - playerRadius - epsilon;
          } else {
            state.playerPos.x = x + 1 + playerRadius + epsilon;
          }
          state.playerVel.x = 0;
        } else if (axis === "y") {
          if (delta > 0) {
            state.playerPos.y = y - playerHeight - epsilon;
          } else {
            // Land on top of the colliding box.
            // For stairs, this depends on which sub-box (bottom slab vs upper step)
            // the player's XZ footprint overlaps; for slabs/cubes use the scalar topFrac.
            const topFrac = isStair
              ? stairTopFracForAabb(aabb, x, y, z, orient)
              : getBlockTopY(bt);
            state.playerPos.y = y + topFrac + epsilon;
            state.onGround = true;
          }
          state.playerVel.y = 0;
        } else if (axis === "z") {
          if (allowStepUp && stepHeight > 0) {
            const originalY = state.playerPos.y;
            state.playerPos.y = originalY + stepHeight;
            const steppedAabb = playerAABBAt(state.playerPos, playerRadius, playerHeight);
            if (!aabbCollidesWorld(steppedAabb, world, epsilon)) {
              state.playerVel.y = Math.max(0, state.playerVel.y);
              state.onGround = true;
              aabb = steppedAabb;
              continue;
            }
            state.playerPos.y = originalY;
          }
          if (delta > 0) {
            state.playerPos.z = z - playerRadius - epsilon;
          } else {
            state.playerPos.z = z + 1 + playerRadius + epsilon;
          }
          state.playerVel.z = 0;
        }
        aabb = playerAABBAt(state.playerPos, playerRadius, playerHeight);
      }
    }
  }
}
