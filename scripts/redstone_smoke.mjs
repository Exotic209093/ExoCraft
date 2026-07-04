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

// Rig R (Wave R2): repeater refreshes a decayed signal back to 15 and recedes on off.
const rigR = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 9;
  for (let dx = 0; dx <= 9; dx++) D.setBlock(P.x + dx, P.y, z, 3); // support row
  D.placeRedstone("lever", P.x, y, z);
  for (let dx = 1; dx <= 4; dx++) D.placeRedstone("wire", P.x + dx, y, z);
  D.placeRedstone("repeater", P.x + 5, y, z, 1); // facing E (+X)
  for (let dx = 6; dx <= 8; dx++) D.placeRedstone("wire", P.x + dx, y, z);
  D.placeRedstone("lamp", P.x + 9, y, z);
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(400); // > 1-tick repeater delay
  const on = {
    preWire: D.getRedstoneAt(P.x + 4, y, z),   // decayed input side
    rep: D.getRedstoneAt(P.x + 5, y, z),
    postWire: D.getRedstoneAt(P.x + 6, y, z),  // refreshed output side
    farWire: D.getRedstoneAt(P.x + 8, y, z),
    lamp: D.getRedstoneAt(P.x + 9, y, z),
  };
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(400);
  const off = {
    postWire: D.getRedstoneAt(P.x + 6, y, z),
    lamp: D.getRedstoneAt(P.x + 9, y, z),
  };
  return { on, off };
}, { P });
// Wire adjacent to the lever reads 15, so the 4th wire is 15-3 = 12.
check("R1 input wire decays to 12 before the repeater", rigR.on.preWire.id === 84 && rigR.on.preWire.power === 12, JSON.stringify(rigR.on.preWire));
check("R2 repeater powers on (output 15)", rigR.on.rep.power === 15, JSON.stringify(rigR.on.rep));
check("R3 output wire refreshed to 15", rigR.on.postWire.id === 84 && rigR.on.postWire.power === 15, JSON.stringify(rigR.on.postWire));
check("R4 far wire 13 + lamp lit through repeater", rigR.on.farWire.power === 13 && rigR.on.lamp.id === 94, JSON.stringify({ far: rigR.on.farWire, lamp: rigR.on.lamp }));
check("R5 lever-off recedes through the repeater", rigR.off.postWire.id === 83 && rigR.off.lamp.id === 93, JSON.stringify(rigR.off));

// Rig S (Wave R2): delay cycling — a 4-tick repeater passes the signal late.
const rigS = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 11;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placeRedstone("wire", P.x + 1, y, z);
  D.placeRedstone("repeater", P.x + 2, y, z, 1);
  D.placeRedstone("wire", P.x + 3, y, z);
  window.advanceTime(100);
  const cycles = [D.cycleRepeaterAt(P.x + 2, y, z), D.cycleRepeaterAt(P.x + 2, y, z), D.cycleRepeaterAt(P.x + 2, y, z)];
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(250); // < 400 ms
  const early = D.getRedstoneAt(P.x + 3, y, z);
  window.advanceTime(400); // past the 4-tick delay
  const late = D.getRedstoneAt(P.x + 3, y, z);
  return { cycles: cycles.map((c) => c.delayTicks), early, late };
}, { P });
check("S1 right-click cycles delay 2,3,4", rigS.cycles.join(",") === "2,3,4", JSON.stringify(rigS.cycles));
check("S2 4-tick repeater: front wire still off at 250ms", rigS.early.id === 83, JSON.stringify(rigS.early));
check("S3 front wire on after the full delay", rigS.late.id === 84 && rigS.late.power === 15, JSON.stringify(rigS.late));

