import type { Ticker } from 'pixi.js';
import { audio, type SoundName } from '../audio/AudioManager';
import { createArena } from '../game/arena';
import type { MatchConfig } from '../game/config';
import { FIXED_STEP, Simulation } from '../game/simulation';
import type { GameEvent, MatchResult, SimulationSetup } from '../game/types';
import { InputController } from '../input/InputController';
import type { GameTextures } from '../render/assets';
import { GameRenderer } from '../render/GameRenderer';

export type PauseReason = 'manual' | 'blur' | 'hidden';
export type SessionPhase = 'starting' | 'running' | 'paused' | 'ended';

export interface HudSnapshot {
  phase: SessionPhase;
  pauseReason: PauseReason | null;
  score: number;
  health: number;
  maxHealth: number;
  remainingSeconds: number;
  result: MatchResult | null;
}

export interface SessionOptions {
  textures: GameTextures;
  config: MatchConfig;
  seed: number;
  setup?: SimulationSetup;
  manualClock?: boolean;
  onEnded: (result: MatchResult) => void;
}

const SHOT_SOUNDS: SoundName[] = ['cannon1', 'cannon2', 'cannon3'];

export class GameSession {
  readonly simulation: Simulation;
  readonly input: InputController;
  private renderer: GameRenderer | null = null;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private manualClock: boolean;
  private snapshot: HudSnapshot;
  private readonly listeners = new Set<() => void>();
  private warnedTime = false;
  private warnedHealth = false;
  private frameIntervals: number[] = [];

  constructor(private readonly options: SessionOptions) {
    this.manualClock = options.manualClock ?? false;
    this.simulation = new Simulation(options.config, createArena(), options.seed, options.setup);
    this.input = new InputController(() => this.pause('manual'));
    const player = this.simulation.player;
    this.snapshot = {
      phase: 'starting',
      pauseReason: null,
      score: 0,
      health: player.health,
      maxHealth: player.hull.maxHealth,
      remainingSeconds: Math.ceil(this.simulation.remaining),
      result: null,
    };
  }

