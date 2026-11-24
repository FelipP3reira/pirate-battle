import type { Arena } from './arena';
import type { MatchConfig } from './config';
import type { Random } from './random';
import type { GameEvent, Projectile, Ship } from './types';

export interface World {
  readonly arena: Arena;
  readonly config: MatchConfig;
  readonly random: Random;
  readonly player: Ship;
  readonly enemies: Ship[];
  readonly projectiles: Projectile[];
  readonly events: GameEvent[];
  elapsed: number;
  score: number;
  allocateId(): number;
}
