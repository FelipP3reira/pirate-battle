export const STORAGE_PREFIX = 'pirate-battle:';

export const STORAGE_KEYS = {
  settings: `${STORAGE_PREFIX}settings:v1`,
  player: `${STORAGE_PREFIX}player:v1`,
  matches: `${STORAGE_PREFIX}matches:v1`,
  mockDatabase: `${STORAGE_PREFIX}mock-db:v1`,
  scenario: `${STORAGE_PREFIX}scenario:v1`,
} as const;

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
