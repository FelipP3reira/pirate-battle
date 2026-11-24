import type { PlayerCommands } from '../game/types';

export type CommandName = keyof PlayerCommands;

export interface CommandBinding {
  command: CommandName;
  label: string;
  keys: string[];
  keyLabels: string[];
}

export const COMMAND_BINDINGS: CommandBinding[] = [
  { command: 'forward', label: 'Sail forward', keys: ['KeyW', 'ArrowUp'], keyLabels: ['W', '↑'] },
  { command: 'turnLeft', label: 'Turn left', keys: ['KeyA', 'ArrowLeft'], keyLabels: ['A', '←'] },
  { command: 'turnRight', label: 'Turn right', keys: ['KeyD', 'ArrowRight'], keyLabels: ['D', '→'] },
  { command: 'fireFront', label: 'Bow cannon', keys: ['Space'], keyLabels: ['Space'] },
  { command: 'fireLeft', label: 'Port broadside', keys: ['KeyQ'], keyLabels: ['Q'] },
  { command: 'fireRight', label: 'Starboard broadside', keys: ['KeyE'], keyLabels: ['E'] },
];

export const PAUSE_KEYS = ['Escape', 'KeyP'];
export const PAUSE_KEY_LABELS = ['Esc', 'P'];

export const KEY_TO_COMMAND: ReadonlyMap<string, CommandName> = new Map(
  COMMAND_BINDINGS.flatMap((binding) => binding.keys.map((key) => [key, binding.command] as const)),
);
