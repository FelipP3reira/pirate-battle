import { useCallback, useSyncExternalStore } from 'react';

export type Route = 'menu' | 'options' | 'ranking' | 'history' | 'play' | 'result';

const PATHS: Record<Route, string> = {
  menu: '#/',
  options: '#/options',
  ranking: '#/log/ranking',
  history: '#/log/history',
  play: '#/play',
  result: '#/result',
};

export function parseRoute(hash: string): Route {
  const entry = (Object.entries(PATHS) as Array<[Route, string]>).find(([, path]) => path === hash);
  return entry?.[0] ?? 'menu';
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function currentHash(): string {
  return window.location.hash || '#/';
}

export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void] {
  const hash = useSyncExternalStore(subscribe, currentHash);
  const navigate = useCallback((route: Route, options?: { replace?: boolean }) => {
    const target = PATHS[route];
    if (currentHash() === target) return;
    if (options?.replace) {
      window.history.replaceState(null, '', target);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = target;
    }
  }, []);
  return [parseRoute(hash), navigate];
}

export function discardInterruptedMatch(): void {
  const route = parseRoute(currentHash());
  if (route === 'play') window.history.replaceState(null, '', PATHS.menu);
}
