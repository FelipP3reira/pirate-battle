import type { Arena } from './arena';
import { pointInsideCollider } from './arena';
import { capsuleFor, capsuleSeparation, capsulesOverlap, segmentCrossesCollider } from './collision';
import { damageShip, destroyEnemy, fireFront } from './combat';
import { angleTo, clamp, distance, wrapAngle } from './math';
import { confineToArena, moveShip, resolveIslands } from './movement';
import type { Ship } from './types';
import type { World } from './world';

const AVOIDANCE_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];

function probeBlocked(arena: Arena, ship: Ship, angle: number, reach: number): boolean {
  const padding = ship.hull.hullRadius + 6;
  for (const fraction of [0.5, 1]) {
    const point = {
      x: ship.x + Math.cos(angle) * reach * fraction,
      y: ship.y + Math.sin(angle) * reach * fraction,
    };
    if (point.x < padding || point.y < padding || point.x > arena.width - padding || point.y > arena.height - padding) {
      return true;
    }
    if (arena.islands.some((island) => pointInsideCollider(point, island.collider, padding))) return true;
  }
  return false;
}

export function avoidObstacles(arena: Arena, ship: Ship, desired: number): number {
  const reach = ship.hull.hullHalfLength + 50 + ship.speed * 0.6;
  for (const offset of AVOIDANCE_OFFSETS) {
    const candidate = wrapAngle(desired + offset);
    if (!probeBlocked(arena, ship, candidate, reach)) return candidate;
  }
  return desired;
}

export function hasLineOfSight(arena: Arena, from: Ship, to: Ship): boolean {
  return arena.islands.every((island) => !segmentCrossesCollider(from, to, island.collider));
}

function turnInputTowards(ship: Ship, desired: number, dt: number): number {
  const delta = wrapAngle(desired - ship.angle);
  return clamp(delta / (ship.hull.turnRate * dt), -1, 1);
}

function updateChaser(world: World, chaser: Ship, dt: number): void {
  const { player, arena } = world;
  const lead = 0.35;
  const target = {
    x: player.x + Math.cos(player.angle) * player.speed * lead,
    y: player.y + Math.sin(player.angle) * player.speed * lead,
  };
  const desired = avoidObstacles(arena, chaser, angleTo(chaser, target));
  const turn = turnInputTowards(chaser, desired, dt);
  const sharpness = Math.abs(wrapAngle(desired - chaser.angle));
  moveShip(chaser, arena, turn, sharpness > 1.2 ? 0.6 : 1, dt);
}

function updateShooter(world: World, shooter: Ship, dt: number): void {
  const { player, arena } = world;
  const settings = world.config.balance.shooter;
  const range = distance(shooter, player);
  const bearing = angleTo(shooter, player);
  const visible = hasLineOfSight(arena, shooter, player);

  if (range > settings.preferredRange || !visible) {
    const desired = avoidObstacles(arena, shooter, bearing);
    moveShip(shooter, arena, turnInputTowards(shooter, desired, dt), 1, dt);
  } else {
    const throttle = range < settings.preferredRange * 0.7 ? 0 : 0.3;
    moveShip(shooter, arena, turnInputTowards(shooter, bearing, dt), throttle, dt);
  }

  const aimError = Math.abs(wrapAngle(angleTo(shooter, player) - shooter.angle));
  if (range <= settings.attackRange && aimError <= settings.aimTolerance && visible) {
    fireFront(world, shooter, 'enemy', settings.cannon);
  }
}

export function updateEnemies(world: World, dt: number): void {
  for (const enemy of world.enemies) {
    if (enemy.kind === 'chaser') updateChaser(world, enemy, dt);
    else updateShooter(world, enemy, dt);
  }
}

export function resolveShipContacts(world: World): void {
  const { player, arena } = world;
  const playerHull = capsuleFor(player.x, player.y, player.angle, player.hull.hullHalfLength, player.hull.hullRadius);

  for (const chaser of world.enemies.filter((enemy) => enemy.kind === 'chaser')) {
    if (player.health <= 0) break;
    const hull = capsuleFor(chaser.x, chaser.y, chaser.angle, chaser.hull.hullHalfLength, chaser.hull.hullRadius);
    if (capsulesOverlap(hull, playerHull)) {
      const damage = world.config.balance.chaser.contactDamage;
      damageShip(world, player, damage, 'enemy', (chaser.x + player.x) / 2, (chaser.y + player.y) / 2);
      world.events.push({ type: 'rammed', chaserId: chaser.id, x: chaser.x, y: chaser.y, damage, health: player.health });
      destroyEnemy(world, chaser, 'ram');
    }
  }

  const ships = [player, ...world.enemies];
  for (let i = 0; i < ships.length; i += 1) {
    for (let j = i + 1; j < ships.length; j += 1) {
      const first = ships[i];
      const second = ships[j];
      if (!first || !second) continue;
      const push = capsuleSeparation(
        capsuleFor(first.x, first.y, first.angle, first.hull.hullHalfLength, first.hull.hullRadius),
        capsuleFor(second.x, second.y, second.angle, second.hull.hullHalfLength, second.hull.hullRadius),
      );
      if (!push) continue;
      first.x += push.x / 2;
      first.y += push.y / 2;
      second.x -= push.x / 2;
      second.y -= push.y / 2;
      for (const ship of [first, second]) {
        resolveIslands(ship, arena);
        confineToArena(ship, arena);
      }
    }
  }
}
