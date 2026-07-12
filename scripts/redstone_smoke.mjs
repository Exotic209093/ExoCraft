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

// Rig AH (Wave R4): chest -> hopper -> chest gravity chain moves items down.
const rigAH = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 29, x = P.x + 1;
  D.setBlock(x, P.y, z, 3); // pedestal
  D.setBlock(x, P.y + 1, z, 22);      // bottom chest
  D.placeHopper(x, P.y + 2, z, 0);    // hopper, output down
  // openChestAt creates the top chest block + state and opens its panel;
  // giveChestItem targets it by KEY; Escape (window-only dispatch) closes the panel.
  D.openChestAt(x, P.y + 3, z);
  D.giveChestItem("bread", 3, `${x},${P.y + 3},${z}`);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  for (let i = 0; i < 40; i++) window.advanceTime(100); // 4s: 3 pulls + 3 pushes
  const hopper = D.getHopperAt(x, P.y + 2, z);
  const signalBottom = D.getContainerSignalAt(x, P.y + 1, z);
  return { hopper, signalBottom };
}, { P });
check("AH1 chest->hopper->chest chain delivers (bottom signal >=1, hopper drained)", rigAH.signalBottom >= 1 && rigAH.hopper.slots.every((s) => s === null), JSON.stringify(rigAH));

// Rig AI (Wave R4): a redstone-locked hopper pauses; unlocking resumes.
const rigAI = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 31, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.setBlock(x, P.y + 1, z, 22);      // bottom chest
  D.placeHopper(x, P.y + 2, z, 0);
  D.giveHopperItem(x, P.y + 2, z, "apple", 2);
  D.placeRedstone("block", x + 1, P.y + 2, z); // power = lock
  window.advanceTime(200);
  const lockedId = D.getHopperAt(x, P.y + 2, z);
  for (let i = 0; i < 15; i++) window.advanceTime(100);
  const whileLocked = D.getContainerSignalAt(x, P.y + 1, z);
  D.setBlock(x + 1, P.y + 2, z, 0); // unlock
  for (let i = 0; i < 15; i++) window.advanceTime(100);
  const afterUnlock = D.getContainerSignalAt(x, P.y + 1, z);
  return { locked: lockedId.locked, whileLocked, afterUnlock };
}, { P });
check("AI1 locked hopper holds items; unlock resumes", rigAI.locked === true && rigAI.whileLocked === 0 && rigAI.afterUnlock >= 1, JSON.stringify(rigAI));

// Rig AJ (Wave R4): comparator reads container fullness into wire strength.
const rigAJ = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 33, x = P.x + 1;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.openChestAt(x, P.y + 1, z);               // chest (comparator rear) + state
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.placeRedstone("comparator", x + 1, P.y + 1, z, 1); // facing E, rear = chest
  D.placeRedstone("wire", x + 2, P.y + 1, z);
  window.advanceTime(300);
  const empty = D.getRedstoneAt(x + 2, P.y + 1, z);
  // No nudge needed: container mutations dirty the sim, waking the comparator.
  D.giveChestItem("stone", 64, `${x},${P.y + 1},${z}`); // ~1/27 slots -> signal 1
  window.advanceTime(400);
  const some = D.getRedstoneAt(x + 2, P.y + 1, z);
  return { empty, some };
}, { P });
check("AJ1 empty chest -> comparator outputs 0", rigAJ.empty.id === 83 && rigAJ.empty.power === 0, JSON.stringify(rigAJ.empty));
check("AJ2 stocked chest -> comparator drives wire (>=1)", rigAJ.some.id === 84 && rigAJ.some.power >= 1, JSON.stringify(rigAJ.some));

