import { advance, expect, holdKeys, observe, openMenu, STEP, startMatch, test, useSettings } from './support';

const START = { x: 896, y: 576, angle: -Math.PI / 2 };

test.describe('03 movement', () => {
  test.beforeEach(async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
  });

  test('sails forward, rotates both ways and is independent of frame slicing', async ({ page }) => {
    await startMatch(page, { seed: 3, manualClock: true, setup: { player: START } });
    const start = await observe(page);
    expect(start.player.speed).toBe(0);

    await holdKeys(page, ['KeyW'], 1000);
    const moved = await observe(page);
    expect(moved.player.y).toBeLessThan(start.player.y - 60);
    expect(Math.abs(moved.player.x - start.player.x)).toBeLessThan(0.5);

    await holdKeys(page, ['KeyD'], 500);
    const right = await observe(page);
    expect(right.player.angle - moved.player.angle).toBeCloseTo(2.4 * 0.5, 1);

    await holdKeys(page, ['ArrowLeft'], 500);
    const left = await observe(page);
    expect(left.player.angle).toBeCloseTo(moved.player.angle, 1);

    await page.keyboard.down('ArrowUp');
    for (let index = 0; index < 30; index += 1) await advance(page, STEP);
    await page.keyboard.up('ArrowUp');
    const sliced = await observe(page);
    expect(sliced.steps - left.steps).toBe(30);
  });

  test('same input produces the same path with one large slice or many small slices', async ({ page }) => {
    await startMatch(page, { seed: 3, manualClock: true, setup: { player: START } });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await advance(page, 1500);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    const coarse = await observe(page);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await startMatch(page, { seed: 3, manualClock: true, setup: { player: START } });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    for (let index = 0; index < 90; index += 1) await advance(page, STEP);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    const fine = await observe(page);

    expect(fine.steps).toBe(coarse.steps);
    expect(fine.player.x).toBeCloseTo(coarse.player.x, 3);
    expect(fine.player.y).toBeCloseTo(coarse.player.y, 3);
    expect(fine.player.angle).toBeCloseTo(coarse.player.angle, 5);
  });

  test('stays inside the arena edge', async ({ page }) => {
    await startMatch(page, { seed: 3, manualClock: true, setup: { player: { x: 150, y: 140, angle: -Math.PI / 2 } } });
    await holdKeys(page, ['KeyW'], 3000);
    const state = await observe(page);
    const bowY = state.player.y + Math.sin(state.player.angle) * 30;
    expect(bowY).toBeGreaterThanOrEqual(22 - 0.01);
    expect(state.player.y).toBeGreaterThan(40);
    expect(state.player.x).toBeCloseTo(150, 0);
  });

  test('cannot sail through an island', async ({ page }) => {
    await startMatch(page, { seed: 3, manualClock: true, setup: { player: { x: 1056, y: 520, angle: -Math.PI / 2 } } });
    await holdKeys(page, ['KeyW'], 4000);
    const state = await observe(page);
    const islandBottom = 2 * 64 + 10 + 3 * 64 - 20;
    const bowY = state.player.y + Math.sin(state.player.angle) * 30;
    expect(bowY - 22).toBeGreaterThanOrEqual(islandBottom - 1);
    expect(state.player.y).toBeGreaterThan(islandBottom);
  });
});
