import { expect, expectNoConsoleErrors, openMenu, test } from './support';

test.describe('01 options', () => {
  test('navigates with the keyboard, validates boundaries and persists after refresh', async ({ page, consoleErrors }) => {
    await openMenu(page);
    await page.getByRole('button', { name: 'Options' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();

    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    const spawn = page.getByRole('spinbutton', { name: 'Enemy spawn time' });
    await expect(session).toHaveValue('120');
    await expect(spawn).toHaveValue('3');

    const cases: Array<[typeof session, string, string | null]> = [
      [session, '59', 'Choose between 60 and 180 seconds.'],
      [session, '181', 'Choose between 60 and 180 seconds.'],
      [session, '90.5', 'Enter a whole number of seconds.'],
      [session, '', 'Enter a whole number of seconds.'],
      [session, '60', null],
      [session, '180', null],
      [spawn, '0', 'Choose between 1 and 10 seconds.'],
      [spawn, '11', 'Choose between 1 and 10 seconds.'],
      [spawn, '-2', 'Choose between 1 and 10 seconds.'],
      [spawn, '1', null],
      [spawn, '10', null],
    ];
    for (const [input, value, message] of cases) {
      await input.fill(value);
      if (message) {
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
      } else {
        await expect(input).not.toHaveAttribute('aria-invalid', 'true');
      }
    }

    await expect(page.getByRole('button', { name: 'Increase game session time' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Increase enemy spawn time' })).toBeDisabled();
    await page.getByRole('button', { name: 'Decrease game session time' }).click();
    await page.getByRole('button', { name: 'Decrease game session time' }).click();
    await page.getByRole('button', { name: 'Decrease enemy spawn time' }).click();
    await expect(session).toHaveValue('160');
    await expect(spawn).toHaveValue('9');
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();

    await session.fill('200');
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('160');
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('9');

    const normal = page.getByRole('radio', { name: 'Normal' });
    const hard = page.getByRole('radio', { name: 'Hard' });
    await expect(normal).toHaveAttribute('aria-checked', 'true');
    await normal.focus();
    await page.keyboard.press('ArrowRight');
    await expect(hard).toHaveAttribute('aria-checked', 'true');
    await expect(hard).toBeFocused();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Ranking' }).click();
    await expect(page.getByText('hard · 160 second battles · 9 second spawn interval', { exact: false })).toBeVisible();
    expectNoConsoleErrors(consoleErrors);
  });
});
