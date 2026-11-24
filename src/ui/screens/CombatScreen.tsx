import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { audio } from '../../audio/AudioManager';
import type { MatchConfig, MatchSettings } from '../../game/config';
import { randomSeed } from '../../game/random';
import type { MatchResult } from '../../game/types';
import type { CommandName } from '../../input/bindings';
import { textureLibrary, type GameTextures } from '../../render/assets';
import { GameSession, type HudSnapshot } from '../../session/GameSession';
import { registerSession, takeMatchOverrides } from '../../testing/hooks';
import { GameButton, hudUrl, Panel, RoundButton, useFocusTrap, type IconName } from '../components';
import { formatClock, spokenDuration } from '../format';
import { OptionsPanel } from './OptionsPanel';

type LoadState = { status: 'loading'; progress: number } | { status: 'error'; message: string } | { status: 'ready'; textures: GameTextures };

const STEER_BUTTONS: Array<{ command: CommandName; icon: IconName; label: string; slot: string }> = [
  { command: 'turnLeft', icon: 'turn_left', label: 'Turn left', slot: 'left' },
  { command: 'forward', icon: 'forward', label: 'Sail forward', slot: 'up' },
  { command: 'turnRight', icon: 'turn_right', label: 'Turn right', slot: 'right' },
];

const FIRE_BUTTONS: Array<{ command: CommandName; icon: IconName; label: string; slot: string }> = [
  { command: 'fireLeft', icon: 'fire_left', label: 'Fire port broadside', slot: 'left' },
  { command: 'fireFront', icon: 'fire_front', label: 'Fire bow cannon', slot: 'up' },
  { command: 'fireRight', icon: 'fire_right', label: 'Fire starboard broadside', slot: 'right' },
];

function useTextures(): [LoadState, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>(() => {
    const ready = textureLibrary.ready;
    return ready ? { status: 'ready', textures: ready } : { status: 'loading', progress: 0 };
  });
  useEffect(() => {
    if (textureLibrary.ready) return;
    let active = true;
    textureLibrary
      .load((progress) => {
        if (active) setState({ status: 'loading', progress });
      })
      .then((textures) => {
        if (active) setState({ status: 'ready', textures });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading', progress: 0 });
    setAttempt((value) => value + 1);
  }, []);
  return [state, retry];
}

const IDLE_HUD: HudSnapshot = {
  phase: 'starting',
  pauseReason: null,
  score: 0,
  health: 0,
  maxHealth: 1,
  remainingSeconds: 0,
  result: null,
};

const noopSubscribe = () => () => undefined;

function Hud({ hud, onPause }: { hud: HudSnapshot; onPause: () => void }) {
  const ratio = Math.max(0, Math.min(1, hud.health / hud.maxHealth));
  const fill = ratio > 0.6 ? 'health_fill_green' : ratio > 0.3 ? 'health_fill_amber' : 'health_fill_red';
  return (
    <header className="hud">
      <div className="hud__health" role="meter" aria-label="Ship health" aria-valuemin={0} aria-valuemax={hud.maxHealth} aria-valuenow={hud.health}>
        <img className="hud__heart" src={hudUrl('icon_heart')} alt="" />
        <div className="hud__bar">
          <img className="hud__bar-frame" src={hudUrl('health_frame')} alt="" />
          <div className="hud__bar-fill" style={{ width: `${(30 + 196 * ratio) / 2.56}%` }}>
            <img src={hudUrl(fill)} alt="" />
          </div>
          <span className="hud__bar-text">
            {hud.health} / {hud.maxHealth}
          </span>
        </div>
      </div>
      <div className="hud__right">
        <div className="hud__counter" aria-label={`Score ${hud.score}`}>
          <img src={hudUrl('icon_score')} alt="" />
          <span data-testid="hud-score">{hud.score}</span>
        </div>
        <div className="hud__counter" role="timer" aria-label={`Time remaining ${spokenDuration(hud.remainingSeconds)}`}>
          <img src={hudUrl('icon_time')} alt="" />
          <span data-testid="hud-time">{formatClock(hud.remainingSeconds)}</span>
        </div>
        <RoundButton icon="pause" label="Pause" className="hud__pause" onClick={onPause} disabled={hud.phase !== 'running'} />
      </div>
    </header>
  );
}

function TouchPad({
  buttons,
  side,
  session,
}: {
  buttons: typeof STEER_BUTTONS;
  side: 'steer' | 'fire';
  session: GameSession | null;
}) {
  const press = (command: CommandName) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!session) return;
    event.preventDefault();
    audio.unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.input.pressPointer(event.pointerId, command);
  };
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    session?.input.releasePointer(event.pointerId);
  };
  return (
    <div className={`touch-pad touch-pad--${side}`} role="group" aria-label={side === 'steer' ? 'Steering controls' : 'Cannon controls'}>
      {buttons.map((button) => (
        <button
          key={button.command}
          type="button"
          tabIndex={-1}
          className={`round-button touch-button touch-button--${button.slot}`}
          aria-label={button.label}
          data-command={button.command}
          onPointerDown={press(button.command)}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onContextMenu={(event) => event.preventDefault()}
        >
          <img src={`${import.meta.env.BASE_URL}assets/png/default/ui/controls/icon_${button.icon}.png`} alt="" draggable={false} />
        </button>
      ))}
    </div>
  );
}

