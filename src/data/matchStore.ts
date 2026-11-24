import type { MatchRecord } from './contracts';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from './storage';

export interface MatchesSnapshot {
  lastResult: MatchRecord | null;
  pending: MatchRecord[];
  savedIds: string[];
}

export type RegistrationStatus = 'saving' | 'pending' | 'saved';

export interface RegistrationState {
  status: RegistrationStatus;
  error: string | null;
}

const EMPTY: MatchesSnapshot = { lastResult: null, pending: [], savedIds: [] };
const SAVED_HISTORY_LIMIT = 50;

function isMatchRecord(value: unknown): value is MatchRecord {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.score === 'number' &&
    typeof value.durationSeconds === 'number' &&
    typeof value.completedAt === 'string' &&
    isRecord(value.config)
  );
}

function load(): MatchesSnapshot {
  const stored = readJson(STORAGE_KEYS.matches);
  if (!isRecord(stored)) return EMPTY;
  return {
    lastResult: isMatchRecord(stored.lastResult) ? stored.lastResult : null,
    pending: Array.isArray(stored.pending) ? stored.pending.filter(isMatchRecord) : [],
    savedIds: Array.isArray(stored.savedIds) ? stored.savedIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

class MatchStore {
  private snapshot: MatchesSnapshot = load();
  private readonly inFlight = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MatchesSnapshot => this.snapshot;

  getVersion = (): number => this.version;

  reload(): void {
    this.snapshot = load();
    this.inFlight.clear();
    this.errors.clear();
    this.emit();
  }

  // Saved before any request goes out, so a refresh or a dead connection right
  // after the match never loses the result.
  recordCompleted(record: MatchRecord): void {
    const pending = [...this.snapshot.pending.filter((item) => item.matchId !== record.matchId), record];
    this.commit({ ...this.snapshot, lastResult: record, pending });
  }

  markInFlight(matchId: string): void {
    this.inFlight.add(matchId);
    this.errors.delete(matchId);
    this.emit();
  }

  markSaved(matchId: string): void {
    this.inFlight.delete(matchId);
    this.errors.delete(matchId);
    const savedIds = [matchId, ...this.snapshot.savedIds.filter((id) => id !== matchId)].slice(0, SAVED_HISTORY_LIMIT);
    this.commit({
      ...this.snapshot,
      pending: this.snapshot.pending.filter((item) => item.matchId !== matchId),
      savedIds,
    });
  }

  markFailed(matchId: string, message: string): void {
    this.inFlight.delete(matchId);
    this.errors.set(matchId, message);
    this.emit();
  }

  isInFlight(matchId: string): boolean {
    return this.inFlight.has(matchId);
  }

  registration(matchId: string): RegistrationState {
    if (this.inFlight.has(matchId)) return { status: 'saving', error: null };
    if (this.snapshot.pending.some((item) => item.matchId === matchId)) {
      return { status: 'pending', error: this.errors.get(matchId) ?? null };
    }
    return { status: 'saved', error: null };
  }

  private commit(next: MatchesSnapshot): void {
    this.snapshot = next;
    writeJson(STORAGE_KEYS.matches, next);
    this.emit();
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const matchStore = new MatchStore();
