import type { SimulationSetup } from '../game/types';
import type { GameSession } from '../session/GameSession';

export const TEST_HOOKS_ENABLED = import.meta.env.VITE_TEST_HOOKS === 'true';

interface MatchOverrides {
  seed?: number;
  setup?: SimulationSetup;
  manualClock?: boolean;
}

interface ShipObservation {
  id: number;
  kind: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  health: number;
  maxHealth: number;
}

export interface Observation {
  phase: string;
  simulationPhase: string;
  elapsed: number;
  remaining: number;
  score: number;
  steps: number;
  seed: number;
  spawned: number;
  player: ShipObservation;
  enemies: ShipObservation[];
  projectiles: Array<{ id: number; faction: string; x: number; y: number; vx: number; vy: number }>;
  cooldowns: { front: number; left: number; right: number };
  display: { ships: number; projectiles: number; effects: number } | null;
  viewport: { scale: number; offsetX: number; offsetY: number; width: number; height: number } | null;
  canvasCount: number;
  activePointers: number;
  inputEnabled: boolean;
}

export interface TestApi {
  configureNextMatch(overrides: MatchOverrides): void;
  observe(): Observation | null;
  setManualClock(manual: boolean): void;
  advance(milliseconds: number): number;
  frameSamples(): number[];
  resetFrameSamples(): void;
}

let current: GameSession | null = null;
let nextOverrides: MatchOverrides = {};

function observeShip(ship: GameSession['simulation']['player']): ShipObservation {
  return {
    id: ship.id,
    kind: ship.kind,
    x: ship.x,
    y: ship.y,
    angle: ship.angle,
    speed: ship.speed,
    health: ship.health,
    maxHealth: ship.hull.maxHealth,
  };
}

export function registerSession(session: GameSession | null): void {
  if (!TEST_HOOKS_ENABLED) return;
  current = session;
}

export function takeMatchOverrides(): MatchOverrides {
  if (!TEST_HOOKS_ENABLED) return {};
  const overrides = nextOverrides;
  nextOverrides = { ...(overrides.manualClock !== undefined ? { manualClock: overrides.manualClock } : {}) };
  return overrides;
}

export function installTestApi(): void {
  if (!TEST_HOOKS_ENABLED) return;
  const api: TestApi = {
    configureNextMatch(overrides) {
      nextOverrides = { ...overrides };
    },
    observe() {
      if (!current) return null;
      const simulation = current.simulation;
      const hud = current.getSnapshot();
      return {
        phase: hud.phase,
        simulationPhase: simulation.phase,
        elapsed: simulation.elapsed,
        remaining: simulation.remaining,
        score: simulation.score,
        steps: simulation.steps,
        seed: simulation.seed,
        spawned: simulation.spawnedCount,
        player: observeShip(simulation.player),
        enemies: simulation.enemies.map(observeShip),
        projectiles: simulation.projectiles.map((projectile) => ({
          id: projectile.id,
          faction: projectile.faction,
          x: projectile.x,
          y: projectile.y,
          vx: projectile.vx,
          vy: projectile.vy,
        })),
        cooldowns: { ...simulation.player.cooldowns },
        display: current.displayCounts,
        viewport: current.viewport,
        canvasCount: document.querySelectorAll('canvas').length,
        activePointers: current.input.activePointerCount(),
        inputEnabled: current.input.isEnabled(),
      };
    },
    setManualClock(manual) {
      current?.setManualClock(manual);
    },
    advance(milliseconds) {
      return current?.advance(milliseconds) ?? 0;
    },
    frameSamples() {
      return current ? [...current.frameSamples] : [];
    },
    resetFrameSamples() {
      current?.resetFrameSamples();
    },
  };
  (window as unknown as { __pirateBattle: TestApi }).__pirateBattle = api;
}