// Rig AK (Wave R4): hopper vacuums dropped items from the cell above.
const rigAK = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 35, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.placeHopper(x, P.y + 1, z, 0);
  // spawnItemEntity takes PLAYER-RELATIVE offsets — compute them to land the
  // stack in the cell above the hopper (player is far away, outside magnet range).
  // Zero velocity = scatter-free vertical drop straight into the funnel.
  const sp = JSON.parse(window.render_game_to_text()).player;
  D.spawnItemEntity("coal", 5, (x + 0.5) - sp.x, (P.y + 2.4) - sp.y, (z + 0.5) - sp.z, { vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 20; i++) window.advanceTime(100);
  const hopper = D.getHopperAt(x, P.y + 1, z);
  const total = hopper.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  return { total, itemId: hopper.slots.find((s) => s)?.itemId };
}, { P });
check("AK1 hopper vacuums the dropped stack (5 coal)", rigAK.total === 5 && rigAK.itemId === "coal", JSON.stringify(rigAK));

// Rig AL (Wave R4): hopper above a furnace feeds the smelt input.
const rigAL = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 37, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.setBlock(x, P.y + 1, z, 7);       // furnace
  D.placeHopper(x, P.y + 2, z, 0);    // hopper above, output down
  D.giveHopperItem(x, P.y + 2, z, "iron_ore", 2);
  for (let i = 0; i < 12; i++) window.advanceTime(100);
  const s = JSON.parse(window.render_game_to_text());
  const hopper = D.getHopperAt(x, P.y + 2, z);
  const left = hopper.slots.reduce((n, sl) => n + (sl ? sl.count : 0), 0);
  return { left };
}, { P });
check("AL1 hopper feeds furnace input (hopper drains)", rigAL.left === 0, JSON.stringify(rigAL));

// Rig AM (Wave R4 review): container reads reach ONLY the comparator rear —
// a repeater behind a stocked chest and a comparator with a chest on its SIDE
// must both stay off (no phantom latch).
const rigAM = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 39, x = P.x + 1;
  // a) Repeater rear = stocked chest.
  for (let dx = 0; dx <= 2; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.openChestAt(x, P.y + 1, z);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.giveChestItem("stone", 64, `${x},${P.y + 1},${z}`);
  D.placeRedstone("repeater", x + 1, P.y + 1, z, 1); // facing E, rear = chest
  D.placeRedstone("wire", x + 2, P.y + 1, z);
  // b) SUBTRACT comparator: rear = redstone block (15), stocked chest on its
  // SIDE. Sides must ignore containers -> out 15; a leak would shave it to 14.
  const z2 = z + 3;
  for (let dx = 0; dx <= 2; dx++) D.setBlock(x + dx, P.y, z2, 3);
  D.setBlock(x + 1, P.y, z2 + 1, 3);
  D.openChestAt(x + 1, P.y + 1, z2 + 1);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.giveChestItem("stone", 64, `${x + 1},${P.y + 1},${z2 + 1}`); // side chest -> signal 1
  D.placeRedstone("block", x, P.y + 1, z2);              // rear source 15
  D.placeRedstone("comparator", x + 1, P.y + 1, z2, 1);  // facing E
  D.toggleComparatorModeAt(x + 1, P.y + 1, z2);          // subtract mode
  D.placeRedstone("wire", x + 2, P.y + 1, z2);
  window.advanceTime(600);
  return {
    repeaterWire: D.getRedstoneAt(x + 2, P.y + 1, z),
    comparatorWire: D.getRedstoneAt(x + 2, P.y + 1, z2),
  };
}, { P });
check("AM1 repeater does NOT read chest rear (wire stays off)", rigAM.repeaterWire.id === 83 && rigAM.repeaterWire.power === 0, JSON.stringify(rigAM.repeaterWire));
check("AM2 comparator side ignores containers (subtract keeps full 15)", rigAM.comparatorWire.id === 84 && rigAM.comparatorWire.power === 15, JSON.stringify(rigAM.comparatorWire));