// Rig U (Wave R2): comparator compare vs subtract with analog strengths.
const rigU = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 13;
  // Rear chain: lever -> wire(15) -> wire(14) -> comparator(E) -> front wire.
  for (let dx = 0; dx <= 4; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placeRedstone("wire", P.x + 1, y, z);
  D.placeRedstone("wire", P.x + 2, y, z);
  D.placeRedstone("comparator", P.x + 3, y, z, 1);
  D.placeRedstone("wire", P.x + 4, y, z);
  // Side chain into the comparator's south side: lever -> wire(15) -> wire(14).
  D.setBlock(P.x + 3, P.y, z + 1, 3);
  D.setBlock(P.x + 3, P.y, z + 2, 3);
  D.setBlock(P.x + 3, P.y, z + 3, 3);
  D.placeRedstone("lever", P.x + 3, y, z + 3);
  D.placeRedstone("wire", P.x + 3, y, z + 2);
  D.placeRedstone("wire", P.x + 3, y, z + 1);
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);          // rear on: comparator rear reads 14
  window.advanceTime(300);
  const compareNoSide = D.getRedstoneAt(P.x + 4, y, z); // rear 14, side 0 -> out 14 (analog!)
  D.toggleLeverAt(P.x + 3, y, z + 3);  // side on: side wire at comparator reads 14
  window.advanceTime(300);
  const compareEqualSide = D.getRedstoneAt(P.x + 4, y, z); // rear 14 >= side 14 -> out 14
  D.toggleComparatorModeAt(P.x + 3, y, z);
  window.advanceTime(300);
  const subtractEqual = D.getRedstoneAt(P.x + 4, y, z);    // 14 - 14 -> 0
  D.toggleLeverAt(P.x + 3, y, z + 3);  // side off
  window.advanceTime(300);
  const subtractNoSide = D.getRedstoneAt(P.x + 4, y, z);   // 14 - 0 -> 14
  return { compareNoSide, compareEqualSide, subtractEqual, subtractNoSide };
}, { P });
check("U1 comparator passes ANALOG rear strength (14, not 15)", rigU.compareNoSide.id === 84 && rigU.compareNoSide.power === 14, JSON.stringify(rigU.compareNoSide));
check("U2 compare: rear >= side still passes", rigU.compareEqualSide.power === 14, JSON.stringify(rigU.compareEqualSide));
check("U3 subtract: equal side cancels output", rigU.subtractEqual.id === 83 && rigU.subtractEqual.power === 0, JSON.stringify(rigU.subtractEqual));
check("U4 subtract: side off restores 14", rigU.subtractNoSide.power === 14, JSON.stringify(rigU.subtractNoSide));

// Rig V (Wave R2): torch + 4-tick repeater loop = a SUSTAINABLE clock (slow enough
// to never hit torch burnout — the repeater is what makes clocks legitimate).
const rigV = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const ty = P.y + 5, z = P.z + 9; // isolated in the air
  const bx = P.x;
  // Upper row (torch level ty+1): torch on T, D1, repeater(E), D2.
  // Lower return row (level ty, at z+1): D3..D6, where D6 sits beside T and powers it.
  D.setBlock(bx, ty, z, 3);          // T — the block the loop powers (torch support)
  D.setBlock(bx + 1, ty, z, 3);      // D1 support
  D.setBlock(bx + 2, ty, z, 3);      // repeater support
  D.setBlock(bx + 3, ty, z, 3);      // D2 support
  for (let dx = 0; dx <= 3; dx++) D.setBlock(bx + dx, ty - 1, z + 1, 3); // return row supports
  // Corner cut: stops D1 step-connecting straight down to the return row, which
  // would bypass the repeater and turn this into a burnout-speed torch loop.
  D.setBlock(bx + 1, ty + 1, z + 1, 3);
  D.placeRedstone("torch", bx, ty + 1, z);
  D.placeRedstone("wire", bx + 1, ty + 1, z);      // D1
  D.placeRedstone("repeater", bx + 2, ty + 1, z, 1); // facing E
  D.placeRedstone("wire", bx + 3, ty + 1, z);      // D2 (repeater output)
  D.placeRedstone("wire", bx + 3, ty, z + 1);      // D3 (step down from D2)
  D.placeRedstone("wire", bx + 2, ty, z + 1);      // D4
  D.placeRedstone("wire", bx + 1, ty, z + 1);      // D5
  D.placeRedstone("wire", bx, ty, z + 1);          // D6 — beside T, powers it
  D.cycleRepeaterAt(bx + 2, ty + 1, z); D.cycleRepeaterAt(bx + 2, ty + 1, z); D.cycleRepeaterAt(bx + 2, ty + 1, z); // 4 ticks
  // Watch the torch over ~4 simulated seconds: it must toggle repeatedly.
  let transitions = 0;
  let last = D.getRedstoneAt(bx, ty + 1, z).id;
  for (let i = 0; i < 40; i++) {
    window.advanceTime(100);
    const cur = D.getRedstoneAt(bx, ty + 1, z).id;
    if (cur !== last) { transitions += 1; last = cur; }
  }
  // Dismantle so the rest of the run is quiet.
  D.setBlock(bx, ty + 1, z, 0);
  window.advanceTime(300);
  return { transitions };
}, { P });
check("V1 repeater-torch clock oscillates sustainably (>=3 transitions, no burnout)", rigV.transitions >= 3, `transitions=${rigV.transitions}`);

