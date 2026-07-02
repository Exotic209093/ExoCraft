// Redstone Wave 1 smoke test — drives the game headlessly via the debug hooks.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5173";
const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
}

// Fail fast with a clear message when the dev server isn't running.
try {
  await fetch(URL, { signal: AbortSignal.timeout(5000) });
} catch {
  console.error(`Dev server not reachable at ${URL} — run \`npm run dev\` first.`);
  process.exit(2);
}

// Prefer the sandbox's pre-provisioned Chromium when the pinned Playwright build
// isn't downloaded (CHROMIUM_PATH overrides; falls back to Playwright's default).
import { existsSync, mkdirSync } from "node:fs";
const executablePath = process.env.CHROMIUM_PATH
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
// A thrown page.evaluate/goto must not leave a Chromium child lingering in CI.
for (const evt of ["uncaughtException", "unhandledRejection"]) {
  process.on(evt, async (err) => {
    console.error(err);
    try { await browser.close(); } catch { /* already closing */ }
    process.exit(1);
  });
}
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// Resource-load noise (favicon 404, dev-server connection blips) isn't a JS error.
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (t.includes("Failed to load resource")) return;
  errors.push(t);
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.click("#start-btn");
await page.waitForTimeout(500);
await page.evaluate(() => window.advanceTime(100));

const base = await page.evaluate(() => {
  const s = JSON.parse(window.render_game_to_text());
  return { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: Math.floor(s.player.z) };
});
// Build a floating stone platform well above terrain, close to the player (active
// chunks). Snapped toward the chunk interior: the lamp sits ~8 cells from every seam
// so its light never crosses a chunk boundary — light REMOVAL near seams re-imports
// stale neighbour light (pre-existing engine limitation, torch id 8 reproduces it),
// which would make the A7b blocklight assertion nondeterministic.
const P = {
  x: Math.floor(base.x / 16) * 16 + 2,
  y: Math.min(100, base.y + 8),
  z: Math.floor(base.z / 16) * 16 + 7,
};

const rig = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const out = {};
  // Platform: 10x3 stone at y=P.y
  for (let dx = 0; dx < 10; dx++) for (let dz = 0; dz < 3; dz++) D.setBlock(P.x + dx, P.y, P.z + dz, 3);
  const cy = P.y + 1;
  // Rig A: lever at x+0, wire x+1..x+5, lamp at x+6 (all on z row 1)
  D.placeRedstone("lever", P.x + 0, cy, P.z + 1);
  for (let i = 1; i <= 5; i++) D.placeRedstone("wire", P.x + i, cy, P.z + 1);
  D.placeRedstone("lamp", P.x + 6, cy, P.z + 1);
  window.advanceTime(50);
  out.initial = {
    lever: D.getRedstoneAt(P.x, cy, P.z + 1),
    wire1: D.getRedstoneAt(P.x + 1, cy, P.z + 1),
    wire5: D.getRedstoneAt(P.x + 5, cy, P.z + 1),
    lamp: D.getRedstoneAt(P.x + 6, cy, P.z + 1),
  };
  // Flip lever ON
  D.toggleLeverAt(P.x, cy, P.z + 1);
  window.advanceTime(50);
  out.on = {
    lever: D.getRedstoneAt(P.x, cy, P.z + 1),
    wire1: D.getRedstoneAt(P.x + 1, cy, P.z + 1),
    wire5: D.getRedstoneAt(P.x + 5, cy, P.z + 1),
    lamp: D.getRedstoneAt(P.x + 6, cy, P.z + 1),
    // Baked blocklight in the air beside the lit lamp (emit 15 → 14 one step out;
    // the block channel is independent of skylight so open sky doesn't wash it out).
    lampGlow: D.getLightAt(P.x + 6, cy + 1, P.z + 1),
  };
  // Flip lever OFF
  D.toggleLeverAt(P.x, cy, P.z + 1);
  window.advanceTime(50);
  out.off = {
    wire1: D.getRedstoneAt(P.x + 1, cy, P.z + 1),
    lamp: D.getRedstoneAt(P.x + 6, cy, P.z + 1),
    lampGlow: D.getLightAt(P.x + 6, cy + 1, P.z + 1),
  };
  return out;
}, { P });