  async mount(host: HTMLElement): Promise<boolean> {
    const bounds = host.getBoundingClientRect();
    const renderer = await GameRenderer.create(this.options.textures, this.simulation.arena, bounds.width, bounds.height);
    // Pixi init is async. In Strict Mode (or if the player leaves quickly) the
    // session can be disposed before this resolves, so throw the late app away
    // instead of attaching a second canvas.
    if (this.disposed) {
      renderer.destroy();
      return false;
    }
    this.renderer = renderer;
    this.host = host;
    renderer.canvas.setAttribute('aria-hidden', 'true');
    renderer.canvas.classList.add('arena-canvas');
    host.appendChild(renderer.canvas);
    renderer.resize(bounds.width, bounds.height);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.input.attach(window);
    renderer.app.ticker.add(this.tick);
    renderer.render(this.simulation, 0);
    this.startRunning();
    audio.play('start', 0.7);
    audio.startLoop('ocean', 0.35);
    audio.startLoop('sailing', 0);
    if (document.visibilityState === 'hidden') this.pause('hidden');
    return true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HudSnapshot => this.snapshot;

  get viewport() {
    return this.renderer?.currentViewport ?? null;
  }

  get displayCounts() {
    return this.renderer?.displayCounts ?? null;
  }

  get frameSamples(): number[] {
    return this.frameIntervals;
  }

  resetFrameSamples(): void {
    this.frameIntervals = [];
  }

  pause(reason: PauseReason): void {
    if (this.snapshot.phase !== 'running') return;
    this.input.setEnabled(false);
    this.renderer?.app.ticker.stop();
    this.simulation.discardPendingTime();
    audio.play('pause', 0.6);
    audio.suspend();
    this.publish({ phase: 'paused', pauseReason: reason });
  }

  resume(): void {
    if (this.snapshot.phase !== 'paused') return;
    // Time spent paused must not turn into movement or extra shots on resume.
    this.simulation.discardPendingTime();
    audio.resume();
    audio.play('resume', 0.6);
    this.startRunning();
  }

  setManualClock(manual: boolean): void {
    this.manualClock = manual;
    this.simulation.discardPendingTime();
    if (this.snapshot.phase !== 'running') return;
    if (manual) this.renderer?.app.ticker.stop();
    else this.renderer?.app.ticker.start();
  }

  advance(milliseconds: number): number {
    if (this.snapshot.phase !== 'running') return 0;
    let steps = 0;
    let remaining = milliseconds / 1000;
    while (remaining > 1e-9 && this.simulation.phase === 'running') {
      const slice = Math.min(FIXED_STEP, remaining);
      steps += this.simulation.advance(slice + 1e-9, this.input.sample());
      remaining -= slice;
      this.processFrame(slice, false);
    }
    this.processFrame(0, true);
    return steps;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.input.detach();
    audio.stopLoops();
    audio.resume();
    if (this.renderer) {
      this.renderer.app.ticker.remove(this.tick);
      this.renderer.destroy();
      this.renderer = null;
    }
    this.host = null;
    this.listeners.clear();
  }

  private startRunning(): void {
    this.input.setEnabled(true);
    this.publish({ phase: 'running', pauseReason: null });
    if (this.manualClock) this.renderer?.app.render();
    else this.renderer?.app.ticker.start();
  }

  private readonly tick = (ticker: Ticker): void => {
    // Coming back from a hidden tab can report a huge delta; the simulation caps
    // its own steps too, this just keeps effects from jumping.
    const seconds = Math.min(ticker.deltaMS, 250) / 1000;
    if (this.snapshot.phase === 'running') {
      this.frameIntervals.push(ticker.deltaMS);
      if (this.frameIntervals.length > 20000) this.frameIntervals.shift();
      if (!this.manualClock) this.simulation.advance(seconds, this.input.sample());
    }
    this.processFrame(seconds);
  };

  private processFrame(seconds: number, draw = true): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      renderer.applyEvents(events);
      this.playSounds(events);
    }
    renderer.render(this.simulation, seconds);
    if (this.manualClock && draw) renderer.app.render();
    audio.setLoopVolume('sailing', (this.simulation.player.speed / this.simulation.player.hull.maxSpeed) * 0.3);
    this.syncHud();
    const ended = events.find((event): event is Extract<GameEvent, { type: 'ended' }> => event.type === 'ended');
    if (ended) this.finish(ended.result);
  }

  private syncHud(): void {
    const simulation = this.simulation;
    const remainingSeconds = Math.ceil(simulation.remaining - 1e-6);
    const health = Math.ceil(simulation.player.health);
    if (
      this.snapshot.score === simulation.score &&
      this.snapshot.health === health &&
      this.snapshot.remainingSeconds === remainingSeconds
    ) {
      return;
    }
    if (!this.warnedTime && remainingSeconds <= 10 && simulation.phase === 'running') {
      this.warnedTime = true;
      audio.play('timeWarning', 0.7);
    }
    if (!this.warnedHealth && health <= simulation.player.hull.maxHealth * 0.3 && health > 0) {
      this.warnedHealth = true;
      audio.play('healthLow', 0.7);
    }
    this.publish({ score: simulation.score, health, remainingSeconds });
  }

  private finish(result: MatchResult): void {
    if (this.snapshot.phase === 'ended') return;
    this.input.setEnabled(false);
    audio.stopLoops();
    audio.play(result.reason === 'destroyed' ? 'over' : 'complete', 0.8);
    this.publish({ phase: 'ended', result });
    window.setTimeout(() => {
      if (!this.disposed) this.renderer?.app.ticker.stop();
    }, 2000);
    this.options.onEnded(result);
  }

  private playSounds(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.count > 1) audio.play('broadside', 0.7);
          else audio.play(SHOT_SOUNDS[Math.floor(Math.random() * SHOT_SOUNDS.length)] ?? 'cannon1', event.faction === 'player' ? 0.6 : 0.4);
          break;
        case 'hit':
          audio.play(Math.random() < 0.5 ? 'wood1' : 'wood2', 0.6);
          break;
        case 'splash':
          if (event.surface === 'water') audio.play(Math.random() < 0.5 ? 'splash1' : 'splash2', 0.35);
          break;
        case 'rammed':
          audio.play('collision', 0.8);
          break;
        case 'destroyed':
          if (event.kind === 'player') audio.play('sinking', 1);
          else audio.play(Math.random() < 0.5 ? 'explosion1' : 'explosion2', 0.8);
          break;
        case 'scored':
          audio.play('score', 0.5);
          break;
        default:
          break;
      }
    }
  }

  private publish(patch: Partial<HudSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private readonly handleResize = (): void => {
    if (!this.host || !this.renderer) return;
    const bounds = this.host.getBoundingClientRect();
    this.renderer.resize(bounds.width, bounds.height);
    this.renderer.render(this.simulation, 0);
    this.renderer.app.render();
  };

  private readonly handleBlur = (): void => this.pause('blur');

  private readonly handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };
}
