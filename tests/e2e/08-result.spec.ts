import { expect, finishByRamming, openMenu, test, useSettings } from './support';

test.describe('08 result', () => {
  test('shows score, time, reason and save status and survives a refresh', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await finishByRamming(page);

    await expect(page.getByRole('heading', { name: 'Ship Destroyed' })).toBeVisible();
    await expect(page).toHaveURL(/#\/result$/);
    await expect(page.getByLabel('0 points')).toBeVisible();
    await expect(page.getByTestId('end-reason')).toHaveText('Defeated');
    await expect(page.getByText("Saved to the Captain's Log.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();
    const summary = await page.locator('.result__summary').textContent();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle:matches:v1') ?? '{}') as { lastResult?: { matchId: string } });
    const matchId = stored.lastResult?.matchId;
    expect(matchId).toBeTruthy();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ship Destroyed' })).toBeVisible();
    await expect(page.locator('.result__summary')).toHaveText(summary ?? '');
    await expect(page.getByText("Saved to the Captain's Log.")).toBeVisible();

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.locator(`tr[data-match-id="${matchId}"]`)).toHaveCount(1);
    await expect(page.locator(`tr[data-match-id="${matchId}"]`)).toContainText('Defeated');
  });
});
