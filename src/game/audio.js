/**
 * audio.js — Wave 11 audio module for ExoCraft.
 *
 * Extracted from main.js (ensureAudio / playTone / playNoiseBurst / break / place / step / jump)
 * and extended with:
 *  - player-hurt sound
 *  - mob-proximity growl (cheap: checks once per updateAudio call)
 *  - water / cave ambience (gentle, quiet, toggleable with music)
 *  - per-block footstep timbre (grass / stone / sand / wood)
 *
 * All sounds are gated behind the AudioContext resume gesture (created on first user action
 * via ensureAudio(), then passed into startAudio() which sets the shared context).
 *
 * Public API:
 *   ensureAudio()                         — create/resume AudioContext; call on user gesture
 *   startAudio(ctx)                       — called by main.js after ensureAudio() to share ctx
 *   playBreakSound(blockType)
 *   playPlaceSound(blockType)
 *   playStepSoundForBlock(blockType)      — per-surface footstep
 *   playJumpSound()
 *   playHurtSound()
 *   updateAudio(state, world, hostileMobs) — cheap per-tick: ambience + mob-proximity
 *   setMusicEnabled(bool)                 — toggle optional quiet background music
 */

// ---------------------------------------------------------------------------
// Shared audio context + master gain — shared between this module and main.js
// ---------------------------------------------------------------------------
let audioContext = null;
let audioMaster = null;

// Separate sub-gains so ambience / music can be muted independently.
let ambienceGain = null;
let musicGain = null;

// State for throttled / interval sounds
let lastProximityGrowlAt = -Infinity;
let lastAmbienceAt = -Infinity;
let ambienceType = "none"; // "none" | "water" | "cave"
let musicEnabled = true;

// Simple background music scheduler state
let nextMusicAt = Infinity;

/**
 * Create (or resume) the Web Audio context. Safe to call multiple times.
 * Returns the context or null if Web Audio is unsupported.
 */
