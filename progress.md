Original prompt: I want too build a minecraft clone but in the browser fully

## 2026-03-04
- Initialized a new Vite + Three.js project in an empty repo.
- Implemented first playable voxel sandbox:
  - Procedural terrain with grass/dirt/stone layers plus simple trees.
  - First-person player with gravity, jumping, collision, and keyboard movement.
  - Block interaction (break/place) using mouse raycasting.
  - Block selection hotbar (keys 1-5), fullscreen toggle (`F`), pointer lock toggle (`L`).
  - HUD + menu/start overlay.
  - Exposed `window.render_game_to_text` and `window.advanceTime(ms)` for deterministic test automation.
- Next: run dev server + Playwright client loop, inspect screenshots, and fix issues.

## Validation updates
- Installed Playwright Chromium and added a local copy of the skill's Playwright client script in `scripts/` so local `playwright` dependency resolution works in this repo.
- Added `scripts/test_actions.json` for repeatable automated gameplay bursts (move, turn, jump, break, place).
- Ran automated gameplay loop multiple times against `http://127.0.0.1:5173` and reviewed:
  - `output/web-game/shot-0.png` .. `shot-3.png`
  - `output/web-game/state-0.json` .. `state-3.json`
- Confirmed deterministic hook and state output are active:
  - `window.advanceTime(ms)` used by Playwright steps.
  - `window.render_game_to_text()` returns movement/target/world state.
- Fixed playability/readability issues found during screenshot review:
  - Reduced tree density and canopy size.
  - Improved spawn selection to prefer walkable/open ground.
  - Spawn now auto-faces the clearest nearby direction.
  - Slightly brighter colors/lighting for visibility.

## TODO / suggestions
- Add chunk meshing or greedy meshing to reduce geometry size and improve FPS on larger worlds.
- Add proper texture atlas + UVs (current blocks use flat colors).
- Add save/load world state (localStorage or IndexedDB).
- Replace simple collision with step-up logic for smoother walking over 1-block rises.

## Bug sweep + fixes (2026-03-04)
- Added automated assertions in `scripts/bug_sweep.mjs` and validated against local dev server.
- Fixed menu input leakage:
  - `Space` pressed in menu no longer causes immediate jump after starting.
  - Movement/action keys are now ignored until mode is `playing`.
- Fixed mode safety for hotkeys:
  - `R` no longer regenerates terrain from menu.
  - One-shot keys (`F`, `R`, `L`, `Digit1-5`) ignore key-repeat spam.
- Fixed pointer-lock interaction consistency:
  - Break/place now raycast from crosshair center while pointer-locked instead of stale mouse coordinates.
- Fixed deterministic stepping conflict:
  - In automation sessions, the RAF simulation loop is paused and updates only through `window.advanceTime(ms)`.
- Fixed repeated mesh rebuild leak risk:
  - Old instanced meshes are now disposed when rebuilt.
- Updated menu text to match behavior:
  - `Hold middle mouse` -> `Middle click`.

## Validation after fixes
- `npm run build` passes.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun:
  - `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game`
  - Reviewed `shot-0..3.png`, `state-0..3.json`, and no `errors-*.json` emitted.

## Milestone 1 complete (foundation refactor)
- Split monolithic `src/main.js` into focused modules:
  - `src/game/config.js`: default config + safe override merging
  - `src/game/world.js`: voxel world generation/storage/meshing
  - `src/game/physics.js`: AABB collision and axis resolution helpers
  - `src/game/controls.js`: input wiring and gameplay-mode key gating
  - `src/game/hud.js`: HUD rendering logic
- Rebuilt `src/main.js` as orchestration glue across these modules while preserving behavior.
- Added runtime config exposure:
  - optional overrides via `window.EXOCRAFT_CONFIG`
  - current merged config introspection via `window.getExoCraftConfig()`

## Milestone 1 validation
- `npm run build` passes after modularization.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes with no console/runtime error artifacts.

## Next milestone target
- Milestone 2: replace fixed world with chunked terrain streaming + chunk meshing.

## Milestone 2 complete (chunked terrain streaming)
- Replaced fixed-size world storage with chunked world data + streaming in `src/game/world.js`:
  - Configurable chunk size (`16`) and active radius (`2`) loaded around the player.
  - Dynamic chunk activation/deactivation as player moves.
  - Per-chunk mesh rebuild with face-exposure checks.
  - Deterministic procedural generation on-demand per chunk.
  - World API preserved (`get/set/findSurfaceY/inBounds`) for gameplay compatibility.
- Updated world config (`src/game/config.js`):
  - Introduced `world.height` and `world.chunk` settings.
- Updated game loop integration (`src/main.js`):
  - Uses chunked world constructor and live chunk streaming around player.
  - Spawn logic now uses chunked spawn center + configurable search radius.
  - `render_game_to_text` now includes chunk diagnostics:
    - `chunkSize`, `worldHeight`, `activeRadius`, `loadedChunks`, `generatedChunks`, `solidBlocks`.
- Updated HUD (`src/game/hud.js`) to show loaded chunk count.

## Milestone 2 validation
- `npm run build` passes.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes (after making target acquisition checks robust for varying spawn views).
- Playwright client rerun passes with no `errors-*.json` generated.
- Reviewed latest gameplay screenshots for active chunked terrain rendering.

## Next milestone target
- Milestone 3: save/load system using world seed + player state + block changes persisted in IndexedDB.

## Milestone 3 complete (save/load + seed persistence)
- Added persistent storage module:
  - `src/game/save.js` (IndexedDB primary, localStorage fallback).
- Added seeded procedural world support:
  - `world.generation.seed` now drives terrain noise.
  - World exposes `getSeed()` / `setSeed(seed)`.
- Added block edit persistence in chunked world:
  - World now tracks edits separately from procedural generation.
  - Export/import via `world.exportEdits()` and `world.importEdits(edits)`.
  - Chunk generation applies persisted edits.
- Added manual persistence UI in-game:
  - Top-right controls: `Save`, `Load`, `New World`.
  - Status text feedback for save/load results.
- Added autosave:
  - Periodic autosave during gameplay and on `pagehide`.
- Updated text-state diagnostics:
  - `render_game_to_text` now includes `seed` and `editCount`.

## Milestone 3 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` with save/load restoration check:
  - Saves state, moves player, loads state, verifies player position restoration.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes with no `errors-*.json`.

## Next milestone target
- Milestone 4: implement survival loop v1 (inventory stacks, tool speeds, and basic crafting recipes).

## Milestone 4 complete (survival loop v1)
- Added survival systems in `src/game/survival.js`:
  - Inventory model (`24` slots, `9` hotbar slots, stack limit `64`).
  - Item catalog (placeables, crafting resources, and wood/stone tools).
  - Block drops, block hardness, and tool-speed break power.
  - Crafting recipes + workbench-gated advanced crafting.
- Integrated survival into runtime (`src/main.js`, `src/game/hud.js`, `src/game/controls.js`):
  - Hotbar now displays inventory items and counts.
  - `1-9` selects hotbar slots.
  - `C` toggles crafting panel.
  - Breaking blocks yields item drops; placing consumes selected stack.
  - Save/load now persists inventory and selected hotbar slot.

## Milestone 4 bug fixes and hardening
- Fixed crafting UI rebuild churn:
  - Craft panel now refreshes only when inventory/workbench state changes instead of rebuilding every frame.
- Hardened world edit import/set paths (`src/game/world.js`):
  - Invalid block IDs from corrupted saves are normalized to air (`0`) to prevent chunk mesh crashes.
  - Meshing now safely ignores unknown IDs if encountered.
- Added safe block-name fallback in gameplay action text so unexpected block IDs cannot crash UI state updates.

## Validation after Milestone 4 completion
- `npm run build` passes.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Extended bug sweep assertions now also verify:
  - crafting panel toggle (`C`) in gameplay;
  - empty hotbar slot placement does not mutate world.
