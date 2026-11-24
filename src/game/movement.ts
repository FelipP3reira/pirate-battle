import type { Arena } from './arena';
import { circleOutOfCollider } from './collision';
import { approach, clamp, wrapAngle } from './math';
import type { Ship } from './types';

const COLLISION_PASSES = 3;

function steer(ship: Ship, turnInput: number, throttle: number, dt: number): void {
  const { hull } = ship;
  ship.angle = wrapAngle(ship.angle + clamp(turnInput, -1, 1) * hull.turnRate * dt);

  const targetSpeed = hull.maxSpeed * clamp(throttle, 0, 1);
  const rate = targetSpeed > ship.speed ? hull.acceleration : hull.deceleration;
  ship.speed = approach(ship.speed, targetSpeed, rate * dt);

  ship.x += Math.cos(ship.angle) * ship.speed * dt;
  ship.y += Math.sin(ship.angle) * ship.speed * dt;
}

function hullPoints(ship: Ship): Array<{ x: number; y: number }> {
  const dx = Math.cos(ship.angle) * ship.hull.hullHalfLength;
  const dy = Math.sin(ship.angle) * ship.hull.hullHalfLength;
  return [
    { x: ship.x + dx, y: ship.y + dy },
    { x: ship.x, y: ship.y },
    { x: ship.x - dx, y: ship.y - dy },
  ];
}

export function resolveIslands(ship: Ship, arena: Arena): void {
  let scraped = false;
  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    let pushed = false;
    for (const island of arena.islands) {
      for (const point of hullPoints(ship)) {
        const push = circleOutOfCollider(point, ship.hull.hullRadius, island.collider);
        if (!push) continue;
        ship.x += push.x;
        ship.y += push.y;
        pushed = true;
      }
    }
    if (!pushed) break;
    scraped = true;
  }
  if (scraped) ship.speed = Math.min(ship.speed, ship.hull.maxSpeed * ship.hull.coastSpeedRatio);
}

export function confineToArena(ship: Ship, arena: Arena): void {
  const radius = ship.hull.hullRadius;
  for (const point of hullPoints(ship)) {
    if (point.x < radius) ship.x += radius - point.x;
    else if (point.x > arena.width - radius) ship.x -= point.x - (arena.width - radius);

    if (point.y < radius) ship.y += radius - point.y;
    else if (point.y > arena.height - radius) ship.y -= point.y - (arena.height - radius);
  }
}

export function moveShip(ship: Ship, arena: Arena, turnInput: number, throttle: number, dt: number): void {
  steer(ship, turnInput, throttle, dt);
  resolveIslands(ship, arena);
  confineToArena(ship, arena);
}
