import { chromium } from "playwright";

const BASE_URL = process.argv[2] || "http://127.0.0.1:5173";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readState(page) {
  const text = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== "function") return null;
    return window.render_game_to_text();
  });
  if (!text) {
    throw new Error("render_game_to_text is missing");
  }
  return JSON.parse(text);
}

async function step(page, frames = 1) {
  for (let i = 0; i < frames; i += 1) {
    await page.evaluate(async () => {
      if (typeof window.advanceTime === "function") {
        await window.advanceTime(1000 / 60);
      }
    });
  }
}

async function advanceMs(page, ms) {
  await page.evaluate(async (durationMs) => {
    if (typeof window.advanceTime === "function") {
      await window.advanceTime(durationMs);
    }
  }, ms);
}

async function pressForFrames(page, key, frames) {
  await page.keyboard.down(key);
  await step(page, frames);
  await page.keyboard.up(key);
}

async function clickCanvasPoint(page, button = "left", normalizedX = 0.5, normalizedY = 0.5) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box unavailable");
  }
  const x = box.x + box.width * normalizedX;
  const y = box.y + box.height * normalizedY;
  await page.mouse.click(x, y, { button });
}

async function clickInventorySlot(page, slotIndex) {
  await page.click(`#inventory-panel [data-slot-index="${slotIndex}"]`);
}

function countItem(slots, itemId) {
  let total = 0;
  for (const slot of slots || []) {
    if (slot && slot.itemId === itemId) {
      total += slot.count;
    }
  }
  return total;
}

async function clickCraftRecipe(page, recipeName) {
  const row = page.locator("#craft-recipes .craft-row", { hasText: recipeName }).first();
  await row.locator("button").click();
}

async function readCraftRecipeButtonState(page, recipeName) {
  const details = await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll("#craft-recipes .craft-row"));
    const row = rows.find((entry) => entry.textContent?.includes(name));
    if (!row) {
      return null;
    }
    const button = row.querySelector("button");
    if (!button) {
      return null;
    }
    return {
      disabled: button.disabled,
      title: button.title || "",
      label: row.querySelector("span")?.textContent || "",
    };
  }, recipeName);
  if (!details) {
    throw new Error(`Craft recipe row not found: ${recipeName}`);
  }
  return details;
}

async function orientUntilTarget(page, maxTries = 30) {
  for (let i = 0; i < maxTries; i += 1) {
    const state = await readState(page);
    if (state.targetBlock) {
      return true;
    }
    if (i % 4 === 3) {
      await pressForFrames(page, "ArrowUp", 8);
    } else {
      await pressForFrames(page, "ArrowRight", 3);
    }
  }
  return false;
}

