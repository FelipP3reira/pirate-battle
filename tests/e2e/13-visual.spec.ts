import { expect, finishByRamming, openMenu, startMatch, test, useSettings } from './support';

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await useSettings(page, 120, 10);
  });

  test('main menu', async ({ page }) => {
    await openMenu(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await openMenu(page);
    await startMatch(page, {
      seed: 42,
      manualClock: true,
      setup: {
        player: { x: 700, y: 620, angle: -0.9 },
        enemies: [
          { kind: 'shooter', x: 1250, y: 420, angle: 2.6 },
          { kind: 'chaser', x: 420, y: 880, angle: -0.6 },
        ],
      },
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openMenu(page);
    await finishByRamming(page);
    await expect(page.getByText('Saved to the Captain’s Log.')).toBeVisible();
    await expect(page).toHaveScreenshot('result.png');
  });
});
