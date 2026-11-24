import { expect, observe, openMenu, test, waitForCombat } from './support';

test.describe('02 asset loading', () => {
  test('shows progress, reports a failed atlas and recovers on retry', async ({ page }) => {
    let releaseAtlas: () => void = () => undefined;
    const atlasGate = new Promise<void>((resolve) => {
      releaseAtlas = resolve;
    });
    let attempts = 0;
    await page.context().route('**/atlas/ships.json', async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.abort('failed');
        return;
      }
      await atlasGate;
      await route.continue();
    });

    await openMenu(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    const failure = page.getByRole('dialog', { name: 'The fleet could not load' });
    await expect(failure).toBeVisible();
    await expect(failure.getByRole('alert')).toContainText('Game assets failed to load');
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);

    await failure.getByRole('button', { name: 'Try Again' }).click();
    const progress = page.getByRole('progressbar', { name: 'Loading game assets' });
    await expect(progress).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    releaseAtlas();

    await waitForCombat(page);
    await expect(progress).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    const state = await observe(page);
    expect(state.phase).toBe('running');
    expect(attempts).toBe(2);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await waitForCombat(page);
    expect(attempts).toBe(2);
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
