import type { PlayerCommands } from '../game/types';
import { KEY_TO_COMMAND, PAUSE_KEYS, type CommandName } from './bindings';

type Source = `key:${string}` | `pointer:${number}`;

export class InputController {
  private readonly held = new Map<CommandName, Set<Source>>();
  private readonly pointerCommands = new Map<number, CommandName>();
  private enabled = false;
  private attachedTarget: Window | null = null;

  constructor(private readonly onPause: () => void) {}

  attach(target: Window): void {
    if (this.attachedTarget) return;
    this.attachedTarget = target;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    if (!this.attachedTarget) return;
    this.attachedTarget.removeEventListener('keydown', this.handleKeyDown);
    this.attachedTarget.removeEventListener('keyup', this.handleKeyUp);
    this.attachedTarget = null;
    this.reset();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.held.clear();
    this.pointerCommands.clear();
  }

  pressPointer(pointerId: number, command: CommandName): void {
    if (!this.enabled) return;
    this.releasePointer(pointerId);
    this.pointerCommands.set(pointerId, command);
    this.add(command, `pointer:${pointerId}`);
  }

  releasePointer(pointerId: number): void {
    const command = this.pointerCommands.get(pointerId);
    if (!command) return;
    this.pointerCommands.delete(pointerId);
    this.remove(command, `pointer:${pointerId}`);
  }

  activePointerCount(): number {
    return this.pointerCommands.size;
  }

  sample(): PlayerCommands {
    return {
      forward: this.isHeld('forward'),
      turnLeft: this.isHeld('turnLeft'),
      turnRight: this.isHeld('turnRight'),
      fireFront: this.isHeld('fireFront'),
      fireLeft: this.isHeld('fireLeft'),
      fireRight: this.isHeld('fireRight'),
    };
  }

  private isHeld(command: CommandName): boolean {
    return (this.held.get(command)?.size ?? 0) > 0;
  }

  private add(command: CommandName, source: Source): void {
    let sources = this.held.get(command);
    if (!sources) {
      sources = new Set();
      this.held.set(command, sources);
    }
    sources.add(source);
  }

  private remove(command: CommandName, source: Source): void {
    this.held.get(command)?.delete(source);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.altKey || event.ctrlKey || event.metaKey) return;
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.onPause();
      return;
    }
    const command = KEY_TO_COMMAND.get(event.code);
    if (!command) return;
    event.preventDefault();
    // Ignore OS key repeat: a key held through the pause menu shouldn't count
    // as pressed again after resume.
    if (event.repeat) return;
    this.add(command, `key:${event.code}`);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const command = KEY_TO_COMMAND.get(event.code);
    if (!command) return;
    this.remove(command, `key:${event.code}`);
  };
}