function PauseDialog({
  reason,
  onResume,
  onMenu,
  settings,
  onSettingsChange,
  restoreFocus,
}: {
  reason: HudSnapshot['pauseReason'];
  onResume: () => void;
  onMenu: () => void;
  settings: MatchSettings;
  onSettingsChange: (settings: MatchSettings) => boolean;
  restoreFocus: React.RefObject<HTMLElement | null>;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, !showOptions, restoreFocus);
  const message =
    reason === 'blur' ? 'Paused because the window lost focus.' : reason === 'hidden' ? 'Paused while the tab was hidden.' : 'Ready when you are.';
  return (
    <div className="overlay overlay--dim" ref={ref}>
      {showOptions ? (
        <OptionsPanel
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowOptions(false)}
          closeLabel="Back"
          note="Changes apply to your next battle."
        />
      ) : (
        <Panel role="dialog" labelledBy="pause-title" className="pause">
          <h2 id="pause-title" className="panel-title">
            Paused
          </h2>
          <p className="pause__message">{message}</p>
          <div className="pause__actions">
            <GameButton onClick={onResume}>Resume</GameButton>
            <GameButton onClick={() => setShowOptions(true)}>Options</GameButton>
            <GameButton onClick={onMenu} sound="back">
              Main Menu
            </GameButton>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Announcer({ hud }: { hud: HudSnapshot }) {
  const [message, setMessage] = useState('');
  const previous = useRef(hud);
  useEffect(() => {
    const before = previous.current;
    previous.current = hud;
    if (hud.phase !== before.phase) {
      if (hud.phase === 'running') setMessage(before.phase === 'paused' ? 'Battle resumed.' : 'Battle started.');
      else if (hud.phase === 'paused') setMessage('Battle paused.');
      else if (hud.phase === 'ended') setMessage(hud.result?.reason === 'destroyed' ? 'Your ship was destroyed.' : 'Time is up.');
      return;
    }
    if (hud.score !== before.score) {
      setMessage(`Score ${hud.score}.`);
      return;
    }
    if (hud.remainingSeconds !== before.remainingSeconds && [60, 30, 10].includes(hud.remainingSeconds)) {
      setMessage(`${hud.remainingSeconds} seconds remaining.`);
      return;
    }
    const crossed = (threshold: number) => before.health > threshold && hud.health <= threshold && hud.health > 0;
    if (crossed(hud.maxHealth * 0.5) || crossed(hud.maxHealth * 0.25)) setMessage(`Health ${hud.health} of ${hud.maxHealth}.`);
  }, [hud]);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="announcer">
      {message}
    </div>
  );
}

export function CombatScreen({
  config,
  settings,
  onSettingsChange,
  onEnded,
  onExit,
}: {
  config: MatchConfig;
  settings: MatchSettings;
  onSettingsChange: (settings: MatchSettings) => boolean;
  onEnded: (result: MatchResult, seed: number) => void;
  onExit: () => void;
}) {
  const [load, retry] = useTextures();
  const hostRef = useRef<HTMLDivElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const pauseButtonRestore = useRef<HTMLElement | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  const textures = load.status === 'ready' ? load.textures : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!textures || !host) return;
    const overrides = takeMatchOverrides();
    const seed = overrides.seed ?? randomSeed();
    const created = new GameSession({
      textures,
      config,
      seed,
      ...(overrides.setup ? { setup: overrides.setup } : {}),
      ...(overrides.manualClock !== undefined ? { manualClock: overrides.manualClock } : {}),
      onEnded: (result) => endedRef.current(result, seed),
    });
    let active = true;
    void created
      .mount(host)
      .then((mounted) => {
        if (!active || !mounted) return;
        registerSession(created);
        setSession(created);
        arenaRef.current?.focus();
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
      registerSession(null);
      created.dispose();
      setSession(null);
    };
  }, [textures, config]);

  const hud = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? (() => IDLE_HUD));

  const pause = useCallback(() => {
    pauseButtonRestore.current = arenaRef.current;
    session?.pause('manual');
  }, [session]);

  const resume = useCallback(() => {
    audio.unlock();
    session?.resume();
    arenaRef.current?.focus();
  }, [session]);

  return (
    <div className="combat">
      <div className="combat__arena" ref={arenaRef} tabIndex={-1} aria-label="Battle arena" role="application" aria-roledescription="game">
        <div className="combat__canvas" ref={hostRef} />
        {session && <Hud hud={hud} onPause={pause} />}
        <img className="brand-logo brand-logo--combat" src={`${import.meta.env.BASE_URL}assets/logo_jungle_gaming.svg`} alt="" />
      </div>
      <div className="combat__controls">
        <TouchPad buttons={STEER_BUTTONS} side="steer" session={session} />
        <TouchPad buttons={FIRE_BUTTONS} side="fire" session={session} />
      </div>
      <p className="combat__orientation">Rotate to landscape for the widest view.</p>
      {session && <Announcer hud={hud} />}

      {load.status === 'loading' && (
        <div className="overlay">
          <Panel labelledBy="loading-title" className="loading">
            <h1 id="loading-title" className="panel-title panel-title--small">
              Loading the fleet
            </h1>
            <div
              className="progress"
              role="progressbar"
              aria-label="Loading game assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(load.progress * 100)}
            >
              <div className="progress__fill" style={{ width: `${Math.round(load.progress * 100)}%` }} />
            </div>
            <p className="loading__value">{Math.round(load.progress * 100)}%</p>
          </Panel>
        </div>
      )}
      {load.status === 'error' && (
        <div className="overlay">
          <Panel role="dialog" labelledBy="load-error-title" className="loading">
            <h1 id="load-error-title" className="panel-title panel-title--small">
              The fleet could not load
            </h1>
            <p className="loading__error" role="alert">
              Game assets failed to load. Check your connection and try again. ({load.message})
            </p>
            <div className="pause__actions">
              <GameButton onClick={retry}>Try Again</GameButton>
              <GameButton onClick={onExit} sound="back">
                Main Menu
              </GameButton>
            </div>
          </Panel>
        </div>
      )}
      {session && hud.phase === 'paused' && (
        <PauseDialog
          reason={hud.pauseReason}
          onResume={resume}
          onMenu={onExit}
          settings={settings}
          onSettingsChange={onSettingsChange}
          restoreFocus={arenaRef}
        />
      )}
      {session && hud.phase === 'ended' && (
        <div className="overlay overlay--dim overlay--passive">
          <p className="battle-over" role="status">
            {hud.result?.reason === 'destroyed' ? 'Your ship sank!' : 'Time is up!'}
          </p>
        </div>
      )}
    </div>
  );
}
