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
