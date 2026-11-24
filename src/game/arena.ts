import type { Vec2 } from './math';

export const TILE_SIZE = 64;
export const WORLD_COLUMNS = 28;
export const WORLD_ROWS = 16;
export const WORLD_WIDTH = WORLD_COLUMNS * TILE_SIZE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE_SIZE;

export type IslandKind = 'grass' | 'sand';

export interface IslandCollider {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface Island {
  id: string;
  kind: IslandKind;
  column: number;
  row: number;
  columns: number;
  rows: number;
  collider: IslandCollider;
}

export interface Decoration {
  tile: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface Arena {
  width: number;
  height: number;
  islands: Island[];
  decorations: Decoration[];
  playerStart: Vec2 & { angle: number };
  spawnPoints: Vec2[];
}

const ISLAND_BLOCK: Record<IslandKind, { columns: number; rows: number; inset: number; radius: number }> = {
  grass: { columns: 4, rows: 4, inset: 8, radius: 44 },
  sand: { columns: 3, rows: 3, inset: 10, radius: 40 },
};

function island(id: string, kind: IslandKind, column: number, row: number): Island {
  const block = ISLAND_BLOCK[kind];
  const x = column * TILE_SIZE + block.inset;
  const y = row * TILE_SIZE + block.inset;
  return {
    id,
    kind,
    column,
    row,
    columns: block.columns,
    rows: block.rows,
    collider: {
      x,
      y,
      width: block.columns * TILE_SIZE - block.inset * 2,
      height: block.rows * TILE_SIZE - block.inset * 2,
      radius: block.radius,
    },
  };
}

function tileCenter(column: number, row: number): Vec2 {
  return { x: (column + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
}

function decoration(tile: number, column: number, row: number, scale = 1, rotation = 0): Decoration {
  const center = tileCenter(column, row);
  return { tile, x: center.x, y: center.y, scale, rotation };
}

export function pointInsideCollider(point: Vec2, collider: IslandCollider, padding = 0): boolean {
  const innerLeft = collider.x + collider.radius;
  const innerTop = collider.y + collider.radius;
  const innerRight = collider.x + collider.width - collider.radius;
  const innerBottom = collider.y + collider.height - collider.radius;
  const nearestX = Math.min(innerRight, Math.max(innerLeft, point.x));
  const nearestY = Math.min(innerBottom, Math.max(innerTop, point.y));
  return Math.hypot(point.x - nearestX, point.y - nearestY) < collider.radius + padding;
}

function buildSpawnPoints(islands: Island[]): Vec2[] {
  const margin = 72;
  const step = TILE_SIZE;
  const points: Vec2[] = [];
  for (let x = margin; x <= WORLD_WIDTH - margin; x += step) {
    points.push({ x, y: margin }, { x, y: WORLD_HEIGHT - margin });
  }
  for (let y = margin + step; y <= WORLD_HEIGHT - margin - step; y += step) {
    points.push({ x: margin, y }, { x: WORLD_WIDTH - margin, y });
  }
  return points.filter((point) => islands.every((item) => !pointInsideCollider(point, item.collider, 70)));
}

export function createArena(): Arena {
  const islands = [
    island('north-west', 'grass', 4, 2),
    island('north', 'sand', 15, 2),
    island('north-east', 'sand', 22, 3),
    island('south-west', 'sand', 8, 10),
    island('south-east', 'grass', 19, 9),
  ];
  const decorations = [
    decoration(71, 5, 3, 1.25),
    decoration(72, 7, 4, 1.05, 0.6),
    decoration(66, 6, 5, 1),
    decoration(70, 16, 3, 1.1, 1.2),
    decoration(49, 15, 4, 0.9),
    decoration(51, 23, 4, 1),
    decoration(72, 24, 5, 0.95, 2.1),
    decoration(65, 9, 11, 1),
    decoration(70, 10, 12, 1.05, 0.4),
    decoration(71, 21, 10, 1.25, 0.9),
    decoration(67, 20, 12, 1),
    decoration(88, 22, 11, 1.1),
  ];
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    islands,
    decorations,
    playerStart: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 + 32, angle: -Math.PI / 2 },
    spawnPoints: buildSpawnPoints(islands),
  };
}
