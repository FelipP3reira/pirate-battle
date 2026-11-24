import type { Page } from '@playwright/test';
import { countInRanking, expect, finishByRamming, openMenu, test, useSettings } from './support';

async function lastMatchId(page: Page): Promise<string> {
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle:matches:v1') ?? '{}') as { lastResult?: { matchId: string } });
  const id = stored.lastResult?.matchId;
  if (!id) throw new Error('No completed match stored');
  return id;
}

test.describe('11 registration', () => {
  test('a finished match appears once in both tabs', async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
    await page.getByRole('button', { name: 'Ranking' }).click();
    await expect(page.getByText('Page 1 of 1')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();

    await finishByRamming(page);
    await expect(page.getByText('Saved to the Captain’s Log.')).toBeVisible();
    const matchId = await lastMatchId(page);
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.locator(`tr[data-match-id="${matchId}"]`)).toHaveCount(1);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(await countInRanking(page, matchId)).toBe(1);
  });

  test('a save that fails at the finish survives refresh and is recovered without duplicates', async ({ page }) => {
    await useSettings(page, 120, 10);
    await page.goto('/?scenario=offline-at-finish');
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await finishByRamming(page);
    await expect(page.getByText(/Not saved yet/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
    const matchId = await lastMatchId(page);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ship Destroyed' })).toBeVisible();
    await expect(page.getByText(/Not saved yet/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByText('1 battle is waiting to be saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();

    await page.getByRole('button', { name: /^Network:/ }).click();
    await page.getByLabel('Mock API behavior').selectOption('normal');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.goto('/#/result');
    await expect(page.getByText('Saved to the Captain’s Log.')).toBeVisible();

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByText('1 battle is waiting to be saved.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.locator(`tr[data-match-id="${matchId}"]`)).toHaveCount(1);
    expect(await countInRanking(page, matchId)).toBe(1);
  });
});
