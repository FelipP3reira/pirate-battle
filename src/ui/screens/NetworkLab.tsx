import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { resetNetworkState, selectScenario } from '../../mocks/control';
import { getScenario, isScenarioId, SCENARIOS } from '../../mocks/scenarios';
import { GameButton, Panel, useFocusTrap } from '../components';

export function NetworkLab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scenario, setScenarioState] = useState(getScenario);
  const [message, setMessage] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectId = useId();
  useFocusTrap(dialogRef, open, triggerRef);
  const current = SCENARIOS.find((item) => item.id === scenario);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="network-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setScenarioState(getScenario());
          setOpen(true);
        }}
      >
        Network: {current?.label ?? 'Normal'}
      </button>
      {open && (
        <div
          className="overlay"
          ref={dialogRef}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <Panel role="dialog" labelledBy="network-title" className="network-lab">
            <h2 id="network-title" className="panel-title panel-title--small">
              Network scenarios
            </h2>
            <label htmlFor={selectId} className="setting__label">
              Mock API behavior
            </label>
            <select
              id={selectId}
              className="network-lab__select"
              value={scenario}
              onChange={(event) => {
                const value = event.target.value;
                if (!isScenarioId(value)) return;
                selectScenario(value, queryClient);
                setScenarioState(value);
                setMessage(`Scenario set to ${SCENARIOS.find((item) => item.id === value)?.label ?? value}.`);
              }}
            >
              {SCENARIOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="network-lab__description">{current?.description}</p>
            <p className="network-lab__status" role="status">
              {message}
            </p>
            <div className="network-lab__actions">
              <GameButton
                variant="secondary"
                size="small"
                onClick={() => {
                  resetNetworkState(queryClient);
                  setScenarioState('normal');
                  setMessage('Mock server, pending saves and cached lists were reset.');
                }}
              >
                Reset data
              </GameButton>
              <GameButton variant="secondary" size="small" onClick={() => setOpen(false)} sound="back">
                Close
              </GameButton>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
