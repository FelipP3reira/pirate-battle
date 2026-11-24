import type { Arena } from './arena';
import { fireBroadside, fireFront, tickCooldowns, updateProjectiles } from './combat';
import type { MatchConfig } from './config';
import { resolveShipContacts, updateEnemies } from './enemies';
import { moveShip } from './movement';
import { createRandom, type Random } from './random';
import { createShip, SpawnDirector } from './spawning';
import type { GameEvent, MatchPhase, MatchResult, PlayerCommands, Projectile, Ship, SimulationSetup } from './types';
import type { World } from './world';

// Rules always run at 60 Hz no matter the display refresh rate, which keeps
// matches reproducible (same inputs + same seed = same match).
export const FIXED_STEP = 1 / 60;
// After a long stall (tab throttled, GC pause) we drop the backlog instead of
// trying to catch up, otherwise every frame gets slower than the last.
const MAX_STEPS_PER_ADVANCE = 15;

export class Simulation implements World {
  readonly random: Random;
  readonly player: Ship;
  readonly enemies: Ship[] = [];
  readonly projectiles: Projectile[] = [];
  readonly events: GameEvent[] = [];
  elapsed = 0;
  score = 0;
  phase: MatchPhase = 'running';
  result: MatchResult | null = null;
  steps = 0;

  private accumulator = 0;
  private idCounter = 0;
  private readonly spawner: SpawnDirector;

  constructor(
    readonly config: MatchConfig,
    readonly arena: Arena,
    readonly seed: number,
    setup: SimulationSetup = {},
  ) {
    this.random = createRandom(seed);
    this.player = createShip(this, 'player', setup.player ?? arena.playerStart);
    for (const enemy of setup.enemies ?? []) {
      this.enemies.push(createShip(this, enemy.kind, enemy));
    }
    this.spawner = new SpawnDirector(config.spawnSeconds);
  }

  get duration(): number {
    return this.config.sessionSeconds;
  }

  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  get interpolation(): number {
    return this.accumulator / FIXED_STEP;
  }

  get spawnedCount(): number {
    return this.spawner.spawnedCount;
  }

  allocateId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  advance(seconds: number, commands: Readonly<PlayerCommands>): number {
    if (this.result) return 0;
    this.accumulator += Math.max(0, seconds);
    let taken = 0;
    while (this.accumulator >= FIXED_STEP) {
      if (taken === MAX_STEPS_PER_ADVANCE) {
        this.accumulator = 0;
        break;
      }
      const finished = this.step(commands);
      this.accumulator -= FIXED_STEP;
      taken += 1;
      if (finished) {
        this.accumulator = 0;
        break;
      }
    }
    return taken;
  }

  discardPendingTime(): void {
    this.accumulator = 0;
    this.snapshotPrevious();
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  private snapshotPrevious(): void {
    for (const ship of [this.player, ...this.enemies]) {
      ship.prevX = ship.x;
      ship.prevY = ship.y;
      ship.prevAngle = ship.angle;
    }
    for (const projectile of this.projectiles) {
      projectile.prevX = projectile.x;
      projectile.prevY = projectile.y;
    }
  }

  private step(commands: Readonly<PlayerCommands>): boolean {
    const dt = FIXED_STEP;
    this.snapshotPrevious();
    this.steps += 1;

    const player = this.player;
    const turn = (commands.turnRight ? 1 : 0) - (commands.turnLeft ? 1 : 0);
    moveShip(player, this.arena, turn, commands.forward ? 1 : 0, dt);
    tickCooldowns(player, dt);
    if (commands.fireFront) fireFront(this, player, 'player', this.config.balance.player.frontCannon);
    if (commands.fireLeft) fireBroadside(this, player, 'left');
    if (commands.fireRight) fireBroadside(this, player, 'right');

    for (const enemy of this.enemies) tickCooldowns(enemy, dt);
    updateEnemies(this, dt);
    resolveShipContacts(this);
    updateProjectiles(this, dt);

    // Derived from the step count on purpose: summing 1/60 thousands of times
    // drifts and the match could end one step late.
    this.elapsed = Math.min(this.duration, this.steps * dt);
    if (player.health > 0 && this.elapsed < this.duration) this.spawner.update(this);

    // Death wins a tie with the clock: sinking on the last step is a defeat.
    if (player.health <= 0) this.finish('destroyed');
    else if (this.elapsed >= this.duration) this.finish('time-up');
    return this.result !== null;
  }

  private finish(reason: MatchResult['reason']): void {
    this.phase = 'ended';
    this.projectiles.length = 0;
    this.result = {
      score: this.score,
      elapsedSeconds: Math.round(this.elapsed * 1000) / 1000,
      reason,
    };
    if (reason === 'destroyed') {
      this.events.push({
        type: 'destroyed',
        shipId: this.player.id,
        kind: 'player',
        x: this.player.x,
        y: this.player.y,
        angle: this.player.angle,
        cause: 'projectile',
      });
    }
    this.events.push({ type: 'ended', result: this.result });
  }
}