// Rig AN (Wave R4 review): tools keep their wear through hopper transfers and
// never stack — two worn pickaxes land in two chest slots, durability intact.
const rigAN = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 45, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.openChestAt(x, P.y + 1, z); // target chest
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.placeHopper(x, P.y + 2, z, 0); // output down into the chest
  D.giveHopperItem(x, P.y + 2, z, "stone_pickaxe", 2, 7); // 2 picks, wear 7/132
  for (let i = 0; i < 15; i++) window.advanceTime(100); // 2 transfer ticks
  const chest = D.getChestContentsAt(x, P.y + 1, z) || [];
  const picks = chest.filter((s) => s && s.itemId === "stone_pickaxe");
  const hopper = D.getHopperAt(x, P.y + 2, z);
  return { picks, hopperLeft: hopper.slots.filter(Boolean).length };
}, { P });
check("AN1 tools land one-per-slot (2 slots, count 1 each)", rigAN.picks.length === 2 && rigAN.picks.every((s) => s.count === 1) && rigAN.hopperLeft === 0, JSON.stringify(rigAN));
check("AN2 tool wear survives the transfer (durability 7)", rigAN.picks.every((s) => s.durability === 7), JSON.stringify(rigAN.picks));

// Rig AO (Wave R4 review): a hopper delivering into a chest wakes the
// comparator reading that chest — live signal rise, no manual re-dirty.
const rigAO = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 47, x = P.x + 1;
  for (let dx = 0; dx <= 2; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.openChestAt(x, P.y + 1, z);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.placeRedstone("comparator", x + 1, P.y + 1, z, 1); // rear = chest
  D.placeRedstone("wire", x + 2, P.y + 1, z);
  window.advanceTime(300);
  const before = D.getRedstoneAt(x + 2, P.y + 1, z);
  D.placeHopper(x, P.y + 2, z, 0); // above the chest, output down
  D.giveHopperItem(x, P.y + 2, z, "bread", 1);
  for (let i = 0; i < 10; i++) window.advanceTime(100);
  const after = D.getRedstoneAt(x + 2, P.y + 1, z);
  return { before, after };
}, { P });
check("AO1 hopper->chest delivery wakes the comparator (wire off->on)", rigAO.before.power === 0 && rigAO.after.id === 84 && rigAO.after.power >= 1, JSON.stringify(rigAO));

// Rig AP (Wave R4 review): non-smeltable items never jam the furnace input —
// the hopper holds them instead of wedging the smelter.
const rigAP = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 49, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.setBlock(x, P.y + 1, z, 7);       // furnace
  D.placeHopper(x, P.y + 2, z, 0);    // hopper above, output down
  D.giveHopperItem(x, P.y + 2, z, "bread", 2); // bread is not smeltable
  for (let i = 0; i < 12; i++) window.advanceTime(100);
  const hopper = D.getHopperAt(x, P.y + 2, z);
  const kept = hopper.slots.reduce((n, sl) => n + (sl ? sl.count : 0), 0);
  const furnaceSignal = D.getContainerSignalAt(x, P.y + 1, z);
  return { kept, furnaceSignal };
}, { P });
check("AP1 non-smeltable stays in hopper; furnace input stays clean", rigAP.kept === 2 && rigAP.furnaceSignal === 0, JSON.stringify(rigAP));

