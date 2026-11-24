import { pointInsideCollider } from './arena';
import { capsuleFor, capsuleOverlapPoint, sweptPointHitsCapsule } from './collision';
import type { WeaponConfig } from './config';
import type { Faction, Ship, WeaponSlot } from './types';
import type { World } from './world';

export function tickCooldowns(ship: Ship, dt: number): void {
  ship.cooldowns.front = Math.max(0, ship.cooldowns.front - dt);
  ship.cooldowns.left = Math.max(0, ship.cooldowns.left - dt);
  ship.cooldowns.right = Math.max(0, ship.cooldowns.right - dt);
}

function launch(world: World, ship: Ship, faction: Faction, weapon: WeaponConfig, x: number, y: number, angle: number): void {
  world.projectiles.push({
    id: world.allocateId(),
    faction,
    sourceId: ship.id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * weapon.projectileSpeed,
    vy: Math.sin(angle) * weapon.projectileSpeed,
    damage: weapon.damage,
    radius: weapon.projectileRadius,
    remainingDistance: weapon.range,
  });
}

export function fireFront(world: World, ship: Ship, faction: Faction, weapon: WeaponConfig): boolean {
  if (ship.cooldowns.front > 0) return false;
  ship.cooldowns.front = weapon.cooldown;
  const muzzle = ship.hull.hullHalfLength + ship.hull.hullRadius + 4;
  const x = ship.x + Math.cos(ship.angle) * muzzle;
  const y = ship.y + Math.sin(ship.angle) * muzzle;
  launch(world, ship, faction, weapon, x, y, ship.angle);
  world.events.push({ type: 'shot', shipId: ship.id, faction, slot: 'front', x, y, angle: ship.angle, count: 1 });
  return true;
}

export function fireBroadside(world: World, ship: Ship, slot: Exclude<WeaponSlot, 'front'>): boolean {
  if (ship.cooldowns[slot] > 0) return false;
  const weapon = world.config.balance.player.broadside;
  ship.cooldowns[slot] = weapon.cooldown;
  const side = slot === 'left' ? -1 : 1;
  const angle = ship.angle + (side * Math.PI) / 2;
  const forwardX = Math.cos(ship.angle);
  const forwardY = Math.sin(ship.angle);
  const sideX = Math.cos(angle);
  const sideY = Math.sin(angle);
  const outward = ship.hull.hullRadius + 4;
  const first = -((weapon.projectiles - 1) / 2) * weapon.spacing;
  for (let index = 0; index < weapon.projectiles; index += 1) {
    const along = first + index * weapon.spacing;
    launch(
      world,
      ship,
      'player',
      weapon,
      ship.x + forwardX * along + sideX * outward,
      ship.y + forwardY * along + sideY * outward,
      angle,
    );
  }
  world.events.push({
    type: 'shot',
    shipId: ship.id,
    faction: 'player',
    slot,
    x: ship.x + sideX * outward,
    y: ship.y + sideY * outward,
    angle,
    count: weapon.projectiles,
  });
  return true;
}

export function damageShip(world: World, target: Ship, amount: number, faction: Faction, x: number, y: number): boolean {
  target.health = Math.max(0, target.health - amount);
  world.events.push({ type: 'hit', targetId: target.id, faction, x, y, damage: amount, health: target.health });
  return target.health <= 0;
}

export function destroyEnemy(world: World, enemy: Ship, cause: 'projectile' | 'ram'): void {
  const index = world.enemies.indexOf(enemy);
  if (index < 0) return;
  world.enemies.splice(index, 1);
  world.events.push({ type: 'destroyed', shipId: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, angle: enemy.angle, cause });
  if (cause === 'projectile') {
    world.score += 1;
    world.events.push({ type: 'scored', score: world.score });
  }
}

export function updateProjectiles(world: World, dt: number): void {
  const { arena, player } = world;
  const survivors = [];
  for (const projectile of world.projectiles) {
    projectile.prevX = projectile.x;
    projectile.prevY = projectile.y;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const travel = Math.min(speed * dt, projectile.remainingDistance);
    const scale = speed > 0 ? travel / speed : 0;
    projectile.x += projectile.vx * scale;
    projectile.y += projectile.vy * scale;
    projectile.remainingDistance -= travel;

    const from = { x: projectile.prevX, y: projectile.prevY };
    const to = { x: projectile.x, y: projectile.y };
    let consumed = false;

    if (projectile.faction === 'player') {
      for (const enemy of world.enemies) {
        const hull = capsuleFor(enemy.x, enemy.y, enemy.angle, enemy.hull.hullHalfLength, enemy.hull.hullRadius);
        if (sweptPointHitsCapsule(from, to, projectile.radius, hull)) {
          const impact = capsuleOverlapPoint(from, to, hull);
          if (damageShip(world, enemy, projectile.damage, 'player', impact.x, impact.y)) destroyEnemy(world, enemy, 'projectile');
          // Stop at the first ship hit so one cannonball never damages twice.
          consumed = true;
          break;
        }
      }
    } else if (player.health > 0) {
      const hull = capsuleFor(player.x, player.y, player.angle, player.hull.hullHalfLength, player.hull.hullRadius);
      if (sweptPointHitsCapsule(from, to, projectile.radius, hull)) {
        const impact = capsuleOverlapPoint(from, to, hull);
        damageShip(world, player, projectile.damage, 'enemy', impact.x, impact.y);
        consumed = true;
      }
    }

    if (!consumed && arena.islands.some((island) => pointInsideCollider(to, island.collider))) {
      world.events.push({ type: 'splash', x: to.x, y: to.y, surface: 'island' });
      consumed = true;
    }
    if (!consumed && (to.x < 0 || to.y < 0 || to.x > arena.width || to.y > arena.height)) {
      consumed = true;
    }
    if (!consumed && projectile.remainingDistance <= 0) {
      world.events.push({ type: 'splash', x: to.x, y: to.y, surface: 'water' });
      consumed = true;
    }
    if (!consumed) survivors.push(projectile);
  }
  world.projectiles.length = 0;
  world.projectiles.push(...survivors);
}