// Rig W (Wave R3): piston extend pushes a 2-block row; retract leaves it (normal).
const rigW = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 15;
  for (let dx = 0; dx <= 5; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, false); // facing E
  D.setBlock(P.x + 2, y, z, 3);           // stone row
  D.setBlock(P.x + 3, y, z, 3);
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const ext = {
    base: D.getBlockAt(P.x + 1, y, z), head: D.getBlockAt(P.x + 2, y, z),
    s1: D.getBlockAt(P.x + 3, y, z), s2: D.getBlockAt(P.x + 4, y, z),
  };
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const ret = {
    base: D.getBlockAt(P.x + 1, y, z), headCell: D.getBlockAt(P.x + 2, y, z),
    s1: D.getBlockAt(P.x + 3, y, z),
  };
  return { ext, ret };
}, { P });
check("W1 piston extends: base id 151, head 169", rigW.ext.base.id === 151 && rigW.ext.head.id === 169, JSON.stringify(rigW.ext));
check("W2 row pushed one cell (stones at +3,+4)", rigW.ext.s1.id === 3 && rigW.ext.s2.id === 3, JSON.stringify(rigW.ext));
check("W3 normal retract: head gone, blocks stay", rigW.ret.base.id === 145 && rigW.ret.headCell.id === 0 && rigW.ret.s1.id === 3, JSON.stringify(rigW.ret));

// Rig X (Wave R3): sticky piston pulls the block back on retract.
const rigX = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 17;
  for (let dx = 0; dx <= 4; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, true); // sticky, facing E
  D.setBlock(P.x + 2, y, z, 82);         // wool block to move
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const ext = { base: D.getBlockAt(P.x + 1, y, z), head: D.getBlockAt(P.x + 2, y, z), wool: D.getBlockAt(P.x + 3, y, z) };
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const ret = { base: D.getBlockAt(P.x + 1, y, z), pulled: D.getBlockAt(P.x + 2, y, z), farCell: D.getBlockAt(P.x + 3, y, z) };
  return { ext, ret };
}, { P });
check("X1 sticky extends: base 163, head 175, wool pushed", rigX.ext.base.id === 163 && rigX.ext.head.id === 175 && rigX.ext.wool.id === 82, JSON.stringify(rigX.ext));
check("X2 sticky retract PULLS the wool back", rigX.ret.base.id === 157 && rigX.ret.pulled.id === 82 && rigX.ret.farCell.id === 0, JSON.stringify(rigX.ret));

// Rig Y (Wave R3): push limit (13 blocks) and immovable (chest) both refuse.
const rigY = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 19;
  for (let dx = 0; dx <= 16; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, false);
  for (let dx = 2; dx <= 14; dx++) D.setBlock(P.x + dx, y, z, 3); // 13 blocks
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const overLimit = { base: D.getBlockAt(P.x + 1, y, z), firstCell: D.getBlockAt(P.x + 2, y, z) };
  // Clear to a single chest in front: immovable.
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  for (let dx = 2; dx <= 14; dx++) D.setBlock(P.x + dx, y, z, 0);
  D.setBlock(P.x + 2, y, z, 22); // chest
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const blocked = { base: D.getBlockAt(P.x + 1, y, z), chest: D.getBlockAt(P.x + 2, y, z) };
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(200);
  return { overLimit, blocked };
}, { P });
check("Y1 13-block row exceeds push limit (stays retracted)", rigY.overLimit.base.id === 145 && rigY.overLimit.firstCell.id === 3, JSON.stringify(rigY.overLimit));
check("Y2 chest is immovable (stays retracted)", rigY.blocked.base.id === 145 && rigY.blocked.chest.id === 22, JSON.stringify(rigY.blocked));

// Rig Z2 (Wave R3): pushing into wire pops it as a drop; vertical piston lifts a block.
const rigZ2 = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 21;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, false);
  D.placeRedstone("wire", P.x + 2, y, z); // component in the push path
  const entitiesBefore = D.getItemEntities().count;
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const popped = {
    head: D.getBlockAt(P.x + 2, y, z),
    entities: D.getItemEntities().count - entitiesBefore,
  };
  // Vertical: up-facing piston lifts a wool block.
  const vx = P.x + 6;
  D.setBlock(vx, P.y, z, 3);
  D.setBlock(vx + 1, P.y, z, 3);
  D.placePiston(vx, P.y + 1, z, 4, false); // facing UP
  D.setBlock(vx, P.y + 2, z, 82);
  D.placeRedstone("lever", vx + 1, P.y + 1, z);
  window.advanceTime(100);
  D.toggleLeverAt(vx + 1, P.y + 1, z);
  window.advanceTime(300);
  const vertical = {
    head: D.getBlockAt(vx, P.y + 2, z),
    lifted: D.getBlockAt(vx, P.y + 3, z),
  };
  return { popped, vertical };
}, { P });
check("Z2a pushing pops the wire as a drop (head takes its cell)", rigZ2.popped.head.id === 169 && rigZ2.popped.entities >= 1, JSON.stringify(rigZ2.popped));
check("Z2b up-facing piston lifts the block (head 172, wool above)", rigZ2.vertical.head.id === 172 && rigZ2.vertical.lifted.id === 82, JSON.stringify(rigZ2.vertical));

