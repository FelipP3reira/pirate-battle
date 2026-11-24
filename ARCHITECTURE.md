# Pirate Battle architecture

## Layers

| Location | Responsibility |
| --- | --- |
| `src/game/` | Pure rules: configuration, arena, collisions, movement, combat, enemy behavior, spawning and the fixed-step `Simulation`. No DOM, Pixi or React imports. |
| `src/input/` | Key bindings and `InputController`, which turns keys and pointer ids into held `PlayerCommands`. |
| `src/render/` | Texture library, `GameRenderer` (Pixi application, layers, viewport fitting), `ShipView` with health bars, and the effect layer. |
| `src/audio/` | Web Audio playback of the supplied WAV files. |
| `src/session/GameSession.ts` | Owns one match: creates the simulation, mounts the renderer, drives the ticker, handles pause, focus loss and resize, and publishes HUD snapshots. |
| `src/ui/`, `src/app/` | React screens, hash routes, focus handling and the HUD. |
| `src/data/` | REST contracts, Axios client, TanStack Query hooks, local persistence and the pending-save store. |
| `src/mocks/` | MSW handlers, seeded fixtures, persisted mock database and network scenarios. |
| `src/testing/hooks.ts` | Test-only instrumentation, compiled in only when `VITE_TEST_HOOKS=true`. |

Data flows one way during a battle: input → `Simulation.advance` → events and entity state → renderer and audio. React never sees per-frame state.

## Simulation loop

- **Fixed step.** `Simulation.advance(seconds, commands)` accumulates active time and runs 60 Hz steps (`FIXED_STEP = 1/60`). Movement, cooldowns, projectile travel, spawns and the match clock all use the step duration, so results do not depend on frame rate. The same inputs produce the same match whether time arrives as one 1.5 s slice or 90 small ones; test 3 checks this.
- **Spiral guard.** At most 15 steps run per call. If a frame is later than 250 ms, the extra time is dropped: the game slows down instead of freezing.
- **Step order.** Player steering and island resolution → player weapons → enemy cooldowns and decisions → ship contacts (Chaser rams and separation) → projectiles → clock and spawns → end check. Elapsed time is `steps × FIXED_STEP`, which avoids floating-point drift at the deadline.
- **Ending.** When health reaches zero the reason is `destroyed`; otherwise reaching the configured duration gives `time-up`. Death is checked first, so if lethal damage and time expiry happen in the same step, the match counts as a defeat. Ending clears projectiles, publishes one `ended` event and makes every later `advance` a no-op. Movement, attacks, damage, spawns and scoring all stop.
- **Interpolation.** Ships and projectiles keep their previous position. The renderer interpolates with `simulation.interpolation`, so motion stays smooth on 90/120 Hz displays without changing the rules.
- **Determinism.** The spawn director uses a seeded `mulberry32` generator. A new match gets a random seed; tests pass a fixed one.

## Movement and collisions

- Ships move forward only. Turning changes heading at `turnRate`, and speed approaches its target using acceleration or deceleration.
- **Hull shape.** Each hull is a capsule: a segment of ±`hullHalfLength` along the heading with radius `hullRadius`, which follows the elongated sprite better than a single circle.
- **Islands.** Each island collider is a rounded rectangle inset from its tiles. Three circles along the hull (bow, center, stern) are pushed out of every collider (up to 3 passes), and speed is capped while scraping a coast. The arena edge is enforced the same way, so ships can never leave the visible arena.
- **Ship contacts.** A Chaser touching the player applies its ramming damage once, is destroyed and scores nothing. Other overlapping ships are pushed apart, then re-resolved against islands.
- **Projectiles.** Each step tests a swept segment against ship capsules, so fast shots cannot tunnel. Player shots only hit enemies and enemy shots only hit the player. A shot is removed on its first hit, on an island, outside the arena or when its range is used up. Destroyed enemies leave the entity list immediately, so they stop moving, firing and colliding.

## Enemy behavior

- **Chaser.** Steers towards the player's predicted position (0.35 s lead) and slows on sharp turns.
- **Shooter.** Approaches until it is within its preferred range and has line of sight, then slows and turns to face the player. It fires its bow cannon only when the target is in range, aligned within `aimTolerance` and not behind an island.
- **Avoidance.** Both types probe ahead for islands and the arena edge and try alternative headings (±0.45 rad steps). Collision resolution is the final guarantee.
- **Spawns.** Enemies spawn every `spawnSeconds` from rim points that are at least 520 from the player and clear of other ships. The opening sequence (Chaser, then Shooter) guarantees both types in a standard match. When all points are blocked or 12 enemies are alive, the spawn waits and retries without building a burst.

## React and Pixi integration

- `CombatScreen` loads textures, then creates a `GameSession` inside an effect keyed by the match. `GameSession.mount` awaits `Application.init`. If the effect was cleaned up meanwhile (React Strict Mode mounts, cleans up and mounts again), the late application is destroyed before its canvas is attached. Test 9 checks that repeated navigation keeps a single canvas.
- **HUD.** The HUD subscribes with `useSyncExternalStore`. The session publishes only when score, health, displayed second or phase changes, so React renders a few times per second at most. A visually hidden polite live region announces phase changes, score changes, health thresholds and the 60/30/10-second marks.
- **Viewport.** The canvas fills its host. A `ResizeObserver` resizes the renderer at `min(devicePixelRatio, 2)` and fits the 1792 × 1024 world with one uniform scale, centred, so the full arena is always visible. The water keeps tiling into the letterbox, with a shade that marks the arena edge. Touch controls are DOM buttons, so they need no coordinate conversion; the world size and physics never change on resize.
- **Pause.** Manual (`Esc`, `P` or the HUD button), window blur and a hidden tab all pause. Pausing stops the ticker, clears held input and discards accumulated time, and the audio context is suspended. Only the Resume button resumes; then accumulated time is discarded again and focus returns to the arena, so nothing from the paused period carries over. Key repeats are ignored, so a key held through the pause must be pressed again.