export function ensureAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) {
    audioContext = new Ctx();
    audioMaster = audioContext.createGain();
    audioMaster.gain.value = 0.35;
    audioMaster.connect(audioContext.destination);

    ambienceGain = audioContext.createGain();
    ambienceGain.gain.value = 0.18;
    ambienceGain.connect(audioMaster);

    musicGain = audioContext.createGain();
    musicGain.gain.value = 0.07;
    musicGain.connect(audioMaster);

    // Schedule first music attempt in ~30s
    nextMusicAt = audioContext.currentTime + 30;
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/** Called by main.js right after ensureAudio() so both share the same instance. */
export function getAudioContext() {
  return audioContext;
}

export function setMusicEnabled(enabled) {
  musicEnabled = !!enabled;
  if (musicGain) {
    musicGain.gain.value = musicEnabled ? 0.07 : 0;
  }
}

// ---------------------------------------------------------------------------
// Low-level primitives (ported from main.js)
// ---------------------------------------------------------------------------
function isReady() {
  return audioContext && audioContext.state === "running";
}

function playNoiseBurst({ durationMs, lowpass = 1200, gainStart = 0.6, targetGain = ambienceGain || audioMaster }) {
  if (!isReady()) return;
  const ctx = audioContext;
  const samples = Math.floor(ctx.sampleRate * (durationMs / 1000));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.85;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(gainStart, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  source.connect(filter).connect(env).connect(targetGain);
  source.start(t);
  source.stop(t + durationMs / 1000 + 0.01);
}

// Master-connected version for gameplay SFX
function playNoiseBurstSFX({ durationMs, lowpass = 1200, gainStart = 0.6 }) {
  if (!isReady()) return;
  const ctx = audioContext;
  const samples = Math.floor(ctx.sampleRate * (durationMs / 1000));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.85;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(gainStart, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  source.connect(filter).connect(env).connect(audioMaster);
  source.start(t);
  source.stop(t + durationMs / 1000 + 0.01);
}

function playTone({ frequency, durationMs, type = "sine", gain = 0.3 }) {
  if (!isReady()) return;
  const ctx = audioContext;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const env = ctx.createGain();
  const t = ctx.currentTime;
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  osc.connect(env).connect(audioMaster);
  osc.start(t);
  osc.stop(t + durationMs / 1000 + 0.01);
}

// ---------------------------------------------------------------------------
// Block-break / place sounds (ported from main.js, unchanged behavior)
// ---------------------------------------------------------------------------
export function playBreakSound(blockType) {
  const stoneLike = blockType === 3 || blockType === 7 || blockType === 9 || blockType === 6;
  playNoiseBurstSFX({
    durationMs: 160,
    lowpass: stoneLike ? 1400 : 900,
    gainStart: stoneLike ? 0.7 : 0.55,
  });
}

export function playPlaceSound(blockType) {
  const stoneLike = blockType === 3 || blockType === 7 || blockType === 9;
  playTone({
    frequency: stoneLike ? 180 : 240,
    durationMs: 90,
    type: "triangle",
    gain: 0.32,
  });
  playNoiseBurstSFX({ durationMs: 70, lowpass: 700, gainStart: 0.25 });
}

// ---------------------------------------------------------------------------
// Jump (ported)
// ---------------------------------------------------------------------------
export function playJumpSound() {
  playTone({ frequency: 380, durationMs: 70, type: "sine", gain: 0.18 });
}

// ---------------------------------------------------------------------------
// Per-block footstep timbre (Wave 11 extension)
// Block surface categories:
//   grass  (1, 2)             — soft thud
//   stone  (3,6,7,9-13,16-20) — crisp click
//   sand   (11)               — dull scrape
//   wood   (4)                — resonant knock
//   glass  (14)               — light clink
//   default                   — generic step
// ---------------------------------------------------------------------------
const STEP_SURFACE = {
  1:  "grass",  // grass
  2:  "grass",  // dirt
  4:  "wood",
  11: "sand",
  12: "sand",   // gravel
  14: "glass",
};

function getSurface(blockType) {
  if (STEP_SURFACE[blockType]) return STEP_SURFACE[blockType];
  if (blockType >= 3 && blockType <= 21) return "stone";
  return "default";
}

export function playStepSoundForBlock(blockType) {
  if (!isReady()) return;
  const surface = getSurface(blockType);
  switch (surface) {
    case "grass":
      playNoiseBurstSFX({ durationMs: 55, lowpass: 500, gainStart: 0.15 });
      break;
    case "stone":
      playNoiseBurstSFX({ durationMs: 40, lowpass: 1200, gainStart: 0.20 });
      playTone({ frequency: 120, durationMs: 35, type: "triangle", gain: 0.06 });
      break;
    case "sand":
      playNoiseBurstSFX({ durationMs: 70, lowpass: 380, gainStart: 0.14 });
      break;
    case "wood":
      playTone({ frequency: 180, durationMs: 55, type: "triangle", gain: 0.12 });
      playNoiseBurstSFX({ durationMs: 40, lowpass: 600, gainStart: 0.10 });
      break;
    case "glass":
      playTone({ frequency: 680, durationMs: 35, type: "sine", gain: 0.07 });
      break;
    default:
      // legacy generic step
      playNoiseBurstSFX({ durationMs: 60, lowpass: 600, gainStart: 0.18 });
  }
}

// Keep the old name for any remaining call sites in main.js during transition.
export function playStepSound() {
  playStepSoundForBlock(0); // "default" surface
}

// ---------------------------------------------------------------------------
// Item pickup pop (Wave F1)
// Short bright ding — two quick ascending tones.
// ---------------------------------------------------------------------------
export function playPickupSound() {
  if (!isReady()) return;
  playTone({ frequency: 880, durationMs: 55, type: "sine", gain: 0.18 });
  playTone({ frequency: 1320, durationMs: 45, type: "sine", gain: 0.12 });
}

// ---------------------------------------------------------------------------
// Player hurt sound (Wave 11)
// ---------------------------------------------------------------------------
export function playHurtSound() {
  if (!isReady()) return;
  // Sharp descending pitch + short noise burst to convey pain
  playTone({ frequency: 520, durationMs: 60, type: "sawtooth", gain: 0.28 });
  playTone({ frequency: 280, durationMs: 80, type: "sawtooth", gain: 0.20 });
  playNoiseBurstSFX({ durationMs: 90, lowpass: 900, gainStart: 0.22 });
}

// ---------------------------------------------------------------------------
// Mob-proximity growl (Wave 11)
// A low rumble when any hostile mob is within a threshold distance.
// Plays at most once per ~3s to avoid spam.
// ---------------------------------------------------------------------------
const GROWL_DISTANCE_SQ = 10 * 10; // 10 blocks
const GROWL_INTERVAL_SEC = 3.0;

function playMobGrowl() {
  if (!isReady()) return;
  const ctx = audioContext;
  const t = ctx.currentTime;
  // Deep sawtooth growl with quick decay
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(55, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.14, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  osc.connect(lp).connect(env).connect(audioMaster);
  osc.start(t);
  osc.stop(t + 0.4);
}

// ---------------------------------------------------------------------------
// Water ambience (Wave 11) — gentle bubble sound
// ---------------------------------------------------------------------------
function playWaterAmbience() {
  if (!isReady() || !ambienceGain) return;
  const ctx = audioContext;
  const t = ctx.currentTime;
  // Filtered noise burst via ambienceGain (quieter sub-channel)
  const samples = Math.floor(ctx.sampleRate * 0.6);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.7;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 200 + Math.random() * 300;
  bp.Q.value = 0.6;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.5, t + 0.2);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  source.connect(bp).connect(env).connect(ambienceGain);
  source.start(t);
  source.stop(t + 0.65);
}

// ---------------------------------------------------------------------------
// Cave ambience (Wave 11) — distant low drone
// ---------------------------------------------------------------------------
function playCaveAmbience() {
  if (!isReady() || !ambienceGain) return;
  const ctx = audioContext;
  const t = ctx.currentTime;
  const dur = 1.8 + Math.random() * 1.2;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 60 + Math.random() * 40;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.4, t + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(ambienceGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------
// Quiet background music (optional, toggleable)
// Three-note arpeggio gently looping — very soft so it never intrudes.
// ---------------------------------------------------------------------------
const MUSIC_NOTES = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
function playMusicNote() {
  if (!isReady() || !musicGain || !musicEnabled) return;
  const ctx = audioContext;
  const t = ctx.currentTime;
  const freq = MUSIC_NOTES[Math.floor(Math.random() * MUSIC_NOTES.length)];
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.8, t + 0.4);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
  osc.connect(env).connect(musicGain);
  osc.start(t);
  osc.stop(t + 3.1);
  // Schedule next note in 6-18s
  nextMusicAt = t + 6 + Math.random() * 12;
}

// ---------------------------------------------------------------------------
// updateAudio — call once per simulation tick; keeps ambient sounds alive
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   playerPos: {x:number,y:number,z:number},
 *   eyeInWater: boolean,
 *   inWater: boolean,
 *   mode: string,
 * }} playerState
 * @param {import('./world').VoxelWorld} world
 * @param {Array} hostileMobsArr
 * @param {number} seaLevelY
 */
export function updateAudio(playerState, world, hostileMobsArr, seaLevelY = 38) {
  if (!isReady()) return;

  const ctx = audioContext;
  const now = ctx.currentTime;

  if (playerState.mode !== "playing") return;

  const px = playerState.playerPos.x;
  const py = playerState.playerPos.y;
  const pz = playerState.playerPos.z;

  // --- Determine desired ambience type ---
  let desired = "none";
  if (playerState.eyeInWater || playerState.inWater) {
    desired = "water";
  } else if (py < seaLevelY - 4) {
    // Underground cave ambience when player is well below sea level
    desired = "cave";
  }

  // Play ambience sounds on a per-type interval
  if (desired !== "none") {
    const interval = desired === "water" ? 1.8 : 4.5;
    if (now - lastAmbienceAt >= interval) {
      lastAmbienceAt = now;
      ambienceType = desired;
      if (desired === "water") {
        playWaterAmbience();
      } else {
        playCaveAmbience();
      }
    }
  } else {
    ambienceType = "none";
  }

  // --- Mob-proximity growl ---
  if (Array.isArray(hostileMobsArr) && hostileMobsArr.length > 0) {
    const nowMs = now;
    if (nowMs - lastProximityGrowlAt >= GROWL_INTERVAL_SEC) {
      for (const mob of hostileMobsArr) {
        const dx = mob.pos.x - px;
        const dy = mob.pos.y - py;
        const dz = mob.pos.z - pz;
        if (dx * dx + dy * dy + dz * dz <= GROWL_DISTANCE_SQ) {
          playMobGrowl();
          lastProximityGrowlAt = nowMs;
          break;
        }
      }
    }
  }

  // --- Optional background music ---
  if (musicEnabled && now >= nextMusicAt) {
    playMusicNote();
  }
}
