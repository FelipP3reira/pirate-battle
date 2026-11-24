import { expect, openMenu, test } from './support';

test.describe('10 ranking and match history', () => {
  test('pages through the ranking and keeps both tabs reachable', async ({ page }) => {
    await openMenu(page);
    await page.getByRole('button', { name: 'Ranking' }).click();
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('120 second battles · 3 second spawn interval')).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await expect(rows.first().locator('td').first()).toHaveText('01');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    const firstPage = await rows.allTextContents();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(rows.first().locator('td').first()).toHaveText('06');
    expect(await rows.allTextContents()).not.toEqual(firstPage);
    const points = (await page.locator('tbody .log-table__points').allTextContents()).map(Number);
    expect([...points].sort((a, b) => b - a)).toEqual(points);

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 3 of 3')).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByText('No battles logged yet. Finish a match to see it here.')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows loading, then background refresh with cached rows', async ({ page }) => {
    await page.goto('/?scenario=slow#/log/ranking');
    await expect(page.getByText('Loading ranking…')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(5, { timeout: 8000 });
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByText('Loading match history…')).toBeVisible();
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(page.getByText('Updating ranking…')).toBeVisible();
    await expect(page.getByText('Updating ranking…')).toHaveCount(0, { timeout: 8000 });
  });

  test('empty scenario shows empty states', async ({ page }) => {
    await page.goto('/?scenario=empty#/log/ranking');
    await expect(page.getByText('No battles in this ranking yet. Be the first to set sail.')).toBeVisible();
  });

  test('many pages scenario paginates deep lists', async ({ page }) => {
    await page.goto('/?scenario=many-pages#/log/ranking');
    await expect(page.getByText('Page 1 of 15')).toBeVisible();
  });

  test('a failed ranking read shows an error and keeps the game available', async ({ page }) => {
    await page.goto('/?scenario=ranking-down#/log/ranking');
    const alert = page.getByRole('alert').filter({ hasText: 'Could not load the ranking' });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByText('No battles logged yet. Finish a match to see it here.')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
  });

  test('a failed history read shows an error and recovers after switching scenario', async ({ page }) => {
    await page.goto('/?scenario=history-down#/log/history');
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load the match history' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Network:/ }).click();
    await page.getByLabel('Mock API behavior').selectOption('normal');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('No battles logged yet. Finish a match to see it here.')).toBeVisible();
  });
});
