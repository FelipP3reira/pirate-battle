import { countInRanking, expect, finishByRamming, test, useSettings } from './support';

test.describe('12 retries and stale responses', () => {
  test('a lost acknowledgment is retried and recovers the stored record without duplication', async ({ page }) => {
    await useSettings(page, 120, 10);
    await page.goto('/?scenario=commit-then-timeout');
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await finishByRamming(page);
    await expect(page.getByText("Saving to the Captain's Log...")).toBeVisible();
    await expect(page.getByText("Saved to the Captain's Log.")).toBeVisible({ timeout: 20_000 });
    const matchId = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('pirate-battle:matches:v1') ?? '{}') as { lastResult: { matchId: string } }).lastResult.matchId,
    );
    const stored = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('pirate-battle:mock-db:v1') ?? '{"confirmed":[]}') as { confirmed: Array<{ matchId: string }> }).confirmed,
    );
    expect(stored.filter((record) => record.matchId === matchId)).toHaveLength(1);

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.locator(`tr[data-match-id="${matchId}"]`)).toHaveCount(1);
    expect(await countInRanking(page, matchId)).toBe(1);
  });

  test('repeated retry clicks keep a single record', async ({ page }) => {
    await useSettings(page, 120, 10);
    await page.goto('/?scenario=connection-lost');
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await finishByRamming(page);
    const retry = page.getByRole('button', { name: 'Retry save' });
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Network:/ }).click();
    await page.getByLabel('Mock API behavior').selectOption('normal');
    await page.getByRole('button', { name: 'Close' }).click();
    await retry.click();
    await retry.click({ timeout: 1000 }).catch(() => undefined);
    await retry.click({ timeout: 1000 }).catch(() => undefined);
    await expect(page.getByText("Saved to the Captain's Log.")).toBeVisible();
    const stored = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('pirate-battle:mock-db:v1') ?? '{"confirmed":[]}') as { confirmed: unknown[] }).confirmed,
    );
    expect(stored).toHaveLength(1);
  });

  test('a delayed older page does not overwrite the page the player is viewing', async ({ page }) => {
    await page.goto('/?scenario=out-of-order#/log/ranking');
    await expect(page.getByText('Page 1 of 3')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('06', { timeout: 5000 });
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('06');
    await expect(page.locator('tbody tr')).toHaveCount(5);
  });
});