// Rig AQ (Wave R5): dispenser fires ONE item per rising edge — no auto-refire
// while held powered; a second OFF->ON edge fires again.
const rigAQ = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 51, x = P.x + 1;
  for (let dx = -1; dx <= 3; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.placeEjector(x, P.y + 1, z, 1, false); // dispenser facing E, open cell in front
  D.giveEjectorItem(x, P.y + 1, z, "arrow", 3);
  window.advanceTime(200);
  const e0 = D.getItemEntities().count;
  D.placeRedstone("block", x - 1, P.y + 1, z); // rising edge
  window.advanceTime(300);
  const e1 = D.getItemEntities().count;
  window.advanceTime(1200); // held powered
  const e2 = D.getItemEntities().count;
  D.setBlock(x - 1, P.y + 1, z, 0); // falling edge
  window.advanceTime(200);
  D.placeRedstone("block", x - 1, P.y + 1, z); // second rising edge
  window.advanceTime(300);
  const e3 = D.getItemEntities().count;
  const left = D.getEjectorAt(x, P.y + 1, z).slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  return { e0, e1, e2, e3, left };
}, { P });
check("AQ1 dispenser fires once on the rising edge", rigAQ.e1 === rigAQ.e0 + 1, JSON.stringify(rigAQ));
check("AQ2 held power does NOT re-fire", rigAQ.e2 === rigAQ.e1, JSON.stringify(rigAQ));
check("AQ3 second edge fires again (2 spent, 1 left)", rigAQ.e3 === rigAQ.e2 + 1 && rigAQ.left === 1, JSON.stringify(rigAQ));

// Rig AR (Wave R5): a dropper facing a chest INSERTS instead of throwing.
const rigAR = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 53, x = P.x + 1;
  for (let dx = -1; dx <= 1; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.openChestAt(x + 1, P.y + 1, z);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  D.placeEjector(x, P.y + 1, z, 1, true); // dropper facing E = into the chest
  D.giveEjectorItem(x, P.y + 1, z, "bread", 2);
  const e0 = D.getItemEntities().count;
  D.placeRedstone("block", x - 1, P.y + 1, z);
  window.advanceTime(300);
  const e1 = D.getItemEntities().count;
  const chest = (D.getChestContentsAt(x + 1, P.y + 1, z) || []).filter((s) => s && s.itemId === "bread");
  return { inserted: chest.reduce((n, s) => n + s.count, 0), e0, e1 };
}, { P });
// e1 <= e0: unrelated older drops may merge/despawn during the window; the
// claim is only that the dropper spawned no NEW ground item.
check("AR1 dropper->chest inserts (no ground item)", rigAR.inserted === 1 && rigAR.e1 <= rigAR.e0, JSON.stringify(rigAR));

// Rig AS (Wave R5): observer pulses its back for 1 tick when the watched cell
// changes; placement primes silently (no pulse before the change).
const rigAS = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 55, x = P.x + 1;
  for (let dx = 0; dx <= 3; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.placeObserver(x + 1, P.y + 1, z, 1); // faces E: watches x+2, back = x
  D.placeRedstone("wire", x, P.y + 1, z);
  window.advanceTime(400);
  const primed = D.getRedstoneAt(x, P.y + 1, z); // must still be off
  D.setBlock(x + 2, P.y + 1, z, 82); // watched cell changes
  window.advanceTime(150);
  const during = D.getRedstoneAt(x, P.y + 1, z);
  window.advanceTime(400);
  const after = D.getRedstoneAt(x, P.y + 1, z);
  return { primed, during, after };
}, { P });
check("AS1 placement primes silently; pulse powers the back wire", rigAS.primed.power === 0 && rigAS.during.id === 84 && rigAS.during.power === 15, JSON.stringify(rigAS));
check("AS2 pulse drops after 1 tick (wire back off)", rigAS.after.id === 83 && rigAS.after.power === 0, JSON.stringify(rigAS));

