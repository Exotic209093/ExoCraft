import * as THREE from "three";

const TILE_PX = 16;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;
const ATLAS_PX = TILE_PX * ATLAS_COLS;

// Atlas slot coordinates (col, row). Row 0 is the top row of the canvas.
const TILE = {
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

function fillTile(ctx, col, row, baseColor) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
}

function rgb(r, g, b) {
  return `rgb(${r},${g},${b})`;
}

function paintGrassTop(ctx, col, row) {
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const n = pixelNoise(x, y, 8);
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
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
export function tileUvRect(tileName) {
  const slot = TILE[tileName];
  if (!slot) {
    return { uMin: 0, vMin: 0, uMax: 1 / ATLAS_COLS, vMax: 1 / ATLAS_ROWS };
  }
  const [col, rowFromTop] = slot;
  const uMin = col / ATLAS_COLS;
  const uMax = (col + 1) / ATLAS_COLS;
  // Canvas row 0 is at the top; UV V=1 is also the top, so flip.
  const vMin = 1 - (rowFromTop + 1) / ATLAS_ROWS;
  const vMax = 1 - rowFromTop / ATLAS_ROWS;
  return { uMin, uMax, vMin, vMax };
}

export const ATLAS_TILE_PX = TILE_PX;
