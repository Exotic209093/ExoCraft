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
        if (world.get(x, y, z) === 0) {
          continue;
        }
        if (aabbIntersectsBlock(aabb, x, y, z)) {
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
        if (world.get(x, y, z) === 0) {
          continue;
        }
        if (!aabbIntersectsBlock(aabb, x, y, z)) {
          continue;
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
            state.playerPos.y = y + 1 + epsilon;
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