// Rig AA (R3 must-fix): pushing into FLOWING water heals the fluid map entry —
// the stale cell would otherwise clobber the pushed block on save/load.
const rigAA = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 23;
  for (let dx = 0; dx <= 4; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.setBlock(P.x + 4, P.y, z + 1, 3); // shelf for the water to spread onto
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, false);
  D.setBlock(P.x + 2, y, z, 3); // stone to push
  D.placeFluidSource(P.x + 4, y, z, "water");
  for (let i = 0; i < 8; i++) D.stepFluidSim(1); // let it spread (flowing cell at +3)
  const flowingBefore = D.getFluidAt(P.x + 3, y, z);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(400); // extend: stone pushed into the flowing cell
  for (let i = 0; i < 6; i++) { D.stepFluidSim(1); window.advanceTime(100); }
  const pushedCell = D.getBlockAt(P.x + 3, y, z);
  const staleEntry = D.getFluidAt(P.x + 3, y, z); // null when block isn't fluid
  return { flowingBefore, pushedCell, staleEntry, fluidCells: D.fluidCellCount() };
}, { P });
check("AA1 water spread to the push cell first", rigAA.flowingBefore && rigAA.flowingBefore.id === 15, JSON.stringify(rigAA.flowingBefore));
check("AA2 pushed stone survives in the ex-fluid cell", rigAA.pushedCell.id === 3 && rigAA.staleEntry === null, JSON.stringify({ cell: rigAA.pushedCell, fluid: rigAA.staleEntry }));

// Rig AB (R3 must-fix): entity standing in front of a bare piston gets displaced
// along the push axis (never entombed in the head / popped through ceilings).
const rigAB = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 25;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placeRedstone("lever", P.x, y, z);
  D.placePiston(P.x + 1, y, z, 1, false); // empty row: head goes to +2
  D.teleportPlayer(P.x + 2.5, y, z + 0.5); // stand exactly in the head's cell
  window.advanceTime(100);
  D.toggleLeverAt(P.x, y, z);
  window.advanceTime(300);
  const s = JSON.parse(window.render_game_to_text());
  const head = D.getBlockAt(P.x + 2, y, z);
  return { head, playerX: s.player.x, playerY: s.player.y, expectMinX: P.x + 3 };
}, { P });
check("AB1 head placed, player displaced along the axis (not upward)", rigAB.head.id === 169 && rigAB.playerX >= rigAB.expectMinX - 0.6, JSON.stringify(rigAB));

// Rig AC (R3 must-fix): sticky piston + redstone block oscillator burns out.
const rigAC = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 1, z = P.z + 27;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(P.x + dx, P.y, z, 3);
  D.placePiston(P.x + 1, y, z, 1, true);   // sticky, facing E
  D.placeRedstone("block", P.x + 2, y, z); // powers it adjacent -> oscillator
  let transitions = 0;
  let last = D.getBlockAt(P.x + 1, y, z).id;
  for (let i = 0; i < 40; i++) {
    window.advanceTime(100);
    const cur = D.getBlockAt(P.x + 1, y, z).id;
    if (cur !== last) { transitions += 1; last = cur; }
  }
  // Frozen tail: no transitions in the last second.
  let tail = 0;
  for (let i = 0; i < 10; i++) {
    window.advanceTime(100);
    const cur = D.getBlockAt(P.x + 1, y, z).id;
    if (cur !== last) { tail += 1; last = cur; }
  }
  const stats = D.getRedstoneStats();
  D.setBlock(P.x + 2, y, z, 0); // dismantle
  window.advanceTime(300);
  return { transitions, tail, pending: stats.pendingPistons };
}, { P });
check("AC1 oscillator burns out (few transitions, then frozen)", rigAC.transitions <= 8 && rigAC.tail === 0, JSON.stringify(rigAC));

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
