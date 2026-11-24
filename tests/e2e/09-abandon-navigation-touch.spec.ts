import {
  advance,
  expect,
  expectNoConsoleErrors,
  maybeObserve,
  observe,
  openMenu,
  startMatch,
  test,
  touch,
  touchCenters,
  useSettings,
  waitForCombat,
} from './support';

const START = { x: 896, y: 576, angle: -Math.PI / 2 };

async function matchStorage(page: import('@playwright/test').Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle:matches:v1') ?? '{"pending":[]}') as { pending: unknown[]; lastResult?: unknown });
}

test.describe('09 abandonment, navigation and touch', () => {
  test.beforeEach(async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
  });

  test('leaving from pause or refreshing discards the match without registering it', async ({ page }) => {
    await startMatch(page, { seed: 9, manualClock: true });
    await advance(page, 3000);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    expect(await maybeObserve(page)).toBeNull();

    await startMatch(page, { seed: 9 });
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('canvas')).toHaveCount(0);

    const stored = await matchStorage(page);
    expect(stored.pending).toHaveLength(0);
    expect(stored.lastResult ?? null).toBeNull();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.getByText('No battles logged yet. Finish a match to see it here.')).toBeVisible();
  });

  test('repeated navigation keeps one canvas and a clean console', async ({ page, consoleErrors }) => {
    for (let round = 0; round < 3; round += 1) {
      await startMatch(page, { seed: 30 + round });
      expect((await observe(page)).canvasCount).toBe(1);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Options' }).click();
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await page.getByRole('button', { name: 'Ranking' }).click();
      await expect(page.getByRole('tabpanel', { name: 'Ranking' })).toContainText('Page 1 of');
      await page.getByRole('tab', { name: 'Match History' }).click();
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
    await page.goBack();
    await page.goForward();
    await expect(page.locator('canvas')).toHaveCount(0);
    expectNoConsoleErrors(consoleErrors);
  });

  test('game keys are ignored outside gameplay', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await startMatch(page, { seed: 9, manualClock: true, setup: { player: START } });
    await page.keyboard.press('Escape');
    await page.keyboard.down('KeyW');
    await page.getByRole('button', { name: 'Resume' }).click();
    await advance(page, 500);
    expect((await observe(page)).player.speed).toBe(0);
    await page.keyboard.up('KeyW');
  });

  test('touch controls support simultaneous presses and release on cancel', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch input runs on the mobile project');
    await startMatch(page, { seed: 9, manualClock: true, setup: { player: START } });
    const viewport = page.viewportSize();
    for (const command of ['turnLeft', 'forward', 'turnRight', 'fireLeft', 'fireFront', 'fireRight']) {
      const box = await page.locator(`[data-command="${command}"]`).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    }
    const hud = await page.locator('.hud').boundingBox();
    expect(hud!.y).toBeGreaterThanOrEqual(0);
    expect(hud!.x + hud!.width).toBeLessThanOrEqual(viewport!.width);

    const [forward, fire, turn] = await touchCenters(page, ['forward', 'fireFront', 'turnRight']);
    await touch(page, 'touchStart', [{ ...forward!, id: 1 }]);
    await touch(page, 'touchStart', [{ ...forward!, id: 1 }, { ...fire!, id: 2 }]);
    await touch(page, 'touchStart', [{ ...forward!, id: 1 }, { ...fire!, id: 2 }, { ...turn!, id: 3 }]);
    await advance(page, 600);
    let state = await observe(page);
    expect(state.activePointers).toBe(3);
    expect(state.player.y).toBeLessThan(START.y - 5);
    expect(state.player.angle).toBeGreaterThan(START.angle + 0.5);
    expect(state.projectiles.filter((projectile) => projectile.faction === 'player').length).toBeGreaterThanOrEqual(2);

    await touch(page, 'touchEnd', []);
    await expect.poll(async () => (await observe(page)).activePointers).toBe(0);
    await touch(page, 'touchStart', [{ ...turn!, id: 4 }]);
    await touch(page, 'touchStart', [{ ...turn!, id: 4 }, { ...fire!, id: 5 }]);
    await expect.poll(async () => (await observe(page)).activePointers).toBe(2);
    await touch(page, 'touchCancel', []);
    await expect.poll(async () => (await observe(page)).activePointers).toBe(0);
    state = await observe(page);
    const projectiles = state.projectiles.length;
    const angle = state.player.angle;
    await advance(page, 900);
    state = await observe(page);
    expect(state.player.angle).toBe(angle);
    expect(state.projectiles.length).toBeLessThanOrEqual(projectiles);
    expect(state.player.speed).toBeLessThan(165);
  });

  test('mobile layout keeps the whole arena visible after resize', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Layout check runs on the mobile project');
    await startMatch(page, { seed: 9, manualClock: true });
    const check = async () => {
      const state = await observe(page);
      const viewport = page.viewportSize()!;
      expect(state.viewport).not.toBeNull();
      const v = state.viewport!;
      expect(v.offsetX).toBeGreaterThanOrEqual(0);
      expect(v.offsetY).toBeGreaterThanOrEqual(0);
      expect(v.offsetX * 2 + 1792 * v.scale).toBeLessThanOrEqual(viewport.width + 1);
      expect(v.offsetY * 2 + 1024 * v.scale).toBeLessThanOrEqual(viewport.height + 1);
    };
    await check();
    await page.setViewportSize({ width: 412, height: 839 });
    await page.waitForTimeout(300);
    await check();
    await expect(page.getByText('Rotate to landscape for the widest view.')).toBeVisible();
    await page.setViewportSize({ width: 839, height: 412 });
    await waitForCombat(page);
    await check();
  });
});
