function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function setupControls({
  windowObj,
  documentObj,
  renderer,
  startButton,
  state,
  hotbarSize,
  startGame,
  toggleFullscreen,
  regenerateWorld,
  togglePointerLock,
  onSelectHotbar,
  toggleCraftPanel,
  toggleInventoryPanel,
  toggleFurnacePanel,
  closeChestPanel,
  breakBlockAt,
  placeBlockAt,
  onRightRelease,
  toNdc,
  toggleF3Overlay,
  onThrowItem,
  togglePauseMenu,
}) {
  // Movement keys tracked in state.keys. Shift and Space handled separately.
  const movementKeyCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "ShiftLeft", "ShiftRight",
    "Space",
  ]);

  // Double-tap-W sprint detection state (not in state object — purely input-layer).
  let lastWPressTime = -Infinity;
  const DOUBLE_TAP_WINDOW_MS = 300;

  // Double-tap-Space fly detection state.
  let lastSpacePressTime = -Infinity;

  const onKeyDown = (event) => {
    const { code } = event;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
      event.preventDefault();
    }

    if (code === "Enter" && state.mode === "menu") {
      startGame();
      return;
    }

    if (state.mode !== "playing") {
      return;
    }

    const isRepeat = event.repeat;
    // Wave P1 — the pause menu counts as an open panel: it blocks movement keys,
    // hotbar switching and mouse actions just like the container UIs.
    const panelOpen = state.craftingOpen || state.inventoryOpen || state.furnaceOpen || state.chestOpen || state.pauseOpen || state.hopperOpen;

    if (code === "Escape" && !isRepeat) {
      if (state.inventoryOpen && typeof toggleInventoryPanel === "function") {
        toggleInventoryPanel();
        return;
      }
      if (state.craftingOpen && typeof toggleCraftPanel === "function") {
        toggleCraftPanel();
        return;
      }
      if (state.furnaceOpen && typeof toggleFurnacePanel === "function") {
        toggleFurnacePanel();
        return;
      }
      if (state.chestOpen && typeof closeChestPanel === "function") {
        closeChestPanel(true);
        return;
      }
      // Wave P1 — no panel open: Esc toggles the pause menu. (While pointer-locked
      // the browser consumes Esc for the unlock; main.js opens the pause menu from
      // the pointerlockchange event instead, so both paths land in the same place.)
      if (typeof togglePauseMenu === "function") {
        togglePauseMenu();
        return;
      }
    }

    if (code === "KeyE" && !isRepeat && typeof toggleInventoryPanel === "function") {
      toggleInventoryPanel();
      return;
    }
    if (code === "KeyV" && !isRepeat && typeof toggleFurnacePanel === "function") {
      toggleFurnacePanel();
      return;
    }

    if (code === "Space" && !panelOpen) {
      if (!isRepeat) {
        // Double-tap-Space toggles fly mode.
        const now = performance.now();
        if (now - lastSpacePressTime <= DOUBLE_TAP_WINDOW_MS) {
          state.isFlying = !state.isFlying;
          if (!state.isFlying) {
            // Turning fly off: clear vertical velocity and suppress fall-damage spike.
            state.playerVel.y = 0;
            state._flyLandingGrace = true;
          }
          lastSpacePressTime = -Infinity; // consume the double-tap
        } else {
          lastSpacePressTime = now;
        }
      }
      if (!state.isFlying) {
        state.jumpQueued = true;
      }
    }
    if (code === "KeyW" && !isRepeat && !panelOpen) {
      // Double-tap-W activates sprint.
      const now = performance.now();
      if (now - lastWPressTime <= DOUBLE_TAP_WINDOW_MS) {
        state._sprintArmed = true;
        lastWPressTime = -Infinity;
      } else {
        lastWPressTime = now;
      }
    }
    if (code === "KeyF" && !isRepeat) {
      toggleFullscreen();
    }
    if (code === "F3" && !isRepeat && typeof toggleF3Overlay === "function") {
      event.preventDefault();
      toggleF3Overlay();
    }
    if (code === "KeyR" && !isRepeat) {
      regenerateWorld();
    }
    if (code === "KeyL" && !isRepeat) {
      togglePointerLock();
    }
    if (code === "KeyC" && !isRepeat && typeof toggleCraftPanel === "function") {
      toggleCraftPanel();
    }
    // Wave F1 — throw selected hotbar item (one-shot, no repeat, no panel-open gate)
    if (code === "KeyQ" && !isRepeat && !panelOpen && typeof onThrowItem === "function") {
      onThrowItem();
    }
    if (code.startsWith("Digit") && !isRepeat) {
      const slot = Number(code.replace("Digit", ""));
      if (slot >= 1 && slot <= hotbarSize) {
        onSelectHotbar(slot - 1);
      }
    }

    if (panelOpen) {
      return;
    }

    if (movementKeyCodes.has(code)) {
      state.keys.add(code);
    }
  };

  const onKeyUp = (event) => {
    state.keys.delete(event.code);
  };

  const onBlur = () => {
    state.keys.clear();
    state.jumpQueued = false;
    lastWPressTime = -Infinity;
    lastSpacePressTime = -Infinity;
  };

  const onPointerLockChange = () => {
    state.pointerLocked = documentObj.pointerLockElement === renderer.domElement;
  };

  const onMouseMove = (event) => {
    if (state.mode !== "playing" || !state.pointerLocked) {
      return;
    }
    // Wave P1 — settings menu exposes a sensitivity multiplier (default 1).
    const sens = Number.isFinite(state.mouseSensitivity) ? state.mouseSensitivity : 1;
    state.yaw -= event.movementX * 0.0024 * sens;
    state.pitch -= event.movementY * 0.002 * sens;
    state.pitch = clamp(state.pitch, -1.45, 1.45);
  };

  const onContextMenu = (event) => {
    event.preventDefault();
  };

  const onMouseDown = (event) => {
    if (state.mode !== "playing") {
      return;
    }
    if (state.inventoryOpen || state.craftingOpen || state.furnaceOpen || state.chestOpen || state.pauseOpen || state.hopperOpen) {
      return;
    }
    renderer.domElement.focus();

    if (event.button === 1) {
      togglePointerLock();
      return;
    }

    // First click engages pointer lock so the player can look around without
    // hunting for the middle-click binding. Once locked, left/right click
    // perform their normal break/place actions.
    if (!state.pointerLocked) {
      togglePointerLock();
      return;
    }

    if (event.button === 0) {
      breakBlockAt(0, 0);
    } else if (event.button === 2) {
      placeBlockAt(0, 0);
    }
  };

  // Wave G3 — releasing right-click fires a drawn bow (no-op for any other held item).
  const onMouseUp = (event) => {
    if (event.button === 2 && typeof onRightRelease === "function") {
      onRightRelease();
    }
  };

  const onStartClick = () => {
    startGame();
  };

  windowObj.addEventListener("keydown", onKeyDown);
  windowObj.addEventListener("keyup", onKeyUp);
  windowObj.addEventListener("blur", onBlur);
  windowObj.addEventListener("mousemove", onMouseMove);
  documentObj.addEventListener("pointerlockchange", onPointerLockChange);
  renderer.domElement.addEventListener("contextmenu", onContextMenu);
  renderer.domElement.addEventListener("mousedown", onMouseDown);
  windowObj.addEventListener("mouseup", onMouseUp);
  startButton.addEventListener("click", onStartClick);

  return () => {
    windowObj.removeEventListener("keydown", onKeyDown);
    windowObj.removeEventListener("keyup", onKeyUp);
    windowObj.removeEventListener("blur", onBlur);
    windowObj.removeEventListener("mousemove", onMouseMove);
    documentObj.removeEventListener("pointerlockchange", onPointerLockChange);
    renderer.domElement.removeEventListener("contextmenu", onContextMenu);
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
    windowObj.removeEventListener("mouseup", onMouseUp);
    startButton.removeEventListener("click", onStartClick);
  };
}