- Additional survival flow check (Playwright inline script) passes:
  - craft planks/sticks/table, place crafting table, detect workbench proximity, craft wood pickaxe.
- Gameplay client rerun and screenshot/state review completed with no runtime error artifacts.

## Next milestone target
- Milestone 5: add a basic player health + fall damage loop (damage feedback, death/respawn handling, and HUD health display).

## Milestone 5 complete (health + fall damage loop)
- Added player health systems (`src/main.js`, `src/game/config.js`, `src/game/hud.js`):
  - Configurable `maxHealth`, fall-damage safe speed, and fall-damage multiplier.
  - Runtime health state in simulation and HUD (`hp current/max` in stats).
  - Health persistence through save/load snapshots.
- Added damage + death/respawn flow:
  - Fall impact damage based on landing speed when above safe threshold.
  - Void damage triggers death/respawn cycle.
  - Death now respawns player at spawn and restores full health.
- Updated text-state API:
  - `render_game_to_text().player` now includes `health` and `maxHealth` for deterministic automation checks.

## Milestone 5 validation
- `npm run build` passes.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes and screenshots confirm HUD health rendering.

## Next milestone target
- Milestone 6: add a backpack/inventory panel with item transfer between backpack and hotbar so crafted/collected items beyond slot 9 remain usable.

## Milestone 6 complete (inventory panel + hotbar/backpack transfer)
- Added inventory panel UI (`index.html`, `src/style.css`):
  - New centered inventory overlay with separate Hotbar and Backpack sections.
  - Slot buttons show item name/count and visual state (selected hotbar and transfer source).
- Added inventory transfer mechanics (`src/main.js`, `src/game/survival.js`):
  - Click one slot, then a second slot to move/swap stacks.
  - Same-item transfers merge up to stack limit (`64`), otherwise stacks swap.
  - Supports moving crafted/collected items between backpack and active hotbar slots.
- Added panel interaction controls (`src/game/controls.js`, `src/main.js`):
  - `E` toggles inventory panel.
  - `Esc` closes whichever panel is open (`inventory`/`crafting`).
  - Mouse break/place is blocked while inventory/crafting panel is open.
  - Opening inventory/crafting exits pointer lock for reliable UI interaction.
- Updated text-state output:
  - `render_game_to_text()` now includes full `inventory` state (`open`, `transferIndex`, and full slot array).

## Milestone 6 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` to verify:
  - inventory toggle with `E`;
  - inventory transfer from hotbar slot 1 to backpack slot 11;
  - selected block updates to `Empty` after moving selected hotbar stack;
  - inventory close behavior.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes with no `errors-*.json` artifacts.
- Captured and reviewed dedicated inventory screenshots:
  - `output/web-game/inventory-open.png`
  - `output/web-game/inventory-moved.png`

## Next milestone target
- Milestone 7: add a basic smelting/furnace loop (fuel + input + output timers) so progression extends beyond crafting table recipes.

## Milestone 7 complete (furnace + smelting loop)
- Added furnace progression content (`src/game/config.js`, `src/game/survival.js`):
  - New placeable furnace block type (`id: 7`).
  - Furnace item recipe (`stone x8 -> furnace`).
  - Smelting recipes:
    - `stone -> refined_stone`
    - `wood -> charcoal`
  - Fuel values for `leaf/stick/plank/wood/charcoal`.
  - New refined progression item/tool: `Reinforced Pickaxe` (crafted from refined stone).
- Added furnace gameplay systems in `src/main.js`:
  - Persistent furnace state map keyed by world position.
  - Fuel/input/output slots with timed smelting simulation in the main update loop.
  - Block-aware furnace lifecycle (state removed when furnace block is broken).
  - Save/load persistence for furnace runtime states.
- Added furnace panel UI (`index.html`, `src/style.css`):
  - `V` key opens/closes furnace panel when nearby.
  - Load input, load fuel, inspect progress, and collect output.
  - Panel closes with `Esc`, and opening panels exits pointer lock.
- Updated controls/state plumbing (`src/game/controls.js`, `src/main.js`):
  - Added `KeyV` handling.
  - Mouse interactions blocked while inventory/crafting/furnace panels are open.
  - `render_game_to_text` now includes furnace state diagnostics.

## Milestone 7 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` to validate furnace flow end-to-end:
  - craft furnace, place furnace, open furnace panel, load input+fuel, smelt, and collect output.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes with no `errors-*.json` artifacts.
- Additional dedicated visual/state furnace checks captured and reviewed:
  - `output/web-game/furnace-open.png`
  - `output/web-game/furnace-smelting.png`
  - `output/web-game/state-furnace-smelt.json`

## Next milestone target
- Milestone 8: add a lightweight day/night cycle with lighting shifts and time-of-day state persistence.

## Movement bug fixes (requested)
- Fixed panel movement leakage while crafting:
  - Opening crafting panel now clears active movement/jump inputs so the player no longer drifts while panel UI is open.
  - Bug sweep now asserts player position remains stable while attempting movement with crafting panel open.
- Added step-up traversal support in collision resolution (`src/game/physics.js` + `src/main.js`):
  - Horizontal movement can step up 1-block ledges when grounded (`player.stepHeight`), reducing snagging on terrain edges.

## Milestone 8 complete (day/night cycle + persistence)
- Added day/night simulation (`src/main.js`, `src/game/config.js`):
  - Continuous cycle clock (`simulation.dayNightCycleMs`) with configurable start time (`simulation.initialTimeOfDayMs`).
  - Dynamic updates for sky/fog color, hemispheric light, sun color/intensity, and sun position.
- Added persistence + state output:
  - Save snapshots now store `worldTimeMs` and restore it on load.
  - `render_game_to_text()` now includes `dayNight` payload (`cycleMs`, `timeOfDayMs`, `dayFactor`).

## Milestone 8 validation
- `npm run build` passes.
- Extended bug sweep checks now validate:
  - day/night fields exist;
  - clock advances under deterministic stepping;
  - clock state restores correctly after load.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright gameplay client rerun passes with no runtime error artifacts.
- Captured additional day/night state artifacts:
  - `output/web-game/daynight-start.png`
  - `output/web-game/daynight-mid.png`
  - `output/web-game/daynight-late.png`
  - `output/web-game/state-daynight.json`

## Next milestone target
- Milestone 9: add basic hostile mob entities with simple AI (wander/chase), damage interaction, and nighttime spawn bias.

## Milestone 9 complete (hostile mobs + nighttime threat loop)
- Added hostile mob systems in `src/main.js` with lightweight entity runtime:
  - Hostile mob mesh group + entity state (position, mode, health, cooldowns).
  - Basic AI behaviors: wander when idle, chase player in aggro range, give up past distance.
  - Contact damage loop with cooldown and existing player health/death pipeline integration.
  - Player combat interaction: left-click now prioritizes attacking a hostile mob in reach before block breaking.
  - Added world-occlusion validation for melee ray hits so mobs cannot be hit through solid blocks.
- Added nighttime spawn bias via config + simulation:
  - Spawn checks now scale by day/night factor (low day factor => higher spawn chance).
  - Spawn limits, min/max spawn distances, and minimum mob separation.
  - Daytime distance-based despawn chance to keep encounters focused around night.
- Added hostile mob persistence:
  - Save snapshots now include hostile mob runtime state.
  - Load restores persisted mobs into valid walkable columns.
  - Regenerate/new world paths now clear runtime hostile mobs.
- Added debug/test hooks:
  - `window.__exoCraftDebug.spawnHostileMobNearPlayer(distance)`
  - `window.__exoCraftDebug.clearHostileMobs()`
  - `window.__exoCraftDebug.setTimeOfDayMs(timeMs)`
- Updated text-state output (`render_game_to_text`) with `hostileMobs` payload (count + entries + mode/chasing flags).
- Updated HUD stats to include active hostile mob count.

