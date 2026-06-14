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
};

// Deterministic pseudo-random — seeded by pixel index so textures are stable across reloads.
function pixelNoise(x, y, salt) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
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
        r = 150 + (n < 0.3 ? -20 : 0);
        g = 108 + (n > 0.6 ? 14 : -10);
        b = 76 + (n < 0.3 ? -16 : 0);
      }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintDirt(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 3);
      // Base ≈ rgb(150, 108, 76).
      let r = 150;
      let g = 108;
      let b = 76;
      if (n < 0.18) { r -= 28; g -= 22; b -= 16; }
      else if (n < 0.4) { r -= 12; g -= 10; b -= 6; }
      else if (n > 0.85) { r += 18; g += 14; b += 10; }
      shade(ctx, ox + x, oy + y, rgb(r, g, b));
    }
  }
}

function paintStone(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 4);
      // Base ≈ rgb(150, 150, 156).
      let v = 150;
      if (n < 0.18) v = 116;
      else if (n < 0.45) v = 138;
      else if (n > 0.85) v = 168;
      shade(ctx, ox + x, oy + y, rgb(v, v + 2, v + 6));
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

function paintCobblestone(ctx, col, row) {
  const { ox, oy } = tileOrigin(col, row);
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 20);
      // Cobblestone: mid-grey base with darker cracks forming irregular "stones".
      // Crack pattern: sine-based grid offset per row gives irregular mortar lines.
      const crackX = (x + Math.floor(Math.sin(y * 1.3 + 0.7) * 2)) % 5 === 0;
      const crackY = (y + Math.floor(Math.sin(x * 1.7 + 1.1) * 2)) % 5 === 0;
      let v;
      if (crackX || crackY) {
        v = 72 + (n < 0.4 ? -10 : 0);
      } else {
        v = 128 + (n < 0.18 ? -22 : n > 0.82 ? 18 : n < 0.45 ? -10 : 0);
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
      const n = pixelNoise(x, y, 23);
      const n2 = pixelNoise(x * 2 + 1, y * 2 + 3, 24);
      // Grey-brown gravel: speckled pebbles on a dark grey base.
      let r;
      let g;
      let b;
      if (n2 > 0.72) {
        // Light pebble highlight
        r = 170; g = 166; b = 162;
      } else if (n2 < 0.18) {
        // Dark crevice between pebbles
        r = 92; g = 88; b = 84;
      } else {
        r = 130 + (n < 0.3 ? -18 : n > 0.75 ? 14 : 0);
        g = 122 + (n < 0.3 ? -16 : n > 0.75 ? 12 : 0);
        b = 114 + (n < 0.3 ? -14 : n > 0.75 ? 10 : 0);
      }
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
export function tileUvRect(tileName) {
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
  return { uMin, uMax, vMin, vMax };
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
};

// Flora block ids as a Set — used by the mesher and collision system.
// Only cross-quad (class 4) blocks are in this set; leaf blocks (class 1) are NOT.
export const FLORA_BLOCK_IDS = new Set([23, 24, 25]);

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
};

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

function paintMoonCanvas(ctx, size) {
  const data = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        const t = dist / radius;
        // Pale cool white with crater-like noise variation.
        const seed = Math.sin(x * 13.1 + y * 7.7) * 0.5 + 0.5;
        const crater = seed < 0.18 ? -22 : seed > 0.85 ? 8 : 0;
        data.data[i] = Math.floor(232 - t * 30 + crater);
        data.data[i + 1] = Math.floor(238 - t * 22 + crater);
        data.data[i + 2] = Math.floor(244 - t * 12 + crater);
        data.data[i + 3] = 255;
      } else if (dist <= radius * 1.2) {
        const t = (dist - radius) / (radius * 0.2);
        data.data[i] = 220;
        data.data[i + 1] = 230;
        data.data[i + 2] = 240;
        data.data[i + 3] = Math.floor((1 - t) * 60);
      } else {
        data.data[i + 3] = 0;
      }
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

export function createMoonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  paintMoonCanvas(ctx, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
