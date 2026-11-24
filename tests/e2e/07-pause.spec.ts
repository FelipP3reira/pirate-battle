import type { Page } from '@playwright/test';
import { expect, observe, openMenu, startMatch, test, useSettings } from './support';

async function emulateHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('07 pause', () => {
  test.beforeEach(async ({ page }) => {
    await useSettings(page, 120, 10);
    await openMenu(page);
  });

  test('manual pause freezes time, cooldowns and held input until resume', async ({ page }) => {
    await startMatch(page, { seed: 4 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Ready when you are.')).toBeVisible();
    const paused = await observe(page);
    expect(paused.phase).toBe('paused');
    expect(paused.inputEnabled).toBe(false);
    const hudTime = await page.getByTestId('hud-time').textContent();

    await page.waitForTimeout(1500);
    await page.keyboard.press('KeyQ');
    const later = await observe(page);
    expect(later.elapsed).toBe(paused.elapsed);
    expect(later.steps).toBe(paused.steps);
    expect(later.player.y).toBe(paused.player.y);
    expect(later.cooldowns).toEqual(paused.cooldowns);
    expect(later.projectiles.length).toBe(paused.projectiles.length);
    await expect(page.getByTestId('hud-time')).toHaveText(hudTime ?? '');
    await page.keyboard.up('KeyW');

    await expect(dialog.getByRole('button', { name: 'Resume' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    const resumed = await observe(page);
    expect(resumed.phase).toBe('running');
    expect(resumed.elapsed - paused.elapsed).toBeLessThan(0.25);
    await expect(page.getByRole('application', { name: 'Battle arena' })).toBeFocused();

    await page.waitForTimeout(500);
    const running = await observe(page);
    expect(running.elapsed).toBeGreaterThan(resumed.elapsed);
    expect(running.player.speed).toBeLessThan(paused.player.speed + 0.01);
  });

  test('losing window focus pauses and needs an explicit resume', async ({ page }) => {
    await startMatch(page, { seed: 4 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByText('Paused because the window lost focus.')).toBeVisible();
    const paused = await observe(page);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(800);
    expect((await observe(page)).elapsed).toBe(paused.elapsed);
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(300);
    expect((await observe(page)).elapsed).toBeGreaterThan(paused.elapsed);
  });

  test('hiding the tab pauses and stays paused when it becomes visible', async ({ page }) => {
    await startMatch(page, { seed: 4 });
    await page.waitForTimeout(300);
    await emulateHidden(page, true);
    await expect(page.getByText('Paused while the tab was hidden.')).toBeVisible();
    const paused = await observe(page);
    await emulateHidden(page, false);
    await page.waitForTimeout(800);
    const still = await observe(page);
    expect(still.phase).toBe('paused');
    expect(still.elapsed).toBe(paused.elapsed);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
  });

  test('options opened from pause apply to the next battle only', async ({ page }) => {
    await startMatch(page, { seed: 4 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('spinbutton', { name: 'Game session time' }).fill('60');
    await expect(page.getByText('Changes apply to your next battle.')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    const current = await observe(page);
    expect(current.remaining).toBeGreaterThan(100);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await startMatch(page);
    expect((await observe(page)).remaining).toBeLessThanOrEqual(60);
  });
});
