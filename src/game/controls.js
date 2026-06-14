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
  toNdc,
  toggleF3Overlay,
}) {
  // Shift used for sprint (web-safe; Ctrl+W would close the tab in most browsers).
  const movementKeyCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "ShiftLeft", "ShiftRight",
  ]);

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
    const panelOpen = state.craftingOpen || state.inventoryOpen || state.furnaceOpen || state.chestOpen;

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
    }

    if (code === "KeyE" && !isRepeat && typeof toggleInventoryPanel === "function") {
      toggleInventoryPanel();
      return;
    }
    if (code === "KeyV" && !isRepeat && typeof toggleFurnacePanel === "function") {
      toggleFurnacePanel();
      return;
    }

    if (code === "Space") {
      state.jumpQueued = true;
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
    if (code.startsWith("Digit") && !isRepeat) {
      const slot = Number(code.replace("Digit", ""));
      if (slot >= 1 && slot <= hotbarSize) {
        onSelectHotbar(slot - 1);
      }
    }

    if (panelOpen) {
      if (code === "Space") {
        state.jumpQueued = false;
      }
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
  };

  const onPointerLockChange = () => {
    state.pointerLocked = documentObj.pointerLockElement === renderer.domElement;
  };

  const onMouseMove = (event) => {
    if (state.mode !== "playing" || !state.pointerLocked) {
      return;
    }
    state.yaw -= event.movementX * 0.0024;
    state.pitch -= event.movementY * 0.002;
    state.pitch = clamp(state.pitch, -1.45, 1.45);
  };

  const onContextMenu = (event) => {
    event.preventDefault();
  };

  const onMouseDown = (event) => {
    if (state.mode !== "playing") {
      return;
    }
    if (state.inventoryOpen || state.craftingOpen || state.furnaceOpen || state.chestOpen) {
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
  startButton.addEventListener("click", onStartClick);

  return () => {
    windowObj.removeEventListener("keydown", onKeyDown);
    windowObj.removeEventListener("keyup", onKeyUp);
    windowObj.removeEventListener("blur", onBlur);
    windowObj.removeEventListener("mousemove", onMouseMove);
    documentObj.removeEventListener("pointerlockchange", onPointerLockChange);
    renderer.domElement.removeEventListener("contextmenu", onContextMenu);
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
    startButton.removeEventListener("click", onStartClick);
  };
}
