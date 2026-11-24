import axios, { AxiosError } from 'axios';
import { API_ROUTES, type ApiError, type HistoryPage, type HistoryQuery, type MatchRecord, type RankingPage, type RankingQuery } from './contracts';

export const REQUEST_TIMEOUT_MS = 4000;

export const http = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

export class RequestFailure extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'server' | 'client' | 'cancelled',
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'RequestFailure';
  }

  get transient(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'server';
  }
}

function describe(error: unknown): RequestFailure {
  if (error instanceof RequestFailure) return error;
  if (axios.isCancel(error)) return new RequestFailure('Request cancelled.', 'cancelled', null);
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new RequestFailure('The server took too long to answer.', 'timeout', null);
    }
    const response = error.response;
    if (!response) return new RequestFailure('Could not reach the server.', 'network', null);
    const body = response.data as Partial<ApiError> | undefined;
    const message = typeof body?.message === 'string' ? body.message : `Request failed with status ${response.status}.`;
    if (response.status >= 500 || response.status === 429) return new RequestFailure(message, 'server', response.status);
    return new RequestFailure(message, 'client', response.status);
  }
  return new RequestFailure('Unexpected error.', 'network', null);
}

export async function fetchRanking(query: RankingQuery, signal?: AbortSignal): Promise<RankingPage> {
  try {
    const response = await http.get<RankingPage>(API_ROUTES.ranking, { params: query, ...(signal ? { signal } : {}) });
    return response.data;
  } catch (error) {
    throw describe(error);
  }
}

export async function fetchHistory(query: HistoryQuery, signal?: AbortSignal): Promise<HistoryPage> {
  try {
    const response = await http.get<HistoryPage>(API_ROUTES.history, { params: query, ...(signal ? { signal } : {}) });
    return response.data;
  } catch (error) {
    throw describe(error);
  }
}

export async function postMatch(record: MatchRecord): Promise<MatchRecord> {
  try {
    const response = await http.post<MatchRecord>(API_ROUTES.matches, record, {
      headers: { 'Idempotency-Key': record.matchId },
    });
    return response.data;
  } catch (error) {
    throw describe(error);
  }
}