## Milestone 9 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - hostile mob text-state presence;
  - nighttime progression leading to hostile spawning;
  - hostile damage interaction path using deterministic debug-assisted setup.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game` passes.
- Captured additional hostile/night artifacts:
  - `output/web-game/mobs-night.png`
  - `output/web-game/mobs-dusk.png`
  - `output/web-game/mobs-visible.png`
  - `output/web-game/state-mobs-night.json`
  - `output/web-game/state-mobs-visible.json`

## Next milestone target
- Milestone 10: add hostile-mob progression rewards (drops + simple combat upgrade path) and a basic torch/light item to improve nighttime readability/survivability.

## Milestone 10 complete (combat progression rewards + torches)
- Expanded survival progression content in `src/game/survival.js`:
  - New items: `bone_shard`, `torch`, `wood_sword`, `bone_blade`.
  - New recipes:
    - `Torch x4` (`stick + plank`)
    - `Wood Sword` (`plank + stick`)
    - `Bone Blade` (`bone_shard + stick + refined_stone`, workbench-gated)
  - Added mob-combat scaling helper `getMobDamage(itemId, baseDamage)`.
  - Added torch block drop/hardness tuning (`block type 8`).
- Added torch block type + emissive support:
  - `src/game/config.js`: block type `8` (`Torch`) and new simulation torch-light settings.
  - `src/game/world.js`: `createBlockMaterials` now applies optional emissive/emissiveIntensity from block type config.
- Added hostile mob reward loop + combat scaling in `src/main.js`:
  - Defeating hostile mobs now grants `bone_shard` loot using configurable drop settings.
  - Player hostile-damage now scales with equipped weapon via `getMobDamage`.
  - `render_game_to_text()` now includes `combat` diagnostics (`baseMobDamage`, `selectedMobDamage`, `bestInventoryMobDamage`).
- Added dynamic torch lighting in `src/main.js`:
  - Nearby placed torch blocks activate pooled point lights around player.
  - Lighting updates continuously and refreshes immediately on torch place/break.
  - `render_game_to_text()` now includes `torchLighting` diagnostics (`enabled`, `activeLights`, `scanRadius`).
- Extended debug hooks:
  - Added `window.__exoCraftDebug.defeatNearestHostileMob()` for deterministic drop validation.

## Milestone 10 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - combat + torch-light state presence in text output;
  - hostile drop reward flow (`bone_shard`) after hostile defeat;
  - combat upgrade path (`Wood Sword`) increases best inventory mob damage;
  - torch crafting + placement activates local dynamic torch lights.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game` passes.
- Captured dedicated Milestone 10 artifacts:
  - `output/web-game/mil10-crafting.png`
  - `output/web-game/mil10-torch-night.png`
  - `output/web-game/mil10-progression-inventory.png`
  - `output/web-game/state-milestone10.json`

## Next milestone target
- Milestone 11: add world-side progression structures (surface ore nodes + simple cave pockets) and tie mob/torch/combat systems into exploration-oriented progression.

## Milestone 11 complete (exploration structures + ore progression)
- Expanded world generation in `src/game/world.js`:
  - Added deterministic cave-pocket carving below surface layers.
  - Added copper ore distribution in two tiers:
    - near-surface ore nodes;
    - deeper cave ore clusters.
  - Added generation caches/utilities for exploration structures (`surfaceOreNodeCache`, 3D noise path).
- Expanded block catalog/config in `src/game/config.js`:
  - Added `Copper Ore` block type (`id: 9`) with emissive-tinted material support.
  - Added cave/ore generation tuning parameters under `world.generation`.
- Expanded survival progression content in `src/game/survival.js`:
  - New items: `copper_ore`, `copper_ingot`, `copper_pickaxe`, `copper_blade`.
  - New smelting recipe: `Copper Ore -> Copper Ingot`.
  - New recipes: `Copper Pickaxe`, `Copper Blade`.
  - Updated drops/hardness/tool preferences for copper ore blocks.
- Runtime/debug/state wiring in `src/main.js`:
  - Added exploration scan helpers for cave/ore structure detection.
  - Added progression state payload in `render_game_to_text()`:
    - resource counters (`boneShard`, `copperOre`, `copperIngot`), upgrade flags, nearby copper count.
  - Added debug hooks used for deterministic validation/artifact capture:
    - `scanExplorationStructures`, `findNearestCopperOre`, `findNearestCavePocket`, `teleportPlayer`, `setBlock`, `grantInventoryItem`.

## Milestone 11 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - progression state fields present;
  - generated cave pockets and surface ore nodes detected via exploration scan;
  - exploration progression loop (`copper_ore -> copper_ingot -> copper_blade`) works end-to-end.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game` passes.
- Captured Milestone 11 artifacts:
  - `output/web-game/mil11-exploration-crafting.png`
  - `output/web-game/mil11-copper-smelting.png`
  - `output/web-game/state-milestone11.json`

## Next milestone target
- Milestone 12: add objective-driven progression (waypoints/mini-quests) so cave exploration, ore smelting, hostile combat, and torch placement form a guided survival loop.

## Milestone 12 complete (objective-driven progression + waypoint guidance)
- Added guided objective runtime in `src/main.js`:
  - Five-step progression chain:
    - collect copper ore
    - smelt copper ingot
    - craft copper blade
    - place torch in cave depth
    - defeat hostile mob with copper blade
  - Objective stats tracking with non-regressing unlock flags (`copperOreCollected`, `copperIngotSmelted`, `copperBladeCrafted`, `caveTorchPlaced`, `copperBladeKills`).
  - Objective waypoint resolvers for ore/furnace/crafting table/cave pocket/nearest hostile.
  - Waypoint recompute throttling (`250ms`) plus animated in-world beacon marker.
  - Objective state persistence through save/load snapshots.
- Added objective HUD wiring:
  - `index.html`: objective panel already present in HUD.
  - `src/style.css`: objective panel styling + mobile adjustments.
- Extended text/debug state:
  - `render_game_to_text()` now includes `objectives` payload (index/completion/current goal/stats/waypoint).
  - Added debug hooks for objective validation support:
    - `getObjectives()`
    - `markCaveTorchPlacement(x,y,z)`
    - `defeatNearestHostileMob(weaponItemId)` now supports explicit weapon context.
- Updated docs:
  - `README.md` now includes the guided objective loop under survival notes.

## Milestone 12 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - objective payload presence and initial objective state;
  - objective progression transitions through blade/cave/hostile steps;
  - final objective-chain completion flag after copper-blade kill path.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game/mil12` passes.
- Captured Milestone 12 artifacts:
  - `output/web-game/mil12/shot-0.png`
  - `output/web-game/mil12/shot-1.png`
  - `output/web-game/mil12/shot-2.png`
  - `output/web-game/mil12/shot-3.png`
  - `output/web-game/mil12/state-0.json`
  - `output/web-game/mil12/state-1.json`
  - `output/web-game/mil12/state-2.json`
  - `output/web-game/mil12/state-3.json`

## Next milestone target
- Milestone 13: add branching objective paths + rewards (combat/exploration specializations) so progression can diverge instead of staying linear.

## Milestone 13 complete (branching specialization objectives + rewards)
- Extended objective runtime in `src/main.js` with specialization branching after core chain completion:
  - Added specialization selection stage (`Combat` vs `Explorer`) once core objectives are complete.
  - Added specialization progression trackers:
    - combat kills (`combatKills`)
    - explorer cave torch placements (`caveTorchesPlaced`)
    - explorer deep-copper mining (`deepCopperMined`)
  - Added specialization completion + reward application:
    - Combat rewards: `+2` mob damage bonus, `+4` max health.
    - Explorer rewards: `+1.1` move speed, `+4` torch scan radius.
- Added runtime stat integration for rewards:
  - Combat damage calculations now include specialization bonuses.
  - Movement speed in simulation now reads specialization-adjusted speed.
  - Torch light scan radius now includes specialization bonus.
  - Max-health reward is applied to runtime health caps and persisted through save/load.
- Expanded objective payload/UX:
  - Objective HUD now supports six-step progression view (`5` core + `1` specialization stage).
  - `render_game_to_text()` objective payload now includes:
    - `coreObjectiveTotal`, `completed`, `fullyCompleted`
    - specialization state and reward diagnostics.
