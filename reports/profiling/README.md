# Performance profiling

Recorded on 24 November 2026 with `scripts/profile.mjs`.

## Environment

| Item | Value |
| --- | --- |
| Hardware | Apple M1, 8 cores, 8 GB RAM, macOS (Darwin 27.2.0, arm64) |
| Browser | Chromium 159.0.8154.6 via Playwright, headless, GPU through ANGLE Metal (`--use-angle=metal`) |
| Viewport | 1280 × 720, device scale factor 1 |
| Build | `npm run build:e2e`: the minified production bundle with test hooks enabled, served by `vite preview` |
| Balance | Hard values from `src/game/config.ts`. These runs happened before the Normal preset existed; Hard has more and stronger enemies, so it is the heavier case. |

## Method

1. Seed the Options in `localStorage` (session length and spawn interval), open the menu and start a match with a fixed seed.
2. Drive the ship with `scripts/autopilot.mjs`. Every 100 ms it reads the observation, decides which keys to hold and presses or releases them through Playwright's keyboard. The game runs on its real clock.
3. Record every ticker interval (`ticker.deltaMS`) while the match is running. Average FPS is `1000 / mean interval`. Percentiles come from the sorted samples.
4. Once per simulated second, log enemies, projectiles, live ship and projectile sprites, and active effects.
5. Return to the menu, force garbage collection twice through CDP and read `Performance.getMetrics`. Repeat start → play up to 20 s → exit, measuring after every cycle.

Raw data: `*.json` (summary, timeline and cycles), `*-frame-intervals.json` (every frame interval in ms) and `*-end.png` (last frame).

## Results

| Run | Active time | Frames | Avg FPS | p50 | p95 | p99 | Max | > 20 ms | Peak enemies / projectiles / effects |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `session-180s-spawn-10s` (seed 1) | **180 s** (time up, 15 points) | 10,798 | 60.0 | 16.7 ms | 16.7 ms | 16.8 ms | 33.4 ms | 1 | 1 / 3 / 20 |
| `session-180s-spawn-5s` (seed 27) | 167.5 s (sunk, 31 points) | 10,042 | 60.0 | 16.7 ms | 16.8 ms | 16.8 ms | 33.3 ms | 1 | 3 / 3 / 20 |
| `stress-180s-spawn-1s` (seed 3) | 21.3 s (sunk, 10 points) | 1,270 | 60.0 | 16.7 ms | 16.8 ms | 16.8 ms | 16.8 ms | 0 | 10 / 5 / 16 |

The 60 FPS target was met in all runs. The single long frame in each long session is one 33 ms interval, i.e. one dropped frame.

## Resources across start / play / exit cycles

Measured on the menu after a forced GC.

| Run | Baseline heap | After cycle 5 | After cycle 10 | After cycle 15 | Canvases | DOM nodes | JS listeners |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `session-180s-spawn-10s` (5 cycles) | 8.22 MB | 8.73 MB | — | — | 0 | 124 → 124 | 191 → 191 |
| `session-180s-spawn-5s` (5 cycles) | 8.28 MB | 8.82 MB | — | — | 0 | 124 → 124 | 193 → 192 |
| `stress-180s-spawn-1s` (15 cycles) | 8.01 MB | 9.00 MB | 9.69 MB | 9.77 MB | 0 | 124 → 124 | 194 → 193 |

### Findings

- After every exit the menu returns to zero canvases and to the same DOM node and event listener counts. Ticker, window and document listeners, the resize observer and the WebGL canvas are all released.
- The heap grows by about 0.1–0.2 MB per cycle during the first ten cycles, then flattens: +0.08 MB across cycles 10–15. That fits one-time caches (compiled code and shader programs) rather than a continuous leak. A leak in per-match objects such as sprites, effects or simulation state would keep growing linearly.
- The heap during a match is only about 0.3 MB above the menu value. The atlases are shared and loaded once, and match objects are small.

## Limitations

- Single machine and browser. Headless Chromium with ANGLE Metal is not identical to a headed browser, and lower-end phones were not measured.
- The scripted player does not survive long under heavy spawn rates, so the 180-second run has light enemy traffic. The stress run covers high entity counts, but only for 21 seconds.
- Frame intervals measure main-thread cadence as seen by the Pixi ticker. GPU time is not measured separately.

## Reproduce

```bash
npm run build:e2e
npm run profile                                   # 180 s, spawn 5 s, seed 27, 5 cycles
PROFILE_SPAWN=10 PROFILE_SEED=1 npm run profile
PROFILE_SPAWN=1 PROFILE_SEED=3 PROFILE_CYCLES=15 PROFILE_NAME=stress-180s-spawn-1s npm run profile
```
