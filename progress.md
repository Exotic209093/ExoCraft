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
