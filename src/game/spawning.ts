import { angleTo, distance } from './math';
import type { EnemyKind } from './config';
import type { Ship, ShipPlacement } from './types';
import type { World } from './world';

export function createShip(world: World, kind: Ship['kind'], placement: ShipPlacement): Ship {
  const hull = kind === 'player' ? world.config.balance.player : world.config.balance[kind];
  return {
    id: world.allocateId(),
    kind,
    hull: {
      maxHealth: hull.maxHealth,
      maxSpeed: hull.maxSpeed,
      acceleration: hull.acceleration,
      deceleration: hull.deceleration,
      turnRate: hull.turnRate,
      hullHalfLength: hull.hullHalfLength,
      hullRadius: hull.hullRadius,
    },
    x: placement.x,
    y: placement.y,
    angle: placement.angle,
    prevX: placement.x,
    prevY: placement.y,
    prevAngle: placement.angle,
    speed: 0,
    health: hull.maxHealth,
    cooldowns: { front: 0, left: 0, right: 0 },
  };
}

export class SpawnDirector {
  private nextSpawnAt: number;
  private spawned = 0;

  constructor(private readonly interval: number) {
    this.nextSpawnAt = interval;
  }

  get spawnedCount(): number {
    return this.spawned;
  }

  update(world: World): void {
    if (world.elapsed < this.nextSpawnAt) return;
    if (world.enemies.length >= world.config.balance.spawn.maxActiveEnemies) return;
    const point = this.choosePoint(world);
    if (!point) return;
    const kind = this.chooseKind(world);
    const enemy = createShip(world, kind, { x: point.x, y: point.y, angle: angleTo(point, world.player) });
    world.enemies.push(enemy);
    world.events.push({ type: 'spawned', shipId: enemy.id, kind });
    this.spawned += 1;
    this.nextSpawnAt = Math.max(this.nextSpawnAt + this.interval, world.elapsed + this.interval / 2);
  }

  private chooseKind(world: World): EnemyKind {
    const { openingSequence, weights } = world.config.balance.spawn;
    const opening = openingSequence[this.spawned];
    if (opening) return opening;
    const total = weights.chaser + weights.shooter;
    return world.random.next() * total < weights.chaser ? 'chaser' : 'shooter';
  }

  private choosePoint(world: World): { x: number; y: number } | null {
    const { minPlayerDistance, clearance } = world.config.balance.spawn;
    const candidates = world.arena.spawnPoints.filter(
      (point) =>
        distance(point, world.player) >= minPlayerDistance &&
        world.enemies.every((enemy) => distance(point, enemy) >= clearance),
    );
    if (candidates.length === 0) return null;
    return world.random.pick(candidates);
  }
}