check("A1 initial wire unpowered (83)", rig.initial.wire1.id === 83, JSON.stringify(rig.initial));
check("A2 initial lamp off (93)", rig.initial.lamp.id === 93);
// Wire adjacent to a source carries 15 (Minecraft behaviour), decaying 1 per step.
check("A3 lever-on powers wire1 (84, p15)", rig.on.wire1.id === 84 && rig.on.wire1.power === 15, JSON.stringify(rig.on.wire1));
check("A4 power decays along wire (wire5 p11)", rig.on.wire5.id === 84 && rig.on.wire5.power === 11, JSON.stringify(rig.on.wire5));
check("A5 lamp lit (94)", rig.on.lamp.id === 94, JSON.stringify(rig.on.lamp));
check("A5b lit lamp bakes blocklight 14 into adjacent air", rig.on.lampGlow?.block === 14, JSON.stringify(rig.on.lampGlow));
check("A6 lever-off recedes wire (83, p0)", rig.off.wire1.id === 83 && rig.off.wire1.power === 0, JSON.stringify(rig.off.wire1));
check("A7 lamp off again (93)", rig.off.lamp.id === 93);
check("A7b unlit lamp blocklight back to 0", rig.off.lampGlow?.block === 0, JSON.stringify(rig.off.lampGlow));

// Rig B: button auto-release
const rigB = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const cy = P.y + 1;
  D.placeRedstone("button", P.x + 0, cy, P.z + 0);
  D.placeRedstone("wire", P.x + 1, cy, P.z + 0);
  window.advanceTime(50);
  D.pressButtonAt(P.x, cy, P.z);
  window.advanceTime(50);
  const pressed = { btn: D.getRedstoneAt(P.x, cy, P.z), wire: D.getRedstoneAt(P.x + 1, cy, P.z) };
  window.advanceTime(1200); // > 1s hold
  const released = { btn: D.getRedstoneAt(P.x, cy, P.z), wire: D.getRedstoneAt(P.x + 1, cy, P.z) };
  return { pressed, released };
}, { P });
check("B1 button pressed (88) powers wire", rigB.pressed.btn.id === 88 && rigB.pressed.wire.id === 84, JSON.stringify(rigB.pressed));
check("B2 button auto-releases (87), wire off", rigB.released.btn.id === 87 && rigB.released.wire.id === 83, JSON.stringify(rigB.released));

// Rig C: redstone torch inverter + redstone block
const rigC = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const ty = P.y + 1; // torch sits on the platform (support = platform stone)
  const tx = P.x + 8, tz = P.z + 1;
  D.placeRedstone("torch", tx, ty, tz);
  window.advanceTime(200);
  const lit = D.getRedstoneAt(tx, ty, tz);
  // Power the support block (the stone below the torch) with a redstone block beside it.
  D.placeRedstone("block", tx + 1, P.y, tz);
  window.advanceTime(300); // > 100ms flip delay
  const inverted = D.getRedstoneAt(tx, ty, tz);
  D.setBlock(tx + 1, P.y, tz, 3); // restore stone, un-power support
  window.advanceTime(300);
  const restored = D.getRedstoneAt(tx, ty, tz);
  return { lit, inverted, restored };
}, { P });
check("C1 placed torch is lit (91)", rigC.lit.id === 91, JSON.stringify(rigC.lit));
check("C2 powered support turns torch off (92)", rigC.inverted.id === 92, JSON.stringify(rigC.inverted));
check("C3 unpowered support relights torch (91)", rigC.restored.id === 91, JSON.stringify(rigC.restored));

// Rig D: support pop — break the platform block under a wire
const rigD = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const cy = P.y + 1;
  const before = D.getRedstoneAt(P.x + 3, cy, P.z + 1); // a wire cell from rig A
  const entitiesBefore = D.getItemEntities().count;
  D.setBlock(P.x + 3, P.y, P.z + 1, 0); // break support under it
  window.advanceTime(100);
  const after = D.getRedstoneAt(P.x + 3, cy, P.z + 1);
  const entitiesAfter = D.getItemEntities().count;
  return { before, after, entitiesBefore, entitiesAfter };
}, { P });
check("D1 wire existed before pop", rigD.before.id === 83 || rigD.before.id === 84, JSON.stringify(rigD.before));
check("D2 wire popped to air", rigD.after.id === 0, JSON.stringify(rigD.after));
check("D3 pop spawned a drop entity", rigD.entitiesAfter > rigD.entitiesBefore, `${rigD.entitiesBefore} -> ${rigD.entitiesAfter}`);

