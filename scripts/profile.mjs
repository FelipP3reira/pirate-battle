import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { decide } from './autopilot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'reports/profiling');
const baseURL = process.env.PROFILE_URL ?? 'http://localhost:4180';
const matchSeconds = Number(process.env.PROFILE_SECONDS ?? 180);
const spawnSeconds = Number(process.env.PROFILE_SPAWN ?? 5);
const seed = Number(process.env.PROFILE_SEED ?? 27);
const viewport = { width: 1280, height: 720 };
const KEYS = { forward: 'KeyW', turnLeft: 'KeyA', turnRight: 'KeyD', fireFront: 'Space', fireLeft: 'KeyQ', fireRight: 'KeyE' };

async function serverUp() {
  try {
    const response = await fetch(baseURL);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn('npm', ['run', 'preview:e2e'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((done) => setTimeout(done, 500));
    if (await serverUp()) return child;
  }
  child.kill();
  throw new Error('Preview server did not start. Run npm run build:e2e first.');
}

function stats(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    samples: intervals.length,
    meanIntervalMs: Number(mean.toFixed(3)),
    averageFps: Number((1000 / mean).toFixed(2)),
    p50IntervalMs: Number(pick(0.5).toFixed(3)),
    p95IntervalMs: Number(pick(0.95).toFixed(3)),
    p99IntervalMs: Number(pick(0.99).toFixed(3)),
    maxIntervalMs: Number(sorted[sorted.length - 1].toFixed(3)),
    framesOver20ms: intervals.filter((value) => value > 20).length,
    framesOver33ms: intervals.filter((value) => value > 33.4).length,
  };
}

async function metrics(page, client) {
  await client.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(300);
  await client.send('HeapProfiler.collectGarbage');
  const { metrics: list } = await client.send('Performance.getMetrics');
  const value = (name) => list.find((item) => item.name === name)?.value ?? null;
  const dom = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    activeMatch: Boolean(window.__pirateBattle?.observe()),
  }));
  return {
    jsHeapUsedMB: Number(((value('JSHeapUsedSize') ?? 0) / 1048576).toFixed(2)),
    jsHeapTotalMB: Number(((value('JSHeapTotalSize') ?? 0) / 1048576).toFixed(2)),
    domNodes: value('Nodes'),
    jsEventListeners: value('JSEventListeners'),
    documents: value('Documents'),
    ...dom,
  };
}

async function drive(page, seconds, onSecond) {
  const held = new Set();
  const started = Date.now();
  let lastSecond = -1;
  for (;;) {
    const state = await page.evaluate(() => window.__pirateBattle.observe());
    if (!state || state.simulationPhase !== 'running') break;
    const elapsedSecond = Math.floor(state.elapsed);
    if (elapsedSecond !== lastSecond) {
      lastSecond = elapsedSecond;
      onSecond?.(state);
    }
    const wanted = decide(state);
    for (const [command, key] of Object.entries(KEYS)) {
      if (wanted[command] && !held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      } else if (!wanted[command] && held.has(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    }
    if ((Date.now() - started) / 1000 > seconds + 30) break;
    await page.waitForTimeout(100);
  }
  for (const key of held) await page.keyboard.up(key);
}

async function main() {
  const server = await ensureServer();
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info && gl ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });

  await page.addInitScript(
    ([session, interval]) => {
      if (sessionStorage.getItem('profile-seeded')) return;
      sessionStorage.setItem('profile-seeded', '1');
      localStorage.setItem('pirate-battle:settings:v1', JSON.stringify({ sessionSeconds: session, spawnSeconds: interval }));
    },
    [matchSeconds, spawnSeconds],
  );
  await page.goto(baseURL);
  await page.getByRole('heading', { name: 'Pirate Battle' }).waitFor();

  await page.evaluate((value) => window.__pirateBattle.configureNextMatch({ seed: value }), seed);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause' }).waitFor();
  await page.waitForFunction(() => window.__pirateBattle.observe()?.phase === 'running');
  await page.evaluate(() => window.__pirateBattle.resetFrameSamples());

  const timeline = [];
  await drive(page, matchSeconds, (state) => {
    timeline.push({
      second: Math.floor(state.elapsed),
      enemies: state.enemies.length,
      projectiles: state.projectiles.length,
      spritesShips: state.display?.ships ?? null,
      spritesProjectiles: state.display?.projectiles ?? null,
      effects: state.display?.effects ?? null,
      score: state.score,
      health: state.player.health,
    });
  });
  const final = await page.evaluate(() => window.__pirateBattle.observe());
  const intervals = await page.evaluate(() => window.__pirateBattle.frameSamples());
  await page.screenshot({ path: resolve(outDir, `${process.env.PROFILE_NAME ?? `session-${matchSeconds}s-spawn-${spawnSeconds}s`}-end.png`) });

  await page.waitForURL(/#\/result/, { timeout: 10_000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('heading', { name: 'Pirate Battle' }).waitFor();

  const cycles = [];
  cycles.push({ label: 'menu baseline', ...(await metrics(page, client)) });
  for (let cycle = 1; cycle <= Number(process.env.PROFILE_CYCLES ?? 5); cycle += 1) {
    await page.evaluate((value) => window.__pirateBattle.configureNextMatch({ seed: value }), 100 + cycle);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Pause' }).waitFor();
    const during = await metrics(page, client);
    await drive(page, 20, null).catch(() => undefined);
    const playing = await page.evaluate(() => window.__pirateBattle.observe());
    if (playing && playing.phase === 'running') {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main Menu' }).click();
    } else {
      await page.waitForURL(/#\/result/, { timeout: 10_000 }).catch(() => undefined);
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
    await page.getByRole('heading', { name: 'Pirate Battle' }).waitFor();
    cycles.push({ label: `after cycle ${cycle}`, inMatchHeapMB: during.jsHeapUsedMB, ...(await metrics(page, client)) });
  }

  const version = browser.version();
  const report = {
    recordedAt: new Date().toISOString(),
    environment: {
      host: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cores: os.cpus().length,
      memoryGB: Number((os.totalmem() / 1073741824).toFixed(1)),
      browser: `Chromium ${version} (Playwright, headless)`,
      gpuRenderer: gpu,
      viewport,
      deviceScaleFactor: 1,
      build: 'vite build --mode e2e (minified production bundle with test hooks enabled)',
    },
    match: { sessionSeconds: matchSeconds, spawnSeconds, seed, input: 'scripts/autopilot.mjs pressing real keys every 100 ms' },
    result: final ? { phase: final.simulationPhase, elapsed: final.elapsed, score: final.score, health: final.player.health } : null,
    frames: stats(intervals),
    maxEntities: {
      enemies: Math.max(...timeline.map((row) => row.enemies)),
      projectiles: Math.max(...timeline.map((row) => row.projectiles)),
      effects: Math.max(...timeline.map((row) => row.effects ?? 0)),
    },
    timeline,
    cycles,
  };
  const name = process.env.PROFILE_NAME ?? `session-${matchSeconds}s-spawn-${spawnSeconds}s`;
  writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify(report, null, 2));
  writeFileSync(resolve(outDir, `${name}-frame-intervals.json`), JSON.stringify(intervals));
  console.log(JSON.stringify({ result: report.result, frames: report.frames, maxEntities: report.maxEntities, cycles }, null, 2));
  await browser.close();
  server?.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
