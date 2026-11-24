import { DEFAULT_SETTINGS, validateSetting, type MatchSettings } from '../game/config';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from './storage';

export function loadSettings(): MatchSettings {
  const stored = readJson(STORAGE_KEYS.settings);
  if (!isRecord(stored)) return { ...DEFAULT_SETTINGS };
  const sessionSeconds = Number(stored.sessionSeconds);
  const spawnSeconds = Number(stored.spawnSeconds);
  return {
    sessionSeconds: validateSetting('sessionSeconds', sessionSeconds) ? DEFAULT_SETTINGS.sessionSeconds : sessionSeconds,
    spawnSeconds: validateSetting('spawnSeconds', spawnSeconds) ? DEFAULT_SETTINGS.spawnSeconds : spawnSeconds,
  };
}

export function saveSettings(settings: MatchSettings): boolean {
  if (validateSetting('sessionSeconds', settings.sessionSeconds) || validateSetting('spawnSeconds', settings.spawnSeconds)) {
    return false;
  }
  return writeJson(STORAGE_KEYS.settings, settings);
}
