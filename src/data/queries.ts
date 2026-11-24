import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { fetchHistory, fetchRanking, postMatch, RequestFailure } from './client';
import { PAGE_SIZE, type MatchRecord } from './contracts';
import { matchStore } from './matchStore';

export const queryKeys = {
  ranking: (configKey: string, page: number) => ['ranking', { configKey, page, pageSize: PAGE_SIZE }] as const,
  rankingAll: ['ranking'] as const,
  history: (playerId: string, page: number) => ['history', { playerId, page, pageSize: PAGE_SIZE }] as const,
  historyAll: ['history'] as const,
};

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof RequestFailure && error.transient && failureCount < MAX_RETRIES;
}

export function retryDelay(attempt: number): number {
  return Math.min(4000, 400 * 2 ** attempt);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: shouldRetry,
        retryDelay,
      },
    },
  });
}

export function useRankingQuery(configKey: string, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(configKey, page),
    queryFn: ({ signal }) => fetchRanking({ configKey, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory({ playerId, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

export function useMatchRegistration(): { register: (record: MatchRecord) => void } {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['matches', 'register'],
    scope: { id: 'match-registration' },
    mutationFn: postMatch,
    onMutate: (record) => matchStore.markInFlight(record.matchId),
    onSuccess: (saved) => {
      matchStore.markSaved(saved.matchId);
    },
    onError: (error, record) => {
      matchStore.markFailed(record.matchId, error instanceof Error ? error.message : 'Could not save the battle.');
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.historyAll }),
      ]);
    },
  });

  const { mutate } = mutation;
  const register = useCallback(
    (record: MatchRecord) => {
      if (matchStore.isInFlight(record.matchId)) return;
      matchStore.markInFlight(record.matchId);
      mutate(record);
    },
    [mutate],
  );

  // Anything still pending from a previous visit is retried once on startup.
  const recovered = useRef(false);
  useEffect(() => {
    if (recovered.current) return;
    recovered.current = true;
    for (const record of matchStore.getSnapshot().pending) register(record);
  }, [register]);

  return { register };
}
