import * as THREE from "three";

const TILE_PX = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 8;
// 1px gutter between tiles so mipmaps don't bleed across tile borders.
const TILE_GUTTER = 1;
const ATLAS_PX = (TILE_PX + TILE_GUTTER * 2) * ATLAS_COLS;

// Atlas slot coordinates (col, row). Row 0 is the top row of the canvas.
// Existing 14 tiles stay at the same logical [col, row] positions.
const TILE = {
  // --- existing tiles (rows 0-3, cols 0-3) ---
  grass_top:       [0, 0],
  grass_side:      [1, 0],
  dirt:            [2, 0],
  stone:           [3, 0],
  wood_top:        [0, 1],
  wood_side:       [1, 1],
  leaves:          [2, 1],
  crafting_top:    [3, 1],
  crafting_side:   [0, 2],
  furnace_top:     [1, 2],
  furnace_side:    [2, 2],
  furnace_front:   [3, 2],
  torch:           [0, 3],
  copper_ore:      [1, 3],
  // --- new tiles (cols 4-7) ---
  cobblestone:     [4, 0],
  sand:            [5, 0],
  gravel:          [6, 0],
  bedrock:         [7, 0],
  glass:           [4, 1],
  // Wave 5
  water:           [5, 1],
  // Wave 8 — ore tiles (rows 2-4, cols 5-7 + row 4)
  coal_ore:        [6, 1],
  iron_ore:        [7, 1],
  gold_ore:        [5, 2],
  diamond_ore:     [6, 2],
  redstone_ore:    [7, 2],
  lava:            [5, 3],
  // Wave 11 — flora tiles (row 4)
  tall_grass:      [0, 4],
  flower:          [1, 4],
  sapling:         [2, 4],
  // Wave 12 — birch/spruce/snow tiles (row 4, cols 3-7; row 5)
  birch_top:       [3, 4],
  birch_side:      [4, 4],
  birch_leaf:      [5, 4],
  spruce_top:      [6, 4],
  spruce_side:     [7, 4],
  spruce_leaf:     [0, 5],
  snow:            [1, 5],
  // Wave F7 — bed tiles (row 5, cols 2-3)
  bed_top:         [2, 5],  // red mattress with white pillow band
  bed_side:        [3, 5],  // side panel (wood frame + red mattress)
  // Wave G1 — farming tiles (row 5 cols 4-7, row 6 col 0)
  farmland:        [4, 5],  // tilled dark soil with furrows
  wheat_stage0:    [5, 5],  // sprouts (alpha-cutout cross-quad)
  wheat_stage1:    [6, 5],
  wheat_stage2:    [7, 5],
  wheat_stage3:    [0, 6],  // golden mature wheat
  // Wave G2a — building tiles (glass pane reuses the existing 'glass' tile)
  fence_oak:       [1, 6],
  ladder:          [2, 6],  // rails + rungs on transparent (alpha-cutout)
  // Wave G2b — door + trapdoor tiles
  door_oak:        [3, 6],
  trapdoor_oak:    [4, 6],
  // Wave G4 — wool
  wool:            [5, 6],
};

// For each block id, list the tile shown on each of the 6 box faces.
// Face order matches Three.js BoxGeometry: +X, -X, +Y (top), -Y (bottom), +Z, -Z.
export const BLOCK_FACE_TILES = {
  // Grass: dirt below, grass on top, grass-edge sides.
  1: { px: "grass_side", nx: "grass_side", py: "grass_top",  ny: "dirt",        pz: "grass_side", nz: "grass_side" },
  // Dirt
  2: { px: "dirt", nx: "dirt", py: "dirt", ny: "dirt", pz: "dirt", nz: "dirt" },
  // Stone
  3: { px: "stone", nx: "stone", py: "stone", ny: "stone", pz: "stone", nz: "stone" },
  // Wood log: end-grain rings on top/bottom, bark on sides.
  4: { px: "wood_side", nx: "wood_side", py: "wood_top", ny: "wood_top", pz: "wood_side", nz: "wood_side" },
  // Leaves (opaque green for v1).
  5: { px: "leaves", nx: "leaves", py: "leaves", ny: "leaves", pz: "leaves", nz: "leaves" },
  // Crafting table: grid on top, plank sides.
  6: { px: "crafting_side", nx: "crafting_side", py: "crafting_top", ny: "crafting_side", pz: "crafting_side", nz: "crafting_side" },
  // Furnace: opening on -Z by convention; sides repeat. Top/bottom stone-rim.
  7: { px: "furnace_side", nx: "furnace_side", py: "furnace_top", ny: "furnace_top", pz: "furnace_side", nz: "furnace_front" },
  // Torch (still a cube in v1 — texture only).
  8: { px: "torch", nx: "torch", py: "torch", ny: "torch", pz: "torch", nz: "torch" },
  // Copper ore: stone base with copper specks on every face.
  9: { px: "copper_ore", nx: "copper_ore", py: "copper_ore", ny: "copper_ore", pz: "copper_ore", nz: "copper_ore" },
  // Cobblestone: uniform cracked stone.
  10: { px: "cobblestone", nx: "cobblestone", py: "cobblestone", ny: "cobblestone", pz: "cobblestone", nz: "cobblestone" },
  // Sand: warm sandy yellow.
  11: { px: "sand", nx: "sand", py: "sand", ny: "sand", pz: "sand", nz: "sand" },
  // Gravel: speckled grey-brown.
  12: { px: "gravel", nx: "gravel", py: "gravel", ny: "gravel", pz: "gravel", nz: "gravel" },
  // Bedrock: near-black, unbreakable.
  13: { px: "bedrock", nx: "bedrock", py: "bedrock", ny: "bedrock", pz: "bedrock", nz: "bedrock" },
  // Glass: transparent with opaque border.
  14: { px: "glass", nx: "glass", py: "glass", ny: "glass", pz: "glass", nz: "glass" },
  // Water: same tile on all faces.
  15: { px: "water", nx: "water", py: "water", ny: "water", pz: "water", nz: "water" },
  // Wave 8 ores — stone base with colored speckles.
  16: { px: "coal_ore",     nx: "coal_ore",     py: "coal_ore",     ny: "coal_ore",     pz: "coal_ore",     nz: "coal_ore"     },
  17: { px: "iron_ore",     nx: "iron_ore",     py: "iron_ore",     ny: "iron_ore",     pz: "iron_ore",     nz: "iron_ore"     },
  18: { px: "gold_ore",     nx: "gold_ore",     py: "gold_ore",     ny: "gold_ore",     pz: "gold_ore",     nz: "gold_ore"     },
  19: { px: "diamond_ore",  nx: "diamond_ore",  py: "diamond_ore",  ny: "diamond_ore",  pz: "diamond_ore",  nz: "diamond_ore"  },
  20: { px: "redstone_ore", nx: "redstone_ore", py: "redstone_ore", ny: "redstone_ore", pz: "redstone_ore", nz: "redstone_ore" },
  // Wave 8 lava.
  21: { px: "lava",         nx: "lava",         py: "lava",         ny: "lava",         pz: "lava",         nz: "lava"         },
  // Wave 11 flora (cross-quad; tile used for the two crossed quads).
  23: { px: "tall_grass",   nx: "tall_grass",   py: "tall_grass",   ny: "tall_grass",   pz: "tall_grass",   nz: "tall_grass"   },
  24: { px: "flower",       nx: "flower",       py: "flower",       ny: "flower",       pz: "flower",       nz: "flower"       },
  25: { px: "sapling",      nx: "sapling",      py: "sapling",      ny: "sapling",      pz: "sapling",      nz: "sapling"      },
  // Wave 12 — birch log: pale end-grain top/bottom, white-striped bark sides.
  26: { px: "birch_side",   nx: "birch_side",   py: "birch_top",    ny: "birch_top",    pz: "birch_side",   nz: "birch_side"   },
  // Wave 12 — birch leaf: bright lime-tinted cutout.
  27: { px: "birch_leaf",   nx: "birch_leaf",   py: "birch_leaf",   ny: "birch_leaf",   pz: "birch_leaf",   nz: "birch_leaf"   },
  // Wave 12 — spruce log: dark reddish bark, dark rings on ends.
  28: { px: "spruce_side",  nx: "spruce_side",  py: "spruce_top",   ny: "spruce_top",   pz: "spruce_side",  nz: "spruce_side"  },
  // Wave 12 — spruce leaf: dark green cutout.
  29: { px: "spruce_leaf",  nx: "spruce_leaf",  py: "spruce_leaf",  ny: "spruce_leaf",  pz: "spruce_leaf",  nz: "spruce_leaf"  },
  // Wave 12 — snow: uniform white-blue top/sides.
  30: { px: "snow",         nx: "snow",         py: "snow",         ny: "snow",         pz: "snow",         nz: "snow"         },
  // Wave F4 — slabs (IDs 31-33): reuse material tile for all faces
  31: { px: "stone",        nx: "stone",        py: "stone",        ny: "stone",        pz: "stone",        nz: "stone"        },
  32: { px: "cobblestone",  nx: "cobblestone",  py: "cobblestone",  ny: "cobblestone",  pz: "cobblestone",  nz: "cobblestone"  },
  33: { px: "crafting_side",nx: "crafting_side",py: "crafting_top", ny: "crafting_side",pz: "crafting_side",nz: "crafting_side" },
  // Wave F4 — stone stairs (IDs 34-37: N/E/S/W)
  34: { px: "stone",        nx: "stone",        py: "stone",        ny: "stone",        pz: "stone",        nz: "stone"        },
  35: { px: "stone",        nx: "stone",        py: "stone",        ny: "stone",        pz: "stone",        nz: "stone"        },
  36: { px: "stone",        nx: "stone",        py: "stone",        ny: "stone",        pz: "stone",        nz: "stone"        },
  37: { px: "stone",        nx: "stone",        py: "stone",        ny: "stone",        pz: "stone",        nz: "stone"        },
  // Wave F4 — cobblestone stairs (IDs 38-41: N/E/S/W)
  38: { px: "cobblestone",  nx: "cobblestone",  py: "cobblestone",  ny: "cobblestone",  pz: "cobblestone",  nz: "cobblestone"  },
  39: { px: "cobblestone",  nx: "cobblestone",  py: "cobblestone",  ny: "cobblestone",  pz: "cobblestone",  nz: "cobblestone"  },
  40: { px: "cobblestone",  nx: "cobblestone",  py: "cobblestone",  ny: "cobblestone",  pz: "cobblestone",  nz: "cobblestone"  },
  41: { px: "cobblestone",  nx: "cobblestone",  py: "cobblestone",  ny: "cobblestone",  pz: "cobblestone",  nz: "cobblestone"  },
  // Wave F4 — wood plank stairs (IDs 42-45: N/E/S/W); top face = crafting_top (plank grain)
  42: { px: "crafting_side",nx: "crafting_side",py: "crafting_top", ny: "crafting_side",pz: "crafting_side",nz: "crafting_side" },
  43: { px: "crafting_side",nx: "crafting_side",py: "crafting_top", ny: "crafting_side",pz: "crafting_side",nz: "crafting_side" },
  44: { px: "crafting_side",nx: "crafting_side",py: "crafting_top", ny: "crafting_side",pz: "crafting_side",nz: "crafting_side" },
  45: { px: "crafting_side",nx: "crafting_side",py: "crafting_top", ny: "crafting_side",pz: "crafting_side",nz: "crafting_side" },
  // Wave F7 — bed (ID 46): red mattress top + white pillow band; wood-framed sides.
  46: { px: "bed_side", nx: "bed_side", py: "bed_top", ny: "crafting_side", pz: "bed_side", nz: "bed_side" },
  // Wave G1 — wheat crop stages (47-50: cross-quad flora, mesher reads the py tile).
  47: { px: "wheat_stage0", nx: "wheat_stage0", py: "wheat_stage0", ny: "wheat_stage0", pz: "wheat_stage0", nz: "wheat_stage0" },
  48: { px: "wheat_stage1", nx: "wheat_stage1", py: "wheat_stage1", ny: "wheat_stage1", pz: "wheat_stage1", nz: "wheat_stage1" },
  49: { px: "wheat_stage2", nx: "wheat_stage2", py: "wheat_stage2", ny: "wheat_stage2", pz: "wheat_stage2", nz: "wheat_stage2" },
  50: { px: "wheat_stage3", nx: "wheat_stage3", py: "wheat_stage3", ny: "wheat_stage3", pz: "wheat_stage3", nz: "wheat_stage3" },
  // Wave G1 — farmland (51): tilled soil on every face (dirt underside).
  51: { px: "farmland", nx: "farmland", py: "farmland", ny: "dirt", pz: "farmland", nz: "farmland" },
  // Wave G2a — fence/pane/ladder all use one tile per block on every face.
  52: { px: "fence_oak", nx: "fence_oak", py: "fence_oak", ny: "fence_oak", pz: "fence_oak", nz: "fence_oak" },
  53: { px: "glass", nx: "glass", py: "glass", ny: "glass", pz: "glass", nz: "glass" },
  54: { px: "ladder", nx: "ladder", py: "ladder", ny: "ladder", pz: "ladder", nz: "ladder" },
  55: { px: "ladder", nx: "ladder", py: "ladder", ny: "ladder", pz: "ladder", nz: "ladder" },
  56: { px: "ladder", nx: "ladder", py: "ladder", ny: "ladder", pz: "ladder", nz: "ladder" },
  57: { px: "ladder", nx: "ladder", py: "ladder", ny: "ladder", pz: "ladder", nz: "ladder" },
  // Wave G2b — doors (58-73) all use door_oak; trapdoors (74-81) use trapdoor_oak.
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [58 + i,
    { px: "door_oak", nx: "door_oak", py: "door_oak", ny: "door_oak", pz: "door_oak", nz: "door_oak" }])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [74 + i,
    { px: "trapdoor_oak", nx: "trapdoor_oak", py: "trapdoor_oak", ny: "trapdoor_oak", pz: "trapdoor_oak", nz: "trapdoor_oak" }])),
  // Wave G4 — wool (opaque cube).
  82: { px: "wool", nx: "wool", py: "wool", ny: "wool", pz: "wool", nz: "wool" },
};