// Rig AT (Wave R5): hoppers feed dispensers (down) and drain them (from above);
// comparators read ejector fullness.
const rigAT = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 57, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.placeEjector(x, P.y + 1, z, 0, false);  // dispenser (facing N, irrelevant)
  D.placeHopper(x, P.y + 2, z, 0);          // hopper above, output down
  D.giveHopperItem(x, P.y + 2, z, "coal", 2);
  for (let i = 0; i < 12; i++) window.advanceTime(100);
  const inDisp = D.getEjectorAt(x, P.y + 1, z).slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  const sig = D.getContainerSignalAt(x, P.y + 1, z);
  // Reverse: dispenser above a hopper drains into it.
  const z2 = z + 2;
  D.setBlock(x, P.y, z2, 3);
  D.placeHopper(x, P.y + 1, z2, 0);
  D.placeEjector(x, P.y + 2, z2, 0, true);  // dropper above the hopper
  D.giveEjectorItem(x, P.y + 2, z2, "bread", 2);
  for (let i = 0; i < 12; i++) window.advanceTime(100);
  const inHopper = D.getHopperAt(x, P.y + 1, z2).slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  return { inDisp, sig, inHopper };
}, { P });
check("AT1 hopper feeds the dispenser below; comparator signal >=1", rigAT.inDisp === 2 && rigAT.sig >= 1, JSON.stringify(rigAT));
check("AT2 hopper drains the dropper above it", rigAT.inHopper === 2, JSON.stringify(rigAT));

// Rig AU (Wave R5): two observers facing each other ping-pong, then the
// burnout guard freezes the pair (no eternal 5 Hz remesh loop).
const rigAU = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 61, x = P.x + 1;
  D.setBlock(x, P.y, z, 3);
  D.setBlock(x + 1, P.y, z, 3);
  D.placeObserver(x, P.y + 1, z, 1);     // faces E (watches x+1)
  window.advanceTime(200);
  D.placeObserver(x + 1, P.y + 1, z, 3); // faces W (watches x) -> A sees it appear
  for (let i = 0; i < 30; i++) window.advanceTime(100); // 3s of ping-pong + burnout
  const stats = JSON.parse(window.render_game_to_text()).redstone;
  const idA = D.getObserverAt(x, P.y + 1, z);
  const idB = D.getObserverAt(x + 1, P.y + 1, z);
  return { pending: stats.pendingObservers, aPowered: idA.powered, bPowered: idB.powered };
}, { P });
check("AU1 observer pair burns out quiet (no pending pulses)", rigAU.pending === 0, JSON.stringify(rigAU));

// Rig AV (Wave R5): dispenser blocked by a solid wall keeps its item (no-op);
// pistons cannot push dispensers (container immovability).
const rigAV = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 63, x = P.x + 1;
  for (let dx = -1; dx <= 1; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.setBlock(x + 1, P.y + 1, z, 3); // solid wall in front
  D.placeEjector(x, P.y + 1, z, 1, false);
  D.giveEjectorItem(x, P.y + 1, z, "coal", 1);
  const e0 = D.getItemEntities().count;
  D.placeRedstone("block", x - 1, P.y + 1, z);
  window.advanceTime(400);
  const e1 = D.getItemEntities().count;
  const kept = D.getEjectorAt(x, P.y + 1, z).slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  // Piston vs dispenser: must refuse to extend.
  const z2 = z + 2;
  for (let dx = 0; dx <= 2; dx++) D.setBlock(x + dx, P.y, z2, 3);
  D.placePiston(x, P.y + 1, z2, 1, false);
  D.placeEjector(x + 1, P.y + 1, z2, 0, false);
  D.placeRedstone("block", x, P.y + 2, z2); // power the piston from above... via adjacency
  window.advanceTime(400);
  const pistonId = D.getRedstoneAt(x, P.y + 1, z2);
  return { e0, e1, kept, pistonId };
}, { P });
check("AV1 blocked dispenser keeps its item (deterministic no-op)", rigAV.e1 === rigAV.e0 && rigAV.kept === 1, JSON.stringify(rigAV));
check("AV2 piston refuses to push a dispenser (stays retracted)", rigAV.pistonId.id === 145, JSON.stringify(rigAV.pistonId));

