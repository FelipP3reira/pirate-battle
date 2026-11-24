export const RULES_VERSION = 1;

export type EnemyKind = 'chaser' | 'shooter';
export type ShipKind = 'player' | EnemyKind;

export interface HullConfig {
  maxHealth: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  turnRate: number;
  hullHalfLength: number;
  hullRadius: number;
}

export interface WeaponConfig {
  cooldown: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  projectileRadius: number;
}

export interface BroadsideConfig extends WeaponConfig {
  projectiles: number;
  spacing: number;
}

export interface BalanceConfig {
  rulesVersion: number;
  player: HullConfig & {
    frontCannon: WeaponConfig;
    broadside: BroadsideConfig;
  };
  chaser: HullConfig & {
    contactDamage: number;
  };
  shooter: HullConfig & {
    attackRange: number;
    preferredRange: number;
    aimTolerance: number;
    cannon: WeaponConfig;
  };
  spawn: {
    openingSequence: EnemyKind[];
    weights: Record<EnemyKind, number>;
    minPlayerDistance: number;
    clearance: number;
    maxActiveEnemies: number;
  };
}

export interface MatchSettings {
  sessionSeconds: number;
  spawnSeconds: number;
}

export interface MatchConfig extends MatchSettings {
  balance: BalanceConfig;
}

export interface SettingLimit {
  min: number;
  max: number;
  step: number;
}

export const SETTINGS_LIMITS: Record<keyof MatchSettings, SettingLimit> = {
  sessionSeconds: { min: 60, max: 180, step: 10 },
  spawnSeconds: { min: 1, max: 10, step: 1 },
};

export const DEFAULT_SETTINGS: MatchSettings = {
  sessionSeconds: 120,
  spawnSeconds: 3,
};

export const DEFAULT_BALANCE: BalanceConfig = {
  rulesVersion: RULES_VERSION,
  player: {
    maxHealth: 100,
    maxSpeed: 165,
    acceleration: 240,
    deceleration: 180,
    turnRate: 2.4,
    hullHalfLength: 30,
    hullRadius: 22,
    frontCannon: {
      cooldown: 0.4,
      damage: 20,
      projectileSpeed: 560,
      range: 560,
      projectileRadius: 5,
    },
    broadside: {
      cooldown: 1.2,
      damage: 20,
      projectileSpeed: 480,
      range: 400,
      projectileRadius: 5,
      projectiles: 3,
      spacing: 26,
    },
  },
  chaser: {
    maxHealth: 40,
    maxSpeed: 140,
    acceleration: 200,
    deceleration: 160,
    turnRate: 1.9,
    hullHalfLength: 30,
    hullRadius: 22,
    contactDamage: 20,
  },
  shooter: {
    maxHealth: 60,
    maxSpeed: 105,
    acceleration: 160,
    deceleration: 160,
    turnRate: 1.6,
    hullHalfLength: 30,
    hullRadius: 22,
    attackRange: 420,
    preferredRange: 300,
    aimTolerance: 0.2,
    cannon: {
      cooldown: 2,
      damage: 8,
      projectileSpeed: 400,
      range: 460,
      projectileRadius: 5,
    },
  },
  spawn: {
    openingSequence: ['chaser', 'shooter'],
    weights: { chaser: 0.55, shooter: 0.45 },
    minPlayerDistance: 520,
    clearance: 110,
    maxActiveEnemies: 12,
  },
};

export function clampSetting(key: keyof MatchSettings, value: number): number {
  const limit = SETTINGS_LIMITS[key];
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)));
}

export function validateSetting(key: keyof MatchSettings, value: number): string | null {
  const limit = SETTINGS_LIMITS[key];
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return 'Enter a whole number of seconds.';
  }
  if (value < limit.min || value > limit.max) {
    return `Choose between ${limit.min} and ${limit.max} seconds.`;
  }
  return null;
}

export function createMatchConfig(settings: MatchSettings, balance: BalanceConfig = DEFAULT_BALANCE): MatchConfig {
  return structuredClone({
    sessionSeconds: settings.sessionSeconds,
    spawnSeconds: settings.spawnSeconds,
    balance,
  });
}
