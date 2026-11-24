import type { EnemyKind, HullConfig, ShipKind } from './config';

export type Faction = 'player' | 'enemy';
export type WeaponSlot = 'front' | 'left' | 'right';
export type EndReason = 'time-up' | 'destroyed';
export type MatchPhase = 'running' | 'ended';

export interface PlayerCommands {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export interface Ship {
  id: number;
  kind: ShipKind;
  hull: HullConfig;
  x: number;
  y: number;
  angle: number;
  prevX: number;
  prevY: number;
  prevAngle: number;
  speed: number;
  health: number;
  cooldowns: Record<WeaponSlot, number>;
}

export interface Projectile {
  id: number;
  faction: Faction;
  sourceId: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  remainingDistance: number;
}

export interface MatchResult {
  score: number;
  elapsedSeconds: number;
  reason: EndReason;
}

export type GameEvent =
  | { type: 'shot'; shipId: number; faction: Faction; slot: WeaponSlot; x: number; y: number; angle: number; count: number }
  | { type: 'hit'; targetId: number; faction: Faction; x: number; y: number; damage: number; health: number }
  | { type: 'splash'; x: number; y: number; surface: 'water' | 'island' }
  | { type: 'spawned'; shipId: number; kind: EnemyKind }
  | {
      type: 'destroyed';
      shipId: number;
      kind: ShipKind;
      x: number;
      y: number;
      angle: number;
      cause: 'projectile' | 'ram';
    }
  | { type: 'rammed'; chaserId: number; x: number; y: number; damage: number; health: number }
  | { type: 'scored'; score: number }
  | { type: 'ended'; result: MatchResult };

export interface ShipPlacement {
  x: number;
  y: number;
  angle: number;
}

export interface SimulationSetup {
  player?: ShipPlacement;
  enemies?: Array<ShipPlacement & { kind: EnemyKind }>;
}
