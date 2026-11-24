import type { MatchConfig } from '../game/config';
import type { EndReason } from '../game/types';

export interface MatchRecord {
  matchId: string;
  playerId: string;
  playerName: string;
  startedAt: string;
  completedAt: string;
  score: number;
  durationSeconds: number;
  endReason: EndReason;
  config: MatchConfig;
  configKey: string;
}

export interface RankingEntry {
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationSeconds: number;
  endReason: EndReason;
  completedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface RankingPage extends Page<RankingEntry> {
  configKey: string;
}

export interface HistoryPage extends Page<MatchRecord> {
  playerId: string;
}

export interface RankingQuery {
  configKey: string;
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: 'invalid_request' | 'conflict' | 'not_found' | 'unavailable' | 'internal';
  message: string;
}

export const API_ROUTES = {
  matches: '/api/matches',
  ranking: '/api/ranking',
  history: '/api/history',
} as const;

export const PAGE_SIZE = 5;
