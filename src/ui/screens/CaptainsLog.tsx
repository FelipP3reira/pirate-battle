import { useState, type ReactNode } from 'react';
import type { MatchRecord, RankingEntry } from '../../data/contracts';
import type { PlayerIdentity } from '../../data/player';
import { useHistoryQuery, useRankingQuery } from '../../data/queries';
import type { MatchSettings } from '../../game/config';
import { formatClock, formatDay, formatReason, formatTime } from '../format';
import { GameButton, hudUrl, Panel, RoundButton, useHeadingFocus } from '../components';

type Tab = 'ranking' | 'history';

interface QueryView<T> {
  data: { items: T[]; page: number; totalPages: number; totalItems: number } | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
  refetch: () => unknown;
}

function Pagination({ page, totalPages, onPage, busy }: { page: number; totalPages: number; onPage: (page: number) => void; busy: boolean }) {
  return (
    <nav className="pagination" aria-label="Pages">
      <RoundButton icon="turn_left" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
      <span className="pagination__label" aria-live="polite" aria-busy={busy}>
        Page {page} of {totalPages}
      </span>
      <RoundButton icon="turn_right" label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
    </nav>
  );
}

function TableState<T>({
  query,
  emptyText,
  label,
  children,
}: {
  query: QueryView<T>;
  emptyText: string;
  label: string;
  children: (items: T[]) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <p className="log-state" role="status">
        Loading {label}...
      </p>
    );
  }
  if (query.isError && !query.data) {
    return (
      <div className="log-state log-state--error" role="alert">
        <p>
          Could not load the {label}. {query.error?.message}
        </p>
        <GameButton variant="secondary" size="small" onClick={() => void query.refetch()}>
          Try again
        </GameButton>
      </div>
    );
  }
  if (!query.data || query.data.items.length === 0) {
    return (
      <p className="log-state" role="status">
        {emptyText}
      </p>
    );
  }
  return <>{children(query.data.items)}</>;
}

function RefreshStatus<T>({ query, label }: { query: QueryView<T>; label: string }) {
  let message = '';
  if (query.isFetching && query.data) message = `Updating ${label}...`;
  else if (query.isError && query.data) message = `Showing saved ${label}. Refresh failed: ${query.error?.message ?? ''}`;
  return (
    <p className={`log-refresh ${query.isError ? 'log-refresh--error' : ''}`} role="status">
      {message}
      {query.isError && query.data && (
        <button type="button" className="text-button" onClick={() => void query.refetch()}>
          Retry
        </button>
      )}
    </p>
  );
}

function RankingTable({ configKey, settings, player }: { configKey: string; settings: MatchSettings; player: PlayerIdentity }) {
  const [page, setPage] = useState(1);
  const query = useRankingQuery(configKey, page);
  return (
    <div className="log-body" id="log-panel-ranking" role="tabpanel" aria-labelledby="log-tab-ranking">
      <p className="log-subtitle">
        {settings.difficulty} · {settings.sessionSeconds} second battles · {settings.spawnSeconds} second spawn interval
      </p>
      <RefreshStatus query={query} label="ranking" />
      <TableState query={query} emptyText="No battles in this ranking yet. Be the first to set sail." label="ranking">
        {(items: RankingEntry[]) => (
          <table className={`log-table log-table--ranking ${query.isPlaceholderData ? 'log-table--stale' : ''}`}>
            <caption className="visually-hidden">Ranking, page {query.data?.page}</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const mine = entry.playerId === player.id;
                return (
                  <tr key={entry.matchId} className={mine ? 'is-mine' : undefined} data-match-id={entry.matchId}>
                    <td className="log-table__rank">{String(entry.rank).padStart(2, '0')}</td>
                    <td className="log-table__name">
                      {entry.rank === 1 && <img src={hudUrl('icon_score')} alt="" className="log-table__star" />}
                      {entry.playerName}
                      {mine && <span className="you-badge">You</span>}
                    </td>
                    <td className="log-table__points">{entry.score}</td>
                    <td className="log-table__date">
                      {formatDay(entry.completedAt)} · {formatTime(entry.completedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableState>
      {query.data && <Pagination page={page} totalPages={query.data.totalPages} onPage={setPage} busy={query.isFetching} />}
    </div>
  );
}

function HistoryTable({ player, highlightId }: { player: PlayerIdentity; highlightId: string | null }) {
  const [page, setPage] = useState(1);
  const query = useHistoryQuery(player.id, page);
  return (
    <div className="log-body" id="log-panel-history" role="tabpanel" aria-labelledby="log-tab-history">
      <p className="log-subtitle">{player.name} · Your recent battles</p>
      <RefreshStatus query={query} label="match history" />
      <TableState query={query} emptyText="No battles logged yet. Finish a match to see it here." label="match history">
        {(items: MatchRecord[]) => (
          <table className={`log-table log-table--history ${query.isPlaceholderData ? 'log-table--stale' : ''}`}>
            <caption className="visually-hidden">Match history, page {query.data?.page}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((record) => (
                <tr key={record.matchId} className={record.matchId === highlightId ? 'is-mine' : undefined} data-match-id={record.matchId}>
                  <td className="log-table__date-main">
                    {formatDay(record.completedAt)} <span className="log-table__time">· {formatTime(record.completedAt)}</span>
                  </td>
                  <td className="log-table__points">{record.score}</td>
                  <td>{formatClock(record.durationSeconds)}</td>
                  <td className={`log-table__reason log-table__reason--${record.endReason}`}>{formatReason(record.endReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableState>
      {query.data && <Pagination page={page} totalPages={query.data.totalPages} onPage={setPage} busy={query.isFetching} />}
    </div>
  );
}

export function CaptainsLog({
  tab,
  onTab,
  onClose,
  settings,
  configKey,
  player,
  highlightId,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onClose: () => void;
  settings: MatchSettings;
  configKey: string;
  player: PlayerIdentity;
  highlightId: string | null;
}) {
  const headingRef = useHeadingFocus<HTMLHeadingElement>();
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'history', label: 'Match History' },
  ];
  return (
    <Panel wide labelledBy="log-title" className="log">
      <h1 id="log-title" className="panel-title" tabIndex={-1} ref={headingRef}>
        Captain's Log
      </h1>
      <div className="log-tabs" role="tablist" aria-label="Captain's log">
        {tabs.map((item) => (
          <GameButton
            key={item.id}
            id={`log-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`log-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            variant={tab === item.id ? 'primary' : 'secondary'}
            size="small"
            onClick={() => onTab(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const next = item.id === 'ranking' ? 'history' : 'ranking';
                onTab(next);
                window.requestAnimationFrame(() => document.getElementById(`log-tab-${next}`)?.focus());
              }
            }}
          >
            {item.label}
          </GameButton>
        ))}
      </div>
      {tab === 'ranking' ? (
        <RankingTable key={configKey} configKey={configKey} settings={settings} player={player} />
      ) : (
        <HistoryTable player={player} highlightId={highlightId} />
      )}
      <GameButton onClick={onClose} sound="back" className="log__close">
        Main Menu
      </GameButton>
    </Panel>
  );
}
