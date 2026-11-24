import { canonical } from '../data/configKey';
import type { MatchRecord, RankingEntry } from '../data/contracts';
import { isRecord, readJson, removeKey, STORAGE_KEYS, writeJson } from '../data/storage';
import { defaultFixtures, manyPageFixtures } from './fixtures';
import type { ScenarioId } from './scenarios';

interface StoredDatabase {
  version: 1;
  confirmed: MatchRecord[];
}

function load(): MatchRecord[] {
  const stored = readJson(STORAGE_KEYS.mockDatabase);
  if (isRecord(stored) && Array.isArray(stored.confirmed)) return stored.confirmed as MatchRecord[];
  return [];
}

function save(confirmed: MatchRecord[]): void {
  const payload: StoredDatabase = { version: 1, confirmed };
  writeJson(STORAGE_KEYS.mockDatabase, payload);
}

function seedFor(scenario: ScenarioId): MatchRecord[] {
  if (scenario === 'empty') return [];
  if (scenario === 'many-pages') return manyPageFixtures();
  return defaultFixtures();
}

export function allRecords(scenario: ScenarioId): MatchRecord[] {
  return [...seedFor(scenario), ...load()];
}

export function findConfirmed(matchId: string): MatchRecord | undefined {
  return load().find((record) => record.matchId === matchId);
}

export function insertConfirmed(record: MatchRecord): void {
  save([...load(), record]);
}

export function resetDatabase(): void {
  removeKey(STORAGE_KEYS.mockDatabase);
}

export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.completedAt !== b.completedAt) return a.completedAt < b.completedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export function compareHistory(a: MatchRecord, b: MatchRecord): number {
  if (a.completedAt !== b.completedAt) return a.completedAt > b.completedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export function toRankingEntry(record: MatchRecord, rank: number): RankingEntry {
  return {
    rank,
    matchId: record.matchId,
    playerId: record.playerId,
    playerName: record.playerName,
    score: record.score,
    durationSeconds: record.durationSeconds,
    endReason: record.endReason,
    completedAt: record.completedAt,
  };
}

export function sameSubmission(a: MatchRecord, b: MatchRecord): boolean {
  return canonical(a) === canonical(b);
}