// Rig E: pressure plate via player teleport
const rigE = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const py = P.y + 1;
  const px = P.x + 8, pz = P.z + 0;
  D.placeRedstone("plate", px, py, pz);
  D.placeRedstone("wire", px + 1, py, pz);
  window.advanceTime(50);
  D.teleportPlayer(px + 0.5, py + 0.1, pz + 0.5);
  window.advanceTime(100);
  const pressed = { plate: D.getRedstoneAt(px, py, pz), wire: D.getRedstoneAt(px + 1, py, pz) };
  D.teleportPlayer(px - 3, py + 0.1, pz - 3);
  window.advanceTime(100);
  const released = { plate: D.getRedstoneAt(px, py, pz), wire: D.getRedstoneAt(px + 1, py, pz) };
  return { pressed, released };
}, { P });
check("E1 standing presses plate (90) + powers wire", rigE.pressed.plate.id === 90 && rigE.pressed.wire.id === 84, JSON.stringify(rigE.pressed));
check("E2 leaving releases plate (89) + wire off", rigE.released.plate.id === 89 && rigE.released.wire.id === 83, JSON.stringify(rigE.released));

// Rig F: wire staircase — breaking the middle step-diagonal wire must depower the top
const rigF = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  // Stone steps: (x, P.y) is the platform; build risers at z+2 off the platform edge
  const sx = P.x + 0, sz = P.z + 2;
  D.setBlock(sx + 1, P.y + 1, sz, 3);      // riser for wire C
  D.setBlock(sx + 2, P.y + 2, sz, 3);      // riser for wire E
  D.setBlock(sx, P.y, sz, 3);              // base support for A
  D.placeRedstone("lever", sx - 1, P.y + 1, sz); // lever on platform edge? ensure support
  D.setBlock(sx - 1, P.y, sz, 3);
  D.placeRedstone("wire", sx, P.y + 1, sz);      // A (base)
  D.placeRedstone("wire", sx + 1, P.y + 2, sz);  // C (step up)
  D.placeRedstone("wire", sx + 2, P.y + 3, sz);  // E (step up again)
  window.advanceTime(50);
  D.toggleLeverAt(sx - 1, P.y + 1, sz);
  window.advanceTime(100);
  const powered = {
    a: D.getRedstoneAt(sx, P.y + 1, sz),
    c: D.getRedstoneAt(sx + 1, P.y + 2, sz),
    e: D.getRedstoneAt(sx + 2, P.y + 3, sz),
  };
  D.setBlock(sx + 1, P.y + 2, sz, 0); // break middle wire C
  window.advanceTime(100);
  const cut = { e: D.getRedstoneAt(sx + 2, P.y + 3, sz) };
  return { powered, cut };
}, { P });
check("G1 staircase wire powers up-steps", rigF.powered.a.id === 84 && rigF.powered.c.id === 84 && rigF.powered.e.id === 84, JSON.stringify(rigF.powered));
check("G2 breaking mid-step depowers the top wire", rigF.cut.e.id === 83 && rigF.cut.e.power === 0, JSON.stringify(rigF.cut));

// Rig H: door powered via its UPPER half
const rigH = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const dx = P.x + 3, dz = P.z + 2;
  D.setBlock(dx, P.y, dz, 3); // support under door
  D.placeBuildingBlock("door", dx, P.y + 1, dz, 0);
  // Redstone block floating beside the UPPER half
  window.advanceTime(50);
  const closed = D.getBlockAt(dx, P.y + 1, dz);
  D.placeRedstone("block", dx + 1, P.y + 2, dz);
  window.advanceTime(100);
  const opened = D.getBlockAt(dx, P.y + 1, dz);
  D.setBlock(dx + 1, P.y + 2, dz, 0); // remove power
  window.advanceTime(100);
  const closedAgain = D.getBlockAt(dx, P.y + 1, dz);
  return { closed, opened, closedAgain };
}, { P });
check("H1 door starts closed (58-61)", rigH.closed.id >= 58 && rigH.closed.id <= 61, JSON.stringify(rigH.closed));
check("H2 power at UPPER half opens door (62-65)", rigH.opened.id >= 62 && rigH.opened.id <= 65, JSON.stringify(rigH.opened));
check("H3 removing power closes door", rigH.closedAgain.id >= 58 && rigH.closedAgain.id <= 61, JSON.stringify(rigH.closedAgain));

