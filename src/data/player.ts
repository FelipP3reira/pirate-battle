import { isRecord, readJson, STORAGE_KEYS, writeJson } from './storage';

export interface PlayerIdentity {
  id: string;
  name: string;
}

const CAPTAIN_NAMES = ['Captain Jack', 'Captain Reed', 'Captain Vale', 'Captain Moss', 'Captain Wren', 'Captain Hale'];

let cached: PlayerIdentity | null = null;

function createIdentity(): PlayerIdentity {
  const id = crypto.randomUUID();
  const index = Number.parseInt(id.slice(0, 2), 16) % CAPTAIN_NAMES.length;
  return { id, name: CAPTAIN_NAMES[index] ?? 'Captain Jack' };
}

export function getPlayer(): PlayerIdentity {
  if (cached) return cached;
  const stored = readJson(STORAGE_KEYS.player);
  if (isRecord(stored) && typeof stored.id === 'string' && typeof stored.name === 'string') {
    cached = { id: stored.id, name: stored.name };
    return cached;
  }
  cached = createIdentity();
  writeJson(STORAGE_KEYS.player, cached);
  return cached;
}