// Deterministic pseudo-random — seeded by pixel index so textures are stable across reloads.
function pixelNoise(x, y, salt) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

// Coherent value-noise: every pixel inside the same `cell`×`cell` block shares one
// value, so painted tiles read as chunky Minecraft pixels rather than per-pixel static.
function cellNoise(x, y, salt, cell = 2) {
  return pixelNoise(Math.floor(x / cell), Math.floor(y / cell), salt);
}

// Stable per-id hash in [0,1) — used to give each cobblestone "stone" its own grey.
function idNoise(id) {
  const v = Math.sin(id * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

function shade(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// Pixel origin of a tile slot, accounting for per-tile gutter padding.
function tileOrigin(col, row) {
  const stride = TILE_PX + TILE_GUTTER * 2;
  return { ox: col * stride + TILE_GUTTER, oy: row * stride + TILE_GUTTER };
}

function fillTile(ctx, col, row, baseColor) {
  const { ox, oy } = tileOrigin(col, row);
  ctx.fillStyle = baseColor;
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
}

function rgb(r, g, b) {
  return `rgb(${r},${g},${b})`;
}

function paintGrassTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 1);
      // Base ≈ rgb(121, 192, 67). Random light/dark blade pattern.
      let r = 121;
      let g = 192;
      let b = 67;
      if (n < 0.18) { r -= 24; g -= 36; b -= 12; }
      else if (n < 0.4) { r -= 10; g -= 18; b -= 6; }
      else if (n > 0.85) { r += 14; g += 18; b += 8; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintGrassSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  // Top 3 rows: grass; bottom: dirt; row 3 has tendrils stitching the two together.
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 2);
      let r;
      let g;
      let b;
      if (y < 3) {
        r = 121 + (n < 0.3 ? -16 : 0);
        g = 192 + (n > 0.7 ? 14 : -16);
        b = 67;
      } else if (y === 3 && pixelNoise(x, y, 5) > 0.55) {
        r = 121;
        g = 192;
        b = 67;
      } else {
        r = 138 + (n < 0.3 ? -20 : 0);
        g = 100 + (n > 0.6 ? 12 : -10);
        b = 70 + (n < 0.3 ? -14 : 0);
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintDirt(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Muted earthy brown with chunky 2px clumps and a few scattered dark pebbles.
      const blob = cellNoise(x, y, 3, 2);
      const speck = pixelNoise(x, y, 31);
      let r = 138;
      let g = 100;
      let b = 70;
      if (blob < 0.22) { r -= 22; g -= 18; b -= 12; }
      else if (blob < 0.45) { r -= 10; g -= 8; b -= 5; }
      else if (blob > 0.82) { r += 14; g += 12; b += 9; }
      if (speck < 0.07) { r -= 18; g -= 14; b -= 9; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintStone(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Calm, slightly-cool grey with chunky 2px shading blobs + a faint per-pixel grain,
      // matching vanilla stone instead of the old streaky white-noise look.
      const blob = cellNoise(x, y, 4, 2);
      const grain = pixelNoise(x, y, 41);
      let v = 140;
      if (blob < 0.16) v = 122;
      else if (blob < 0.42) v = 132;
      else if (blob > 0.86) v = 152;
      else if (blob > 0.62) v = 146;
      if (grain < 0.08) v -= 6;
      else if (grain > 0.94) v += 5;
      shade(ctx, ox + x, oy + y, rgb(v, v + 1, v + 5));
    }
  }
}

function paintWoodTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  const cx = (TILE_PX - 1) / 2;
  const cy = (TILE_PX - 1) / 2;
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(radius * 0.95) % 2;
      const speck = pixelNoise(x, y, 6);
      // Light/dark concentric rings, both brighter than before.
      let r = ring === 0 ? 192 : 152;
      let g = ring === 0 ? 144 : 108;
      let b = ring === 0 ? 80 : 58;
      if (speck < 0.12) { r -= 22; g -= 16; b -= 10; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintWoodSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const stripe = (x % 4 === 0 || x % 4 === 3) ? -18 : 0;
      const knot = pixelNoise(x, y, 7);
      let r = 178 + stripe;
      let g = 130 + stripe;
      let b = 76 + stripe;
      if (knot < 0.08) { r -= 36; g -= 26; b -= 16; }
      else if (knot > 0.9) { r += 12; g += 8; b += 4; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintLeaves(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 8);
      // Leave ~18% of pixels transparent so the alpha-cutout material (alphaTest 0.5)
      // produces Minecraft-style canopy gaps — sky shows through instead of solid green.
      const hole = pixelNoise(x, y, 88);
      if (hole < 0.18) {
        continue; // alpha 0 < alphaTest 0.5 → discarded by shader
      }
      // Base ≈ rgb(96, 168, 80) — Minecraft-ish leaves.
      let r = 96;
      let g = 168;
      let b = 80;
      if (n < 0.18) { r -= 28; g -= 36; b -= 22; }
      else if (n > 0.82) { r += 16; g += 22; b += 14; }
      else if (n < 0.4) { r -= 10; g -= 16; b -= 8; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintCraftingTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 9);
      let r = 200;
      let g = 150;
      let b = 84;
      if (x === TILE_PX / 2 || y === TILE_PX / 2) { r -= 60; g -= 48; b -= 30; }
      else if (x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1) { r -= 30; g -= 22; b -= 12; }
      else if (n < 0.18) { r -= 14; g -= 10; b -= 6; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintCraftingSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const plankRow = Math.floor(y / 4);
      const stripe = y % 4 === 0 ? -36 : 0;
      const grain = pixelNoise(x, y + plankRow * 13, 10) < 0.2 ? -14 : 0;
      shade(ctx, ox + x, oy + y, rgb(190 + stripe + grain, 138 + stripe + grain, 78 + stripe + grain));
    }
  }
}

function paintFurnaceTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const border = x < 2 || y < 2 || x >= TILE_PX - 2 || y >= TILE_PX - 2;
      const n = pixelNoise(x, y, 11);
      let v = border ? 110 : 152;
      if (n < 0.22) v -= 12;
      else if (n > 0.82) v += 10;
      shade(ctx, ox + x, oy + y, rgb(v, v + 2, v + 6));
    }
  }
}

function paintFurnaceSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const stripe = (x === 0 || x === TILE_PX - 1) ? -32 : 0;
      const n = pixelNoise(x, y, 12);
      let v = 150 + stripe;
      if (n < 0.2) v -= 12;
      else if (n > 0.85) v += 10;
      shade(ctx, ox + x, oy + y, rgb(v, v + 2, v + 6));
    }
  }
}

function paintFurnaceFront(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const inOpening = x >= 4 && x < 12 && y >= 6 && y < 13;
      const inFlame = x >= 5 && x < 11 && y >= 8 && y < 12;
      const n = pixelNoise(x, y, 13);
      let r;
      let g;
      let b;
      if (inFlame) {
        const flameNoise = pixelNoise(x, y, 14);
        if (flameNoise < 0.4) { r = 244; g = 164; b = 60; }
        else if (flameNoise < 0.8) { r = 220; g = 100; b = 38; }
        else { r = 250; g = 220; b = 110; }
      } else if (inOpening) {
        r = 28;
        g = 28;
        b = 34;
      } else {
        let v = 150;
        if (n < 0.2) v -= 12;
        else if (n > 0.85) v += 10;
        r = v;
        g = v + 2;
        b = v + 6;
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintTorch(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  // Dark backing with a vertical stick and a flame at the top.
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      let r = 28;
      let g = 28;
      let b = 36;
      const onStick = x >= 7 && x <= 8 && y >= 6;
      const flameCore = (x === 7 || x === 8) && y >= 2 && y <= 5;
      const flameOuter = x >= 6 && x <= 9 && y >= 1 && y <= 6 && !flameCore;
      if (flameCore) { r = 250; g = 220; b = 110; }
      else if (flameOuter) { r = 232; g = 142; b = 50; }
      else if (onStick) {
        const knot = pixelNoise(x, y, 15) < 0.25;
        r = knot ? 110 : 142;
        g = knot ? 70 : 96;
        b = knot ? 36 : 52;
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintCopperOre(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 4);
      const ore = pixelNoise(x, y, 16);
      let r;
      let g;
      let b;
      if (ore > 0.78) {
        r = 218 + (ore > 0.92 ? 24 : 0);
        g = 130 + (ore > 0.92 ? 18 : 0);
        b = 70;
      } else {
        let v = 150;
        if (n < 0.18) v = 116;
        else if (n < 0.45) v = 138;
        else if (n > 0.85) v = 168;
        r = v;
        g = v + 2;
        b = v + 6;
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

// Cobblestone via a jittered Voronoi: each seed is one rounded stone; pixels that
// sit near-equidistant between the two closest seeds become the dark mortar seam.
// This reads unmistakably as mortared cobble instead of grey static.
function buildCobbleSeeds() {
  const GRID = 3;                 // ~3x3 stones across the 16px tile
  const step = TILE_PX / GRID;
  const seeds = [];
  for (let gy = -1; gy <= GRID; gy += 1) {
    for (let gx = -1; gx <= GRID; gx += 1) {
      const jx = pixelNoise(gx, gy, 62);
      const jy = pixelNoise(gx, gy, 63);
      seeds.push({
        x: (gx + 0.5 + (jx - 0.5) * 0.85) * step,
        y: (gy + 0.5 + (jy - 0.5) * 0.85) * step,
        grey: 104 + Math.floor(idNoise(gx * 73 + gy * 19 + 5) * 56), // 104..160
      });
    }
  }
  return seeds;
}
const _cobbleSeeds = buildCobbleSeeds();

function paintCobblestone(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      let d1 = 1e9;
      let d2 = 1e9;
      let best = _cobbleSeeds[0];
      for (let i = 0; i < _cobbleSeeds.length; i += 1) {
        const s = _cobbleSeeds[i];
        const dx = x + 0.5 - s.x;
        const dy = y + 0.5 - s.y;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = s; }
        else if (d < d2) { d2 = d; }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      let v;
      if (edge < 1.1) {
        v = 60; // dark mortar
      } else {
        v = best.grey;
        const grain = pixelNoise(x, y, 64);
        if (grain < 0.14) v -= 12;
        else if (grain > 0.88) v += 8;
      }
      shade(ctx, ox + x, oy + y, rgb(v, v, v + 2));
    }
  }
}

function paintSand(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 21);
      const n2 = pixelNoise(x + 3, y + 5, 22);
      // Warm sandy yellow with subtle grain variation.
      let r = 228;
      let g = 210;
      let b = 142;
      if (n < 0.15) { r -= 18; g -= 16; b -= 10; }
      else if (n > 0.85) { r += 14; g += 12; b += 8; }
      if (n2 < 0.12) { r -= 8; g -= 8; b -= 4; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintGravel(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Chunky 2px pebbles in greys with the odd brown one and a dark crevice.
      const blob = cellNoise(x, y, 23, 2);
      const tone = cellNoise(x + 7, y + 3, 24, 2);
      let r;
      let g;
      let b;
      if (blob < 0.16) { r = 80; g = 77; b = 74; }       // dark crevice
      else if (blob < 0.44) { r = 110; g = 106; b = 100; }
      else if (blob > 0.85) { r = 162; g = 158; b = 150; } // light pebble
      else { r = 132; g = 127; b = 120; }
      if (tone < 0.2) { r += 12; g -= 2; b -= 12; }        // occasional brown pebble
      const grain = pixelNoise(x, y, 25);
      if (grain < 0.1) { r -= 10; g -= 10; b -= 10; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintBedrock(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 25);
      const n2 = pixelNoise(x + 7, y + 9, 26);
      // Very dark near-black with subtle lighter patches — unmistakably unbreakable.
      let v;
      if (n2 > 0.82) {
        v = 62;
      } else if (n < 0.15) {
        v = 22;
      } else {
        v = 38 + (n < 0.4 ? -8 : n > 0.78 ? 12 : 0);
      }
      shade(ctx, ox + x, oy + y, rgb(v, v, v + 1));
    }
  }
}

function paintGlass(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Glass: transparent interior with a thin opaque white border.
      const onBorder = x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1;
      const innerBorder = x === 1 || y === 1 || x === TILE_PX - 2 || y === TILE_PX - 2;
      if (onBorder) {
        // Outer solid border.
        shade(ctx, ox + x, oy + y, "rgba(220,240,255,255)");
      } else if (innerBorder) {
        shade(ctx, ox + x, oy + y, "rgba(200,228,248,180)");
      } else {
        // Interior: mostly transparent with a faint blue tint.
        const glint = pixelNoise(x, y, 27);
        if (glint > 0.92) {
          shade(ctx, ox + x, oy + y, "rgba(255,255,255,120)");
        } else {
          shade(ctx, ox + x, oy + y, "rgba(180,220,255,30)");
        }
      }
    }
  }
}

function paintWater(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Animated-looking still water: diagonal wave pattern + noise variation.
      const wave = Math.sin((x + y) * 0.9 + 1.3) * 0.5 + 0.5;
      const n = pixelNoise(x, y, 30);
      const n2 = pixelNoise(x + 5, y + 3, 31);
      // Base deep blue; lighter crests, darker troughs.
      let r = 28  + Math.floor(wave * 22) + (n > 0.78 ? 20 : 0);
      let g = 80  + Math.floor(wave * 28) + (n > 0.78 ? 18 : 0);
      let b = 180 + Math.floor(wave * 40) + (n2 < 0.12 ? -20 : 0);
      // Bright specular glint on some pixels
      if (n > 0.93) { r += 40; g += 40; b += 20; }
      // Clamp
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      // Semi-transparent: alpha ~168 (≈66%) gives a nice translucent water look.
      ctx.fillStyle = `rgba(${r},${g},${b},168)`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// Generic ore tile: stone base + colored speckles.
// speckR/G/B define the ore vein color; highlightBoost brightens bright speckles.
function paintOre(ctx, col, row, speckR, speckG, speckB, salt) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 4);
      const ore = pixelNoise(x, y, salt);
      let r;
      let g;
      let b;
      if (ore > 0.76) {
        // Ore speckle: bright vein pixel.
        const bright = ore > 0.91;
        r = speckR + (bright ? 28 : 0);
        g = speckG + (bright ? 20 : 0);
        b = speckB + (bright ? 14 : 0);
      } else {
        // Stone base (same as paintStone).
        let v = 150;
        if (n < 0.18) v = 116;
        else if (n < 0.45) v = 138;
        else if (n > 0.85) v = 168;
        r = v;
        g = v + 2;
        b = v + 6;
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintCoalOre(ctx, col, row) {
  paintOre(ctx, col, row, 42, 40, 42, 40);
}

function paintIronOre(ctx, col, row) {
  paintOre(ctx, col, row, 200, 158, 118, 41);
}

function paintGoldOre(ctx, col, row) {
  paintOre(ctx, col, row, 232, 200, 48, 42);
}

function paintDiamondOre(ctx, col, row) {
  paintOre(ctx, col, row, 64, 224, 208, 43);
}

function paintRedstoneOre(ctx, col, row) {
  paintOre(ctx, col, row, 192, 28, 28, 44);
}

function paintLava(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      // Hot diagonal wave pattern: bright orange-yellow crests, dark red-black troughs.
      const wave = Math.sin((x - y) * 0.8 + 0.5) * 0.5 + 0.5;
      const n = pixelNoise(x, y, 50);
      const n2 = pixelNoise(x + 3, y + 7, 51);
      // Dark molten red base; brighter "hot spots" near crests.
      const r = Math.min(255, 180 + Math.floor(wave * 70) + (n > 0.82 ? 20 : 0));
      const g = Math.min(255,  40 + Math.floor(wave * 90) + (n > 0.82 ? 30 : 0));
      const b = (n2 < 0.08) ? 12 : 0;
      // Fully opaque — lava blocks light rather than lets it through.
      ctx.fillStyle = `rgba(${r},${g},${b},255)`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Wave 11 — flora tile paint functions
// All three tiles use DoubleSide alpha-cutout in the mesher.
// Pixels not painted (transparent) are cut out by alphaTest 0.5.
// ---------------------------------------------------------------------------

function paintTallGrass(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 91);
      const n2 = pixelNoise(x, y, 92);
      // Bottom 2 rows: stem; rest: feathery tips.
      // Sparse pattern so alpha-cutout produces see-through gaps like tall grass.
      const inStem = y >= TILE_PX - 3;
      const blade = Math.abs(x - TILE_PX / 2) < 2.5 + Math.sin(y * 0.9) * 2;
      const wing  = (n > 0.55) && Math.abs(x - TILE_PX / 2) < 5 && y < TILE_PX - 2;
      if (!inStem && !blade && !wing) continue;
      // Darker near base, brighter at tips
      const bright = 1 - (y / TILE_PX) * 0.35;
      let r = Math.round((82 + n2 * 24) * bright);
      let g = Math.round((164 + n2 * 30) * bright);
      let b = Math.round((58 + n2 * 16) * bright);
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintFlower(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 93);
      const cx = TILE_PX / 2;
      const cy = TILE_PX / 2 - 1;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Stem: thin center column bottom half
      const inStem = Math.abs(x - cx) < 1.2 && y > cy;
      // Petals: 4 cardinal petal puffs at radius ~3-4
      const petal = dist > 2.2 && dist < 5.0 && n > 0.32;
      // Center disc
      const centre = dist < 2.4;
      if (!inStem && !petal && !centre) continue;
      let r, g, b;
      if (inStem) { r = 80; g = 150; b = 50; }
      else if (centre) { r = 240; g = 200; b = 30; }
      else {
        // Petals: soft white-pink with noise variation
        const pn = pixelNoise(x, y, 94);
        r = 240 + Math.round(pn * 15);
        g = 160 + Math.round(pn * 30);
        b = 200 + Math.round(pn * 15);
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

// ---------------------------------------------------------------------------
// Wave 12 — birch/spruce/snow tile paint functions
// ---------------------------------------------------------------------------

function paintBirchTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  const cx = (TILE_PX - 1) / 2;
  const cy = (TILE_PX - 1) / 2;
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(radius * 0.95) % 2;
      const speck = pixelNoise(x, y, 96);
      // Pale birch rings — much lighter/yellower than oak
      let r = ring === 0 ? 216 : 180;
      let g = ring === 0 ? 200 : 168;
      let b = ring === 0 ? 148 : 120;
      if (speck < 0.12) { r -= 18; g -= 16; b -= 12; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintBirchSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 97);
      // Birch bark: white/pale cream with characteristic dark horizontal flecks.
      let r = 224;
      let g = 220;
      let b = 196;
      // Horizontal dark band marks (birch characteristic)
      const band = pixelNoise(x * 0.3, y * 2.1, 98);
      if (band < 0.18) { r = 60; g = 54; b = 46; }         // dark stripe
      else if (band < 0.28) { r -= 20; g -= 18; b -= 14; } // near-stripe
      else if (n < 0.12) { r -= 12; g -= 10; b -= 8; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintBirchLeaf(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 99);
      const hole = pixelNoise(x, y, 100);
      if (hole < 0.18) continue; // alpha cutout
      // Birch leaves: bright lime-green, lighter than oak
      let r = 120;
      let g = 188;
      let b = 80;
      if (n < 0.18) { r -= 24; g -= 32; b -= 18; }
      else if (n > 0.82) { r += 20; g += 24; b += 12; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintSpruceTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  const cx = (TILE_PX - 1) / 2;
  const cy = (TILE_PX - 1) / 2;
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(radius * 0.95) % 2;
      const speck = pixelNoise(x, y, 101);
      // Spruce rings: dark reddish-brown
      let r = ring === 0 ? 140 : 100;
      let g = ring === 0 ?  92 :  64;
      let b = ring === 0 ?  48 :  30;
      if (speck < 0.12) { r -= 22; g -= 14; b -= 8; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintSpruceSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const stripe = (x % 4 === 0 || x % 4 === 3) ? -22 : 0;
      const knot = pixelNoise(x, y, 102);
      // Spruce bark: dark brownish-red
      let r = 110 + stripe;
      let g =  70 + stripe;
      let b =  38 + stripe;
      if (knot < 0.08) { r -= 28; g -= 18; b -= 10; }
      else if (knot > 0.9) { r += 10; g += 6; b += 3; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintSpruceLeaf(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 103);
      const hole = pixelNoise(x, y, 104);
      if (hole < 0.18) continue; // alpha cutout
      // Spruce leaves: dark forest green
      let r = 46;
      let g = 100;
      let b = 46;
      if (n < 0.18) { r -= 10; g -= 20; b -= 10; }
      else if (n > 0.82) { r += 14; g += 24; b += 14; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintSnow(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 105);
      const n2 = pixelNoise(x + 3, y + 5, 106);
      // Clean white-blue snow with subtle sparkle variation
      let r = 234;
      let g = 240;
      let b = 248;
      if (n < 0.15) { r -= 12; g -= 12; b -= 8; }
      else if (n > 0.88) { r = 255; g = 255; b = 255; } // sparkle
      if (n2 < 0.08) { r -= 8; g -= 8; b -= 4; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintSapling(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 95);
      const cx = TILE_PX / 2;
      // Trunk: bottom 6 rows, 2px wide
      const inTrunk = Math.abs(x - cx) < 1.5 && y >= TILE_PX - 6;
      // Leaves: small oval cluster upper half
      const lx = x - cx;
      const ly = y - 4;
      const inLeaf = (lx * lx * 0.4 + ly * ly) < 16 && n > 0.22;
      if (!inTrunk && !inLeaf) continue;
      let r, g, b;
      if (inTrunk) {
        r = 160 + Math.round(n * 20); g = 110 + Math.round(n * 20); b = 60;
      } else {
        r = 76 + Math.round(n * 30); g = 148 + Math.round(n * 30); b = 60;
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

// Wave F7 — bed tiles
function paintBedTop(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  // Red mattress base with a white pillow band across the top 5 rows.
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 110);
      const inPillow = y < 5;
      let r, g, b;
      if (inPillow) {
        // White pillow band with subtle crinkle noise
        r = 248 + (n < 0.15 ? -14 : n > 0.88 ? 7 : 0);
        g = 244 + (n < 0.15 ? -12 : n > 0.88 ? 7 : 0);
        b = 240 + (n < 0.15 ? -10 : n > 0.88 ? 7 : 0);
        // Pillow border stitching (dark red line at y=4 / bottom of pillow)
        if (y === 4) { r = 160; g = 30; b = 30; }
      } else {
        // Red mattress with fabric noise
        r = 192 + (n < 0.2 ? -28 : n > 0.82 ? 20 : 0);
        g = 36  + (n < 0.2 ? -10 : n > 0.82 ? 10 : 0);
        b = 36  + (n < 0.2 ? -10 : n > 0.82 ? 10 : 0);
        // Thin vertical stripe "quilt" lines every 4 px
        if (x % 4 === 0) { r -= 22; g -= 8; b -= 8; }
      }
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintBedSide(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  // Wood frame along top and bottom edges; red fabric fill in middle.
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 111);
      const isFrame = y <= 1 || y >= TILE_PX - 2;
      let r, g, b;
      if (isFrame) {
        // Wood frame: warm brown
        const stripe = (x % 4 === 0 || x % 4 === 3) ? -18 : 0;
        r = 180 + stripe + (n < 0.15 ? -18 : 0);
        g = 128 + stripe + (n < 0.15 ? -12 : 0);
        b = 70  + stripe + (n < 0.15 ? -8  : 0);
      } else {
        // Red mattress side
        r = 186 + (n < 0.2 ? -24 : n > 0.84 ? 16 : 0);
        g = 34  + (n < 0.2 ? -8  : n > 0.84 ? 8  : 0);
        b = 34  + (n < 0.2 ? -8  : n > 0.84 ? 8  : 0);
      }
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

// Wave G1 — tilled farmland: darker, wetter dirt with horizontal furrow rows.
function paintFarmland(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 71);
      // Base ≈ rgb(96, 66, 38) — damp tilled soil, darker than plain dirt.
      let r = 96, g = 66, b = 38;
      // Furrow rows every 5 px read as darker grooves.
      if (y % 5 === 2) { r -= 30; g -= 22; b -= 14; }
      if (n < 0.2) { r -= 16; g -= 12; b -= 8; }
      else if (n > 0.85) { r += 14; g += 10; b += 6; }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G1 — wheat crop cross-quad sprite. Alpha-cutout: only stalk pixels are painted;
// the rest stay transparent (discarded by the flora material's alphaTest). heightFrac
// controls how far up the tile the stalks reach (taller = later growth stage); `mature`
// switches the top to golden grain heads.
function paintWheatStage(ctx, col, row, heightFrac, mature) {
  const { ox, oy } = tileOrigin(col, row);
  const topY = Math.round(TILE_PX * (1 - heightFrac)); // pixels above this stay empty
  // 4 evenly-spaced vertical stalks.
  const stalkXs = [2, 6, 9, 13];
  for (let y = 0; y < TILE_PX; y += 1) {
    if (y < topY) continue;
    for (let x = 0; x < TILE_PX; x += 1) {
      let onStalk = false;
      for (const sx of stalkXs) {
        if (x === sx || (mature && Math.abs(x - sx) === 1 && y < topY + 4)) { onStalk = true; break; }
      }
      if (!onStalk) continue;
      const n = pixelNoise(x, y, 72);
      let r, g, b;
      if (mature && y < topY + 5) {
        // Golden grain head near the top.
        r = 216 + (n < 0.3 ? -28 : n > 0.8 ? 14 : 0);
        g = 188 + (n < 0.3 ? -22 : 0);
        b = 74  + (n < 0.3 ? -10 : 0);
      } else {
        // Green stalk.
        r = 104 + (n < 0.3 ? -22 : 0);
        g = 150 + (n < 0.3 ? -28 : n > 0.8 ? 14 : 0);
        b = 58  + (n < 0.3 ? -12 : 0);
      }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G2a — oak fence: warm plank brown with vertical grain streaks.
function paintFenceOak(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 510);
      let r = 176, g = 138, b = 85;
      if (x % 5 === 0) { r -= 26; g -= 22; b -= 16; } // vertical plank seam
      if (n < 0.2) { r -= 16; g -= 14; b -= 10; }
      else if (n > 0.85) { r += 14; g += 12; b += 8; }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G2a — ladder: two vertical rails + horizontal rungs on a transparent background
// (alpha-cutout, like leaves — unpainted pixels are discarded).
function paintLadder(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const isRail = x <= 2 || x >= TILE_PX - 3;
      const isRung = (y % 5 === 1 || y % 5 === 2);
      if (!isRail && !isRung) continue; // transparent gap
      const n = pixelNoise(x, y, 511);
      let r = 150, g = 102, b = 56;
      if (n < 0.3) { r -= 22; g -= 16; b -= 10; }
      else if (n > 0.8) { r += 12; g += 8; b += 6; }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G2b — oak door: plank panel with a vertical edge seam + a handle dot.
function paintDoorOak(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 512);
      let r = 198, g = 158, b = 96;
      if (x <= 1 || x >= TILE_PX - 2) { r -= 30; g -= 26; b -= 18; } // edge frame
      if (y === 5 || y === 10) { r -= 22; g -= 18; b -= 12; }        // panel seams
      if (n < 0.2) { r -= 14; g -= 12; b -= 8; } else if (n > 0.85) { r += 12; g += 10; b += 6; }
      // handle dot
      if (x >= 11 && x <= 12 && y >= 7 && y <= 8) { r = 70; g = 60; b = 44; }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G2b — oak trapdoor: horizontal plank slats with gaps.
function paintTrapdoorOak(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 513);
      let r = 190, g = 150, b = 90;
      if (y % 4 === 3) { r -= 34; g -= 28; b -= 20; } // horizontal slat gaps
      if (n < 0.2) { r -= 14; g -= 12; b -= 8; } else if (n > 0.85) { r += 12; g += 10; b += 6; }
      shade(ctx, ox + x, oy + y, rgb(Math.max(0, r), Math.max(0, g), Math.max(0, b)));
    }
  }
}

// Wave G4 — wool: soft off-white with subtle fluffy noise.
function paintWool(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 514);
      let v = 232;
      if (n < 0.25) v -= 18;
      else if (n > 0.85) v += 10;
      shade(ctx, ox + x, oy + y, rgb(v, v, Math.min(255, v + 4)));
    }
  }
}

function paintAtlas(ctx) {
  // Default-fill with bright magenta to make any unmapped face obvious in dev.
  fillTile(ctx, 0, 0, "#ff00ff");
  paintGrassTop(ctx, ...TILE.grass_top);
  paintGrassSide(ctx, ...TILE.grass_side);
  paintDirt(ctx, ...TILE.dirt);
  paintStone(ctx, ...TILE.stone);
  paintWoodTop(ctx, ...TILE.wood_top);
  paintWoodSide(ctx, ...TILE.wood_side);
  paintLeaves(ctx, ...TILE.leaves);
  paintCraftingTop(ctx, ...TILE.crafting_top);
  paintCraftingSide(ctx, ...TILE.crafting_side);
  paintFurnaceTop(ctx, ...TILE.furnace_top);
  paintFurnaceSide(ctx, ...TILE.furnace_side);
  paintFurnaceFront(ctx, ...TILE.furnace_front);
  paintTorch(ctx, ...TILE.torch);
  paintCopperOre(ctx, ...TILE.copper_ore);
  // New wave-2 tiles
  paintCobblestone(ctx, ...TILE.cobblestone);
  paintSand(ctx, ...TILE.sand);
  paintGravel(ctx, ...TILE.gravel);
  paintBedrock(ctx, ...TILE.bedrock);
  paintGlass(ctx, ...TILE.glass);
  // Wave 5
  paintWater(ctx, ...TILE.water);
  // Wave 8 — ore ladder + lava
  paintCoalOre(ctx,     ...TILE.coal_ore);
  paintIronOre(ctx,     ...TILE.iron_ore);
  paintGoldOre(ctx,     ...TILE.gold_ore);
  paintDiamondOre(ctx,  ...TILE.diamond_ore);
  paintRedstoneOre(ctx, ...TILE.redstone_ore);
  paintLava(ctx,        ...TILE.lava);
  // Wave 11 — flora
  paintTallGrass(ctx,   ...TILE.tall_grass);
  paintFlower(ctx,      ...TILE.flower);
  paintSapling(ctx,     ...TILE.sapling);
  // Wave 12 — wood/snow variants
  paintBirchTop(ctx,    ...TILE.birch_top);
  paintBirchSide(ctx,   ...TILE.birch_side);
  paintBirchLeaf(ctx,   ...TILE.birch_leaf);
  paintSpruceTop(ctx,   ...TILE.spruce_top);
  paintSpruceSide(ctx,  ...TILE.spruce_side);
  paintSpruceLeaf(ctx,  ...TILE.spruce_leaf);
  paintSnow(ctx,        ...TILE.snow);
  // Wave F7 — bed
  paintBedTop(ctx,  ...TILE.bed_top);
  paintBedSide(ctx, ...TILE.bed_side);
  // Wave G1 — farming
  paintFarmland(ctx, ...TILE.farmland);
  paintWheatStage(ctx, ...TILE.wheat_stage0, 0.35, false);
  paintWheatStage(ctx, ...TILE.wheat_stage1, 0.55, false);
  paintWheatStage(ctx, ...TILE.wheat_stage2, 0.80, false);
  paintWheatStage(ctx, ...TILE.wheat_stage3, 1.00, true);
  // Wave G2a — building
  paintFenceOak(ctx, ...TILE.fence_oak);
  paintLadder(ctx, ...TILE.ladder);
  // Wave G2b — door + trapdoor
  paintDoorOak(ctx, ...TILE.door_oak);
  paintTrapdoorOak(ctx, ...TILE.trapdoor_oak);
  // Wave G4 — wool
  paintWool(ctx, ...TILE.wool);
}

export function createAtlasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  paintAtlas(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// Returns the [u, v] rect for a named tile in atlas UV space (V=0 at bottom).
// Insets by TILE_GUTTER pixels on each edge so mipmaps sample only within the tile.
//
// Memoized: the atlas is static, so a given tileName always maps to the same rect. The
// mesher calls this once per exposed face — thousands per chunk rebuild — so caching turns
// per-face object+division churn into ~one object per distinct tile for the app lifetime.
// The returned rect is SHARED and must be treated as immutable (all consumers only read).
const _tileUvRectCache = new Map();
export function tileUvRect(tileName) {
  const cached = _tileUvRectCache.get(tileName);
  if (cached) {
    return cached;
  }
  const slot = TILE[tileName];
  const stride = TILE_PX + TILE_GUTTER * 2; // pixel stride per slot
  const [col, rowFromTop] = slot || [0, 0];
  // Pixel coordinates of the inset tile region within the atlas canvas.
  const pxLeft   = col * stride + TILE_GUTTER;
  const pxRight  = pxLeft + TILE_PX;
  const pxTop    = rowFromTop * stride + TILE_GUTTER;
  const pxBottom = pxTop + TILE_PX;
  const uMin = pxLeft   / ATLAS_PX;
  const uMax = pxRight  / ATLAS_PX;
  // Canvas Y=0 is top; UV V=1 is top → invert.
  const vMin = 1 - pxBottom / ATLAS_PX;
  const vMax = 1 - pxTop    / ATLAS_PX;
  // NOTE: this object is shared across all callers for this tile — do not mutate it.
  const rect = { uMin, uMax, vMin, vMax };
  _tileUvRectCache.set(tileName, rect);
  return rect;
}

export const ATLAS_TILE_PX = TILE_PX;

// Transparency class for each block id.
// 0 = opaque (default, not in map)
// 1 = alpha-cutout (leaves: sky visible through gaps, same-class faces still culled)
// 2 = full-transparent (glass: faces between same-class adjacent blocks are culled)
// A face between two blocks of the SAME nonzero class is treated as interior (not exposed).
export const BLOCK_TRANSPARENCY_CLASS = {
  5:  1, // leaves — alpha cutout
  14: 2, // glass — full transparent
  15: 2, // water — full transparent (water-water faces culled; water-air/solid faces emitted)
  // Wave 8: lava — own buffer (class 3). Lava-lava faces culled; lava-air/solid faces rendered.
  // Class 3 is numerically distinct so lava-water faces are NOT culled (they border each other).
  21: 3,
  // Wave 11 flora — class 4 = cross-quad (alpha-cutout, DoubleSide, NOT cube faces).
  // Class 4 is distinct from all other classes so neighbor checks never cull them.
  23: 4, // tall grass
  24: 4, // flower
  25: 4, // sapling
  // Wave 12 — birch/spruce leaves use the same alpha-cutout class as oak leaves (1).
  27: 1, // birch leaf
  29: 1, // spruce leaf
  // Wave F4 — partial-geometry blocks (slabs, stairs).
  // Class 5 = opaque-but-partial: ensures neighboring full-blocks never cull their face
  // when adjacent to a slab or stair (because class 5 ≠ 0 → neighbor face is always exposed).
  // The partial blocks themselves are emitted via their own mesher branch (not isFaceExposed).
  31: 5, 32: 5, 33: 5,
  34: 5, 35: 5, 36: 5, 37: 5,
  38: 5, 39: 5, 40: 5, 41: 5,
  42: 5, 43: 5, 44: 5, 45: 5,
  // Wave F7 — bed: partial geometry, same class.
  46: 5,
  // Wave G1 — wheat crop stages: cross-quad flora (class 4). Farmland (51) is opaque (omit).
  47: 4, 48: 4, 49: 4, 50: 4,
  // Wave G2a — fence (5=partial-opaque), glass pane (2=full-transparent, merges with glass),
  // ladders (4=isolated cross-quad-like, never cull neighbours).
  52: 5,
  53: 2,
  54: 4, 55: 4, 56: 4, 57: 4,
  // Wave G2b — doors + trapdoors are all partial-geometry (class 5).
  ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [58 + i, 5])),
};

// Flora block ids as a Set — used by the mesher and collision system.
// Only cross-quad (class 4) blocks are in this set; leaf blocks (class 1) are NOT.
// Wave G1 — wheat crop stages 47-50 are cross-quad flora too.
export const FLORA_BLOCK_IDS = new Set([23, 24, 25, 47, 48, 49, 50]);

// Wave F4 — partial-geometry block id sets.
// Slabs: one id per material (bottom-half box).
export const SLAB_BLOCK_IDS = new Set([
  31, // stone slab
  32, // cobblestone slab
  33, // wood plank slab
  46, // bed (low box ~0.55 height — emitted as flat slab geometry then stretched)
]);

// Stairs: 4 orientation ids per material (N / E / S / W facing).
// "Facing" = the direction the placing player was looking = the open/low side of the stair.
export const STAIR_BLOCK_IDS = new Set([
  34, 35, 36, 37, // stone stairs  N E S W
  38, 39, 40, 41, // cobblestone stairs  N E S W
  42, 43, 44, 45, // wood plank stairs  N E S W
]);

// Orientation index within each stair material group (offset from material's first id).
// "North" = the player was facing -Z when they placed the stair (camera yaw ≈ 0).
// The tall step is on the opposite side from the placing player; the open/low side
// faces the player (so you walk up a stair from the side you were facing when placing it).
//   orient 0 (North): tall step on -Z half, open/low side on +Z  (player was at +Z)
//   orient 1 (East):  tall step on +X half, open/low side on -X  (player was at -X)
//   orient 2 (South): tall step on +Z half, open/low side on -Z  (player was at -Z)
//   orient 3 (West):  tall step on -X half, open/low side on +X  (player was at +X)
export const STAIR_ORIENTATION_NORTH = 0;
export const STAIR_ORIENTATION_EAST  = 1;
export const STAIR_ORIENTATION_SOUTH = 2;
export const STAIR_ORIENTATION_WEST  = 3;

// First id of each stair material group.
export const STAIR_BASE_IDS = {
  stone:       34,
  cobblestone: 38,
  plank:       42,
};

// ---------------------------------------------------------------------------
// Wave G2a — building block id sets + pure id↔state helpers (single source of
// truth, mirrored by world.js mesher, physics.js collision, and main.js logic).
// ---------------------------------------------------------------------------
export const FENCE_BLOCK_IDS = new Set([52]);   // post + connecting rails
export const PANE_BLOCK_IDS = new Set([53]);    // thin connecting glass plane
// Ladder: 4 ids by the WALL DIRECTION the ladder is mounted against / faces away from.
//   54 = +Z, 55 = -Z, 56 = +X, 57 = -X (the open face the player climbs).
export const LADDER_BLOCK_IDS = new Set([54, 55, 56, 57]);
export function ladderFacing(id) { return id - 54; } // 0=+Z,1=-Z,2=+X,3=-X

// Wave G2b — doors: 16 ids. Lower 58-65 (closed 58-61 N/E/S/W, open 62-65); upper 66-73
// (closed 66-69, open 70-73). Toggling open↔closed is +4/-4 within each half.
export const DOOR_LOWER_IDS = new Set([58, 59, 60, 61, 62, 63, 64, 65]);
export const DOOR_UPPER_IDS = new Set([66, 67, 68, 69, 70, 71, 72, 73]);
export const DOOR_BLOCK_IDS = new Set([...DOOR_LOWER_IDS, ...DOOR_UPPER_IDS]);
export const DOOR_OPEN_IDS = new Set([62, 63, 64, 65, 70, 71, 72, 73]);
export function doorIsUpper(id) { return DOOR_UPPER_IDS.has(id); }
export function doorIsOpen(id) { return DOOR_OPEN_IDS.has(id); }
export function doorOrient(id) {
  if (id >= 58 && id <= 61) return id - 58;
  if (id >= 62 && id <= 65) return id - 62;
  if (id >= 66 && id <= 69) return id - 66;
  return id - 70; // 70-73
}
export function doorToggle(id) { return doorIsOpen(id) ? id - 4 : id + 4; }

// Wave G2b — trapdoors: 8 ids. Closed 74-77 (N/E/S/W), open 78-81. Toggle is +4/-4.
export const TRAPDOOR_BLOCK_IDS = new Set([74, 75, 76, 77, 78, 79, 80, 81]);
export const TRAPDOOR_CLOSED_IDS = new Set([74, 75, 76, 77]);
export const TRAPDOOR_OPEN_IDS = new Set([78, 79, 80, 81]);
export function trapdoorIsOpen(id) { return TRAPDOOR_OPEN_IDS.has(id); }
export function trapdoorOrient(id) { return trapdoorIsOpen(id) ? id - 78 : id - 74; }
export function trapdoorToggle(id) { return trapdoorIsOpen(id) ? id - 4 : id + 4; }

// Combined set for fast mesher dispatch (fence + doors + trapdoors join the partial path;
// panes & ladders get their own mesher branches).
export const PARTIAL_BLOCK_IDS = new Set([
  ...SLAB_BLOCK_IDS, ...STAIR_BLOCK_IDS, ...FENCE_BLOCK_IDS, ...DOOR_BLOCK_IDS, ...TRAPDOOR_BLOCK_IDS,
]);

// ----- Item icon canvases -----
// Returns a lazily-painted atlas canvas (shared, painted once).
let _atlasCanvas = null;
function getAtlasCanvas() {
  if (_atlasCanvas) return _atlasCanvas;
  _atlasCanvas = document.createElement("canvas");
  _atlasCanvas.width = ATLAS_PX;
  _atlasCanvas.height = ATLAS_PX;
  const ctx = _atlasCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  paintAtlas(ctx);
  return _atlasCanvas;
}

// Palette of distinct colors for non-block items (tools/resources).
const ITEM_CHIP_COLORS = {
  // Wave G1/G2/G3/G4 — item chip colors for non-block items.
  wheat:              "#d8c24a",
  bread:              "#c8924a",
  wood_hoe:           "#c8a060",
  stone_hoe:          "#9098a0",
  iron_hoe:           "#d8d8e0",
  bow:                "#b08040",
  arrow:              "#d8d8d8",
  flint:              "#404048",
  string:             "#e8e8e8",
  shears:             "#b8c4cc",
  wool_block:         "#e8e8e8",
  plank:              "#c8a060",
  stick:              "#a07040",
  bone_shard:         "#e0dcc8",
  copper_ingot:       "#d4804a",
  charcoal:           "#3a3a3a",
  refined_stone:      "#8890a0",
  wood_sword:         "#c8a060",
  bone_blade:         "#d8d4b8",
  copper_blade:       "#c87040",
  vanguard_blade:     "#6080c0",
  warden_totem:       "#506840",
  deep_delver_pickaxe:"#4070b0",
  spelunker_compass:  "#50c0c0",
  wood_pickaxe:       "#c8a060",
  wood_axe:           "#c8a060",
  wood_shovel:        "#c8a060",
  stone_pickaxe:      "#8890a0",
  stone_axe:          "#8890a0",
  stone_shovel:       "#8890a0",
  reinforced_pickaxe: "#7090b0",
  copper_pickaxe:     "#c87040",
  // Wave 2 block items
  cobblestone:        "#808080",
  sand:               "#e4d28e",
  gravel:             "#827a72",
  glass:              "#b4dcf8",
  // Wave 5
  water:              "#2b6ccc",
  // Wave 8 — ore items + ingots/gems
  coal_ore:           "#4a4a52",
  iron_ore:           "#c4a07a",
  gold_ore:           "#e8c840",
  diamond_ore:        "#50e8d8",
  redstone_ore:       "#c02020",
  coal:               "#2a2a2e",
  iron_ingot:         "#d4c0a8",
  gold_ingot:         "#f0d040",
  diamond:            "#60f0e0",
  redstone:           "#e03030",
  // Wave 8 — new tool tiers
  iron_pickaxe:       "#d4c0a8",
  iron_axe:           "#d4c0a8",
  iron_shovel:        "#d4c0a8",
  iron_sword:         "#d4c0a8",
  diamond_pickaxe:    "#60f0e0",
  diamond_axe:        "#60f0e0",
  diamond_shovel:     "#60f0e0",
  diamond_sword:      "#60f0e0",
  // Wave 9 — passive mob drops (raw/cooked meats, animal products)
  raw_beef:           "#c84040",
  steak:              "#a03020",
  raw_porkchop:       "#d46060",
  cooked_porkchop:    "#8b3a1a",
  raw_chicken:        "#e0b080",
  cooked_chicken:     "#c07040",
  wool:               "#e8e8e8",
  leather:            "#8b5a2b",
  feather:            "#f0f0f0",
  // Wave 9 / 11 — flora drops
  seeds:              "#a8b840",
  flower:             "#f070c0",
  sapling:            "#68a840",
  // Wave 9 / food extras
  apple:              "#d03020",
  cooked_apple:       "#a82418",
  // Wave 10 — armor (leather tier)
  leather_helmet:     "#8b5a2b",
  leather_chestplate: "#7a4e26",
  leather_leggings:   "#6e4520",
  leather_boots:      "#8b5a2b",
  // Wave 10 — armor (iron tier)
  iron_helmet:        "#d4c0a8",
  iron_chestplate:    "#c4b098",
  iron_leggings:      "#b8a48e",
  iron_boots:         "#d4c0a8",
  // Wave 10 — armor (diamond tier)
  diamond_helmet:     "#60f0e0",
  diamond_chestplate: "#50d8cc",
  diamond_leggings:   "#48c4b8",
  diamond_boots:      "#60f0e0",
  // Wave 11 — flora/plant blocks
  tall_grass:         "#6ab040",
  // Wave F7 — bed
  bed:                "#cc3333",
  // Wave F4 — slabs and stairs
  stone_slab:         "#8890a0",
  cobblestone_slab:   "#808080",
  wood_slab:          "#c8a060",
  stone_stairs:       "#8890a0",
  cobblestone_stairs: "#808080",
  wood_stairs:        "#c8a060",
};

/** Returns the chip color hex string for any item id, falling back to the shared default. */
export function getChipColor(itemId) {
  return ITEM_CHIP_COLORS[itemId] || "#607080";
}

const ICON_SIZE = 32;
const _iconCache = new Map();

/**
 * Returns a 32x32 canvas showing the item's icon.
 * @param {string} itemId
 * @param {number|null} placeBlockType - the block type this item places (from ITEM_DEFS[id].placeBlockType), or null.
 *
 * For placeable blocks: crops the block's top-face ('py') tile from the shared atlas canvas, scaled 2x pixel-perfect.
 * For tools/resources: a flat colored chip with a pixel highlight/shadow border.
 * Memoized per itemId; safe to call every frame.
 */
export function getItemIconCanvas(itemId, placeBlockType) {
  if (_iconCache.has(itemId)) return _iconCache.get(itemId);

  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  let drawnFromAtlas = false;

  if (placeBlockType != null && BLOCK_FACE_TILES[placeBlockType]) {
    const faces = BLOCK_FACE_TILES[placeBlockType];
    // Use top face for icon; torches/uniform blocks use any available face.
    const tileName = faces.py || faces.pz || faces.px;
    const slot = TILE[tileName];
    if (slot) {
      const [col, row] = slot;
      const { ox: srcX, oy: srcY } = tileOrigin(col, row);
      ctx.drawImage(getAtlasCanvas(), srcX, srcY, TILE_PX, TILE_PX, 0, 0, ICON_SIZE, ICON_SIZE);
      drawnFromAtlas = true;
    }
  }

  if (!drawnFromAtlas) {
    const color = ITEM_CHIP_COLORS[itemId] || "#607080";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = color;
    ctx.fillRect(2, 2, ICON_SIZE - 4, ICON_SIZE - 4);
    // Top-left highlight.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(2, 2, ICON_SIZE - 4, 2);
    ctx.fillRect(2, 2, 2, ICON_SIZE - 4);
    // Bottom-right shadow.
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(2, ICON_SIZE - 4, ICON_SIZE - 4, 2);
    ctx.fillRect(ICON_SIZE - 4, 2, 2, ICON_SIZE - 4);
  }

  _iconCache.set(itemId, canvas);
  return canvas;
}

// ----- Mining crack overlay textures -----
// 10 stages of progressively heavier cracks on a transparent background. Drawn at
// 16x16 to match the atlas; sampled with NearestFilter to keep the pixel-art look.
const CRACK_STAGES = 10;

function paintCrackStage(ctx, stage) {
  // Each stage seeds new fracture lines plus expands prior ones.
  const intensity = (stage + 1) / CRACK_STAGES;
  ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = "rgba(0,0,0,0)";
  // Major fractures
  const lineCount = Math.floor(2 + intensity * 5);
  for (let i = 0; i < lineCount; i += 1) {
    const seed = i * 13 + stage * 7;
    const x0 = Math.floor((Math.sin(seed) * 0.5 + 0.5) * TILE_PX);
    const y0 = Math.floor((Math.cos(seed * 1.7) * 0.5 + 0.5) * TILE_PX);
    const angle = (Math.sin(seed * 0.31) * 0.5 + 0.5) * Math.PI * 2;
    const len = 4 + Math.floor(intensity * 8);
    let x = x0;
    let y = y0;
    for (let s = 0; s < len; s += 1) {
      if (x < 0 || x >= TILE_PX || y < 0 || y >= TILE_PX) break;
      const alpha = 0.4 + intensity * 0.45;
      ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
      const wobble = Math.sin((seed + s) * 1.7);
      const branch = Math.cos((seed - s) * 2.1);
      x += Math.round(Math.cos(angle + wobble * 0.3));
      y += Math.round(Math.sin(angle + branch * 0.3));
    }
  }
  // Speckle fractures (small dark spots)
  const speckles = Math.floor(intensity * 24);
  for (let i = 0; i < speckles; i += 1) {
    const seed = i * 31 + stage * 17;
    const sx = Math.floor((Math.sin(seed) * 0.5 + 0.5) * TILE_PX);
    const sy = Math.floor((Math.cos(seed * 0.7) * 0.5 + 0.5) * TILE_PX);
    ctx.fillStyle = `rgba(0,0,0,${(0.25 + intensity * 0.4).toFixed(3)})`;
    ctx.fillRect(sx, sy, 1, 1);
  }
}

export function createCrackTextures() {
  const textures = [];
  for (let stage = 0; stage < CRACK_STAGES; stage += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintCrackStage(ctx, stage);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    textures.push(tex);
  }
  return textures;
}

export const CRACK_STAGE_COUNT = CRACK_STAGES;

// ----- Sky body textures (sun + moon) -----
function paintSunCanvas(ctx, size) {
  const data = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        const t = dist / radius;
        // Bright white-yellow core fading to soft yellow rim.
        data.data[i] = 255;
        data.data[i + 1] = Math.floor(245 - t * 30);
        data.data[i + 2] = Math.floor(180 - t * 80);
        data.data[i + 3] = 255;
      } else if (dist <= radius * 1.3) {
        // Soft glow halo.
        const t = (dist - radius) / (radius * 0.3);
        const alpha = Math.max(0, 1 - t);
        data.data[i] = 255;
        data.data[i + 1] = 220;
        data.data[i + 2] = 140;
        data.data[i + 3] = Math.floor(alpha * 120);
      } else {
        data.data[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
}

// Paint a moon disc for the given phase (0–7, Minecraft convention):
//   0 = full moon, 1 = waning gibbous, 2 = last quarter, 3 = waning crescent,
//   4 = new moon,  5 = waxing crescent, 6 = first quarter, 7 = waxing gibbous
// The lit fraction of the disc is determined by phase; the shadow is painted
// as a soft dark overlay on the right or left half, matching Minecraft's behavior
// where phase 0 is full and phase 4 is new (disc barely visible).
function paintMoonCanvas(ctx, size, phase = 0) {
  const data = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.4;

  // litFraction: 1 = full, 0 = new.  Follows a cosine across 8 phases.
  // phase 0 = full (1.0), phase 4 = new (0.0), phase 2/6 = half (0.5).
  const litFraction = (1 + Math.cos((phase / 8) * Math.PI * 2)) / 2;
  // shadowEdge: x offset (in disc radii) of the terminator boundary.
  // +1 = shadow completely to the right of the disc (full moon lit),
  // -1 = shadow covers whole disc (new moon).
  // Waning (phases 1-4): shadow comes from the right.
  // Waxing (phases 5-7): shadow comes from the left.
  const waning = phase <= 4;
  // Map litFraction to the x-center of the shadow ellipse.
  // shadowX: 0 = center (half lit), -radius = all shadow right side, +radius = all lit.
  const shadowCenterX = waning
    ? cx + radius * (2 * litFraction - 1)
    : cx - radius * (2 * litFraction - 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        const t = dist / radius;
        // Pale cool white disc with subtle crater noise.
        const seed = Math.sin(x * 13.1 + y * 7.7) * 0.5 + 0.5;
        const crater = seed < 0.18 ? -22 : seed > 0.85 ? 8 : 0;
        let r = Math.floor(232 - t * 30 + crater);
        let g = Math.floor(238 - t * 22 + crater);
        let b = Math.floor(244 - t * 12 + crater);
        let a = 255;

        // Shadow: elliptical mask — points within the shadow ellipse are darkened.
        // The shadow ellipse has x-radius = radius*litFraction (scaled by lit fraction),
        // y-radius = radius (full height). Its center drifts based on phase.
        const sdx = x - shadowCenterX;
        const sdy = y - cy;
        // Terminator blend: soft edge over ~8px so the shadow isn't a hard line.
        // We compute how deep into shadow the pixel is by projecting onto the ellipse normal.
        const shadowR = Math.max(0.01, radius * Math.abs(2 * litFraction - 1));
        const shadowDist = Math.sqrt((sdx / shadowR) ** 2 + (sdy / radius) ** 2);
        const shadowAlpha = waning
          ? Math.max(0, Math.min(1, (1 - (x - shadowCenterX) / radius) * 4))
          : Math.max(0, Math.min(1, (1 + (x - shadowCenterX) / radius) * 4));
        // Simple: darken pixels on the shadow side of the terminator.
        // terminator is the vertical chord at shadowCenterX.
        const onShadowSide = waning ? (x < shadowCenterX) : (x > shadowCenterX);
        if (onShadowSide) {
          // Soft blend near terminator: 0 at edge, full dark further in.
          const blendDist = Math.abs(x - shadowCenterX) / (radius * 0.18 + 1);
          const blend = Math.min(1, blendDist);
          // New moon: nearly invisible; full shadow = very dim bluish-grey.
          r = Math.floor(r * (1 - blend * 0.88) + 8 * blend);
          g = Math.floor(g * (1 - blend * 0.88) + 10 * blend);
          b = Math.floor(b * (1 - blend * 0.88) + 16 * blend);
        }

        // New moon: make entire disc very dim (nearly transparent).
        if (phase === 4) {
          a = 30;
        }

        data.data[i]     = Math.max(0, Math.min(255, r));
        data.data[i + 1] = Math.max(0, Math.min(255, g));
        data.data[i + 2] = Math.max(0, Math.min(255, b));
        data.data[i + 3] = a;
      } else if (dist <= radius * 1.2) {
        // Soft glow halo — only if not new moon.
        if (phase !== 4) {
          const t = (dist - radius) / (radius * 0.2);
          data.data[i]     = 220;
          data.data[i + 1] = 230;
          data.data[i + 2] = 240;
          data.data[i + 3] = Math.floor((1 - t) * 60 * litFraction);
        }
      }
      // else: transparent (data already zeroed by createImageData)
    }
  }
  ctx.putImageData(data, 0, 0);
}

export function createSunTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  paintSunCanvas(ctx, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createMoonTexture(phase = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  paintMoonCanvas(ctx, 64, phase);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Update an existing moon CanvasTexture in-place for a new phase.
// The texture's .image is the canvas from createMoonTexture.
export function updateMoonTexture(tex, phase) {
  const canvas = tex.image;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintMoonCanvas(ctx, canvas.width, phase);
  tex.needsUpdate = true;
}
