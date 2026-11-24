import type { Observation } from '../../src/testing/hooks';
import { advance, advanceUntil, expect, observe, openMenu, startMatch, test, useSettings } from './support';

const START = { x: 896, y: 576, angle: -Math.PI / 2 };
const NORTH_ISLAND = { x: 970, y: 138, width: 172, height: 172, radius: 40 };

function gap(x: number, y: number): number {
  const c = NORTH_ISLAND;
  const nx = Math.min(c.x + c.width - c.radius, Math.max(c.x + c.radius, x));
  const ny = Math.min(c.y + c.height - c.radius, Math.max(c.y + c.radius, y));
  return Math.hypot(x - nx, y - ny) - c.radius;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test.describe('05 enemies', () => {
  test('chaser pursues, rams once, explodes and does not score', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await startMatch(page, {
      seed: 8,
      manualClock: true,
      setup: { player: START, enemies: [{ kind: 'chaser', x: START.x + 380, y: START.y - 100, angle: Math.PI }] },
    });
    const first = await observe(page);
    await advance(page, 500);
    const closer = await observe(page);
    expect(distance(closer.enemies[0]!, closer.player)).toBeLessThan(distance(first.enemies[0]!, first.player));
    const rammed = await advanceUntil(page, (state) => state.enemies.length === 0, { step: 100, limit: 8000 });
    expect(rammed.player.health).toBe(80);
    expect(rammed.score).toBe(0);
    await advance(page, 1000);
    expect((await observe(page)).player.health).toBe(80);
  });

  test('shooter closes to its range and fires on the player', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await startMatch(page, {
      seed: 8,
      manualClock: true,
      setup: { player: START, enemies: [{ kind: 'shooter', x: START.x - 600, y: START.y, angle: 0 }] },
    });
    let sawEnemyShot = false;
    let closest = Infinity;
    let state: Observation = await observe(page);
    for (let index = 0; index < 40; index += 1) {
      await advance(page, 150);
      state = await observe(page);
      sawEnemyShot ||= state.projectiles.some((projectile) => projectile.faction === 'enemy');
      closest = Math.min(closest, distance(state.enemies[0]!, state.player));
    }
    expect(sawEnemyShot).toBe(true);
    expect(state.player.health).toBeLessThan(100);
    expect((100 - state.player.health) % 8).toBe(0);
    expect(closest).toBeLessThan(420);
    expect(closest).toBeGreaterThan(150);
  });

  test('enemies steer around islands instead of crossing them', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await startMatch(page, {
      seed: 8,
      manualClock: true,
      setup: {
        player: { x: 1056, y: 560, angle: Math.PI / 2 },
        enemies: [{ kind: 'chaser', x: 1056, y: 70, angle: Math.PI / 2 }],
      },
    });
    let minimumGap = Infinity;
    for (let index = 0; index < 90; index += 1) {
      await advance(page, 100);
      const state = await observe(page);
      const enemy = state.enemies[0];
      if (!enemy) break;
      for (const offset of [-30, 0, 30]) {
        minimumGap = Math.min(minimumGap, gap(enemy.x + Math.cos(enemy.angle) * offset, enemy.y + Math.sin(enemy.angle) * offset));
      }
    }
    expect(minimumGap).toBeGreaterThanOrEqual(22 - 0.5);
    expect((await observe(page)).enemies).toHaveLength(0);
  });

  test('spawns alternate types on the configured interval at safe distances', async ({ page }) => {
    await useSettings(page, 120, 2);
    await openMenu(page);
    await startMatch(page, { seed: 21, manualClock: true });
    await advance(page, 1900);
    expect((await observe(page)).spawned).toBe(0);
    await advance(page, 200);
    let state = await observe(page);
    expect(state.spawned).toBe(1);
    expect(state.enemies[0]?.kind).toBe('chaser');
    expect(distance(state.enemies[0]!, state.player)).toBeGreaterThanOrEqual(520);
    await advance(page, 2000);
    state = await observe(page);
    expect(state.spawned).toBe(2);
    expect(state.enemies.map((enemy) => enemy.kind)).toContain('shooter');
    const shooter = state.enemies.find((enemy) => enemy.kind === 'shooter')!;
    expect(distance(shooter, state.player)).toBeGreaterThanOrEqual(480);
    await advance(page, 2000);
    expect((await observe(page)).spawned).toBe(3);
  });
});
