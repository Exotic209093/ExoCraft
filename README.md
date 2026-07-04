# ExoCraft

A browser voxel sandbox inspired by Minecraft, built with Three.js and Vite. Procedurally generated biome world, smooth voxel lighting, survival mechanics, mobs, crafting, and a modern post-processing render pipeline.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click **Start**, then click the canvas to lock the mouse.

## Controls

- `WASD` / arrows: move
- Mouse: look (click canvas to lock; `Esc` releases)
- `Shift`: sprint
- `Space`: jump / swim up (in water)
- Left click: break block — or attack a mob under the crosshair
- Right click: place the selected item — or eat it if it's food
- `1`–`9`: select hotbar slot
- `E`: inventory (with crafting grid + armor equip slots)
- `C`: crafting panel (2×2 in hand, 3×3 near a crafting table)
- `V`: furnace (when near a furnace); right-click a chest to open it
- `F3`: debug overlay (position, facing, biome, light, FPS, looked-at block)
- `F`: fullscreen · `L`: toggle mouse lock · `R`: regenerate world
- `Save` / `Load` / `New World` (top-right)

## What's in it

**World** — Seeded procedural terrain ~112 blocks tall with FBM + ridged-noise mountains, valleys and cliffs; 5 biomes (plains, forest, desert, snow, mountains) with per-biome surface blocks, grass tint, tree types (oak/birch/spruce) and snow cover. Deep connected caves, depth-banded ores (coal → iron → gold/redstone → diamond), oceans/lakes at sea level with sand beaches, lava pools deep underground, and chunk streaming with memory eviction.

**Lighting** — Per-chunk merged geometry with baked ambient occlusion and a 0–15 skylight + blocklight flood-fill. Caves are dark until you place a torch; the surface dims at night. Day/night drives a gradient sky dome with stars and drifting clouds.

**Survival** — Health + hearts, hunger + food (apples from leaves, cooked meats), passive health regen and starvation, fall/void/lava damage, tool durability, and wearable armor (leather/iron/diamond) with damage reduction. Mine the right tool tier to harvest higher ores.

**Building & crafting** — Full block palette (cobblestone, glass, sand/gravel with gravity, planks, ores, …), 3×3 shaped + shapeless crafting, smelting furnaces, and 27-slot chests.

**Redstone** — Redstone dust places wire that carries a 0–15 signal (with per-step decay and step-up/down connections), powered by levers, momentary stone buttons (~1 s), pressure plates (player + mobs), redstone torches (signal inverters with a 100 ms flip delay — torch clocks oscillate) and redstone blocks. Repeaters refresh the signal to 15 with a right-click-cyclable 1–4 tick delay (making sustainable clocks), and comparators compare or subtract analog signal strengths — and read container fullness. Pistons (normal + sticky, all six facings) push rows of up to 12 blocks and pull one back on retract, displacing entities in the way. Hoppers move items between chests, furnaces (feeding inputs and fuel) and each other, vacuum dropped items, and pause when powered. Dispensers and droppers hold 9 slots and fire once per rising power edge — throwing items out (dispensers hard, droppers gently) or inserting them into a container in front; observers watch the block they face and pulse power from their back when it changes. Powered wire lights redstone lamps (real baked blocklight) and opens doors/trapdoors. Components pop off when their supporting block is broken; circuits persist in saves.

**Mobs** — Passive cows/pigs/sheep/chickens (meat, leather, wool, feathers) and hostile zombies (daylight burn), skeletons (arrows), creepers (explode + crater terrain) and spiders, with night spawning and drops.

**Feel & graphics** — Mouse-look first-person with a held-item viewmodel that swings on use, weighty combat with knockback, procedural break/place/footstep/hurt/ambient audio, animated water, biome weather (rain/snow), wind-swaying grass and leaves, and a post-processing pipeline (ACES tone mapping, bloom on emissives, FXAA). Landing camera dips and directional hurt tilt add impact weight.

**UI & settings** — Original pixel-art icons for every item (tools, weapons, food, materials, armor) across the hotbar, inventory, containers, ground drops and the held-item view; an item-name popup on hotbar selection; a "You died!" screen with cause + respawn; and an Esc pause menu with live settings (FOV, mouse sensitivity, render distance, volume, music) persisted locally.

There's also a guided objective/specialization progression system (collect copper → smelt → craft → explore/combat branches) layered on top.

## Test hooks (automation / debugging)

Exposed on `window` for deterministic testing:

- `window.render_game_to_text()` — full game state as JSON
- `window.advanceTime(ms)` — step the deterministic simulation (the RAF loop pauses under automation)
- `window.__exoCraftDebug` — `teleportPlayer`, `setBlock`, `grantInventoryItem`, `setTimeOfDayMs`, `spawnMob(type,dist)`, `spawnPassive(type,dist)`, `explodeNearestCreeper`, `setWeather(type)`, `findBiome(name)`, `setHunger`, `eatSelected`, `equipArmor`, `hurtPlayer`, `getArmorStats`, and more.

## Architecture

Modular `src/game/` — `world.js` (gen + mesher + lighting), `physics.js`, `controls.js`, `survival.js`, `mobs.js`, `passiveMobs.js`, `weather.js`, `sky.js`, `viewmodel.js`, `audio.js`, `hud.js`, `textures.js` (procedural atlas), `config.js`, `save.js` — orchestrated by `src/main.js`. Rendering uses a custom per-vertex lighting shader patch plus an EffectComposer post chain.

See `progress.md` for the full build log (12 gameplay waves + 3 graphics passes).