- Expanded debug hooks for deterministic branching validation:
  - `setSpecialization(path)`
  - updated cave torch marker flow to include explorer progression.

## Milestone 13 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - core objective completion still works;
  - combat specialization can be selected and completed;
  - specialization rewards apply to damage and max-health stats.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game/mil13` passes.
- Captured Milestone 13 artifacts:
  - `output/web-game/mil13/shot-0.png`
  - `output/web-game/mil13/shot-1.png`
  - `output/web-game/mil13/shot-2.png`
  - `output/web-game/mil13/shot-3.png`
  - `output/web-game/mil13/state-0.json`
  - `output/web-game/mil13/state-1.json`
  - `output/web-game/mil13/state-2.json`
  - `output/web-game/mil13/state-3.json`

## Next milestone target
- Milestone 14: add branch-exclusive craftables/perks (unique combat and exploration items) so specialization choices materially change long-term playstyle.

## Milestone 14 complete (branch-exclusive craftables + passive perks)
- Added branch-exclusive craftables in `src/game/survival.js`:
  - Combat: `Vanguard Blade`, `Warden Totem`
  - Explorer: `Deep Delver Pickaxe`, `Spelunker Compass`
- Added specialization-lock behavior in `src/main.js` crafting flow:
  - Recipes with `requiredSpecialization` are disabled unless the matching specialization is selected and its trial is complete.
  - Craft button tooltips now explain lock reasons (`branch only`, `complete trial first`, etc.).
  - Craft panel context now reflects current specialization and trial status.
- Added passive item-perk runtime integration in `src/main.js`:
  - `Warden Totem`: `+3` max health while carried.
  - `Spelunker Compass`: `+0.55` move speed and `+3` torch-scan radius while carried.
  - Bonus stacking now uses a combined bonus model (`specialization + item perks`) for:
    - combat damage baseline
    - movement speed
    - torch scan radius
    - max-health cap updates.
- Expanded debug/testability hooks:
  - Added `window.__exoCraftDebug.ensureWorkbenchNearby()` for deterministic branch-crafting validation.
- Expanded `render_game_to_text()` payload for automation diagnostics:
  - `progression.specialItems`
  - `bonuses.specialization`, `bonuses.items`, `bonuses.total`

## Milestone 14 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - branch-exclusive recipe lock/unlock behavior in crafting UI;
  - combat branch can craft `Vanguard Blade` + `Warden Totem`;
  - explorer-exclusive `Spelunker Compass` remains blocked on combat branch;
  - passive perk effects appear in runtime stats/text-state output.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright client rerun:
  - `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game/mil14`
  - Reviewed `output/web-game/mil14/shot-0..3.png` and `state-0..3.json`; no `errors-*.json` emitted.

## Next milestone target
- Milestone 15: add branch-specific midgame goals/events (combat hunts vs explorer survey runs) with unique rewards so each specialization gains its own repeatable progression loop.

## Milestone 15 complete (repeatable branch midgame loops)
- Extended specialization state in `src/main.js` with persisted repeatable branch-loop progress:
  - `branchLoop.completions`
  - `combatHuntKills`
  - `explorerSurveyTorches`
  - `explorerSurveyDeepCopper`
  - `lastReward`
- Added post-specialization objective stage:
  - Objective flow now shows `7` total steps (`5` core + `1` specialization + `1` repeatable branch loop).
  - Combat branch:
    - first objective: forge `Vanguard Blade`
    - repeatable objective: `Vanguard Hunt` (`4` kills with the Vanguard Blade)
  - Explorer branch:
    - first objective: assemble survey kit (`Deep Delver Pickaxe` + `Spelunker Compass`)
    - repeatable objective: `Survey Run` (`2` cave torches + `2` deep copper)
- Added branch-loop reward bundles:
  - Combat hunt reward: `Bone Shard x4` + `Copper Ingot x1`
  - Explorer survey reward: `Torch x4` + `Copper Ore x2`
- Routed repeatable progress into live gameplay hooks:
  - hostile defeats now feed Vanguard Hunt progress when using `Vanguard Blade`
  - cave torch placement and deep copper mining now feed Survey Run progress once explorer gear is assembled
- Added new debug hooks for deterministic branch-loop validation:
  - `completeCoreObjectives()`
  - `findNearestDeepCopperOre(radius)`
  - `markDeepCopperMine(x,y,z)`
- Expanded objective payload to expose repeatable branch-loop diagnostics under `objectives.specialization.branchLoop`.

## Milestone 15 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - combat path unlocks `Forge Vanguard Blade` after specialization;
  - combat branch transitions into `Vanguard Hunt` after crafting gear;
  - one full Vanguard Hunt cycle pays out repeatable rewards and resets progress;
  - explorer branch can be completed deterministically in a fresh session;
  - one full Survey Run cycle pays out repeatable explorer rewards and resets progress.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright client rerun:
  - `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game/mil15`
  - Reviewed `output/web-game/mil15/shot-0..3.png` and `state-0..3.json`; no `errors-*.json` emitted.

## Next milestone target
- Milestone 16: add branch-specific world encounters (combat ambush pockets vs explorer survey caches) so the repeatable loops lead players into distinct places instead of only counting actions.

## Milestone 16 complete (branch-specific world encounters)
- Extended the repeatable branch-loop state in `src/main.js` with persisted encounter data:
  - `branchLoop.encounter.type`
  - `branchLoop.encounter.stage`
  - `branchLoop.encounter.site`
- Added encounter-site generation:
  - Combat branch now searches for a nearby surface `Ambush Pocket` with enough open space for a wave encounter.
  - Explorer branch now searches for a cave-side `Survey Cache` near deep copper deposits.
- Added encounter activation logic:
  - Reaching an ambush pocket triggers a local hostile wave and switches the objective from travel to `Vanguard Hunt`.
  - Reaching a survey cache switches the objective from travel to `Survey Run`.
- Tightened repeatable branch progress so it is location-aware:
  - `Vanguard Hunt` kills only count once the combat encounter is active.
  - `Survey Run` torch and deep-copper progress only count while the active explorer encounter is underway near the survey site.
- Expanded objective payload diagnostics:
  - `objectives.specialization.branchLoop.encounter` now exposes encounter type/stage/site in `render_game_to_text()`.
- Added deterministic debug hooks for encounter validation:
  - `getBranchEncounter()`
  - `startBranchEncounter(path)`

## Milestone 16 validation
- `npm run build` passes.
- Extended `scripts/bug_sweep.mjs` now validates:
  - combat branch transitions from forge step -> ambush travel -> active `Vanguard Hunt`;
  - explorer branch transitions from survey-kit step -> survey-cache travel -> active `Survey Run`;
  - repeatable combat and explorer rewards still pay out and reset correctly under encounter-gated progression.
- `node scripts/bug_sweep.mjs http://127.0.0.1:5173` passes.
- Playwright client rerun:
  - `node scripts/web_game_playwright_client.mjs --url http://127.0.0.1:5173 --actions-file scripts/test_actions.json --click-selector #start-btn --iterations 4 --pause-ms 250 --screenshot-dir output/web-game/mil16`
  - Reviewed `output/web-game/mil16/shot-0..3.png` and `state-0..3.json`; no `errors-*.json` emitted.

## Next milestone target
- Milestone 17: add tangible encounter props/rewards in the world (combat relic drops and explorer cache pickups) so these branch encounters feel less abstract than pure waypoint/state transitions.

---

# Minecraft Fidelity Push (2026-06-14, branch feat/minecraft-fidelity)

Goal: get ExoCraft as close to Minecraft as possible. Recon produced a 12-wave dependency-ordered roadmap (w1 HUD -> w2 palette -> w3 terrain -> w4 smooth lighting -> w5 water -> w6 sky -> w7 hunger/durability -> w8 ores/lava -> w9 mobs -> w10 crafting/chests/armor -> w11 combat/audio/flora -> w12 biomes). Each wave: one implementer + adversarial review + fix, then hook-driven verification (render_game_to_text / advanceTime / __exoCraftDebug + screenshots). NOTE: scripts/bug_sweep.mjs is flaky in headless (pointer-lock canvas clicks fail on baseline too); verification uses the JS hooks instead.

