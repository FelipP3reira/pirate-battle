import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { configKeyFor } from '../data/configKey';
import type { MatchRecord } from '../data/contracts';
import { matchStore } from '../data/matchStore';
import { getPlayer } from '../data/player';
import { createQueryClient, useMatchRegistration } from '../data/queries';
import { loadSettings, saveSettings } from '../data/settings';
import { createMatchConfig, type MatchConfig, type MatchSettings } from '../game/config';
import type { MatchResult } from '../game/types';
import { SceneBackdrop } from '../ui/components';
import { CaptainsLog } from '../ui/screens/CaptainsLog';
import { CombatScreen } from '../ui/screens/CombatScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { NetworkLab } from '../ui/screens/NetworkLab';
import { OptionsPanel } from '../ui/screens/OptionsPanel';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { useRoute } from './router';

interface ActiveMatch {
  matchId: string;
  config: MatchConfig;
  startedAt: string;
}

function useMatches() {
  useSyncExternalStore(matchStore.subscribe, matchStore.getVersion);
  return matchStore.getSnapshot();
}

function Shell() {
  const [route, navigate] = useRoute();
  const [settings, setSettings] = useState<MatchSettings>(loadSettings);
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const player = useMemo(() => getPlayer(), []);
  const matches = useMatches();
  const { register } = useMatchRegistration();
  const resultTimer = useRef<number | null>(null);
  const awaitingCombat = useRef<string | null>(null);

  const rankingConfigKey = useMemo(() => configKeyFor(createMatchConfig(settings)), [settings]);

  const updateSettings = useCallback((next: MatchSettings) => {
    setSettings(next);
    return saveSettings(next);
  }, []);

  const startMatch = useCallback(() => {
    if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
    const matchId = crypto.randomUUID();
    awaitingCombat.current = matchId;
    setMatch({
      matchId,
      config: createMatchConfig(settings),
      startedAt: new Date().toISOString(),
    });
    navigate('play');
  }, [navigate, settings]);

  useEffect(() => {
    if (route === 'play') {
      awaitingCombat.current = null;
      if (!match) navigate('menu', { replace: true });
      return;
    }
    if (match && awaitingCombat.current !== match.matchId) setMatch(null);
  }, [route, match, navigate]);

  useEffect(
    () => () => {
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
    },
    [],
  );

  const handleEnded = useCallback(
    (result: MatchResult) => {
      if (!match) return;
      const record: MatchRecord = {
        matchId: match.matchId,
        playerId: player.id,
        playerName: player.name,
        startedAt: match.startedAt,
        completedAt: new Date().toISOString(),
        score: result.score,
        durationSeconds: result.elapsedSeconds,
        endReason: result.reason,
        config: match.config,
        configKey: configKeyFor(match.config),
      };
      matchStore.recordCompleted(record);
      register(record);
      resultTimer.current = window.setTimeout(() => {
        resultTimer.current = null;
        if (window.location.hash === '#/play') navigate('result', { replace: true });
      }, 1200);
    },
    [match, navigate, player, register],
  );

  if (route === 'play' && match) {
    return (
      <CombatScreen
        key={match.matchId}
        config={match.config}
        settings={settings}
        onSettingsChange={updateSettings}
        onEnded={handleEnded}
        onExit={() => navigate('menu')}
      />
    );
  }

  let content;
  if (route === 'options') {
    content = <OptionsPanel settings={settings} onChange={updateSettings} onClose={() => navigate('menu')} />;
  } else if (route === 'ranking' || route === 'history') {
    content = (
      <CaptainsLog
        tab={route}
        onTab={(tab) => navigate(tab, { replace: true })}
        onClose={() => navigate('menu')}
        settings={settings}
        configKey={rankingConfigKey}
        player={player}
        highlightId={matches.lastResult?.matchId ?? null}
      />
    );
  } else if (route === 'result' && matches.lastResult) {
    const record = matches.lastResult;
    content = (
      <ResultScreen
        record={record}
        registration={matchStore.registration(record.matchId)}
        onRetry={() => register(record)}
        onPlayAgain={startMatch}
        onMenu={() => navigate('menu')}
      />
    );
  } else {
    content = (
      <MenuScreen
        onPlay={startMatch}
        onOptions={() => navigate('options')}
        onRanking={() => navigate('ranking')}
        onHistory={() => navigate('history')}
        pendingCount={matches.pending.length}
      />
    );
  }

  return (
    <SceneBackdrop>
      {content}
      <NetworkLab />
    </SceneBackdrop>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}
