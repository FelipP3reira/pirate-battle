# Pirate Battle

A single-player, top-down naval shooter for the browser. Sail between islands, sink Chasers and Shooters, and log your best battles in the Captain's Log.

Built with React, strict TypeScript and PixiJS. Ranking and match history come from REST APIs mocked with MSW and consumed through Axios and TanStack Query. Playwright covers end-to-end flows and visual regression.

- **Live build:** https://pirate-battle-orcin-nine.vercel.app (Vercel, deployed from `main`; the mock API runs in the browser through MSW)
- Original challenge brief: [docs/CHALLENGE.md](docs/CHALLENGE.md)
- Architecture and decisions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Test report: `reports/playwright/index.html` (open with `npx playwright show-report reports/playwright`)
- Profiling evidence: [reports/profiling/](reports/profiling/)

## Requirements

- Node.js 24 (see `.nvmrc`; any Node ≥ 22.12 works) and npm 11
- Chromium for Playwright (`npx playwright install chromium`)

No environment variables are needed for development or the production build. The only variable is `VITE_TEST_HOOKS`, which the `e2e` mode sets through the committed `.env.e2e` file to expose the test instrumentation described below. Production builds never include it.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install the exact dependency tree from the lockfile |
| `npm run dev` | Start the Vite dev server on http://localhost:5173 |
| `npm run build` | Type-check and build the optimized bundle into `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm run lint` | ESLint with type-aware rules |
| `npm run typecheck` | `tsc -b` in strict mode for app, tests and configs |
| `npm run e2e` | Build the test bundle, serve it on port 4180 and run every Playwright project |
| `npm run e2e:update` | Same, rewriting the visual baselines |
| `npx playwright show-report reports/playwright` | Open the HTML report |
| `npm run profile` | Run the 3-minute performance session and the five start/play/exit cycles (needs `npm run build:e2e`) |
| `npm run atlas` | Regenerate `public/atlas/*.json` from the supplied sprite sheets |

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail forward | `W` or `↑` | Left pad, up arrow |
| Turn left / right | `A` / `D` or `←` / `→` | Left pad, curved arrows |
| Bow cannon (one shot) | `Space` | Right pad, middle button |
| Port / starboard broadside (three parallel shots) | `Q` / `E` | Right pad, side buttons |
| Pause | `Esc` or `P` | Pause button in the HUD |

Movement and firing can be combined freely; the touch controls track every pointer independently, so steering and firing work at the same time. Game keys are only captured while a battle is running and not paused. The menu shows the same bindings.

**Mobile orientation:** landscape is the supported orientation. Portrait still works: the whole arena is fitted at the top and the touch pads move below it, with a hint to rotate the device.

## Gameplay configuration

All balance values live in [src/game/config.ts](src/game/config.ts) (`NORMAL_BALANCE` and `HARD_BALANCE`). Systems read them from the match snapshot, so tuning never requires touching logic. Each match copies the full configuration when it starts; changing Options mid-battle only affects the next one.

Options exposed to the player (persisted under `pirate-battle:settings:v1`):

| Option | Default | Limits |
| --- | --- | --- |
| Game session time | 120 s | 60–180 s, whole seconds |
| Enemy spawn time | 3 s | 1–10 s, whole seconds |
| Difficulty | Normal | Normal or Hard |

Balance (world units are pixels of the 1792 × 1024 arena, time in seconds). Values are for **Hard**; **Normal** changes only the entries listed after the table:

| Entity | Values |
| --- | --- |
| Player | 100 health, 165 speed, 240 acceleration, 180 deceleration, 2.4 rad/s turn |
| Bow cannon | 20 damage, 0.4 s cooldown, 560 speed, 560 range |
| Broadside (each side) | 3 shots × 20 damage, 26 spacing, 1.2 s cooldown, 480 speed, 400 range |
| Chaser | 40 health, 140 speed, 1.9 rad/s turn, 20 ramming damage, explodes on impact (no point) |
| Shooter | 60 health, 105 speed, 1.6 rad/s turn, holds at 300, fires within 420 when aimed within 0.15 rad, 8 damage, 2.4 s cooldown |
| Spawns | First two are one Chaser then one Shooter; afterwards 55 % Chaser / 45 % Shooter. Spawn points sit on the arena rim, at least 520 from the player and 110 from other ships. At most 12 enemies alive at once. |

**Normal** differs from Hard only here: player health 130; Chaser speed 125 and ramming damage 15; Shooter damage 6, cooldown 2.8 s and aim tolerance 0.12 rad; at most 8 enemies alive at once. The difficulty is part of the match configuration, so each difficulty has its own ranking.

Each enemy destroyed by the player's cannons scores one point.

## Network scenarios (MSW)

The mock API runs in the browser through a service worker in development, tests and the deployed build. Confirmed records and pending submissions persist in `localStorage`, so they survive refresh.

**Select a scenario** with the **Network** button in the bottom-left corner of every menu screen, or open the app with `?scenario=<id>` (for example `/?scenario=offline-at-finish`). **Reset data** in the same dialog restores the seeded state: it clears confirmed records, pending saves, the last result, the Query cache and the scenario. Your settings and player identity are kept.