## Wave 1 complete — Minecraft HUD
- `src/game/textures.js`: `getItemIconCanvas(itemId, placeBlockType)` — memoized per-item icon canvases cropped from the real block atlas (top face), colored chips for non-block items.
- `src/game/hud.js`: rewrote the text HUD into a Minecraft hotbar — 9 icon slots with count badges + white selection box, and a 10-heart row (full/half/empty) above it. Per-section cached signatures (lastStats/lastHotbar/lastHearts) so repaints still fire.
- `index.html` + `src/style.css`: bottom-centre beveled hotbar, hearts row, full-screen `#damage-flash` red overlay (pointer-events:none), low-health vignette.
- `src/main.js`: `triggerDamageFlash()` hooked into `takeDamage`.
- Verified: build green; both reviewers pass; hooks confirm 10 hearts / 9 slots / icons / selection / damage-flash; screenshot reads as Minecraft.

## Wave 2 complete — block palette + transparency + falling blocks
- `src/game/textures.js`: atlas 4x4 -> 8x8 with 1px gutters (TILE_GUTTER, tileOrigin, gutter-inset tileUvRect) so mipmaps don't bleed. New pixel-art tiles + paint fns: cobblestone, sand, gravel, bedrock, glass. `BLOCK_TRANSPARENCY_CLASS` export (leaves=cutout, glass=full). paintLeaves now punches ~18% transparent pixels for true alpha-cutout.
- `src/game/config.js`: blockTypes 10 Cobblestone, 11 Sand, 12 Gravel, 13 Bedrock, 14 Glass.
- `src/game/survival.js`: registry entries (drops/hardness/preferred-tool/items) for new blocks; stone now drops cobblestone; smelting cobblestone->stone and sand->glass.
- `src/game/world.js`: three material variants (opaque / alpha-cutout leaves DoubleSide / transparent glass depthWrite:false); transparency-class-aware hasExposedFace; transparent meshes renderOrder=1; bedrock band at y=0 in proceduralBlockTypeAt.
- `src/main.js`: block-id constants + FALLING_BLOCK_TYPES; bedrock guard in breakBlock; updateFallingBlocks() with per-chunk hasFallingBlocks dirty flag + direct typed-array reads (no per-frame full-world scan), settles sand/gravel via world.set.
- Reviewers flagged + fix-agent resolved: falling-block per-frame perf cliff, and opaque-leaves texture. Verified: build green; atlas intact (existing + new textures render); hotbar shows new icons; glass shows backdrop through it.

## Wave 3 complete — taller world + real noise terrain + deeper caves
- `src/game/config.js`: world.height 24 -> 112; replaced 5 sine params with FBM+ridge params; baseHeight 48, minSurfaceY 4, topClearance 8; caveCeilingY 50; caveOreCeilingY 70, surfaceOreThreshold 0.90 (copper-reachability fixes); chunk.evictRadius 5.
- `src/game/world.js`: noise2/noise3 now interpolated seeded value-noise (smoothstep fade, dual-hash to kill axis banding); fbm2 (4 octaves) + ridgedNoise2; surfaceHeight = fbm hills + mask-gated ridged mountains (regional peaks); per-chunk Uint8Array resized to new height; caves tuned to connected tunnels; chunk voxel-DATA eviction (blocks=null beyond evictRadius, regenerates identically + reapplies chunkEdits on re-entry).
- Reviewers: perf/determinism pass; terrain reviewer flagged 2 copper-objective regressions (cave-ore band below new surface; smooth noise collapsed surface-ore density) -> fixed. Verified via hooks: worldHeight 112, spawn valid y43, surfaces vary 41/43/65, copper waypoint 13m, solidBlocks ~257k; screenshot shows forested hillside with relief.

## Wave 4 complete — smooth lighting: merged mesher + AO + light BFS
- `src/game/world.js`: replaced per-type InstancedMesh with merged per-chunk BufferGeometry (one opaque + leaf-cutout + glass mesh), emitting only exposed faces with per-face UVs. Classic 3-sample voxel AO with the asymmetric-quad flip. Skylight (flood down from open sky + horizontal BFS) and blocklight (torch=14, copper=3 BFS) baked into separate vertex-color channels (R=sky, G=block, B=AO); persisted on chunk for cross-seam reads. `onBeforeCompile` shader combines via a shared `dayFactorUniform`: finalLight = max(sky*dayFactor, block) clamped to 0.08 ambient floor, ×AO — so day/night needs NO remesh. set()/break/place relight the chunk + 8 neighbours; dispose hygiene; eviction/falling-blocks intact.
- `src/main.js`: 2-line dayFactorUniform wire-up in updateDayNight; updateTorchLights point-light pool kept as glow accent.
- THREE reviewers caught 6 real bugs (inverted PY/NY winding culling tops, 4 chunk-seam light leaks from unpersisted light buffers, double vColor multiply) -> all fixed.
- CRITICAL runtime catch (reviewers did static analysis only): `vLightColor = vColor` failed shader compilation because three r183 declares vColor as vec4, not vec3 -> whole world rendered blank. Root-caused via an isolated in-page Three repro (GLSL "dimension mismatch" at the assign), fixed to `vColor.rgb`. Verified: world renders with AO shading; sealed box is dark (skylight occluded); torch lights the interior with visible falloff; 0 shader warnings; build green.

## Wave 5 complete — water: sea-level fill, beaches, swim physics, underwater fog
- `src/game/config.js`/`world.js`/`textures.js`/`survival.js`: Water block id 15, seaLevel 38 (valleys ~28 flood, avg surface ~48 stays dry → coastlines); air above terrain at/below seaLevel becomes water; sand beaches near the shoreline. Water = transparency class 2 (own buffer + waterMaterial, depthWrite:false, renderOrder 3, ~66% blue) through the wave-4 merged mesher; water-water faces cull. Added to LIGHT_PASSABLE so skylight BFS lights underwater by day. Water hardness Infinity, no drop.
- `src/game/physics.js`/`main.js`: water passable in collision; submersion test at waist+eye; in-water branch replaces gravity with buoyancy + exponential vertical damp + sink cap, 0.55x horizontal speed, Space swims up, fall damage suppressed; underwater fog (deep blue, near 2/far 16) when eye submerged; land movement path unchanged. render_game_to_text gains inWater/eyeInWater/seaLevel.
- Reviewers found+fixed 4 must-fixes: raycast/break/target skip water, spawn rejects ocean columns, vertical-drag formula (was ~0) -> exponential damp. Verified via hooks: submerged, vy -1.2 damped sink, no fall damage, raycast hits stone through water, seaLevel 38.

## Wave 6 complete — sky dome gradient + stars + clouds
- New `src/game/sky.js`: `Sky(scene)` + `sky.update(dayFactor, worldTimeMs, cameraPos, eyeInWater)`. Gradient skydome (BackSide sphere r240, ShaderMaterial smoothstep horizon->zenith, renderOrder -2, fog:false), driven by day/night palette + dusk/dawn tint. 2800 additive star Points (seeded), opacity smoothstep(0.2,0.5,1-dayFactor) — invisible by day, full at night. Procedural canvas cloud plane at Y90, seamless X drift via worldTimeMs (deterministic). Hidden entirely when eyeInWater so wave-5 underwater fog reads clean.
- `src/main.js`: import + `new Sky(scene)` near sun/moon setup + `sky.update(...)` at tail of updateDayNight; compute eyeInWater before updateDayNight (fixes 1-frame surface-cross flicker). Sun/moon sprites (renderOrder -1, depthTest:false) still draw over the dome.
- Reviewers: visual reviewer ran the app + passed (gradient day, starry night, dusk, clouds, sun/moon); integration reviewer found+fixed the eyeInWater ordering must-fix. Verified myself: day gradient sky, night dark sky with visible stars + cloud band, terrain dims at night.

