import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.setDefaultTimeout(90000);
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.addInitScript(() => { window.__drainVirtualTimePending = () => 0; });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const step = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  assert.equal((await state()).mode, 'menu');
  await page.click('#start-btn');
  await step(100);
  assert.equal((await state()).mode, 'playing');
  console.log(`PASS startup and PBR shader compilation (${Date.now() - start} ms)`);
  for (const [key, panel] of [['KeyE', 'inventory'], ['KeyC', 'crafting']]) {
    await page.keyboard.press(key);
    assert.equal((await state())[panel].open, true);
    await page.keyboard.press(key);
    assert.equal((await state())[panel].open, false);
  }
  console.log('PASS inventory and crafting menus');
  await page.evaluate(() => {
    const d = window.__exoCraftDebug;
    d.setFlying(true);
    d.teleportPlayer(8.5, 78, 8.5);
    d.setLook(0, -0.3);
  });
  const before = (await state()).player;
  await page.keyboard.down('KeyW');
  await step(500);
  await page.keyboard.up('KeyW');
  const after = (await state()).player;
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.1);
  console.log('PASS movement');
  await page.evaluate(() => {
    const d = window.__exoCraftDebug;
    const blocks = [3, 5, 14, 15, 21, 23, 30, 53, 54, 8];
    blocks.forEach((id, i) => d.setBlock(3 + i, 76, 2, id));
    for (const [x, type] of [[4, 'water'], [12, 'lava']]) {
      d.setBlock(x, 74, 0, 3);
      d.placeFluidSource(x, 76, 0, type);
    }
    d.stepFluidSim(3);
    window.advanceTime(100);
    d.setWeather('clear');
    d.setTimeOfDayMs(30000);
    d.addXp(25);
    d.setSpawnPoint(8, 78, 8);
  });
  await step(100);
  assert.ok(await page.evaluate(() => window.__exoCraftDebug.fluidCellCount()) > 0);
  assert.equal(await page.evaluate(() => window.__exoCraftDebug.getBlockAt(3, 76, 2).id), 3);
  await page.evaluate(() => {
    window.__exoCraftDebug.teleportPlayer(8.5, 79, 10.5);
    window.__exoCraftDebug.aimAt(8, 76, 2);
  });
  await step(100);
  console.log('PASS block edits and flowing water/lava rendering');
  mkdirSync('output', { recursive: true });
  await page.screenshot({ path: 'output/rendering-smoke.png' });
  const savedXp = await page.evaluate(() => window.__exoCraftDebug.getXp());
  await page.click('#save-btn');
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');
  await page.evaluate(() => window.__exoCraftDebug.addXp(100));
  await page.click('#load-btn');
  await page.waitForFunction(expected => window.__exoCraftDebug.getXp().level === expected, savedXp.level);
  const loadedXp = await page.evaluate(() => window.__exoCraftDebug.getXp());
  assert.equal(loadedXp.level, savedXp.level);
  assert.equal(loadedXp.xpWithinLevel, savedXp.xpWithinLevel);
  assert.deepEqual(await page.evaluate(() => window.__exoCraftDebug.getSpawnPoint()), { x: 8, y: 78, z: 8 });
  await step(100);
  console.log('PASS save/load restores XP and spawn point');
  assert.deepEqual(errors, [], 'Browser runtime or WebGL errors');
  console.log('PASS zero browser runtime or shader errors');
} finally {
  await browser.close();
}
