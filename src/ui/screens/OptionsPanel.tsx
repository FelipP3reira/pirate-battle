import { useId, useState } from 'react';
import { DIFFICULTIES, SETTINGS_LIMITS, validateSetting, type Difficulty, type MatchSettings, type NumericSetting } from '../../game/config';
import { GameButton, Panel, RoundButton, useHeadingFocus } from '../components';

const FIELDS: Array<{ key: NumericSetting; label: string }> = [
  { key: 'sessionSeconds', label: 'Game session time' },
  { key: 'spawnSeconds', label: 'Enemy spawn time' },
];

function SettingStepper({
  field,
  value,
  onCommit,
}: {
  field: (typeof FIELDS)[number];
  value: number;
  onCommit: (value: number) => boolean;
}) {
  const id = useId();
  const limit = SETTINGS_LIMITS[field.key];
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  const commit = (text: string) => {
    setDraft(text);
    const parsed = text.trim() === '' ? Number.NaN : Number(text);
    const problem = validateSetting(field.key, parsed);
    setError(problem);
    if (!problem) onCommit(parsed);
  };

  const step = (direction: 1 | -1) => {
    const base = Number.isFinite(Number(draft)) && draft.trim() !== '' ? Number(draft) : value;
    const next = Math.min(limit.max, Math.max(limit.min, Math.round(base / limit.step) * limit.step + direction * limit.step));
    commit(String(next));
  };

  const parsedDraft = Number(draft);
  return (
    <div className="setting">
      <label className="setting__label" htmlFor={id}>
        {field.label}
      </label>
      <div className="setting__row">
        <RoundButton
          icon="minus"
          label={`Decrease ${field.label.toLowerCase()}`}
          onClick={() => step(-1)}
          disabled={Number.isFinite(parsedDraft) && parsedDraft <= limit.min}
        />
        <span className="setting__value">
          <input
            id={id}
            className="setting__input"
            type="number"
            inputMode="numeric"
            min={limit.min}
            max={limit.max}
            step={1}
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint ${id}-error`}
            onChange={(event) => commit(event.target.value)}
          />
          <span aria-hidden="true">s</span>
        </span>
        <RoundButton
          icon="plus"
          label={`Increase ${field.label.toLowerCase()}`}
          onClick={() => step(1)}
          disabled={Number.isFinite(parsedDraft) && parsedDraft >= limit.max}
        />
      </div>
      <p id={`${id}-hint`} className="setting__hint">
        {limit.min}–{limit.max} seconds
      </p>
      <p id={`${id}-error`} className="setting__error" role="alert">
        {error ?? ''}
      </p>
    </div>
  );
}

function DifficultyPicker({ value, onSelect }: { value: Difficulty; onSelect: (difficulty: Difficulty) => void }) {
  const current = DIFFICULTIES.find((item) => item.id === value);
  const select = (difficulty: Difficulty) => {
    onSelect(difficulty);
    window.requestAnimationFrame(() => document.getElementById(`difficulty-${difficulty}`)?.focus());
  };
  return (
    <div className="setting">
      <span className="setting__label" id="difficulty-label">
        Difficulty
      </span>
      <div className="difficulty" role="radiogroup" aria-labelledby="difficulty-label" aria-describedby="difficulty-hint">
        {DIFFICULTIES.map((item, index) => (
          <GameButton
            key={item.id}
            id={`difficulty-${item.id}`}
            role="radio"
            aria-checked={item.id === value}
            tabIndex={item.id === value ? 0 : -1}
            variant={item.id === value ? 'primary' : 'secondary'}
            size="small"
            onClick={() => select(item.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const step = event.key === 'ArrowRight' ? 1 : -1;
              const next = DIFFICULTIES[(index + step + DIFFICULTIES.length) % DIFFICULTIES.length];
              if (next) select(next.id);
            }}
          >
            {item.label}
          </GameButton>
        ))}
      </div>
      <p id="difficulty-hint" className="setting__hint">
        {current?.description}
      </p>
    </div>
  );
}

export function OptionsPanel({
  settings,
  onChange,
  onClose,
  closeLabel = 'Main Menu',
  note,
}: {
  settings: MatchSettings;
  onChange: (settings: MatchSettings) => boolean;
  onClose: () => void;
  closeLabel?: string;
  note?: string;
}) {
  const headingRef = useHeadingFocus<HTMLHeadingElement>();
  const [status, setStatus] = useState('');
  const save = (key: keyof MatchSettings, value: number | Difficulty) => {
    const saved = onChange({ ...settings, [key]: value });
    setStatus(saved ? 'Settings saved.' : 'Settings could not be saved on this device.');
    return saved;
  };
  return (
    <Panel labelledBy="options-title" className="options">
      <h1 id="options-title" className="panel-title" tabIndex={-1} ref={headingRef}>
        Options
      </h1>
      {FIELDS.map((field) => (
        <SettingStepper key={field.key} field={field} value={settings[field.key]} onCommit={(value) => save(field.key, value)} />
      ))}
      <DifficultyPicker value={settings.difficulty} onSelect={(difficulty) => save('difficulty', difficulty)} />
      <p className="options__status" role="status">
        {status}
        {note ? ` ${note}` : ''}
      </p>
      <GameButton onClick={onClose} sound="back">
        {closeLabel}
      </GameButton>
    </Panel>
  );
}
