import { COMMAND_BINDINGS, PAUSE_KEY_LABELS } from '../../input/bindings';
import { GameButton, Panel, useHeadingFocus } from '../components';

const UI = `${import.meta.env.BASE_URL}assets/png/default/ui/menu`;

const CONTROL_GROUPS = [
  { label: 'Sail', commands: ['forward'] },
  { label: 'Turn', commands: ['turnLeft', 'turnRight'] },
  { label: 'Bow cannon', commands: ['fireFront'] },
  { label: 'Broadsides', commands: ['fireLeft', 'fireRight'] },
] as const;

function keysFor(commands: readonly string[]): string[] {
  return commands.flatMap((command) => COMMAND_BINDINGS.find((binding) => binding.command === command)?.keyLabels ?? []);
}

export function MenuScreen({
  onPlay,
  onOptions,
  onRanking,
  onHistory,
  pendingCount,
}: {
  onPlay: () => void;
  onOptions: () => void;
  onRanking: () => void;
  onHistory: () => void;
  pendingCount: number;
}) {
  const headingRef = useHeadingFocus<HTMLHeadingElement>();
  return (
    <Panel labelledBy="menu-title" className="menu">
      <h1 id="menu-title" className="menu__title" tabIndex={-1} ref={headingRef}>
        <img src={`${UI}/title_pirate_battle.png`} alt="Pirate Battle" />
      </h1>
      <p className="menu__tagline">Set sail. Take command.</p>
      <div className="menu__actions">
        <GameButton onClick={onPlay}>Play</GameButton>
        <GameButton onClick={onOptions}>Options</GameButton>
      </div>
      <section className="controls-card" aria-labelledby="controls-title">
        <h2 id="controls-title" className="visually-hidden">
          Controls
        </h2>
        <dl className="controls-card__list">
          {CONTROL_GROUPS.map((group) => (
            <div key={group.label} className="controls-card__item">
              <dt>{group.label}</dt>
              <dd>
                {keysFor(group.commands).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dd>
            </div>
          ))}
          <div className="controls-card__item">
            <dt>Pause</dt>
            <dd>
              {PAUSE_KEY_LABELS.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dd>
          </div>
        </dl>
        <p className="controls-card__touch">On touch screens, steer with the left buttons and fire with the right buttons.</p>
      </section>
      <p className="menu__hint">Navigate the islands. Survive the battle.</p>
      {pendingCount > 0 && (
        <p className="menu__pending" role="status">
          {pendingCount === 1 ? '1 battle is waiting to be saved.' : `${pendingCount} battles are waiting to be saved.`}
        </p>
      )}
      <nav className="menu__log" aria-label="Captain's log">
        <GameButton variant="secondary" size="small" onClick={onRanking}>
          Ranking
        </GameButton>
        <GameButton variant="secondary" size="small" onClick={onHistory}>
          Match History
        </GameButton>
      </nav>
    </Panel>
  );
}
