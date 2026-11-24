import { delay, http, HttpResponse } from 'msw';
import { API_ROUTES, type ApiError, type HistoryPage, type MatchRecord, type RankingPage } from '../data/contracts';
import { isRecord } from '../data/storage';
import { createRandom, type Random } from '../game/random';
import {
  allRecords,
  compareHistory,
  compareRanking,
  findConfirmed,
  insertConfirmed,
  sameSubmission,
  toRankingEntry,
} from './database';
import { getScenario, TIMEOUT_DELAY_MS, type ScenarioId } from './scenarios';

interface ScenarioState {
  reads: number;
  latency: Random;
  lostAcknowledgmentUsed: boolean;
}

const state: ScenarioState = {
  reads: 0,
  latency: createRandom(2026),
  lostAcknowledgmentUsed: false,
};

export function resetScenarioState(): void {
  state.reads = 0;
  state.latency = createRandom(2026);
  state.lostAcknowledgmentUsed = false;
}

function error(status: number, code: ApiError['code'], message: string) {
  return HttpResponse.json<ApiError>({ code, message }, { status });
}

async function latency(scenario: ScenarioId, read: boolean): Promise<void> {
  switch (scenario) {
    case 'slow':
      await delay(2500);
      return;
    case 'variable-latency':
      await delay(Math.round(state.latency.range(150, 2200)));
      return;
    case 'out-of-order':
      if (read) {
        state.reads += 1;
        await delay(state.reads % 2 === 1 ? 2400 : 200);
        return;
      }
      await delay(150);
      return;
    case 'timeout':
      await delay(TIMEOUT_DELAY_MS);
      return;
    default:
      await delay(120);
  }
}

function failure(scenario: ScenarioId, resource: 'ranking' | 'history' | 'matches') {
  switch (scenario) {
    case 'connection-lost':
      return HttpResponse.error();
    case 'client-error':
      return resource === 'matches'
        ? error(422, 'invalid_request', 'The battle record was rejected.')
        : error(400, 'invalid_request', 'The request parameters were rejected.');
    case 'server-error':
      return error(503, 'unavailable', 'The captain’s log is temporarily unavailable.');
    case 'ranking-down':
      return resource === 'ranking' ? error(500, 'internal', 'Ranking could not be loaded.') : null;
    case 'history-down':
      return resource === 'history' ? error(500, 'internal', 'Match history could not be loaded.') : null;
    case 'offline-at-finish':
      return resource === 'matches' ? HttpResponse.error() : null;
    default:
      return null;
  }
}

function pageParams(url: URL): { page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '5');
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  return { page, pageSize };
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalItems, totalPages };
}

function isMatchRecord(value: unknown): value is MatchRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === 'string' &&
    value.matchId.length > 0 &&
    typeof value.playerId === 'string' &&
    typeof value.playerName === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.completedAt === 'string' &&
    typeof value.score === 'number' &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    typeof value.durationSeconds === 'number' &&
    value.durationSeconds > 0 &&
    (value.endReason === 'time-up' || value.endReason === 'destroyed') &&
    isRecord(value.config) &&
    typeof value.configKey === 'string'
  );
}

export const handlers = [
  http.get(API_ROUTES.ranking, async ({ request }) => {
    const scenario = getScenario();
    await latency(scenario, true);
    if (scenario === 'timeout') return error(504, 'unavailable', 'Ranking timed out.');
    const failed = failure(scenario, 'ranking');
    if (failed) return failed;
    const url = new URL(request.url);
    const configKey = url.searchParams.get('configKey');
    const params = pageParams(url);
    if (!configKey || !params) return error(400, 'invalid_request', 'configKey, page and pageSize are required.');
    const ranked = allRecords(scenario)
      .filter((record) => record.configKey === configKey)
      .sort(compareRanking)
      .map((record, index) => toRankingEntry(record, index + 1));
    return HttpResponse.json<RankingPage>({ ...paginate(ranked, params.page, params.pageSize), configKey });
  }),

  http.get(API_ROUTES.history, async ({ request }) => {
    const scenario = getScenario();
    await latency(scenario, true);
    if (scenario === 'timeout') return error(504, 'unavailable', 'Match history timed out.');
    const failed = failure(scenario, 'history');
    if (failed) return failed;
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');
    const params = pageParams(url);
    if (!playerId || !params) return error(400, 'invalid_request', 'playerId, page and pageSize are required.');
    const history = allRecords(scenario)
      .filter((record) => record.playerId === playerId)
      .sort(compareHistory);
    return HttpResponse.json<HistoryPage>({ ...paginate(history, params.page, params.pageSize), playerId });
  }),

  http.post(API_ROUTES.matches, async ({ request }) => {
    const scenario = getScenario();
    const body: unknown = await request.json().catch(() => null);
    if (scenario !== 'commit-then-timeout') await latency(scenario, false);
    if (scenario === 'timeout') return error(504, 'unavailable', 'The registration timed out before it was stored.');
    const failed = failure(scenario, 'matches');
    if (failed) return failed;
    if (!isMatchRecord(body)) return error(400, 'invalid_request', 'The battle record is incomplete.');

    const existing = findConfirmed(body.matchId);
    if (existing) {
      if (!sameSubmission(existing, body)) {
        return error(409, 'conflict', 'A different battle was already saved with this id.');
      }
      await delay(120);
      return HttpResponse.json<MatchRecord>(existing, { status: 200 });
    }

    insertConfirmed(body);
    if (scenario === 'commit-then-timeout' && !state.lostAcknowledgmentUsed) {
      state.lostAcknowledgmentUsed = true;
      await delay(TIMEOUT_DELAY_MS);
    } else {
      await delay(120);
    }
    return HttpResponse.json<MatchRecord>(body, { status: 201 });
  }),
];
