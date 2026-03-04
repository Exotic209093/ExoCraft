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
- `Right click`: place selected block
- `1-5`: pick block type
- `L`: toggle mouse lock
- `F`: toggle fullscreen
- `R`: regenerate terrain

## Test hooks

- `window.advanceTime(ms)` for deterministic stepping
- `window.render_game_to_text()` for concise state output