## Resource ownership

- **Textures.** `textureLibrary` loads the three atlases once (`Assets.load` with progress) and owns them for the page lifetime; every match reuses them. A failed load unloads partial entries so **Try Again** fetches again. Combat is not created until all atlases are ready.
- **Renderer.** `GameRenderer` owns its `Application`, ticker, sprites, pooled projectile sprites, effect displays, cropped health-bar textures and the baked island texture. The islands are pre-rendered once at 1:1 scale into a single texture, which prevents seams from scaling and saves draw calls. `destroy()` releases all of them and destroys the app with `texture: false` so the shared atlases survive.
- **Session.** `GameSession.dispose()` disconnects the resize observer, removes window and document listeners, detaches input, stops audio loops and destroys the renderer. Leaving combat, Play Again and reload all go through it. The five-cycle memory check in `reports/profiling/` verifies this.

## Persistence

| Key | Contents |
| --- | --- |
| `pirate-battle:settings:v1` | Validated Options (whole seconds within limits; invalid stored values fall back to defaults) |
| `pirate-battle:player:v1` | Generated player id and captain name |
| `pirate-battle:matches:v1` | `lastResult`, the `pending` registration queue and recently saved ids |
| `pirate-battle:mock-db:v1` | Records confirmed by the mock server |
| `pirate-battle:scenario:v1` | Selected network scenario |

- **Completed matches.** When a match ends, the record is written to `lastResult` and `pending` in a single write before any HTTP request, so a refresh at any moment keeps it.
- **Abandoned matches.** Abandoning (Main Menu from pause, back navigation or reload on `#/play`) creates no record. A reload on `#/play` is redirected to the menu before React mounts.

## Ranking and history

### Contracts (`src/data/contracts.ts`)

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/matches` | `MatchRecord` (+ `Idempotency-Key: matchId`) | 201 on first commit; 200 with the stored record on an identical replay; 409 for a different payload under the same id; 400 for invalid records |
| `GET /api/ranking` | `configKey`, `page`, `pageSize` | `RankingPage`: entries filtered by configuration, sorted by score desc, `completedAt` asc, `matchId` asc, with absolute `rank` |
| `GET /api/history` | `playerId`, `page`, `pageSize` | `HistoryPage`: newest first, then `matchId` |

- **Records.** A `MatchRecord` carries the match id (UUID allocated at start), player id and name, start and completion times (UTC ISO), score, effective active duration, end reason, the full configuration snapshot and its `configKey`.
- **Configuration key.** `configKey` hashes a canonical serialization of the entire configuration (including `rulesVersion`). The ranking therefore compares only matches played with identical rules. Its subtitle names the cohort the player is currently configured for.
- **Mock data.** Fixtures are generated deterministically for three cohorts. The mock server derives both lists from one record store, which keeps the tabs consistent.

### Client behavior

- **Queries.** Query keys contain every filter and page parameter, and the AbortSignal is passed to Axios. Lists keep the previous page while the next one loads (`keepPreviousData`, shown dimmed). Tabs refetch whenever they are shown (`refetchOnMount: 'always'`) and on window focus. Each tab has its own loading, empty and error state, plus a background-refresh status line.
- **Stale responses.** A slow response cannot overwrite newer data. Responses land under their own key, and navigating or invalidating cancels the in-flight request. Test 12 checks this with the out-of-order scenario.
- **Retries.** Timeouts, network errors, 429 and 5xx are retried twice with exponential backoff. Other 4xx responses surface immediately.
- **Registration.** `useMatchRegistration` lives at the app root. Mutations run in one serial scope, and a store-level in-flight guard stops repeated clicks from starting parallel posts. On success, the id leaves `pending`; on failure, the error is shown with **Retry save**. Both outcomes invalidate the ranking and history queries.
- **Recovery.** Every pending record is re-sent on app start. Because the server is idempotent on `matchId`, a retry after a lost acknowledgment returns the stored record instead of creating a second one.
- **Failure isolation.** API failures never block Play, Options or a running battle. A new match can start while older registrations are still pending.

## Balance decisions

- **Defaults.** The arena (28 × 16 tiles of 64 px) fits the supplied tiles exactly and matches the proportions of `assets/sample.png`. Defaults follow the sample screens (120 s battles, 3 s spawn interval). Spawn interval limits of 1–10 s keep pacing readable while staying positive.
- **Difficulty.** Shooter damage and fire rate were lowered after headless runs: a scripted player that aims and dodges (`scripts/autopilot.mjs`) averaged about 19 points but did not survive the full default 120 s match against an ever-growing fleet. It survived 180 s matches at 7–10 s spawn intervals in most seeds. The default is intentionally hard; dying early ends the match with its score.
- **Enemy cap.** Concurrent enemies are capped at 12 so the arena stays readable on phones; spawns resume as soon as one is destroyed.

## Limitations

- Islands are axis-aligned blocks taken from the supplied tile set. The grass block shows the faint seams present in the source art.
- Enemy avoidance is local (probe-based), so a ship can briefly scrape a coast before sliding around it.
- Visual baselines are platform-dependent because of system fonts.
- Profiling ran on a single machine (see `reports/profiling/`). Lower-end phones were not measured.