// Rig AW (Wave R5 review MUST-FIX): an observer saved MID-PULSE must not load
// stuck-powered. Trigger a pulse, capture it powered, then reseed from edits
// (the save/load path) and confirm the back-pulse does NOT persist forever.
const rigAW = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 71, x = P.x + 1; // clear of AV (P.z+63/+65) and AX (P.z+67)
  for (let dx = 0; dx <= 3; dx++) D.setBlock(x + dx, P.y, z, 3);
  D.placeObserver(x + 1, P.y + 1, z, 1); // faces E: watches x+2, back = x
  D.placeRedstone("wire", x, P.y + 1, z);
  window.advanceTime(300);
  D.setBlock(x + 2, P.y + 1, z, 82);  // watched change -> pulse
  window.advanceTime(150);            // now inside the 100ms powered window
  const midPulse = D.getObserverAt(x + 1, P.y + 1, z); // must be powered here
  const wireMid = D.getRedstoneAt(x, P.y + 1, z);
  D.reseedRedstoneFromEdits();        // <-- simulate save + reload mid-pulse
  window.advanceTime(3000);           // no off-flip would ever come if stuck
  const afterLoad = D.getObserverAt(x + 1, P.y + 1, z);
  const wireAfter = D.getRedstoneAt(x, P.y + 1, z);
  const stats = JSON.parse(window.render_game_to_text()).redstone;
  return { midPulse, wireMid, afterLoad, wireAfter, pending: stats.pendingObservers };
}, { P });
check("AW1 observer was genuinely mid-pulse before reseed", rigAW.midPulse.powered === true && rigAW.wireMid.power === 15, JSON.stringify(rigAW));
check("AW2 reseed clears the stuck pulse (observer unpowered, wire off)", rigAW.afterLoad.powered === false && rigAW.wireAfter.id === 83 && rigAW.wireAfter.power === 0 && rigAW.pending === 0, JSON.stringify(rigAW));

// Rig AX (Wave R5 review MUST-FIX): a dispenser destroyed by a creeper blast
// (not breakBlock) must SPILL its contents and drop its state — no silent loss,
// no leaked ejectorStates entry.
const rigAX = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const z = P.z + 77, x = P.x + 1; // >3 cells from any other rig's ejector (blast r=3)
  D.setBlock(x, P.y, z, 3);
  D.placeEjector(x, P.y + 1, z, 0, false);
  D.giveEjectorItem(x, P.y + 1, z, "bread", 5);
  const before = D.getItemEntities().count;
  const statesBefore = JSON.parse(window.render_game_to_text()).redstone.ejectorStates;
  D.explodeAt(x, P.y + 1, z);
  window.advanceTime(300);
  const gone = D.getEjectorAt(x, P.y + 1, z); // block + state should be gone
  const after = D.getItemEntities().count;
  const statesAfter = JSON.parse(window.render_game_to_text()).redstone.ejectorStates;
  return { before, after, gone, statesBefore, statesAfter, blockId: D.getRedstoneAt(x, P.y + 1, z).id };
}, { P });
check("AX1 exploded dispenser spills bread (new ground entities)", rigAX.after > rigAX.before, JSON.stringify(rigAX));
check("AX2 exploded dispenser drops its state (no leak, block gone)", rigAX.gone === null && rigAX.blockId === 0 && rigAX.statesAfter === rigAX.statesBefore - 1, JSON.stringify(rigAX));