function normalizeAngle(value) {
  let v = value;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

async function orientTowardFirstHostileMob(page, maxTries = 6) {
  for (let i = 0; i < maxTries; i += 1) {
    const state = await readState(page);
    const mob = state.hostileMobs?.entries?.[0];
    if (!mob) {
      return false;
    }
    const dx = mob.x - state.player.x;
    const dz = mob.z - state.player.z;
    const targetYaw = Math.atan2(dx, -dz);
    const diff = normalizeAngle(targetYaw - state.view.yaw);
    if (Math.abs(diff) < 0.07) {
      return true;
    }
    const turnKey = diff > 0 ? "ArrowRight" : "ArrowLeft";
    const turnMs = Math.min(1800, Math.max(40, (Math.abs(diff) / 2.3) * 1000));
    await page.keyboard.down(turnKey);
    await advanceMs(page, turnMs);
    await page.keyboard.up(turnKey);
    await advanceMs(page, 80);
  }
  return false;
}

async function ensureItemInHotbar(page, itemId) {
  let state = await readState(page);
  let hotbarIndex = state.hotbar.findIndex((slot) => slot && slot.itemId === itemId);
  if (hotbarIndex >= 0) {
    return hotbarIndex;
  }
  const inventoryIndex = state.inventory.slots.findIndex((slot) => slot && slot.itemId === itemId);
  if (inventoryIndex < 0) {
    return -1;
  }

  await page.keyboard.press("KeyE");
  await step(page, 2);
  state = await readState(page);
  let destination = state.inventory.slots.slice(0, 9).findIndex((slot) => !slot);
  if (destination < 0) {
    destination = 8;
  }

  await clickInventorySlot(page, inventoryIndex);
  await step(page, 1);
  await clickInventorySlot(page, destination);
  await step(page, 1);
  await page.keyboard.press("KeyE");
  await step(page, 2);
  hotbarIndex = destination;
  return hotbarIndex;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const errors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${String(err)}`);
  });

  // Signal automation mode so the game relies on window.advanceTime for updates.
  await page.addInitScript(() => {
    window.__drainVirtualTimePending = () => 0;
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);

  // Bug check: space pressed in menu should not trigger a jump after start.
  await page.keyboard.press("Space");
  await page.click("#start-btn");
  await step(page, 3);
  let state = await readState(page);
  assert(state.mode === "playing", "Game did not enter playing mode");
  assert(Number.isFinite(state.player.health), "Player health missing from text state");
  assert(Number.isFinite(state.player.maxHealth), "Player maxHealth missing from text state");
  assert(Number.isFinite(state.dayNight?.dayFactor), "Day/night state missing from text output");
  assert(Number.isFinite(state.dayNight?.timeOfDayMs), "Day/night time missing from text output");
  assert(typeof state.hostileMobs?.enabled === "boolean", "Hostile mob state missing from text output");
  assert(Number.isFinite(state.hostileMobs?.count), "Hostile mob count missing from text output");
  assert(Number.isFinite(state.combat?.baseMobDamage), "Combat mob damage state missing from text output");
  assert(Number.isFinite(state.progression?.resources?.copperOre), "Progression copper ore state missing from text output");
  assert(Number.isFinite(state.progression?.resources?.copperIngot), "Progression copper ingot state missing from text output");
  assert(typeof state.progression?.specialItems?.wardenTotem === "boolean", "Special item progression state missing");
  assert(Number.isFinite(state.bonuses?.total?.maxHealthBonus), "Combined bonuses state missing from text output");
  assert(typeof state.torchLighting?.enabled === "boolean", "Torch lighting state missing from text output");
  assert(Number.isFinite(state.objectives?.total), "Objectives payload missing total count");
  assert(Number.isFinite(state.objectives?.index), "Objectives payload missing current index");
  assert(state.objectives.total >= 5, "Objective sequence should include at least 5 goals");
  assert(state.objectives.index === 0, "Initial objective index should begin at 0");
  assert(state.objectives.current?.id === "collect_copper_ore", "Initial objective should target copper ore collection");
  assert(state.recentAction !== "Jumped", "Space in menu leaked into gameplay and triggered jump");
  const dayNightStart = state.dayNight.timeOfDayMs;
  await step(page, 30);
  state = await readState(page);
  assert(state.dayNight.timeOfDayMs !== dayNightStart, "Day/night clock did not advance with simulation steps");

  // Bug check: no automatic simulation while waiting in automation mode.
  const p1 = state.player;
  await page.waitForTimeout(250);
  const p2 = (await readState(page)).player;
  assert(
    Math.abs(p1.x - p2.x) < 0.001 && Math.abs(p1.y - p2.y) < 0.001 && Math.abs(p1.z - p2.z) < 0.001,
    "Player moved without advanceTime in automation mode",
  );

  // Bug check: R should not regenerate while in menu.
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  await page.keyboard.press("KeyR");
  state = await readState(page);
  assert(state.mode === "menu", "Mode changed unexpectedly when pressing R in menu");
  assert(state.recentAction !== "Regenerated terrain", "R regenerated world while still in menu");

  // Start a play session for interaction checks.
  await page.click("#start-btn");
  await step(page, 4);

  // Bug check: inventory panel toggles, exposes slot state, and supports moving stacks.
  await page.keyboard.press("KeyE");
  await step(page, 2);
  state = await readState(page);
  assert(state.inventory.open === true, "KeyE did not open inventory panel");
  assert(Array.isArray(state.inventory.slots), "Inventory slot state missing from render output");
  assert(state.inventory.slots.length >= 24, "Inventory slot count is lower than expected");
  assert(state.inventory.slots[0]?.itemId === "grass", "Starting hotbar slot 1 should contain grass");

  await clickInventorySlot(page, 0);
  await step(page, 1);
  state = await readState(page);
  assert(state.inventory.transferIndex === 0, "Inventory source slot was not selected");

  await clickInventorySlot(page, 10);
  await step(page, 1);
  state = await readState(page);
  assert(state.inventory.transferIndex === null, "Transfer selection should clear after move");
  assert(state.inventory.slots[0] === null, "Slot 1 should be empty after moving stack to backpack");
  assert(state.inventory.slots[10]?.itemId === "grass", "Backpack slot did not receive moved stack");

  await page.keyboard.press("Digit1");
  await step(page, 1);
  state = await readState(page);
  assert(state.selectedBlock === "Empty", "Digit1 should select Empty after moving slot 1 stack");

  await page.keyboard.press("KeyE");
  await step(page, 2);
  state = await readState(page);
  assert(state.inventory.open === false, "KeyE did not close inventory panel");

  // Bug check: furnace flow (craft -> place -> smelt -> take output).
  await page.keyboard.press("KeyC");
  await step(page, 2);
  await clickCraftRecipe(page, "Furnace");
  await step(page, 2);
  state = await readState(page);
  const furnaceSlot = state.hotbar.findIndex((slot) => slot && slot.itemId === "furnace");
  assert(furnaceSlot >= 0, "Crafted furnace not found in hotbar");
  await page.keyboard.press(`Digit${furnaceSlot + 1}`);
  await page.keyboard.press("KeyC");
  await step(page, 2);

  await orientUntilTarget(page);
  const furnaceClickPoints = [
    [0.5, 0.68],
    [0.55, 0.66],
    [0.45, 0.66],
    [0.5, 0.58],
    [0.5, 0.78],
  ];
  let placedFurnace = false;
  for (let i = 0; i < 8; i += 1) {
    const [nx, ny] = furnaceClickPoints[(i + 1) % furnaceClickPoints.length];
    await clickCanvasPoint(page, "right", nx, ny);
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Placed Furnace")) {
      placedFurnace = true;
      break;
    }
    if (i % 2 === 0) {
      await pressForFrames(page, "ArrowUp", 2);
    } else {
      await pressForFrames(page, "ArrowRight", 2);
    }
  }
  assert(placedFurnace, "Could not place furnace for smelting test");

  await page.keyboard.press("KeyV");
  await step(page, 2);
  state = await readState(page);
  assert(state.furnace.open === true, "KeyV did not open furnace panel");
  assert(state.furnace.activeKey, "Furnace panel opened without active nearby furnace");

  await page.click('#furnace-controls button[data-action="load-input"][data-item-id="stone"]');
  await page.click('#furnace-controls button[data-action="load-fuel"][data-item-id="wood"]');
  await step(page, 200);
  await page.click('#furnace-controls button[data-action="take-output"]');
  await step(page, 2);
  state = await readState(page);
  const refinedCount = countItem(state.inventory.slots, "refined_stone");
  assert(refinedCount >= 1, "Furnace smelting did not produce refined stone output");

  await page.keyboard.press("KeyV");
  await step(page, 2);
  state = await readState(page);
  assert(state.furnace.open === false, "KeyV did not close furnace panel");

  // Bug check: survival crafting panel hotkey toggles open/closed in gameplay.
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(state.crafting.open === true, "KeyC did not open crafting panel");
  const craftOpenPos = state.player;
  await pressForFrames(page, "ArrowUp", 12);
  const craftOpenAfterMoveAttempt = await readState(page);
  const craftPanelMoveDistance = Math.hypot(
    craftOpenAfterMoveAttempt.player.x - craftOpenPos.x,
    craftOpenAfterMoveAttempt.player.y - craftOpenPos.y,
    craftOpenAfterMoveAttempt.player.z - craftOpenPos.z,
  );
  assert(craftPanelMoveDistance < 0.05, "Player moved while crafting panel was open");
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(state.crafting.open === false, "KeyC did not close crafting panel");

  // Bug check: selecting an empty hotbar slot should not place blocks.
  await page.keyboard.press("Digit9");
  await step(page, 1);
  state = await readState(page);
  assert(state.selectedSlot === 8, "Digit9 did not select slot 9");
  assert(state.selectedBlock === "Empty", "Empty slot did not report Empty selected item");
  const emptyBeforeSolid = state.world.solidBlocks;
  await clickCanvasPoint(page, "right", 0.5, 0.68);
  await step(page, 2);
  const emptyAfter = await readState(page);
  assert(emptyAfter.world.solidBlocks === emptyBeforeSolid, "Placing from empty slot changed world blocks");

  await page.keyboard.press("Digit3");
  state = await readState(page);
  assert(state.selectedBlock === "Stone", "Digit3 did not select Stone block");

  await orientUntilTarget(page);

  let before = await readState(page);
  let broke = false;
  const clickPoints = [
    [0.5, 0.68],
    [0.55, 0.66],
    [0.45, 0.66],
    [0.5, 0.58],
    [0.5, 0.78],
  ];
  for (let i = 0; i < 8; i += 1) {
    const [nx, ny] = clickPoints[i % clickPoints.length];
    await clickCanvasPoint(page, "left", nx, ny);
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Broke ")) {
      assert(after.world.solidBlocks === before.world.solidBlocks - 1, "Breaking block did not decrement solid count");
      before = after;
      broke = true;
      break;
    }
    if (i % 2 === 0) {
      await pressForFrames(page, "ArrowUp", 3);
    } else {
      await pressForFrames(page, "ArrowRight", 2);
    }
  }
  assert(broke, "Could not break a block during interaction test");

  let placed = false;
  for (let i = 0; i < 8; i += 1) {
    const [nx, ny] = clickPoints[(i + 2) % clickPoints.length];
    await clickCanvasPoint(page, "right", nx, ny);
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Placed ")) {
      assert(after.world.solidBlocks === before.world.solidBlocks + 1, "Placing block did not increment solid count");
      assert(after.recentAction.includes("Stone"), "Placed block did not use selected block type");
      placed = true;
      break;
    }
    if (i % 2 === 0) {
      await pressForFrames(page, "ArrowUp", 3);
    } else {
      await pressForFrames(page, "ArrowRight", 2);
    }
  }
  assert(placed, "Could not place a block during interaction test");

  // Save/load regression check: loading should restore previous player position.
  const savedState = await readState(page);
  await page.click("#save-btn");
  await page.waitForTimeout(150);
  await pressForFrames(page, "ArrowUp", 12);
  await step(page, 6);
  const movedState = await readState(page);
  const movedDistance = Math.hypot(
    movedState.player.x - savedState.player.x,
    movedState.player.y - savedState.player.y,
    movedState.player.z - savedState.player.z,
  );
  assert(movedDistance > 0.25, "Player did not move enough before load-state check");

  await page.click("#load-btn");
  await page.waitForTimeout(300);
  await step(page, 4);
  const loadedState = await readState(page);
  const restoreDistance = Math.hypot(
    loadedState.player.x - savedState.player.x,
    loadedState.player.y - savedState.player.y,
    loadedState.player.z - savedState.player.z,
  );
  assert(restoreDistance < 0.2, "Load did not restore saved player position");
  const cycleMs = Number.isFinite(loadedState.dayNight?.cycleMs) ? loadedState.dayNight.cycleMs : 0;
  let restoreDayNightDelta = Math.abs(loadedState.dayNight.timeOfDayMs - savedState.dayNight.timeOfDayMs);
  if (cycleMs > 0) {
    restoreDayNightDelta = Math.min(restoreDayNightDelta, Math.abs(cycleMs - restoreDayNightDelta));
  }
  assert(restoreDayNightDelta < 200, "Load did not restore saved day/night clock state");

  // Bug check: hostile mobs spawn with nighttime bias and can damage player.
  await advanceMs(page, 180000);
  let nightState = await readState(page);
  let sawNightSpawn = nightState.hostileMobs.count > 0;
  for (let i = 0; i < 8 && !sawNightSpawn; i += 1) {
    await advanceMs(page, 2000);
    nightState = await readState(page);
    sawNightSpawn = nightState.hostileMobs.count > 0;
  }
  assert(sawNightSpawn, "Hostile mobs did not spawn during nighttime progression");

  const forcedSpawn = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.clearHostileMobs === "function") {
      window.__exoCraftDebug.clearHostileMobs();
    }
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.spawnHostileMobNearPlayer === "function") {
      return window.__exoCraftDebug.spawnHostileMobNearPlayer(1.3);
    }
    return false;
  });
  assert(forcedSpawn, "Could not force-spawn a nearby hostile mob for damage interaction test");

  const healthBeforeHostileWindow = nightState.player.health;
  await advanceMs(page, 5000);
  const postHostileState = await readState(page);
  const hostileDamageObserved =
    postHostileState.player.health < healthBeforeHostileWindow || /hostile/.test(postHostileState.recentAction);
  assert(hostileDamageObserved, "Hostile mobs did not cause player damage interaction");

  // Bug check: defeating hostile mobs grants progression drops.
  const boneBefore = countItem(postHostileState.inventory.slots, "bone_shard");
  const dropSpawned = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.clearHostileMobs === "function") {
      window.__exoCraftDebug.clearHostileMobs();
    }
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.spawnHostileMobNearPlayer === "function") {
      return window.__exoCraftDebug.spawnHostileMobNearPlayer(1.8);
    }
    return false;
  });
  assert(dropSpawned, "Could not spawn hostile mob for drop validation");
  const defeatedForDrop = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.defeatNearestHostileMob === "function") {
      return window.__exoCraftDebug.defeatNearestHostileMob();
    }
    return false;
  });
  assert(defeatedForDrop, "Could not defeat hostile mob for drop validation");
  await step(page, 2);
  state = await readState(page);
  const boneAfter = countItem(state.inventory.slots, "bone_shard");
  assert(boneAfter > boneBefore, "Defeating hostile mob did not grant bone shard drops");

  // Bug check: combat upgrade path via crafted weapon increases damage potential.
  const baseMobDamage = state.combat.baseMobDamage;
  await page.keyboard.press("KeyC");
  await step(page, 2);
  await clickCraftRecipe(page, "Planks x4");
  await step(page, 1);
  await clickCraftRecipe(page, "Sticks x4");
  await step(page, 1);
  await clickCraftRecipe(page, "Wood Sword");
  await step(page, 2);
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(countItem(state.inventory.slots, "wood_sword") >= 1, "Crafting Wood Sword failed");
  assert(
    state.combat.bestInventoryMobDamage > baseMobDamage,
    "Crafted weapon did not improve combat damage progression",
  );

  // Bug check: torch crafting + placement should activate local dynamic torch lighting.
  await page.keyboard.press("KeyC");
  await step(page, 2);
  await clickCraftRecipe(page, "Planks x4");
  await step(page, 1);
  await clickCraftRecipe(page, "Sticks x4");
  await step(page, 1);
  await clickCraftRecipe(page, "Torch x4");
  await step(page, 2);
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(countItem(state.inventory.slots, "torch") >= 1, "Crafting torches failed");

  const torchHotbarSlot = await ensureItemInHotbar(page, "torch");
  assert(torchHotbarSlot >= 0, "Torch was not found in inventory");
  await page.keyboard.press(`Digit${torchHotbarSlot + 1}`);
  await step(page, 1);
  await orientUntilTarget(page);

  let placedTorch = false;
  for (let i = 0; i < 8; i += 1) {
    const [nx, ny] = clickPoints[(i + 3) % clickPoints.length];
    await clickCanvasPoint(page, "right", nx, ny);
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Placed Torch")) {
      placedTorch = true;
      break;
    }
    if (i % 2 === 0) {
      await pressForFrames(page, "ArrowUp", 2);
    } else {
      await pressForFrames(page, "ArrowRight", 2);
    }
  }
  assert(placedTorch, "Could not place torch block for lighting validation");
  await advanceMs(page, 400);
  const torchState = await readState(page);
  assert(Number.isFinite(torchState.torchLighting?.activeLights), "Torch lighting output missing active light count");
  assert(torchState.torchLighting.activeLights >= 1, "Placed torch did not activate nearby dynamic lighting");

  // Bug check: world exploration generation includes cave pockets + surface ore nodes.
  const explorationScan = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.scanExplorationStructures === "function") {
      return window.__exoCraftDebug.scanExplorationStructures(18);
    }
    return null;
  });
  assert(explorationScan, "Exploration structure scan hook missing");
  assert(explorationScan.surfaceOre > 0, "No surface ore nodes detected near spawn region");
  assert(explorationScan.caveAir > 0, "No cave pockets detected near spawn region");

  // Bug check: exploration progression loop (ore -> smelt -> copper blade combat upgrade).
  const grantedOre = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.grantInventoryItem === "function") {
      return window.__exoCraftDebug.grantInventoryItem("copper_ore", 3);
    }
    return 0;
  });
  const grantedFuel = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.grantInventoryItem === "function") {
      return window.__exoCraftDebug.grantInventoryItem("wood", 4);
    }
    return 0;
  });
  const grantedStick = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.grantInventoryItem === "function") {
      return window.__exoCraftDebug.grantInventoryItem("stick", 2);
    }
    return 0;
  });
  const grantedBone = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.grantInventoryItem === "function") {
      return window.__exoCraftDebug.grantInventoryItem("bone_shard", 1);
    }
    return 0;
  });
  assert(grantedOre >= 2, "Could not grant copper ore for progression smelting validation");
  assert(grantedFuel >= 2, "Could not grant furnace fuel for progression smelting validation");
  assert(grantedStick >= 1, "Could not grant sticks for progression crafting validation");
  assert(grantedBone >= 1, "Could not grant bone shard for progression crafting validation");

  await page.keyboard.press("KeyV");
  await step(page, 2);
  state = await readState(page);
  assert(state.furnace.open === true, "Furnace panel did not open for copper smelting validation");
  assert(state.furnace.activeKey, "No active furnace found for copper smelting validation");

  await page.click('#furnace-controls button[data-action="load-input"][data-item-id="copper_ore"]');
  await page.click('#furnace-controls button[data-action="load-input"][data-item-id="copper_ore"]');
  await page.click('#furnace-controls button[data-action="load-fuel"][data-item-id="wood"]');
  await page.click('#furnace-controls button[data-action="load-fuel"][data-item-id="wood"]');
  await advanceMs(page, 7000);
  await page.click('#furnace-controls button[data-action="take-output"]');
  await step(page, 2);
  state = await readState(page);
  const copperIngotCount = countItem(state.inventory.slots, "copper_ingot");
  assert(copperIngotCount >= 2, "Copper ore smelting did not produce enough copper ingots");

  await page.keyboard.press("KeyV");
  await step(page, 2);
  state = await readState(page);
  assert(state.furnace.open === false, "Furnace panel did not close after copper smelting validation");

  const damageBeforeCopperBlade = state.combat.bestInventoryMobDamage;
  await page.keyboard.press("KeyC");
  await step(page, 2);
  await clickCraftRecipe(page, "Copper Blade");
  await step(page, 2);
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(countItem(state.inventory.slots, "copper_blade") >= 1, "Copper Blade crafting failed");
  assert(
    state.combat.bestInventoryMobDamage > damageBeforeCopperBlade,
    "Copper Blade progression did not increase best inventory mob damage",
  );
  assert(state.objectives.index >= 3, "Objective progression did not advance after copper blade crafting");

  const nearestCave = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.findNearestCavePocket === "function") {
      return window.__exoCraftDebug.findNearestCavePocket(28);
    }
    return null;
  });
  assert(nearestCave && Number.isFinite(nearestCave.x), "Could not locate cave pocket for objective validation");
  const markedCaveTorch = await page.evaluate((cave) => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.markCaveTorchPlacement === "function") {
      return window.__exoCraftDebug.markCaveTorchPlacement(cave.x, cave.y, cave.z);
    }
    return false;
  }, nearestCave);
  assert(markedCaveTorch, "Could not mark cave torch objective progression");
  await step(page, 2);
  state = await readState(page);
  assert(state.objectives.stats?.caveTorchPlaced === true, "Cave torch objective stat did not update");
  assert(state.objectives.index >= 4, "Objective progression did not advance to hostile defeat step");

  const spawnedForObjective = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.clearHostileMobs === "function") {
      window.__exoCraftDebug.clearHostileMobs();
    }
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.spawnHostileMobNearPlayer === "function") {
      return window.__exoCraftDebug.spawnHostileMobNearPlayer(1.6);
    }
    return false;
  });
  assert(spawnedForObjective, "Could not spawn hostile mob for objective combat validation");
  const defeatedForObjective = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.defeatNearestHostileMob === "function") {
      return window.__exoCraftDebug.defeatNearestHostileMob("copper_blade");
    }
    return false;
  });
  assert(defeatedForObjective, "Could not defeat hostile mob with copper blade objective path");
  await step(page, 2);
  state = await readState(page);
  assert(state.objectives.stats?.copperBladeKills >= 1, "Copper blade kill objective stat did not update");
  assert(state.objectives.completed === true, "Objective sequence did not report completion after final objective");

  const selectedCombatPath = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.setSpecialization === "function") {
      return window.__exoCraftDebug.setSpecialization("combat");
    }
    return false;
  });
  assert(selectedCombatPath, "Could not select combat specialization path");

  for (let i = 0; i < 3; i += 1) {
    const spawned = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.spawnHostileMobNearPlayer === "function") {
        return window.__exoCraftDebug.spawnHostileMobNearPlayer(1.5);
      }
      return false;
    });
    assert(spawned, "Could not spawn hostile mob for specialization combat progression");
    const defeated = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.defeatNearestHostileMob === "function") {
        return window.__exoCraftDebug.defeatNearestHostileMob("copper_blade");
      }
      return false;
    });
    assert(defeated, "Could not defeat hostile mob for specialization combat progression");
    await step(page, 1);
  }
  state = await readState(page);
  assert(state.objectives.specialization?.selected === "combat", "Combat specialization did not remain selected");
  assert(state.objectives.specialization?.completed === true, "Combat specialization did not complete");
  assert(state.objectives.specialization?.rewards?.mobDamageBonus >= 2, "Combat specialization reward missing mob damage bonus");
  assert(state.objectives.specialization?.rewards?.maxHealthBonus >= 4, "Combat specialization reward missing max health bonus");
  assert(state.player.maxHealth >= 24, "Combat specialization did not increase max health");
  assert(state.combat.baseMobDamage >= 4, "Combat specialization did not increase base combat damage");
  assert(state.objectives.current?.id === "combat_branch_forge_vanguard_blade", "Combat midgame objective did not switch to Vanguard Blade forge step");

  const workbenchReady = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.ensureWorkbenchNearby === "function") {
      return window.__exoCraftDebug.ensureWorkbenchNearby();
    }
    return false;
  });
  assert(workbenchReady, "Could not place/ensure nearby workbench for specialization recipe validation");

  await page.evaluate(() => {
    if (!window.__exoCraftDebug || typeof window.__exoCraftDebug.grantInventoryItem !== "function") {
      return;
    }
    window.__exoCraftDebug.grantInventoryItem("copper_blade", 1);
    window.__exoCraftDebug.grantInventoryItem("bone_shard", 12);
    window.__exoCraftDebug.grantInventoryItem("copper_ingot", 6);
    window.__exoCraftDebug.grantInventoryItem("refined_stone", 4);
    window.__exoCraftDebug.grantInventoryItem("charcoal", 4);
    window.__exoCraftDebug.grantInventoryItem("stick", 4);
  });
  await step(page, 2);
  state = await readState(page);
  assert(countItem(state.inventory.slots, "copper_blade") >= 1, "Missing copper blade before branch-exclusive crafting validation");
  assert(countItem(state.inventory.slots, "bone_shard") >= 10, "Missing bone shards before branch-exclusive crafting validation");
  assert(countItem(state.inventory.slots, "copper_ingot") >= 2, "Missing copper ingots before branch-exclusive crafting validation");
  assert(countItem(state.inventory.slots, "refined_stone") >= 2, "Missing refined stone before branch-exclusive crafting validation");
  assert(countItem(state.inventory.slots, "charcoal") >= 2, "Missing charcoal before branch-exclusive crafting validation");
  assert(countItem(state.inventory.slots, "stick") >= 2, "Missing sticks before branch-exclusive crafting validation");

  const maxHealthBeforeCombatCraftables = state.player.maxHealth;
  const moveSpeedBeforeCombatCraftables = state.player.moveSpeed;
  const torchRadiusBeforeCombatCraftables = state.torchLighting.scanRadius;

  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(state.crafting.open === true, "Craft panel did not open for branch-exclusive crafting validation");
  assert(state.crafting.nearWorkbench === true, "Branch-exclusive crafting validation requires nearby workbench");

  const vanguardButton = await readCraftRecipeButtonState(page, "Vanguard Blade");
  const totemButton = await readCraftRecipeButtonState(page, "Warden Totem");
  const compassButton = await readCraftRecipeButtonState(page, "Spelunker Compass");
  assert(vanguardButton.disabled === false, "Combat-exclusive Vanguard Blade recipe should be available on combat branch");
  assert(totemButton.disabled === false, "Combat-exclusive Warden Totem recipe should be available on combat branch");
  assert(compassButton.disabled === true, "Explorer-exclusive Spelunker Compass recipe should be locked on combat branch");
  assert(/explorer|branch/i.test(compassButton.title), "Explorer recipe lock reason should explain specialization requirement");

  await clickCraftRecipe(page, "Vanguard Blade");
  await step(page, 2);
  await clickCraftRecipe(page, "Warden Totem");
  await step(page, 2);
  await page.keyboard.press("KeyC");
  await step(page, 2);
  state = await readState(page);
  assert(state.crafting.open === false, "Craft panel did not close after branch-exclusive crafting validation");

  assert(countItem(state.inventory.slots, "vanguard_blade") >= 1, "Vanguard Blade crafting failed on combat branch");
  assert(countItem(state.inventory.slots, "warden_totem") >= 1, "Warden Totem crafting failed on combat branch");
  assert(countItem(state.inventory.slots, "spelunker_compass") === 0, "Explorer-exclusive Spelunker Compass should not be craftable on combat branch");
  assert(state.player.maxHealth >= maxHealthBeforeCombatCraftables + 3, "Warden Totem passive bonus did not increase max health");
  assert(Math.abs(state.player.moveSpeed - moveSpeedBeforeCombatCraftables) < 0.001, "Combat branch craftables unexpectedly changed move speed");
  assert(
    state.torchLighting.scanRadius === torchRadiusBeforeCombatCraftables,
    "Combat branch craftables unexpectedly changed torch scan radius",
  );
  assert(state.combat.bestInventoryMobDamage >= 14, "Vanguard Blade did not provide expected combat damage upgrade");
  assert(state.bonuses?.items?.maxHealthBonus >= 3, "Item bonus payload missing Warden Totem max-health bonus");
  assert(state.bonuses?.items?.moveSpeedBonus === 0, "Item bonus payload reported explorer move bonus on combat branch");
  assert(state.progression?.specialItems?.wardenTotem === true, "Special item progression payload missing Warden Totem ownership flag");
  assert(state.progression?.specialItems?.vanguardBlade === true, "Special item progression payload missing Vanguard Blade ownership flag");
  assert(state.objectives.current?.id === "combat_branch_reach_ambush_pocket", "Combat midgame objective did not switch to ambush-pocket travel step");

  const combatLoopCompletionsBefore = state.objectives.specialization?.branchLoop?.completions || 0;
  const copperIngotsBeforeCombatLoop = countItem(state.inventory.slots, "copper_ingot");
  const startedCombatEncounter = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.startBranchEncounter === "function") {
      return window.__exoCraftDebug.startBranchEncounter("combat");
    }
    return false;
  });
  assert(startedCombatEncounter, "Could not start combat branch encounter");
  await step(page, 2);
  state = await readState(page);
  assert(state.objectives.current?.id === "combat_branch_vanguard_hunt", "Combat encounter did not switch to Vanguard Hunt");

  for (let i = 0; i < 4; i += 1) {
    const spawned = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.getBranchEncounter === "function") {
        const encounter = window.__exoCraftDebug.getBranchEncounter();
        return encounter && encounter.type === "combat" && encounter.stage === "active";
      }
      return false;
    });
    assert(spawned, "Combat branch encounter was not active during Vanguard Hunt validation");
    const defeated = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.defeatNearestHostileMob === "function") {
        return window.__exoCraftDebug.defeatNearestHostileMob("vanguard_blade");
      }
      return false;
    });
    assert(defeated, "Could not defeat hostile mob for Vanguard Hunt validation");
    await step(page, 1);
  }
  state = await readState(page);
  assert(
    (state.objectives.specialization?.branchLoop?.completions || 0) >= combatLoopCompletionsBefore + 1,
    "Combat branch loop did not award a completed Vanguard Hunt",
  );
  assert(
    countItem(state.inventory.slots, "copper_ingot") >= copperIngotsBeforeCombatLoop + 1,
    "Combat branch loop did not grant the expected bounty reward",
  );
  assert(
    (state.objectives.specialization?.branchLoop?.combatHuntKills || 0) < 4,
    "Combat branch loop progress did not reset after reward payout",
  );

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.click("#start-btn");
  await step(page, 4);

  const completedCoreObjectives = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.completeCoreObjectives === "function") {
      return window.__exoCraftDebug.completeCoreObjectives();
    }
    return null;
  });
  assert(completedCoreObjectives?.completed === true, "Could not force-complete core objectives for explorer branch validation");

  const selectedExplorerPath = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.setSpecialization === "function") {
      return window.__exoCraftDebug.setSpecialization("explorer");
    }
    return false;
  });
  assert(selectedExplorerPath, "Could not select explorer specialization path");

  const caveWaypoint = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.findNearestCavePocket === "function") {
      return window.__exoCraftDebug.findNearestCavePocket(64);
    }
    return null;
  });
  assert(caveWaypoint && Number.isFinite(caveWaypoint.x), "Could not locate cave pocket for explorer branch validation");

  for (let i = 0; i < 3; i += 1) {
    const marked = await page.evaluate((cave) => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.markCaveTorchPlacement === "function") {
        return window.__exoCraftDebug.markCaveTorchPlacement(cave.x, cave.y, cave.z);
      }
      return false;
    }, caveWaypoint);
    assert(marked, "Could not mark cave torch placement for explorer specialization validation");
  }

  for (let i = 0; i < 4; i += 1) {
    const ore = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.findNearestDeepCopperOre === "function") {
        return window.__exoCraftDebug.findNearestDeepCopperOre(96);
      }
      return null;
    });
    assert(ore && Number.isFinite(ore.x), "Could not locate deep copper for explorer specialization validation");
    const mined = await page.evaluate((target) => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.markDeepCopperMine === "function") {
        return window.__exoCraftDebug.markDeepCopperMine(target.x, target.y, target.z);
      }
      return false;
    }, ore);
    assert(mined, "Could not mark deep copper mining for explorer specialization validation");
  }

  await page.evaluate(() => {
    if (!window.__exoCraftDebug || typeof window.__exoCraftDebug.grantInventoryItem !== "function") {
      return;
    }
    window.__exoCraftDebug.grantInventoryItem("deep_delver_pickaxe", 1);
    window.__exoCraftDebug.grantInventoryItem("spelunker_compass", 1);
  });
  await step(page, 2);
  state = await readState(page);
  assert(state.objectives.specialization?.selected === "explorer", "Explorer specialization did not remain selected");
  assert(state.objectives.specialization?.completed === true, "Explorer specialization did not complete");
  assert(state.objectives.current?.id === "explorer_branch_reach_survey_cache", "Explorer midgame objective did not switch to survey-cache travel step");

  const explorerLoopCompletionsBefore = state.objectives.specialization?.branchLoop?.completions || 0;
  const torchesBeforeSurveyReward = countItem(state.inventory.slots, "torch");
  const copperOreBeforeSurveyReward = countItem(state.inventory.slots, "copper_ore");
  const startedExplorerEncounter = await page.evaluate(() => {
    if (window.__exoCraftDebug && typeof window.__exoCraftDebug.startBranchEncounter === "function") {
      return window.__exoCraftDebug.startBranchEncounter("explorer");
    }
    return false;
  });
  assert(startedExplorerEncounter, "Could not start explorer branch encounter");
  await step(page, 2);
  state = await readState(page);
  assert(state.objectives.current?.id === "explorer_branch_survey_run", "Explorer encounter did not switch to Survey Run");

  for (let i = 0; i < 2; i += 1) {
    const marked = await page.evaluate((cave) => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.markCaveTorchPlacement === "function") {
        return window.__exoCraftDebug.markCaveTorchPlacement(cave.x, cave.y, cave.z);
      }
      return false;
    }, caveWaypoint);
    assert(marked, "Could not mark cave torch placement for Survey Run validation");
  }

  for (let i = 0; i < 2; i += 1) {
    const ore = await page.evaluate(() => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.findNearestDeepCopperOre === "function") {
        return window.__exoCraftDebug.findNearestDeepCopperOre(96);
      }
      return null;
    });
    assert(ore && Number.isFinite(ore.x), "Could not locate deep copper for Survey Run validation");
    const mined = await page.evaluate((target) => {
      if (window.__exoCraftDebug && typeof window.__exoCraftDebug.markDeepCopperMine === "function") {
        return window.__exoCraftDebug.markDeepCopperMine(target.x, target.y, target.z);
      }
      return false;
    }, ore);
    assert(mined, "Could not mark deep copper mining for Survey Run validation");
  }

  await step(page, 2);
  state = await readState(page);
  assert(
    (state.objectives.specialization?.branchLoop?.completions || 0) >= explorerLoopCompletionsBefore + 1,
    "Explorer branch loop did not award a completed Survey Run",
  );
  assert(
    countItem(state.inventory.slots, "torch") >= torchesBeforeSurveyReward + 4,
    "Explorer branch loop did not grant the expected torch reward",
  );
  assert(
    countItem(state.inventory.slots, "copper_ore") >= copperOreBeforeSurveyReward + 2,
    "Explorer branch loop did not grant the expected copper ore reward",
  );
  assert(
    (state.objectives.specialization?.branchLoop?.explorerSurveyTorches || 0) < 2 &&
      (state.objectives.specialization?.branchLoop?.explorerSurveyDeepCopper || 0) < 2,
    "Explorer branch loop progress did not reset after reward payout",
  );

  if (errors.length > 0) {
    throw new Error(`Console/runtime errors detected:\n${errors.join("\n")}`);
  }

  await browser.close();
  console.log("Bug sweep passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