## Wave 7 complete — survival loop: hunger, food, regen, tool durability
- New `src/game/hunger.js` (pure drain/regen/eat fns). state.hunger/maxHunger(20)/saturation; saturation-first drain 0.02/s rest +0.04/s sprint +0.1/jump; regen +0.5hp/s when hunger>=18 & hurt; starvation 1dmg/4s at 0. Food: apple (drops 12.5% from leaves via new BLOCK_EXTRA_DROPS) hunger+4, cooked_apple (furnace) hunger+6; right-click eats selected food (before place).
- Tool durability 60-400 on all tools/blades; per-instance damage, never stack-merge (addItemToInventory + transferInventoryStack guards); decrement on break + mob hit; breaks+clears slot at 0; green→red durability bar on damaged hotbar slots.
- Save version 3->4: serialize hunger/saturation + per-slot durability; old saves forward-default (hunger->max, tools->undamaged). HUD: #mc-status-row with hearts (left) + 10 hunger shanks (right), own cached signature. Debug: setHunger(n), eatSelected().
- BOTH reviewers passed clean (0 must-fix). Verified via hooks: 10 hearts + 10 shanks; starvation -2hp/10s at hunger 0; regen +5hp/10s at hunger 20; eat apple 6->10 hunger consuming 1; build green.

## Wave 8 complete — ore ladder + depth distribution + tool tiers + lava
- Ores (ids 16-20): coal Y20-44, iron Y14-32, gold Y8-22, redstone Y4-18, diamond Y2-14 via deterministic seeded oreAt() in the stone branch (copper untouched + objective intact). Distinct speckle tiles, ingot/gem items, smelting iron/gold ore->ingot, coal as fuel.
- Tool tiers 0-5 (hand/wood/stone/copper/iron/diamond) + harvest-level gating: ore drops only when tool tier >= ore requirement (iron needs stone+, gold/diamond/redstone need iron+), else breaks no-drop. Iron+diamond tool recipes (3 mat + 2 stick) with durability. MUST-FIX: copper removed from harvest map so the first objective stays bare-hand mineable.
- Lava (id 21): reuses wave-5 fluid (PASSABLE_BLOCKS, submersion) + wave-4 emissive blocklight (BLOCK_LIGHT_EMIT 15, own buffer tclass 3, renderOrder 4, emissive orange). Pools in deep cave air <= Y16; 2 HP/s standing damage, half move speed, orange eye-in-lava fog. inLava/eyeInLava in text-state. No save-shape change.
- Lava reviewer passed clean; ore reviewer's copper must-fix fixed. Verified: lava burns -4.5HP/3s + orange tint when submerged; 5 ore blocks render distinct textures + hotbar icons; build green.

## Wave 9 complete — passive animals + distinct hostiles + drops
- New `src/game/mobs.js`: 4 hostile types with distinct low-poly Group meshes + per-type stats/AI — zombie (melee, daylight burn), skeleton (keep-distance + arrow projectiles), creeper (3-block fuse -> radius-3 crater + radial dmg, self-removes), spider (fast, climb). Weighted night spawn; per-type drops; mobType persisted (old saves default).
- New `src/game/passiveMobs.js`: cow/pig/sheep/chicken, daytime grass wander (no chase), capped, distinct meshes; drops cow->raw_beef+leather, pig->raw_porkchop, sheep->wool, chicken->raw_chicken+feather. Food chain: raw meats (low hunger) smelt to steak/cooked_porkchop/cooked_chicken (high); wool/leather/feather materials (feed wave-10 armor).
- main.js: passive group + update/save/text-state; render_game_to_text per-mob type + passive payload; debug spawnMob/spawnPassive/explodeNearestCreeper.
- 2 must-fixes (both fixed): melee raycast was non-recursive so it never hit the new Group meshes (combat + objectives broken) -> recursive; creeper blast destroyed water/lava -> now skipped (like bedrock). Passive reviewer passed clean. Verified: all 4 hostile + 4 passive types spawn with correct types + distinct meshes; creeper craters 47 blocks + radial damage + self-removes; build green.

## Wave 10 complete — 3x3 shaped crafting + chests + armor
- Shaped (pattern+key, offset-normalized) + shapeless (multiset) grid matcher; craft panel rebuilt as 3x3 grid + result + accessible inventory; 2x2 in inventory / 3x3 at table; requiredSpecialization preserved; all old recipes still craft.
- Chest block (id 22): per-position 27-slot chestStates Map (furnace pattern), chest panel + click-transfer, serialized, break dumps contents.
- Armor: leather/iron/diamond helmet/chest/legs/boots (armor:{slot,defense}), 4 equip slots, takeDamage reduction min(0.96, def/25) floored >=1 (starvation/void bypass), armor bar above hearts (own signature). Save v4->5 (chests+armor persist, old saves default). Debug: equipArmor/hurtPlayer/openChestAt/giveChestItem/getArmorStats.
- 3 reviewers found+fixed 7 must-fixes (grid was inaccessible; item-loss on craft/close/save; sword workbench flags; chest-open input lock; armor stacked-equip). Verified: full diamond armor cuts 8dmg->1; 3x3 grid + inventory render; build green.

## Wave 11 complete — combat weight + audio + flora + F3
- Combat: 0.4s swing cooldown (rate-limits melee); mob knockback (8 m/s, via collision-aware move) + player knockback (5.5 m/s, integrates over a 0.25s window, skips starvation/void/fall/lava). Objective combat chain intact.
- New `src/game/audio.js`: extracted break/place/step/jump + added hurt, mob-growl-when-near, water/cave ambience, soft toggleable music, per-surface footstep timbre. Gated behind startGame audio-resume; cheap per-tick.
- Cross-quad flora ids 23 tall-grass / 24 flower / 25 sapling: own buffer + X-quad branch in the wave-4 mesher (DoubleSide alpha-cutout, neutral AO, sky-sampled light), PASSABLE, instant-break drops, sparse seeded placement on grass above the beach line.
- F3 overlay (F3 toggle, default off): XYZ/chunk/facing/target/eye+fluid/light/FPS/chunks/time from text-state; own cached signature.
- 2 reviewers found+fixed 5 must-fixes (player knockback dead on ground; mob knockback teleported through world; F3 light readout + dedup). Verified: flowers/grass/saplings render as cross-quads; F3 shows full readout; build green. (FPS ~27 under paused-RAF automation — real-play perf to check in graphics phase.)

## Wave 12 complete — biomes + wood/tree/snow variants (ROADMAP COMPLETE)
- biomeAt(x,z) from seeded temperature/humidity/mountain noise -> 5 biomes: PLAINS (grass, sparse oak), FOREST (grass, dense oak/birch), DESERT (sand, no trees), SNOW (snow cover + spruce), MOUNTAINS (high amplitude, stone/snow peaks). Branches surface block, tree type/density, terrain amplitude. Cached, cleared on setSeed.
- Grass tint via a SEPARATE `tint` vec3 vertex attribute + shader multiply (NOT the wave-4 light channels) so lighting/AO stay intact (lighting reviewer passed clean — no blank world). Grass top + leaves + flora tinted per biome.
- Variants ids 26 birch-log / 27 birch-leaf / 28 spruce-log / 29 spruce-leaf / 30 snow; per-biome trees; snow cap at topY+1 above snow line. birch/spruce log -> 4 plank recipes + fuel (must-fix: removed orphaned plank items).
- render_game_to_text + F3 show biome; debug findBiome(name) teleports safely. Verified: 5 biomes reachable, desert=sand(11), snow=snow(30)+spruce, world renders lit; build green.

# === 12-WAVE MINECRAFT-FIDELITY ROADMAP COMPLETE ===
Commits 6022661..(wave12) on feat/minecraft-fidelity. Next: graphics-enhancement phase (post-processing/shadows/water/weather/viewmodel) + performance.

