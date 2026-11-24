import type { Arena } from './arena';
import { circleOutOfCollider } from './collision';
import { approach, clamp, wrapAngle } from './math';
import type { Ship } from './types';

export function steer(ship: Ship, turnInput: number, throttle: number, dt: number): void {
  ship.angle = wrapAngle(ship.angle + clamp(turnInput, -1, 1) * ship.hull.turnRate * dt);
  const targetSpeed = ship.hull.maxSpeed * clamp(throttle, 0, 1);
  const rate = targetSpeed > ship.speed ? ship.hull.acceleration : ship.hull.deceleration;
  ship.speed = approach(ship.speed, targetSpeed, rate * dt);
  ship.x += Math.cos(ship.angle) * ship.speed * dt;
  ship.y += Math.sin(ship.angle) * ship.speed * dt;
}

export function hullCircles(ship: Ship): Array<{ x: number; y: number }> {
  const dx = Math.cos(ship.angle) * ship.hull.hullHalfLength;
  const dy = Math.sin(ship.angle) * ship.hull.hullHalfLength;
  return [
    { x: ship.x + dx, y: ship.y + dy },
    { x: ship.x, y: ship.y },
    { x: ship.x - dx, y: ship.y - dy },
  ];
}

export function resolveIslands(ship: Ship, arena: Arena): boolean {
  let touched = false;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    let moved = false;
    for (const island of arena.islands) {
      for (const circle of hullCircles(ship)) {
        const push = circleOutOfCollider(circle, ship.hull.hullRadius, island.collider);
        if (push) {
          ship.x += push.x;
          ship.y += push.y;
          moved = true;
          touched = true;
        }
      }
    }
    if (!moved) break;
  }
  if (touched) ship.speed = Math.min(ship.speed, ship.hull.maxSpeed * 0.45);
  return touched;
}

export function confineToArena(ship: Ship, arena: Arena): boolean {
  let touched = false;
  for (const circle of hullCircles(ship)) {
    const radius = ship.hull.hullRadius;
    if (circle.x < radius) {
      ship.x += radius - circle.x;
      touched = true;
    } else if (circle.x > arena.width - radius) {
      ship.x -= circle.x - (arena.width - radius);
      touched = true;
    }
    if (circle.y < radius) {
      ship.y += radius - circle.y;
      touched = true;
    } else if (circle.y > arena.height - radius) {
      ship.y -= circle.y - (arena.height - radius);
      touched = true;
    }
  }
  return touched;
}

export function moveShip(ship: Ship, arena: Arena, turnInput: number, throttle: number, dt: number): void {
  steer(ship, turnInput, throttle, dt);
  resolveIslands(ship, arena);
  confineToArena(ship, arena);
}
