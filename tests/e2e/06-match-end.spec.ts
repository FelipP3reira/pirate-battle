import { advance, advanceUntil, expect, finishByRamming, observe, openMenu, startMatch, test, useSettings } from './support';

test.describe('06 match end', () => {
  test('ends when time runs out and freezes the simulation', async ({ page }) => {
    await useSettings(page, 60, 10);
    await openMenu(page);
    await startMatch(page, { seed: 1, manualClock: true });
    for (const key of ['KeyW', 'KeyD', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.down(key);
    const ended = await advanceUntil(page, (state) => state.simulationPhase === 'ended', { step: 1000, limit: 61_000 });
    for (const key of ['KeyW', 'KeyD', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.up(key);
    expect(ended.elapsed).toBeCloseTo(60, 5);
    expect(ended.player.health).toBeGreaterThan(0);
    expect(ended.projectiles).toHaveLength(0);

    expect(await advance(page, 2000)).toBe(0);
    const frozen = await observe(page);
    expect(frozen.steps).toBe(ended.steps);
    expect(frozen.score).toBe(ended.score);
    expect(frozen.spawned).toBe(ended.spawned);
    expect(frozen.player.x).toBe(ended.player.x);
    expect(frozen.inputEnabled).toBe(false);

    await expect(page.getByRole('heading', { name: 'Battle Complete' })).toBeVisible();
    await expect(page.getByTestId('end-reason')).toHaveText('Time up');
    await expect(page.getByText('01:00')).toBeVisible();
    await expect(page.getByLabel(`${ended.score} points`)).toBeVisible();
  });

  test('ends when the player is destroyed', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await finishByRamming(page);
    const state = await observe(page);
    expect(state.player.health).toBe(0);
    expect(state.score).toBe(0);
    await expect(page.getByRole('heading', { name: 'Ship Destroyed' })).toBeVisible();
    await expect(page.getByTestId('end-reason')).toHaveText('Defeated');
  });

  test('play again starts a clean match', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await finishByRamming(page);
    const previous = await observe(page);
    await page.getByRole('button', { name: 'Play Again' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
    const fresh = await observe(page);
    expect(fresh.phase).toBe('running');
    expect(fresh.elapsed).toBe(0);
    expect(fresh.steps).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(100);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    expect(fresh.seed).not.toBe(previous.seed);
    expect(fresh.canvasCount).toBe(1);
    await expect(page.getByTestId('hud-time')).toHaveText('02:00');
    await expect(page.getByTestId('hud-score')).toHaveText('0');
    await advance(page, 1000);
    expect((await observe(page)).steps).toBe(60);
  });
});