| Scenario id | Behavior |
| --- | --- |
| `normal` | Seeded captains, 120 ms responses |
| `empty` | No seeded records |
| `many-pages` | 60 extra records in the default cohort (15 pages) |
| `slow` | Every request waits 2.5 s |
| `variable-latency` | Seeded delays between 150 ms and 2.2 s |
| `out-of-order` | Odd reads answer after 2.4 s, even reads after 200 ms |
| `timeout` | Requests answer after the 4 s client timeout; registrations are not stored |
| `connection-lost` | Network error on every request |
| `client-error` | Reads answer 400, registrations 422 |
| `server-error` | Every request answers 503 |
| `ranking-down` / `history-down` | Only that read fails with 500 |
| `commit-then-timeout` | The first registration is stored, but its response arrives after the client timeout |
| `offline-at-finish` | Registrations fail before storage until you switch back to `normal` |

### Reproducing the failure cases

1. **Lost acknowledgment:** select *Lost acknowledgment*, play until the battle ends. The result shows *Saving…* while the first request times out, then the automatic retry receives the stored record (HTTP 200) and shows *Saved*. Both tabs list the match once.
2. **Outage at the finish:** select *Offline at finish* and finish a battle. The result shows *Not saved yet* with **Retry save**. Reload: the result and the pending save are still there, and the menu says a battle is waiting. Start another battle to confirm the game stays playable. Switch back to *Normal*: the pending save is sent on the next load or with **Retry save**, and it appears once in each tab.
3. **Stale responses:** select *Out-of-order responses*, open Ranking and page forward and back quickly. The slow response for an abandoned page never replaces the page on screen.
4. **Read failures:** select *Ranking unavailable*, *HTTP 5xx* or *Connection lost* and open the Captain's Log. Each tab shows its own error with **Try again**; Play and Options keep working.

## Test instrumentation

Builds made with `--mode e2e` expose `window.__pirateBattle`. Tests use it to:

- seed the next match (`seed`, starting positions of the player and enemies),
- switch to a manual clock and advance simulated time,
- read an observation of the simulation, renderer and input state.

It never applies damage, points, winners or API results. Combat tests press real keys or dispatch real touch events, and the rules, collisions and renderer run unchanged.

## Testing

`npm run e2e` runs 13 spec files (the 12 required flows plus visual regression) in two projects: **desktop-chromium** (1280 × 720, DPR 1) and **mobile-chromium** (Pixel 7 landscape, touch). Every test starts in a fresh browser context. The HTML report, JSON results and failure traces go to `reports/playwright/` and `test-results/`.

| # | Flow | Spec |
| --- | --- | --- |
| 1 | Options navigation, validation and persistence | `tests/e2e/01-options.spec.ts` |
| 2 | Asset loading, failure and retry | `tests/e2e/02-assets.spec.ts` |
| 3 | Start, movement, rotation, arena limits, islands | `tests/e2e/03-movement.spec.ts` |
| 4 | Bow and broadside fire, damage, cooldowns, score | `tests/e2e/04-combat.spec.ts` |
| 5 | Chaser and Shooter behavior, spawn interval | `tests/e2e/05-enemies.spec.ts` |
| 6 | Time and death endings, frozen simulation, clean restart | `tests/e2e/06-match-end.spec.ts` |
| 7 | Pause, focus loss, hidden tab, explicit resume | `tests/e2e/07-pause.spec.ts` |
| 8 | Result screen and persistence after refresh | `tests/e2e/08-result.spec.ts` |
| 9 | Abandonment, repeated navigation, touch controls | `tests/e2e/09-abandon-navigation-touch.spec.ts` |
| 10 | Ranking and history paging, loading, empty, error | `tests/e2e/10-captains-log.spec.ts` |
| 11 | Registration, both tabs updated, pending recovery after refresh | `tests/e2e/11-registration.spec.ts` |
| 12 | Retry after timeout without duplicates, stale responses | `tests/e2e/12-idempotency-and-races.spec.ts` |
| — | Visual baselines: menu, arena, result | `tests/e2e/13-visual.spec.ts` |

Visual baselines are versioned in `tests/e2e/__screenshots__/` and were generated on macOS. Fonts differ between operating systems, so regenerate them with `npm run e2e:update` on another OS.

## Performance

See [reports/profiling/README.md](reports/profiling/README.md) for the method, environment, raw samples and findings.

## Assets and licenses

- Game art, UI atlas, sounds and the Jungle Gaming logo come from the challenge repository ([junglegaming/game-developer-challenge](https://github.com/junglegaming/game-developer-challenge/tree/315891441be81ca0bff75cf3c2b0cd2f27f119cd/assets)) and are used as supplied.
- `public/atlas/ships.json` and `public/atlas/tiles.json` are generated from the supplied sheets by `scripts/build-atlases.mjs`; they contain frame coordinates only.
- No third-party art, fonts or sounds were added. Text uses system fonts (Arial and Trebuchet MS stacks).

## Known limitations

- Visual baselines depend on the operating system's fonts.
- The GPU flags in `playwright.config.ts` target macOS (ANGLE Metal); other platforms fall back to their default renderer.
- Islands use the supplied fixed-size blocks; the grass island shows the faint seams present in the source art.
- Audio starts after the first click or tap, as browsers require.
