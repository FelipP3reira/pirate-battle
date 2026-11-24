import type { QueryClient } from '@tanstack/react-query';
import { matchStore } from '../data/matchStore';
import { removeKey, STORAGE_KEYS } from '../data/storage';
import { resetDatabase } from './database';
import { resetScenarioState } from './handlers';
import { setScenario, type ScenarioId } from './scenarios';

export function selectScenario(id: ScenarioId, queryClient: QueryClient): void {
  setScenario(id);
  resetScenarioState();
  void queryClient.invalidateQueries();
}

export function resetNetworkState(queryClient: QueryClient): void {
  setScenario('normal');
  resetScenarioState();
  resetDatabase();
  removeKey(STORAGE_KEYS.matches);
  matchStore.reload();
  queryClient.clear();
}