// Rig AY (Wave L1): removing a light emitter at a CHUNK SEAM must not leave
// ghost blocklight — the monotonic per-chunk BFS re-seeds removed light across
// the seam forever unless a fixpoint regional relight clears it. Work high in
// open air so blocklight propagates freely and isn't masked by skylight.
const rigAY = await page.evaluate(async ({ P }) => {
  const D = window.__exoCraftDebug;
  const y = P.y + 24;
  const seam = (Math.floor(P.x / 16) + 1) * 16; // chunk boundary east of P's chunk
  const z = P.z;
  const tx = seam - 1;     // last column of P's chunk (touches the seam)
  const probeX = seam + 3; // 3 cells into the neighbour chunk
  D.teleportPlayer(P.x + 0.5, y + 2, P.z + 0.5);
  window.advanceTime(50);
  D.setBlock(tx, y, z, 8); // torch (emit 14)
  window.advanceTime(50);
  const litNeighbour = D.getLightAt(probeX, y, z).block; // glow crosses the seam
  D.setBlock(tx, y, z, 0); // remove the torch
  window.advanceTime(50);
  const ghostNeighbour = D.getLightAt(probeX, y, z).block; // must be 0
  const ghostSource = D.getLightAt(tx, y, z).block;        // must be 0
  // A surviving neighbouring torch's glow must NOT be wiped by the regional relight.
  const t2 = seam + 5;
  D.setBlock(t2, y, z, 8);
  window.advanceTime(50);
  D.setBlock(tx, y, z, 8);  // second torch at the seam
  window.advanceTime(50);
  D.setBlock(tx, y, z, 0);  // remove the seam torch again
  window.advanceTime(50);
  const survivorGlow = D.getLightAt(t2 - 1, y, z).block; // still lit by t2 (~13)
  D.setBlock(t2, y, z, 0);
  return { litNeighbour, ghostNeighbour, ghostSource, survivorGlow };
}, { P });
check("AY1 torch glow crosses the chunk seam", rigAY.litNeighbour >= 8, JSON.stringify(rigAY));
check("AY2 removing a seam emitter leaves NO ghost light", rigAY.ghostNeighbour === 0 && rigAY.ghostSource === 0, JSON.stringify(rigAY));
check("AY3 the regional relight preserves a surviving source", rigAY.survivorGlow >= 12, JSON.stringify(rigAY));

// Rig AZ (Wave U1): shift-click quick-move sends a whole stack from the player
// inventory into an open chest in a single click, and back out again.
const rigAZ = await page.evaluate(async () => {
  const D = window.__exoCraftDebug;
  // Place the chest right next to the player so it's within interact range
  // (openChestPanel is proximity-gated — a far chest never actually opens).
  const s = JSON.parse(window.render_game_to_text());
  const x = Math.floor(s.player.x) + 2, y = Math.floor(s.player.y), z = Math.floor(s.player.z);
  D.setBlock(x, y - 1, z, 3);
  D.grantInventoryItem("gold_ingot", 7);
  D.openChestAt(x, y, z); // renders the chest panel with the item visible
  const inv0 = JSON.parse(window.render_game_to_text()).inventory.slots;
  const idx = inv0.findIndex((s) => s && s.itemId === "gold_ingot");
  const shiftClick = (sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    return !!el;
  };
  const foundInv = shiftClick(`[data-chest-inv-index="${idx}"]`); // inventory -> chest
  const chest1 = D.getChestContentsAt(x, y, z) || [];
  const inChest = chest1.filter((s) => s && s.itemId === "gold_ingot").reduce((n, s) => n + s.count, 0);
  const invAfter1 = JSON.parse(window.render_game_to_text()).inventory.slots.filter((s) => s && s.itemId === "gold_ingot").reduce((n, s) => n + s.count, 0);
  const cslot = chest1.findIndex((s) => s && s.itemId === "gold_ingot");
  const foundChest = shiftClick(`[data-chest-slot="${cslot}"]`); // chest -> inventory
  const chest2 = D.getChestContentsAt(x, y, z) || [];
  const backInChest = chest2.filter((s) => s && s.itemId === "gold_ingot").reduce((n, s) => n + s.count, 0);
  const invAfter2 = JSON.parse(window.render_game_to_text()).inventory.slots.filter((s) => s && s.itemId === "gold_ingot").reduce((n, s) => n + s.count, 0);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  return { inChest, invAfter1, backInChest, invAfter2, foundInv, foundChest };
});
check("AZ1 shift-click quick-moves inventory -> chest", rigAZ.inChest === 7 && rigAZ.invAfter1 === 0, JSON.stringify(rigAZ));
check("AZ2 shift-click quick-moves chest -> inventory", rigAZ.backInChest === 0 && rigAZ.invAfter2 === 7, JSON.stringify(rigAZ));

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
