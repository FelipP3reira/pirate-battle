import type { MatchRecord } from '../../data/contracts';
import type { RegistrationState } from '../../data/matchStore';
import { formatClock, formatReason, spokenDuration } from '../format';
import { GameButton, Panel, useHeadingFocus } from '../components';

function RegistrationLine({ state, onRetry }: { state: RegistrationState; onRetry: () => void }) {
  if (state.status === 'saved') {
    return (
      <p className="registration registration--saved" role="status">
        Saved to the Captain's Log.
      </p>
    );
  }
  if (state.status === 'saving') {
    return (
      <p className="registration" role="status">
        Saving to the Captain's Log...
      </p>
    );
  }
  return (
    <div className="registration registration--pending" role="status">
      <p>
        Not saved yet{state.error ? `: ${state.error}` : '.'} It is kept on this device until it is saved.
      </p>
      <GameButton variant="secondary" size="small" onClick={onRetry}>
        Retry save
      </GameButton>
    </div>
  );
}

export function ResultScreen({
  record,
  registration,
  onRetry,
  onPlayAgain,
  onMenu,
}: {
  record: MatchRecord;
  registration: RegistrationState;
  onRetry: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const headingRef = useHeadingFocus<HTMLHeadingElement>();
  const title = record.endReason === 'time-up' ? 'Battle Complete' : 'Ship Destroyed';
  return (
    <Panel labelledBy="result-title" className="result">
      <h1 id="result-title" className="panel-title" tabIndex={-1} ref={headingRef}>
        {title}
      </h1>
      <p className="result__score" aria-label={`${record.score} points`}>
        {record.score}
      </p>
      <p className="result__summary">
        <span>Points</span> · <span aria-label={`played ${spokenDuration(record.durationSeconds)}`}>{formatClock(record.durationSeconds)}</span> ·{' '}
        <span data-testid="end-reason">{formatReason(record.endReason)}</span>
      </p>
      <RegistrationLine state={registration} onRetry={onRetry} />
      <div className="result__actions">
        <GameButton onClick={onPlayAgain}>Play Again</GameButton>
        <GameButton onClick={onMenu} sound="back">
          Main Menu
        </GameButton>
      </div>
    </Panel>
  );
}