# === GRAPHICS-ENHANCEMENT PHASE (better-than-vanilla visuals) ===

## Graphics A — post-processing pipeline (7313a21)
EffectComposer: RenderPass -> UnrealBloomPass (half-res, threshold 0.92 so only torches/lava/sun glow) -> OutputPass (ACES filmic tonemap + sRGB) -> FXAA (keeps pixel-art crisp). Pixel ratio capped at 2; resize-aware. Fixed: outputColorSpace was forced Linear (killed gamma -> too dark). Verified ~3.5ms/frame.

## Graphics B — living world (8905f63)
worldTimeUniform (deterministic). Animated water (dual-sine vertex wave + fresnel). Wind sway via per-vertex swayWeight attribute (leaves + grass/flowers, anchored at base). weather.js: biome-driven rain/snow/none camera-following Points + fog darkening + ambience; setWeather debug + text-state. Fixed 6 (incl. orchestrator-caught mesher crash: lava branch left swayArr undefined, `!== null` guard missed undefined -> blank world; fixed to truthy guard + swayArr=null).

## Graphics C — held-item viewmodel (6da3cc1)
viewmodel.js: overlay scene+camera rendered after the composer (autoClear=false + clearDepth) -> on top, no clip, no input intercept. Selected item as tilted atlas cube / tool quad / empty hand; swing-on-use (break/place/attack) + walk bob + idle sway, deterministic. Distinct ITEM_CHIP_COLORS for all wave-8/9 items via single getChipColor. Fixed 4 (disposal leak, item too low + swung up, iron-armor colors, dup chip map).

## Final integration sweep (verified)
Full-load stress (4 hostiles + 4 animals + rain + night + post chain + viewmodel): 3.7ms/frame, ZERO JS errors (only favicon 404s), all systems coexist. 5 biomes reachable, save v5, build green. Game runs smoothly and reads as Minecraft with richer-than-vanilla post-processing.

NOTE: night surface is quite dark (wave-4 ambient floor 0.08, no moonlight term) — deliberate (use torches); a future moonlight term in the chunk shader combine would lift night surface while keeping caves dark, but that shader is the project's blank-world risk zone — change with review + runtime verification.

---

# FIDELITY POLISH PHASE (2026-06-14, branch feat/minecraft-fidelity)

Post-roadmap push toward true Minecraft feel. Same discipline: one Workflow per wave (implementer + 3 adversarial reviewers + auto-fix), then orchestrator runtime-verifies via JS hooks + screenshots and commits. Planned waves: F1 item entities, F2 XP, F3 mob animation/AI, F4 partial-geometry blocks (slabs/stairs/fences/panes), F5 flowing fluids + buckets, F6 sneak/creative, F7 beds/sleep, F8 lighting/sky polish (moonlight).

