# Performance profiling

Recorded on 24 and 25 November 2026 with `scripts/profile.mjs`.

## Environment

| Item | Value |
| --- | --- |
| Hardware | Apple M1, 8 cores, 8 GB RAM, macOS (Darwin 27.2.0, arm64) |
| Browser | Chromium 159.0.8154.6 via Playwright, headless, GPU through ANGLE Metal (`--use-angle=metal`) |
| Viewport | 1280 × 720 at DPR 1, plus one run at 1920 × 1080 at DPR 2 |
| Build | `npm run build:e2e`: the minified production bundle with test hooks enabled, served by `vite preview` |
| Balance | As noted per run. The 24 November runs predate the Normal preset and used the values that are now Hard. |

## Method

1. Seed the Options in `localStorage` (session length, spawn interval, difficulty), open the menu and start a match with a fixed seed.
2. Drive the ship with `scripts/autopilot.mjs`. Every 100 ms it reads the observation, decides which keys to hold and presses or releases them through Playwright's keyboard. The game runs on its real clock.
3. Record every ticker interval (`ticker.deltaMS`) while the match is running. Average FPS is `1000 / mean interval`. Percentiles come from the sorted samples.
4. Once per simulated second, log enemies, projectiles, live ship and projectile sprites, and active effects.
5. With `PROFILE_MIN_ACTIVE`, play matches back to back with consecutive seeds until the active time reaches the target, and aggregate every frame.
6. Return to the menu, force garbage collection twice through CDP and read `Performance.getMetrics`. Repeat start → play up to 20 s → exit, measuring after every cycle.

Raw data: `*.json` (summary, timeline per second, matches and cycles), `*-frame-intervals.json` (every frame interval in ms) and `*-end.png` (last frame of the first match).

## Results

| Run | Balance | Active time | Frames | Avg FPS | p95 | p99 | Max | > 20 ms | Enemies (avg / max) | Peak projectiles / effects |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stress-hard-spawn-1s-sustained` (seeds 1-8) | Hard, 1 s spawn | **190 s** over 8 matches | 11,382 | 60.0 | 16.7 ms | 16.8 ms | 16.8 ms | 0 | **6.0 / 12** | 7 / 38 |
| `session-180s-spawn-10s` (seed 1) | Hard values, 10 s spawn | **180 s**, one match (time up) | 10,798 | 60.0 | 16.7 ms | 16.8 ms | 33.4 ms | 1 | 0.4 / 1 | 3 / 20 |
| `session-180s-normal-spawn-3s` (seed 35) | Normal, 3 s spawn | 133.5 s (sunk, 38 points) | 7,996 | 59.96 | 16.7 ms | 16.8 ms | 100 ms | 2 | 1.5 / 4 | 4 / 16 |
| `session-180s-normal-spawn-3s-1080p-dpr2` (seed 35) | Normal, 3 s spawn, 1920 × 1080 at DPR 2 | 134.4 s (sunk, 39 points) | 8,047 | 59.97 | 16.7 ms | 16.8 ms | 100 ms | 1 | 1.9 / 4 | 4 / 24 |
| `session-180s-spawn-5s` (seed 27) | Hard values, 5 s spawn | 167.5 s (sunk, 31 points) | 10,042 | 60.0 | 16.8 ms | 16.8 ms | 33.3 ms | 1 | - / 3 | 3 / 20 |
| `stress-180s-spawn-1s` (seed 3) | Hard values, 1 s spawn | 21.3 s (sunk, 10 points) | 1,270 | 60.0 | 16.8 ms | 16.8 ms | 16.8 ms | 0 | - / 10 | 5 / 16 |

### What each run shows

- **Sustained heavy load.** The `stress-hard-spawn-1s-sustained` run kept the arena busy for 190 active seconds: 6 enemies on average and the 12-enemy cap reached. In 124 of the 195 logged seconds there were 6 or more enemies at once. No frame took longer than 16.8 ms. This is the main evidence that combat holds 60 FPS under load.
- **A full three-minute match.** `session-180s-spawn-10s` is the only single match that lasted the full 180 s. It is light (0.4 enemies on average, at most one), so it shows a complete match lifecycle rather than load.
- **GPU fill rate.** The 1080p DPR 2 run pushes about 4.5 times the pixels of the 1280 × 720 runs at the same frame rate.
- **Long frames.** Each Normal session had one 100 ms frame out of about 8,000. The heavy stress run had none, so this does not scale with entity count. It is most likely a garbage-collection or browser pause.

## Resources across start / play / exit cycles

Measured on the menu after a forced GC.

| Run | Baseline heap | After cycle 5 | After cycle 10 | After cycle 15 | Canvases | DOM nodes | JS listeners |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stress-hard-spawn-1s-sustained` (5 cycles, after 8 heavy matches) | 9.10 MB | 9.76 MB | - | - | 0 | 124 → 124 | 194 → 192 |
| `session-180s-normal-spawn-3s` (5 cycles) | 8.26 MB | 8.87 MB | - | - | 0 | 124 → 124 | 193 → 196 |
| `session-180s-spawn-10s` (5 cycles) | 8.22 MB | 8.73 MB | - | - | 0 | 124 → 124 | 191 → 191 |
| `stress-180s-spawn-1s` (15 cycles) | 8.01 MB | 9.00 MB | 9.69 MB | 9.77 MB | 0 | 124 → 124 | 194 → 193 |

