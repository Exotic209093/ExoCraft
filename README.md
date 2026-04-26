# ExoCraft

A browser voxel sandbox inspired by Minecraft, built with Three.js and Vite.

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:5173`

## Controls

- `WASD` or `ArrowUp/ArrowDown`: move
- `ArrowLeft/ArrowRight`: turn
- `Space`: jump
- `Left click`: break block
  - If a hostile mob is under the crosshair and in reach, left click attacks it instead.
- `Right click`: place selected hotbar item (if placeable)
- `1-9`: select hotbar slot
- `E`: toggle inventory panel
- `C`: toggle crafting panel
- `V`: toggle furnace panel (requires nearby furnace block)
- `Esc`: close open inventory/crafting/furnace panel
- `L`: toggle mouse lock
- `F`: toggle fullscreen
- `R`: regenerate terrain
- `Save` / `Load` / `New World` buttons (top-right) for persistence controls

## Survival Notes

- High falls cause damage.
- Reaching `0` health respawns you at spawn with full health.
- Inventory panel supports moving/swapping stacks between hotbar and backpack by clicking one slot, then another.
- Furnace panel supports loading smeltable input + fuel and collecting output.
- Time of day now cycles automatically and is persisted in saves.
- Player movement now auto-steps over 1-block ledges for smoother traversal.
- Hostile mobs now wander/chase with stronger nighttime spawning and can damage the player on contact.
- Defeated hostile mobs now drop `Bone Shard` progression loot.
- Crafting now includes combat upgrades (`Wood Sword`, `Bone Blade`) and placeable `Torch` blocks.
- Torches provide local dynamic light to improve nighttime visibility.
- World generation now includes cave pockets and copper ore nodes (surface/deep variants).
- Furnace progression now supports `Copper Ore -> Copper Ingot` smelting.
- Exploration crafting now includes `Copper Pickaxe` and `Copper Blade` (combat path ties ore + mob drops).
- Guided progression now includes an objective HUD + world waypoint beacon:
  - collect copper ore
  - smelt copper ingot
  - craft copper blade
  - place a torch in a cave
  - defeat a hostile mob with the copper blade
- After the core objective chain, progression now branches into specialization paths:
  - Combat path: hostile-kill trial rewards bonus damage + max health.
  - Explorer path: cave torch + deep copper trial rewards move-speed + torch-scan range boosts.
- Specialization trials now unlock branch-exclusive craftables:
  - Combat branch: `Vanguard Blade` and `Warden Totem` (totem grants `+3` passive max health while carried).
  - Explorer branch: `Deep Delver Pickaxe` and `Spelunker Compass` (compass grants `+0.55` move speed and `+3` torch scan radius while carried).
  - Branch-exclusive recipes stay locked if the wrong specialization is selected.
- After specialization completion, each branch now gets a repeatable midgame loop:
  - Combat: forge the `Vanguard Blade`, then clear `Vanguard Hunt` runs by defeating `4` hostile mobs with it for bonus `Bone Shard` and `Copper Ingot` rewards.
  - Explorer: craft the `Deep Delver Pickaxe` plus `Spelunker Compass`, then clear `Survey Run` routes by placing `2` cave torches and mining `2` deep copper for bonus `Torch` and `Copper Ore` rewards.
- Those repeatable loops now lead into branch-specific encounter locations:
  - Combat branch marks an `Ambush Pocket`; reaching it triggers a local hostile wave before hunt progress counts.
  - Explorer branch marks a `Survey Cache`; reaching it anchors the torch/deep-copper route to one cave site before survey progress counts.

## Test hooks

- `window.advanceTime(ms)` for deterministic stepping
- `window.render_game_to_text()` for concise state output

## Persistence

- Uses IndexedDB when available (fallback to localStorage).
- Stores world seed, day/night clock, player transform/health, selected hotbar slot, inventory contents, furnace states, hostile mobs, and placed/broken block edits.
- Autosaves periodically while playing.
