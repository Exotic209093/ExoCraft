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

async function pressForFrames(page, key, frames) {
  await page.keyboard.down(key);
  await step(page, frames);
  await page.keyboard.up(key);
}

async function clickCanvasCenter(page, button = "left") {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box unavailable");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
}

async function orientUntilTarget(page, maxTries = 30) {
  for (let i = 0; i < maxTries; i += 1) {
    const state = await readState(page);
    if (state.targetBlock) {
      return true;
    }
    await pressForFrames(page, "ArrowRight", 3);
  }
  return false;
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
  assert(state.recentAction !== "Jumped", "Space in menu leaked into gameplay and triggered jump");

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

  await page.keyboard.press("Digit3");
  state = await readState(page);
  assert(state.selectedBlock === "Stone", "Digit3 did not select Stone block");

  const hasTarget = await orientUntilTarget(page);
  assert(hasTarget, "Could not find a target block for interaction tests");

  let before = await readState(page);
  let broke = false;
  for (let i = 0; i < 8; i += 1) {
    await clickCanvasCenter(page, "left");
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Broke ")) {
      assert(after.world.solidBlocks === before.world.solidBlocks - 1, "Breaking block did not decrement solid count");
      before = after;
      broke = true;
      break;
    }
    await pressForFrames(page, "ArrowRight", 2);
  }
  assert(broke, "Could not break a block during interaction test");

  let placed = false;
  for (let i = 0; i < 8; i += 1) {
    await clickCanvasCenter(page, "right");
    await step(page, 2);
    const after = await readState(page);
    if (after.recentAction.startsWith("Placed ")) {
      assert(after.world.solidBlocks === before.world.solidBlocks + 1, "Placing block did not increment solid count");
      assert(after.recentAction.includes("Stone"), "Placed block did not use selected block type");
      placed = true;
      break;
    }
    await pressForFrames(page, "ArrowRight", 2);
  }
  assert(placed, "Could not place a block during interaction test");

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
