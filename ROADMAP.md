# ExoCraft Roadmap

Goal: a feature-complete, clean-room voxel sandbox that plays like Minecraft from the
player's perspective, built entirely from **original code and original procedural assets**
(user-provided resource packs supported later — never bundled third-party assets).

Working method: one PR-sized **wave** at a time. Every wave builds green, extends the
headless regression suite (`scripts/redstone_smoke.mjs` + hook-driven probes), gets
adversarial review on risky areas (mesher/shader = blank-world lens), and is documented
in `progress.md`. Never leave the project broken.

Legend: ✅ done · 🟡 partial (works, known gaps listed) · ⬜ not started

---

## 1. Current status by system

### Foundation & world
| System | Status | Notes / gaps |
|---|---|---|
| Procedural terrain (FBM + ridged mountains) | ✅ | 5 biomes, beaches, sea level |
| Chunk streaming + memory eviction | ✅ | Horizontal "infinite"; height fixed at 112 |
| Save/load (seed + edits + entities + state) | ✅ | v11 schema, forward-defaulting discipline |
| Caves, depth-banded ores, lava pools | ✅ | coal → iron → gold/redstone → diamond ladder |
| Block states | 🟡 | Encoded in block ids (doors, redstone…) — works well; a metadata layer only if id space (≤255) runs out |
| Lighting engine (skylight + blocklight BFS, AO) | ✅ | Emitter removal / opaque-block placement near a chunk seam does a fixpoint regional relight (Wave L1) — no more ghost light |
| Day/night, moon phases, sunrise/sunset | ✅ | |
| Weather (biome rain/snow) | ✅ | No thunder/lightning |
| Flowing water & lava + buckets | ✅ | No obsidian interaction yet (water+lava → cobblestone) |
| Structures | 🟡 | Rare loot huts only — no villages, dungeons, mineshafts |
| Dimensions & portals | ⬜ | No Nether/End equivalents |

### Redstone & machines
| System | Status | Notes / gaps |
|---|---|---|
| Wire (0–15 analog), lever, button, plate | ✅ | Floor-mounted only (no wall mounting) |
| Redstone torch (inverter, clocks, burnout) | ✅ | |
| Lamp (real baked light), redstone block | ✅ | |
| Repeater (1–4 tick delay, signal refresh) | ✅ | No locking (side-input latch) |
| Comparator (compare/subtract, analog) | ✅ | Reads container fullness (chest/hopper/furnace/dispenser) |
| Pistons (+ sticky) | ✅ | 6 facings, 12-block push, sticky pull, burnout guard; no slime-chain physics |
| Hoppers | ✅ | Pull/push/vacuum, lock-when-powered, comparator container reads |
| Dispenser/dropper + observer | ✅ | 9-slot edge-triggered ejectors (throw or feed containers); observer change-pulse with burnout guard |
| Note blocks, TNT-as-circuit-output | ⬜ | Later redstone polish |

### Gameplay & survival
| System | Status | Notes / gaps |
|---|---|---|
| Health, hunger, saturation, regen, starvation | ✅ | |
| Tools, tiers, durability, harvest gating | ✅ | |
| Armor (3 tiers × 4 slots) | ✅ | |
| Crafting (3×3 shaped + shapeless), furnace, chests | ✅ | |
| Farming (wheat, breeding), shears/wool, beds | ✅ | Single-crop; add carrots/potatoes later |
| Combat (melee, knockback, cooldown, bow) | 🟡 | No crits, shields, or sweeping |
| XP orbs, levels | ✅ | XP is not yet *spent* on anything (→ enchanting) |
| Item entities (drops, toss, merge) | ✅ | |
| Enchanting | ⬜ | Table + XP cost + a starter set (Sharpness/Protection/Efficiency/Unbreaking) |
| Brewing / potions & status effects | ⬜ | Needs a status-effect framework first |
| Villagers & trading | ⬜ | Needs villages + AI/pathfinding upgrades |

### Mobs & AI
| System | Status | Notes / gaps |
|---|---|---|
| Hostiles: zombie, skeleton, creeper, spider | ✅ | Caps, despawn rules, drops |
| Passives: cow, pig, sheep, chicken (+breeding) | ✅ | |
| Mob animation, hurt/death, head tracking | ✅ | |
| AI | 🟡 | Wander/chase/hazard-avoid + step-up only — no real pathfinding (A*), no line-of-sight stalking |
| More mobs (enderman-like, slime, boss?) | ⬜ | After pathfinding |

### Rendering & performance
| System | Status | Notes / gaps |
|---|---|---|
| Merged chunk meshes, AO, per-vertex light shader | ✅ | The "blank-world risk zone" — always adversarially reviewed |
| Post-processing (ACES, bloom, FXAA), viewmodel | ✅ | |
| Water/leaf/flora animation (wind, waves) | ✅ | |
| Stutter elimination (budgeted remesh, no-alloc hot paths) | ✅ | |
| Frustum culling | 🟡 | Per-mesh (three.js built-in); fine at current radii |
| Greedy meshing | ⬜ | Big vertex-count win; large mesher rewrite — do with worker offload |
| Web-worker chunk gen/meshing | ⬜ | Removes the last main-thread world hitches |
| Shadows (sun shadow map) | ⬜ | Optional graphics setting |
| Configurable graphics (clouds, bloom, particles toggles) | 🟡 | Only FOV/render distance so far |