## Wave F1 complete — dropped item entities + magnetic pickup + throw
- New `src/game/itemEntities.js`: ItemEntityManager owns the entity list + a THREE.Group. spawn/toss/update(dt,playerPos,world,worldTimeMs)->pickups/serialize/restore/clear. Block items render as a small (~0.25) atlas-textured cube; tools/resources as a flat icon sprite (getItemIconCanvas). Deterministic pop scatter from a seeded incrementing spawn id (NO runtime RNG), bob/spin pure fns of time. Gravity + ground-settle on first solid block below; 0.5s pickup delay; magnetic glide within 1.6m, collect within 0.6m; same-item ground merge; 300s despawn; ~200 cap.
- `src/main.js`: block-break drops (breakBlock ~5409) and mob-death drops (passive ~3252, hostile ~3572) now SPAWN entities instead of direct addItemToInventory; update loop awards returned pickups (inventory-full leaves remainder on ground) + pickup pop sound; KeyQ tosses 1 of selected slot in facing dir; save v5->6 (entities persisted, v<=5 forward-default to none); render_game_to_text gains itemEntities {count,entries[20]}; debug spawnItemEntity/getItemEntities/clearItemEntities.
- `src/game/audio.js`: pickup ding. `src/game/controls.js`: KeyQ one-shot (playing-mode gated).
- Reviewers caught 2 distinct must-fixes (each found by all 3): (1) BLANK-WORLD bug — block-item meshes reuse the SHARED world atlas texture; the per-entity dispose path freed it on first pickup/merge/cap/clear, untexturing the whole world + viewmodel. Fixed: `if (m.map && !e.isBlock) m.map.dispose()` (block cubes keep the shared atlas, sprites still dispose their own CanvasTexture). (2) chained 3-stack merge lost item counts -> `mergedAway` Set guards both loops. Nice-to-haves deferred: sprite billboards spin edge-on (should face camera), bob/spin use wrapping day clock (snaps every 4 min), cube UVs mirror directional faces, no geometry/texture pooling.
- VERIFIED (hooks + screenshot): spawned 4 then 8 entities; they fall and settle at ground (y44/45), in-range items collect into inventory (stick + a stone block-item collected -> the block dispose path ran), out-of-range items wait on the ground (Minecraft-accurate). World stays fully textured after block-item collection; 0 disposed-texture console warnings (only favicon 404). Build green (33 modules).
- KNOWN: render_game_to_text() returns a JSON STRING — JSON.parse it. __exoCraftDebug.getItemEntities() returns {count, entries[]} not a bare array. Dev server binds to localhost/IPv6 (use http://localhost:<port>, 127.0.0.1 is refused); 5173/5174 were occupied so it used 5175.

## Wave F2 complete — XP orbs + XP bar + levels
- New `src/game/xpOrbs.js` (XpOrbManager, modeled on itemEntities.js): orbs split incoming xp into MC denominations 1/3/7/17/37/73; deterministic seeded scatter; gravity + ground-settle; ~5-block magnet range (bigger than items), collect on contact; same-value ground merge; 300s despawn; 200 cap. Emissive sphere, hue yellow->green by value, scale by denomination. Bob/pulse pure fns of worldTimeMs.
- `src/main.js`: xp state (level, xpWithinLevel, xpToNext, _furnaceXpAccum); real MC cost curve xpCostForLevel = L<=15?2L+7 : L<=30?5L-38 : 9L-158; addXp() levels up + level-up sound + HUD refresh. Sources: passive death 1-3xp, hostile death 5xp, ore mining via xpForBlockBreak() (coal 0-2, redstone 1-5, diamond-tier 3-7; iron/gold/copper give 0 on mine — xp on smelt), furnace collect accumulates fractional xp per smelted item. Save v6->7 (xp + orbs; v<=6 forward-default to L0). New-World resets. render_game_to_text xp {level,xp,xpToNext,progress,totalOrbs}; debug spawnXpOrb/addXp/getXp/clearXpOrbs.
- `src/game/hud.js` + index.html + style.css: thin green XP bar spanning hotbar width above the hearts/hunger row, green level number centered above it, own cached signature (lastXp).
- `src/game/audio.js`: level-up arpeggio (C5/E5/G5).
- Reviewers: 9 findings, **0 must-fix** (one ran the engine and confirmed merge awards exact xp + the L15->16 breakpoint). Deferred nice-to-haves: merged orb keeps pre-merge hue (cosmetic), level-up sound fires per-level on a multi-level grant, per-tick Set/filter alloc (inherited from itemEntities), no orb geometry/material pooling.
- VERIFIED (hooks + element screenshot): xpToNext 7 at L0; +7 -> L1 (xpToNext 9); +200 from L1 -> L11 with 20 xp leftover + xpToNext 29 (cumulative L1->11 cost = 180, exact); 2 orbs (7+3) collected -> L12 +1; HUD shows green bar at 3% fill with "12". World renders, no real console errors (favicon 404 only). Build green (34 modules).

## Wave F3 complete — mob life: limb animation + head tracking + hurt/death + smarter AI
- `src/game/mobs.js` + `src/game/passiveMobs.js`: buildGroup refactored so each mesh's animatable parts are NAMED on group.userData.parts (head + legs/arms; quadrupeds 4 legs, bipeds 2 legs+2 arms, spider leg banks). Classic Minecraft limb rig — geometry offset inside a pivot sub-Group so limbs swing from the top.
- New `src/game/mobAnim.js`: initMobAnimState/initMobShadow, updateMobTravel, tickMobAnims (walk-cycle limb swing = sine of accumulated travel distance, amplitude by speed; subtle body bob; head yaw/pitch toward player when aware, clamped+smoothed), triggerHurtFlash (clone-per-mob material, 300ms red emissive, restore), startMobDeath/isMobDying/isMobDeathFinished (500ms tip 90deg + opacity fade then remove), getMobDebugSnapshot. All deterministic (dt-accumulated, no new RNG).
- `src/main.js`: tickMobAnims wired into updateHostileMobs/updatePassiveMobs; death routing — reward (drops + xp) fires ONCE at death-start then startMobDeath, update loop animates dying->removed (dying mobs are un-hittable, no damage, not persisted); smarter AI — gravity/grounding, auto-jump over 1-block steps (hostile + passive), lava/water/big-drop hazard avoidance; pooled soft circular shadow under each mob; __exoCraftDebug.getMobDebug() scalar snapshot. Save version unchanged (7) — anim/hurt/death state transient.
- Reviewers: 12 findings, 4 must-fix — ALL applied: (1-3, same bug found by all 3) body-bob froze mesh.y at spawn height so mobs visually sank/floated off terrain -> fixed to mob.mesh.position.y = mob.pos.y + bobDy; (4) passive mobs never auto-jumped 1-block steps -> added hop + vel.y integration to the passive loop. Deferred nice-to-haves: skeleton-retreat planarDistance===0 NaN guard, shadow ground-projection (rides up when airborne), death pivot at feet not center, hurt-flash clone is dead work (materials already per-mob), creeper-flash vs hurt-flash emissive contention.
- VERIFIED (hooks + screenshots): limb angle varies with movement (moving sheep/pig swing, stationary shooting skeleton ~0); skeleton headYaw -1.41 rad tracking player; real burn-death path shows transient dying state for zombies in daylight then removal; reward-once (xp + drop entities); AI modes wander/shoot transition; zero runtime errors (favicon 404 only), world renders. Build green (35 modules). NOTE: debug defeatNearestHostileMob hard-removes (legacy, for deterministic objective tests) — it bypasses the death animation; real HP-zero kills route through startMobDeath. Test-teleport via findBiome can fall-through-respawn under paused RAF (mobs end up at spawn).

## Wave F4 complete — slabs + stairs (partial-geometry blocks)
- Extends the MESHER (blank-world risk zone) by following the flora special-geometry pattern: new SLAB_BLOCK_IDS/STAIR_BLOCK_IDS sets (textures.js, transparency class 5 so neighbours don't cull faces against them and they skip the cube-face loop), a dedicated partial-geometry emitter branch + buffer in world.js (emitBox helpers, per-cell light sampling like flora), and a dedicated MeshLambertMaterial routed through the SAME onBeforeCompile light shader (NOT modified). No opaque-emitter or GLSL edits.
- Block ids: slabs 31 stone / 32 cobblestone / 33 plank (bottom-half box). Stairs 34-45 = 4 orientation ids (N/E/S/W) × 3 materials (stone/cobble/plank), since the world stores only id bytes with NO metadata. ONE stair ITEM per material; placement picks the orientation id from camera yaw (4-way); break drops the single item.
- Registry through config.js + survival.js + textures (shared-registry discipline). Crafting: 3-in-a-row -> 6 slabs; stair pattern -> 4 stairs. Collision: physics.js getBlockTopY half-height for slabs + new two-box stair profile (aabbIntersectsStair / stairTopFracForAabb: full-footprint lower 0.5 + orientation-dependent upper step). Save: NO version bump (ids persist via chunkEdits; old v7 saves load + placements survive save/load). Debug: __exoCraftDebug.listPartialBlockIds().
- Reviewers: 13 findings, 3 must-fix — ALL applied: (1) stairs collided as full cubes -> two-box stair collision in physics; (2&3) N/S stair geometry was inverted on Z (ran into the tall face) -> swapped case 0/2 emitBox z-offsets in world.js (fixed geometry, left placement table, reconciled the textures.js comment). The dedicated blank-world reviewer ran an 8-point check + compiled and found NO blank-world defect.
- VERIFIED (hooks + screenshot): world renders (no blank-world — critical mesher check), slabs + stairs render with partial geometry, 0 shader warnings; collision — player rests at y44.5 on a slab (half), 44.0 on full floor, 45.0 on a stair's tall-step half (two-box works). Build green (35 modules).
- DEFERRED nice-to-haves: stepHeight is 1.05 so the player auto-steps any full block -> slabs/stairs give no traversal advantage (true MC stepHeight is 0.6 — change in a movement wave, affects all terrain); side-face texture squashed onto half-height quads (no V-subrect); top-slab + double-slab + stacking-on-slab not handled (no metadata); wood slab/stair top face shows the crafting-grid tile (no standalone plank tile); fences/glass-panes/ladders/doors NOT in this wave (future F4b).

## Wave F6 complete — movement: sneak + sprint-remap + fly + stepHeight (NO mesher change)
- SNEAK on Left Shift (remapped off sprint): 0.3x speed (moveSpeed 6.2->1.86), camera eye lowered ~0.14, per-axis EDGE-GUARD via hasSolidSupportAt (can't walk off a ledge, can still slide along it). Grounded + not-flying only.
- SPRINT remapped to DOUBLE-TAP-W (controls.js _sprintArmed, 300ms window, !isRepeat gate); 1.32x speed (->8.18) + FOV bump; ends on forward release; mutually exclusive with sneak. (Shift no longer sprints — feeds hunger sprint-drain correctly.)
- FLY via DOUBLE-TAP-SPACE: no gravity, collisions intact; Space ascends / Shift descends (Shift = descend while flying, sneak while grounded); 2x walk speed (FLY_SPEED_MULTIPLIER, MC creative feel); fly-off mid-air re-enables gravity + takes real fall damage. respawnPlayer now clears isFlying/isSneaking/_sprintArmed/_flyLandingGrace.
- STEP HEIGHT lowered 1.05 -> 0.6 (config.js): auto-step half-blocks (slabs/stairs top 0.5), must JUMP for full 1.0 blocks (the reason F4 stairs exist). Mob step/jump unaffected (mobs got their own F3 auto-jump). Hooks: __exoCraftDebug.setFlying/setSneaking/getMovementState; player payload + sneaking/sprinting/flying. Save unchanged (v7, transient).
- Reviewers: 10 findings, 3 must-fix — ALL applied (reviewers ran the game): (1) sneak edge-guard hasSolidSupportAt had an off-by-one floorY (Math.floor(restY-eps) = the EMPTY feet layer) so sneak FROZE all movement on full-block ground -> replaced with a partial-height-aware AABB support probe (aabbCollidesWorld); (2&3) _flyLandingGrace was sticky (fly up, toggle off, fall damage-free exploit; also leaked past soft landings) -> scoped to a single tick (captured + cleared at frame start). Plus 2 polish edits I made + verified: fly 2x speed, respawn clears transient flags.
- VERIFIED (hooks + key-dispatch): stepHeight 0.6; fly ascend (vy 12.4=2x) / descend / no-gravity / fall-damage-on-fly-off (hp 20->13.55 on a real post-fly fall); sneak moves at 30% (0.57 vs walk 1.9) NOT frozen, edge-guard keeps player on platform (y51) while no-sneak walks off (falls to y43); sprint double-tap-W -> 8.18 speed, ends on release; respawn-while-flying clears the flag. Build green (35 modules).
- TEST-HARNESS GOTCHA: the keydown listener is on `window` only (controls.js:215). Dispatching a synthetic KeyboardEvent on BOTH window AND document double-fires it (document event bubbles to window) -> fakes a double-tap (toggles fly / arms sprint spuriously). Dispatch on window ONLY for deterministic input tests.
