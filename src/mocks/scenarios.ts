import { REQUEST_TIMEOUT_MS } from '../data/client';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from '../data/storage';

export type ScenarioId =
  | 'normal'
  | 'empty'
  | 'many-pages'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'timeout'
  | 'connection-lost'
  | 'client-error'
  | 'server-error'
  | 'ranking-down'
  | 'history-down'
  | 'commit-then-timeout'
  | 'offline-at-finish';

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  description: string;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'normal', label: 'Normal', description: 'Seeded captains, fast and successful responses.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history start with no records.' },
  { id: 'many-pages', label: 'Many pages', description: 'Adds 60 seeded battles to the default cohort.' },
  { id: 'slow', label: 'Slow network', description: 'Every request waits a fixed 2.5 seconds.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded delays between 150 ms and 2.2 s.' },
  {
    id: 'out-of-order',
    label: 'Out-of-order responses',
    description: 'Odd-numbered reads answer after 2.4 s, even-numbered reads after 200 ms.',
  },
  { id: 'timeout', label: 'Timeout', description: 'Requests never answer before the client timeout.' },
  { id: 'connection-lost', label: 'Connection lost', description: 'Requests fail at the network layer.' },
  { id: 'client-error', label: 'HTTP 4xx', description: 'Reads answer 400 and registrations answer 422.' },
  { id: 'server-error', label: 'HTTP 5xx', description: 'Every request answers 503.' },
  { id: 'ranking-down', label: 'Ranking unavailable', description: 'Only ranking reads fail with 500.' },
  { id: 'history-down', label: 'History unavailable', description: 'Only history reads fail with 500.' },
  {
    id: 'commit-then-timeout',
    label: 'Lost acknowledgment',
    description: 'The first registration is stored, but its response arrives after the client timeout.',
  },
  {
    id: 'offline-at-finish',
    label: 'Offline at finish',
    description: 'Registrations fail before storage until you switch back to Normal.',
  },
];

export const TIMEOUT_DELAY_MS = REQUEST_TIMEOUT_MS + 1500;

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && SCENARIOS.some((scenario) => scenario.id === value);
}

export function getScenario(): ScenarioId {
  const stored = readJson(STORAGE_KEYS.scenario);
  return isScenarioId(stored) ? stored : 'normal';
}

export function setScenario(id: ScenarioId): void {
  if (id === 'normal') removeKey(STORAGE_KEYS.scenario);
  else writeJson(STORAGE_KEYS.scenario, id);
}

export function applyScenarioFromUrl(): void {
  const requested = new URLSearchParams(window.location.search).get('scenario');
  if (isScenarioId(requested)) setScenario(requested);
}
