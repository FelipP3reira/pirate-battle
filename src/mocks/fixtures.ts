import { configKeyFor } from '../data/configKey';
import type { MatchRecord } from '../data/contracts';
import { createMatchConfig, DEFAULT_SETTINGS, type MatchSettings } from '../game/config';
import { createRandom } from '../game/random';

const CAPTAINS = [
  { id: 'fixture-flint', name: 'Captain Flint' },
  { id: 'fixture-sparrow', name: 'Red Sparrow' },
  { id: 'fixture-storm', name: 'Storm Rider' },
  { id: 'fixture-wolf', name: 'Sea Wolf' },
  { id: 'fixture-marlow', name: 'Anne Marlow' },
  { id: 'fixture-kidd', name: 'Iron Kidd' },
  { id: 'fixture-coral', name: 'Coral Queen' },
  { id: 'fixture-gull', name: 'Old Gull' },
];

const BASE_TIME = Date.UTC(2026, 10, 20, 18, 0, 0);

function buildRecords(seed: number, count: number, settings: MatchSettings, prefix: string): MatchRecord[] {
  const random = createRandom(seed);
  const config = createMatchConfig(settings);
  const configKey = configKeyFor(config);
  const records: MatchRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const captain = CAPTAINS[index % CAPTAINS.length] ?? CAPTAINS[0];
    if (!captain) break;
    const destroyed = random.next() < 0.35;
    const durationSeconds = destroyed ? Math.round(random.range(40, settings.sessionSeconds - 5)) : settings.sessionSeconds;
    const score = Math.round(random.range(4, 36) * (durationSeconds / settings.sessionSeconds));
    const completed = BASE_TIME - index * 47 * 60_000 - Math.round(random.range(0, 30)) * 60_000;
    records.push({
      matchId: `${prefix}-${String(index + 1).padStart(3, '0')}`,
      playerId: captain.id,
      playerName: captain.name,
      startedAt: new Date(completed - durationSeconds * 1000).toISOString(),
      completedAt: new Date(completed).toISOString(),
      score,
      durationSeconds,
      endReason: destroyed ? 'destroyed' : 'time-up',
      config,
      configKey,
    });
  }
  return records;
}

export function defaultFixtures(): MatchRecord[] {
  return [
    ...buildRecords(7, 13, DEFAULT_SETTINGS, 'seed-default'),
    ...buildRecords(5, 8, { ...DEFAULT_SETTINGS, difficulty: 'hard' }, 'seed-hard'),
    ...buildRecords(11, 9, { sessionSeconds: 60, spawnSeconds: 2, difficulty: 'normal' }, 'seed-short'),
    ...buildRecords(13, 9, { sessionSeconds: 180, spawnSeconds: 4, difficulty: 'normal' }, 'seed-long'),
  ];
}

export function manyPageFixtures(): MatchRecord[] {
  return [...defaultFixtures(), ...buildRecords(17, 60, DEFAULT_SETTINGS, 'seed-bulk')];
}