### Findings

- After every exit the menu returns to zero canvases and to the same DOM node count; event listeners stay within ±3 of the baseline. Ticker, window and document listeners, the resize observer and the WebGL canvas are released.
- The heap grows by about 0.1–0.2 MB per cycle during the first ten cycles, then flattens (+0.08 MB across cycles 10–15). That fits one-time caches (compiled code, shader programs) rather than a continuous leak. A leak in per-match objects (sprites, effects, simulation state) would keep growing linearly.

## Limitations

- **No single high-load full-length match.** A player that survives three minutes is one that sinks enemies quickly, so concurrent load stays low. The heavy evidence therefore comes from consecutive matches. In the browser the scripted player sank at about 133 s in the busier Normal runs, even though the same seed survived in a headless simulation; deciding every 100 ms in real time changes the outcome.
- Single machine and browser. Headless Chromium with ANGLE Metal is not identical to a headed browser, and lower-end phones were not measured.
- Frame intervals measure main-thread cadence as seen by the Pixi ticker. GPU time is not measured separately.

## Reproduce

```bash
npm run build:e2e
PROFILE_DIFFICULTY=hard PROFILE_SPAWN=1 PROFILE_SEED=1 PROFILE_MIN_ACTIVE=180 PROFILE_NAME=stress-hard-spawn-1s-sustained npm run profile
PROFILE_DIFFICULTY=hard PROFILE_SPAWN=10 PROFILE_SEED=1 PROFILE_NAME=session-180s-spawn-10s npm run profile
PROFILE_DIFFICULTY=normal PROFILE_SPAWN=3 PROFILE_SEED=35 PROFILE_NAME=session-180s-normal-spawn-3s npm run profile
PROFILE_DIFFICULTY=normal PROFILE_SPAWN=3 PROFILE_SEED=35 PROFILE_CYCLES=0 PROFILE_WIDTH=1920 PROFILE_HEIGHT=1080 PROFILE_DPR=2 PROFILE_NAME=session-180s-normal-spawn-3s-1080p-dpr2 npm run profile
```

Options: `PROFILE_SECONDS` (match length, default 180), `PROFILE_SPAWN`, `PROFILE_DIFFICULTY` (`normal` or `hard`), `PROFILE_SEED`, `PROFILE_MIN_ACTIVE` (keep playing matches until this many active seconds), `PROFILE_CYCLES` (start/play/exit cycles, default 5), `PROFILE_WIDTH`, `PROFILE_HEIGHT`, `PROFILE_DPR`, `PROFILE_NAME`.
