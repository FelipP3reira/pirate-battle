import { expect, test as base, type CDPSession, type Page } from '@playwright/test';
import type { Observation, TestApi } from '../../src/testing/hooks';

type Placement = { x: number; y: number; angle: number };

export interface MatchSetup {
  seed?: number;
  manualClock?: boolean;
  setup?: {
    player?: Placement;
    enemies?: Array<Placement & { kind: 'chaser' | 'shooter' }>;
  };
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };

export const STEP = 1000 / 60;

export async function seedStorage(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, values);
}

export async function useSettings(
  page: Page,
  sessionSeconds: number,
  spawnSeconds: number,
  difficulty: 'normal' | 'hard' = 'hard',
): Promise<void> {
  await seedStorage(page, { 'pirate-battle:settings:v1': { sessionSeconds, spawnSeconds, difficulty } });
}

export async function openMenu(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
}

export async function configureNextMatch(page: Page, setup: MatchSetup): Promise<void> {
  await page.waitForFunction(() => '__pirateBattle' in window);
  await page.evaluate((value) => {
    (window as unknown as { __pirateBattle: TestApi }).__pirateBattle.configureNextMatch(value);
  }, setup);
}

export async function startMatch(page: Page, setup?: MatchSetup): Promise<void> {
  if (setup) await configureNextMatch(page, setup);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await waitForCombat(page);
}

export async function waitForCombat(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const api = (window as unknown as { __pirateBattle?: TestApi }).__pirateBattle;
    return api?.observe()?.phase === 'running';
  });
}

export async function observe(page: Page): Promise<Observation> {
  const value = await page.evaluate(() => (window as unknown as { __pirateBattle: TestApi }).__pirateBattle.observe());
  if (!value) throw new Error('No active match to observe');
  return value;
}

export async function maybeObserve(page: Page): Promise<Observation | null> {
  return page.evaluate(() => (window as unknown as { __pirateBattle: TestApi }).__pirateBattle.observe());
}

export async function advance(page: Page, milliseconds: number): Promise<number> {
  return page.evaluate((ms) => (window as unknown as { __pirateBattle: TestApi }).__pirateBattle.advance(ms), milliseconds);
}

export async function advanceUntil(
  page: Page,
  predicate: (observation: Observation) => boolean,
  options: { step?: number; limit?: number } = {},
): Promise<Observation> {
  const step = options.step ?? 250;
  const limit = options.limit ?? 30_000;
  let spent = 0;
  for (;;) {
    const current = await observe(page);
    if (predicate(current)) return current;
    if (spent >= limit) throw new Error(`Condition not reached after ${limit} ms of simulated time`);
    await advance(page, step);
    spent += step;
  }
}

export async function holdKeys(page: Page, keys: string[], milliseconds: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await advance(page, milliseconds);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

export async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await advance(page, STEP);
  await page.keyboard.up(key);
}

export async function touchCenters(page: Page, commands: string[]): Promise<Array<{ x: number; y: number }>> {
  const points: Array<{ x: number; y: number }> = [];
  for (const command of commands) {
    const box = await page.locator(`[data-command="${command}"]`).boundingBox();
    if (!box) throw new Error(`Touch control ${command} is not visible`);
    points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  return points;
}

const touchSessions = new WeakMap<Page, CDPSession>();

export async function touch(
  page: Page,
  type: 'touchStart' | 'touchEnd' | 'touchCancel' | 'touchMove',
  points: Array<{ x: number; y: number; id: number }>,
): Promise<void> {
  let client = touchSessions.get(page);
  if (!client) {
    client = await page.context().newCDPSession(page);
    touchSessions.set(page, client);
  }
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id, radiusX: 4, radiusY: 4, force: 1 })),
  });
}

export async function finishByRamming(page: Page): Promise<void> {
  const start = { x: 896, y: 576, angle: -Math.PI / 2 };
  await startMatch(page, {
    seed: 11,
    manualClock: true,
    setup: {
      player: start,
      enemies: [
        { kind: 'chaser', x: start.x, y: start.y - 150, angle: Math.PI / 2 },
        { kind: 'chaser', x: start.x, y: start.y + 150, angle: -Math.PI / 2 },
        { kind: 'chaser', x: start.x - 160, y: start.y, angle: 0 },
        { kind: 'chaser', x: start.x + 160, y: start.y, angle: Math.PI },
        { kind: 'chaser', x: start.x + 150, y: start.y - 150, angle: (3 * Math.PI) / 4 },
      ],
    },
  });
  await advanceUntil(page, (state) => state.simulationPhase === 'ended', { step: 100, limit: 10_000 });
}

export function expectNoConsoleErrors(errors: string[]): void {
  const relevant = errors.filter((text) => !/Failed to load resource|net::ERR_FAILED|status of 5\d\d|status of 4\d\d/.test(text));
  expect(relevant, relevant.join('\n')).toEqual([]);
}

export async function countInRanking(page: Page, matchId: string): Promise<number> {
  await page.getByRole('tab', { name: 'Ranking' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  let found = 0;
  for (;;) {
    found += await page.locator(`tr[data-match-id="${matchId}"]`).count();
    const next = page.getByRole('button', { name: 'Next page' });
    if (await next.isDisabled()) break;
    const label = await page.locator('.pagination__label').textContent();
    await next.click();
    await expect(page.locator('.pagination__label')).not.toHaveText(label ?? '');
    await expect(page.locator('.log-table--stale')).toHaveCount(0);
  }
  return found;
}
