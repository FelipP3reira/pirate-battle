import { advance, expect, holdKeys, observe, openMenu, pressKey, startMatch, test, useSettings } from './support';

const START = { x: 896, y: 576, angle: -Math.PI / 2 };

test.describe('04 combat', () => {
  test.beforeEach(async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
  });

  test('bow cannon fires one shot per cooldown window', async ({ page }) => {
    await startMatch(page, { seed: 5, manualClock: true, setup: { player: START } });
    await holdKeys(page, ['Space'], 900);
    const state = await observe(page);
    const shots = state.projectiles.filter((projectile) => projectile.faction === 'player');
    expect(shots).toHaveLength(3);
    for (const shot of shots) {
      expect(shot.vx).toBeCloseTo(0, 3);
      expect(shot.vy).toBeCloseTo(-560, 3);
    }
  });

  test('broadsides fire three parallel shots per side and respect their cooldown', async ({ page }) => {
    await startMatch(page, { seed: 5, manualClock: true, setup: { player: START } });
    await pressKey(page, 'KeyQ');
    let state = await observe(page);
    const port = state.projectiles.filter((projectile) => projectile.vx < 0);
    expect(port).toHaveLength(3);
    for (const shot of port) {
      expect(shot.vx).toBeCloseTo(-480, 3);
      expect(shot.vy).toBeCloseTo(0, 3);
    }
    const rows = port.map((shot) => shot.y).sort((a, b) => a - b);
    expect(rows[1]! - rows[0]!).toBeCloseTo(26, 3);
    expect(rows[2]! - rows[1]!).toBeCloseTo(26, 3);

    await pressKey(page, 'KeyQ');
    state = await observe(page);
    expect(state.projectiles.filter((projectile) => projectile.vx < 0)).toHaveLength(3);
    expect(state.cooldowns.left).toBeGreaterThan(1);

    await pressKey(page, 'KeyE');
    state = await observe(page);
    const starboard = state.projectiles.filter((projectile) => projectile.vx > 0);
    expect(starboard).toHaveLength(3);
    for (const shot of starboard) expect(shot.vx).toBeCloseTo(480, 3);

    await advance(page, 1300);
    await pressKey(page, 'KeyQ');
    state = await observe(page);
    expect(state.projectiles.filter((projectile) => projectile.vx < 0)).toHaveLength(3);
    expect(state.cooldowns.left).toBeGreaterThan(1);
  });

  test('moves and fires at the same time', async ({ page }) => {
    await startMatch(page, { seed: 5, manualClock: true, setup: { player: START } });
    await holdKeys(page, ['KeyW', 'KeyD', 'Space', 'KeyE'], 500);
    const state = await observe(page);
    expect(state.player.y).toBeLessThan(START.y - 10);
    expect(state.player.angle).toBeGreaterThan(START.angle + 0.5);
    expect(state.projectiles.filter((projectile) => projectile.faction === 'player').length).toBeGreaterThanOrEqual(4);
  });

  test('each hit damages once, removes the shot and scores one point per kill', async ({ page }) => {
    await startMatch(page, {
      seed: 5,
      manualClock: true,
      setup: { player: START, enemies: [{ kind: 'shooter', x: START.x, y: START.y - 300, angle: -Math.PI / 2 }] },
    });
    const enemyHealth: number[] = [];
    for (let shot = 0; shot < 3; shot += 1) {
      await pressKey(page, 'Space');
      await advance(page, 450);
      const state = await observe(page);
      expect(state.projectiles.filter((projectile) => projectile.faction === 'player')).toHaveLength(0);
      enemyHealth.push(state.enemies[0]?.health ?? 0);
    }
    expect(enemyHealth).toEqual([40, 20, 0]);
    let state = await observe(page);
    expect(state.enemies).toHaveLength(0);
    expect(state.score).toBe(1);
    await expect(page.getByTestId('hud-score')).toHaveText('1');

    await pressKey(page, 'Space');
    await advance(page, 1100);
    state = await observe(page);
    expect(state.score).toBe(1);
    await expect(page.getByTestId('hud-score')).toHaveText('1');
  });

  test('a broadside volley damages each enemy it reaches exactly once', async ({ page }) => {
    await startMatch(page, {
      seed: 5,
      manualClock: true,
      setup: {
        player: START,
        enemies: [{ kind: 'shooter', x: START.x - 200, y: START.y, angle: Math.PI / 2 }],
      },
    });
    await pressKey(page, 'KeyQ');
    await advance(page, 600);
    const state = await observe(page);
    const damage = 60 - (state.enemies[0]?.health ?? 0);
    expect(damage % 20).toBe(0);
    expect(damage).toBeGreaterThanOrEqual(20);
    expect(damage).toBeLessThanOrEqual(60);
    expect(state.projectiles.filter((projectile) => projectile.vx < 0)).toHaveLength(3 - damage / 20);
  });

  test('shots from a shooter that sinks first never reach the player', async ({ page }) => {
    await startMatch(page, {
      seed: 5,
      manualClock: true,
      setup: { player: START, enemies: [{ kind: 'shooter', x: START.x - 400, y: START.y, angle: 0 }] },
    });
    await pressKey(page, 'KeyQ');
    let state = await observe(page);
    expect(state.projectiles.filter((projectile) => projectile.faction === 'enemy')).toHaveLength(1);

    while (state.enemies.length > 0) {
      await advance(page, 1000 / 60);
      state = await observe(page);
      expect(state.elapsed).toBeLessThan(1);
    }
    expect(state.score).toBe(1);
    expect(state.player.health).toBe(100);
    expect(state.projectiles.filter((projectile) => projectile.faction === 'enemy')).toHaveLength(0);

    await advance(page, 1500);
    expect((await observe(page)).player.health).toBe(100);
  });
});