// Rig I: torch clock burns out (perf guard) instead of flipping forever.
// Loop: torch on T → wire D1 (torch level) → step-down to D2 → D3 beside T → powers T
// → torch turns off → loop unpowers → torch relights → oscillates → burnout.
const rigI = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const tx = P.x + 6, ty = P.y + 4, tz = P.z + 6; // isolated in the air
  D.setBlock(tx, ty, tz, 3);                 // support block T
  D.placeRedstone("torch", tx, ty + 1, tz);  // torch on T
  D.setBlock(tx + 1, ty, tz, 3);             // D1 support (torch level - 1)
  D.placeRedstone("wire", tx + 1, ty + 1, tz);      // D1: beside torch
  D.setBlock(tx + 1, ty - 1, tz + 1, 3);     // D2 support
  D.placeRedstone("wire", tx + 1, ty, tz + 1);      // D2: step-down from D1
  D.setBlock(tx, ty - 1, tz + 1, 3);         // D3 support
  D.placeRedstone("wire", tx, ty, tz + 1);          // D3: beside T -> powers T
  // Confirm the loop actually oscillates: watch the torch flip within the first second.
  let sawOff = false, sawOnAgain = false;
  for (let i = 0; i < 10; i++) {
    window.advanceTime(100);
    const id = D.getRedstoneAt(tx, ty + 1, tz).id;
    if (id === 92) sawOff = true;
    else if (sawOff && id === 91) sawOnAgain = true;
  }
  // Run the clock out to burnout (limit is 8 flips in 1.6s).
  for (let i = 0; i < 30; i++) window.advanceTime(100);
  const torch2 = D.getRedstoneAt(tx, ty + 1, tz);
  for (let i = 0; i < 10; i++) window.advanceTime(100);
  const s2 = D.getRedstoneStats();
  const torch3 = D.getRedstoneAt(tx, ty + 1, tz);
  return { sawOff, sawOnAgain, torch2, s2, torch3 };
}, { P });
check("I0 torch clock oscillates before burnout", rigI.sawOff && rigI.sawOnAgain, JSON.stringify({ sawOff: rigI.sawOff, sawOnAgain: rigI.sawOnAgain }));
check("I1 clock torch burns out (92, off)", rigI.torch2.id === 92 && rigI.torch3.id === 92, JSON.stringify({ t2: rigI.torch2, t3: rigI.torch3 }));
check("I2 sim quiet after burnout (no pending flips)", rigI.s2.pendingTorchFlips === 0 && rigI.s2.dirtyCells === 0, JSON.stringify(rigI.s2));

// Rig J: falling sand pops the component riding it
const rigJ = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const jx = P.x + 9, jz = P.z + 2;
  D.setBlock(jx, P.y, jz, 3);      // pillar
  D.setBlock(jx, P.y + 1, jz, 11); // sand on pillar
  D.placeRedstone("torch", jx, P.y + 2, jz); // torch on sand
  window.advanceTime(100);
  const before = D.getRedstoneAt(jx, P.y + 2, jz);
  D.setBlock(jx, P.y, jz, 0);      // remove pillar -> sand falls
  for (let i = 0; i < 20; i++) window.advanceTime(50);
  const after = D.getRedstoneAt(jx, P.y + 2, jz);
  return { before, after };
}, { P });
check("J1 torch lit on sand", rigJ.before.id === 91, JSON.stringify(rigJ.before));
check("J2 falling sand pops the torch (cell empties)", rigJ.after.id === 0, JSON.stringify(rigJ.after));

// Text-state payload present
const payload = await page.evaluate(() => JSON.parse(window.render_game_to_text()).redstone);
check("F1 render_game_to_text has redstone payload", payload && typeof payload.trackedWireCells === "number", JSON.stringify(payload));

// Screenshot for visual review (output/ is gitignored)
mkdirSync("output", { recursive: true });
await page.screenshot({ path: "output/redstone-smoke.png" });

check("Z1 zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(results.join("\n"));
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