### UI, audio, input
| System | Status | Notes / gaps |
|---|---|---|
| Pixel UI, hotbar, hearts/hunger/XP/armor, F3 | ✅ | |
| Item pixel-art icons everywhere + held sprites | ✅ | |
| Death screen, pause menu, settings (persisted) | ✅ | |
| Inventory interactions | 🟡 | Click-click transfer, shift-click quick-move (U1), hover tooltips (U2); still needs drag & drop |
| Audio | 🟡 | Procedural SFX + music toggle + master volume; needs positional (3D) audio, biome ambience beds, sound categories, subtitles |
| Controller/gamepad support | ⬜ | Gamepad API mapping + UI focus model |
| Mobile/touch | ⬜ | Stretch goal |

### Platform
| System | Status | Notes / gaps |
|---|---|---|
| Resource-pack loading | ⬜ | Load user-provided Minecraft-format packs (zip: pack.mcmeta, textures) over the procedural atlas; never bundle assets |
| Multiplayer networking | ⬜ | Biggest architectural wave — see phase 6 |
| Server authority | ⬜ | Comes with multiplayer design |
| Modding API | ⬜ | Registries already data-shaped; expose + document + sandbox |
| Save compatibility | 🟡 | Forward-defaults hold old→new; new→old normalizes unknown ids to air (documented) |

---

## 2. Planned waves (dependency order)

### Phase A — machines (finish the redstone arc)
1. **Pistons** — normal + sticky; push limit ~12; moves block ids + their edits;
   piston head partial geometry; can't move bedrock/containers; interacts with
   attached components (pops them). High mesher risk → full review treatment.
2. **Hoppers** — 5-slot container, pulls from above / pushes to facing; hopper
   minecart later; comparator reads container fullness (closes the R2 gap).
3. **Dispenser/dropper + observer** — circuit outputs; observer completes the
   "detect change" primitive. ✅ (Wave R5)

### Phase B — depth systems
4. **Lighting fix wave** — seam ghost-light: relight-to-fixpoint over the affected
   3×3 (or a light-removal BFS). Verify with `getLightAt` probes at seams. ✅ (Wave L1)
5. **Enchanting** — table block, XP-level costs, lapis stand-in (use gold?),
   enchantment data on item instances (extends durability field pattern),
   starter enchants: Efficiency, Unbreaking, Sharpness, Protection, Power.
6. **Status effects + brewing** — effect framework (speed/slow/regen/poison…),
   brewing stand, nether-wart stand-in crop, potion items + drinking.
7. **Inventory UX** — drag & drop, shift-click quick-move, hover tooltips
   (name + enchants), number-key slot swap inside panels. 🟡 shift-click (U1) + tooltips (U2) done.

### Phase C — world expansion
8. **Structures wave** — villages (small: houses + farms + well), dungeons with
   spawner + loot chests, abandoned mineshafts in caves.
9. **AI/pathfinding** — grid A* with jump/fall costs for mobs; villagers walk
   paths; hostiles navigate around hazards; leash-range behaviors.
10. **Villagers & trading** — professions, trade UI (emerald stand-in currency),
    restocking; ties into village structures.
11. **New mobs** — 2–3 more hostiles (teleporter, slime with splitting), 1–2
    neutral (wolf-like tameable?); boss as a capstone later.
12. **Dimensions & portals** — a "hollow world" (nether-like: lava seas, new
    blocks/ores) reached via a built portal frame; separate chunk store + save
    section; dimension-aware lighting palette.

### Phase D — platform & polish
13. **Resource packs** — async loader for user-provided packs (zip), texture
    override of the procedural atlas by name mapping, pack.mcmeta parsing,
    graceful fallback; groundwork for sounds too.
14. **Audio wave** — WebAudio panner-based positional SFX, biome ambience beds,
    sound categories with per-category sliders, optional subtitles feed.
15. **Controller support** — Gamepad API: movement/look/interact bindings, UI
    focus navigation, rebinding screen in settings.
16. **Graphics options wave** — clouds/bloom/particle-density/fancy-leaves
    toggles, optional sun shadow map, brightness (gamma) slider.

### Phase E — performance at scale
17. **Web-worker chunk pipeline** — generation + light + meshing off the main
    thread (transferable buffers); removes remaining hitches at high radii.
18. **Greedy meshing** — merged coplanar faces (with the AO/light seams handled);
    combined with 17, raises max render distance substantially.
19. **BVH / broadphase raycast** — replace per-triangle raycasts if profiling
    still shows cost after 17–18.

### Phase F — multiplayer (largest arc, its own design doc when started)
20. **Netcode foundations** — deterministic tick audit, world-delta protocol
    (edits + entity snapshots), WebSocket server (Node) reusing the sim modules.
21. **Server authority** — server-side world + validation, client prediction +
    reconciliation for movement, authoritative inventory/combat.
22. **Multiplayer polish** — player avatars/skins, chat, per-player saves,
    interest management (chunk subscriptions).

### Phase G — modding
23. **Modding API v1** — stable registries (blocks/items/recipes/mobs already
    data-driven), event hooks (tick, block change, interact), sandboxed JS mod
    loading, docs + example mod.

---

## 3. Standing engineering rules

- Clean-room only: original code, original procedural art/audio; user-supplied
  resource packs are loaded at runtime, never redistributed.
- Every wave: `npm run build` green + smoke suite green before commit.
- Mesher/shader changes always get the dedicated blank-world review lens.
- Determinism is sacred: no wall-clock/Math.random in sim paths; everything
  steps through `advanceTime` for tests.
- Save changes must forward-default (old saves load) and be documented when
  they are lossy backward.
- Id space: 214/255 used (0-213). If a wave would push past ~230, do the metadata-layer
  refactor first (per-chunk aux array) instead of minting more state ids.
