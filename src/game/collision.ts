import type { IslandCollider } from './arena';
import type { Vec2 } from './math';

export interface Capsule {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
}

interface Push {
  x: number;
  y: number;
}

export function capsuleFor(x: number, y: number, angle: number, halfLength: number, radius: number): Capsule {
  const dx = Math.cos(angle) * halfLength;
  const dy = Math.sin(angle) * halfLength;
  return { ax: x - dx, ay: y - dy, bx: x + dx, by: y + dy, radius };
}

function segmentSegmentClosest(
  p1x: number,
  p1y: number,
  q1x: number,
  q1y: number,
  p2x: number,
  p2y: number,
  q2x: number,
  q2y: number,
): { a: Vec2; b: Vec2 } {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number;
  let t: number;
  if (a <= 1e-9 && e <= 1e-9) {
    s = 0;
    t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-9) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denominator = a * e - b * b;
      s = denominator !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denominator)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  return {
    a: { x: p1x + d1x * s, y: p1y + d1y * s },
    b: { x: p2x + d2x * t, y: p2y + d2y * t },
  };
}

export function capsulesOverlap(first: Capsule, second: Capsule): boolean {
  const { a, b } = segmentSegmentClosest(
    first.ax,
    first.ay,
    first.bx,
    first.by,
    second.ax,
    second.ay,
    second.bx,
    second.by,
  );
  return Math.hypot(a.x - b.x, a.y - b.y) < first.radius + second.radius;
}

export function capsuleSeparation(first: Capsule, second: Capsule): Push | null {
  const { a, b } = segmentSegmentClosest(
    first.ax,
    first.ay,
    first.bx,
    first.by,
    second.ax,
    second.ay,
    second.bx,
    second.by,
  );
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const gap = Math.hypot(dx, dy);
  const overlap = first.radius + second.radius - gap;
  if (overlap <= 0) return null;
  if (gap < 1e-6) return { x: overlap, y: 0 };
  return { x: (dx / gap) * overlap, y: (dy / gap) * overlap };
}

// Projectiles cover ~9 px per step, so checking only the end position could
// let them skip through a hull. Testing the whole segment travelled avoids that.
export function sweptPointHitsCapsule(from: Vec2, to: Vec2, pointRadius: number, capsule: Capsule): boolean {
  const { a, b } = segmentSegmentClosest(from.x, from.y, to.x, to.y, capsule.ax, capsule.ay, capsule.bx, capsule.by);
  return Math.hypot(a.x - b.x, a.y - b.y) < capsule.radius + pointRadius;
}

export function capsuleOverlapPoint(from: Vec2, to: Vec2, capsule: Capsule): Vec2 {
  return segmentSegmentClosest(from.x, from.y, to.x, to.y, capsule.ax, capsule.ay, capsule.bx, capsule.by).a;
}

export function circleOutOfCollider(center: Vec2, radius: number, collider: IslandCollider): Push | null {
  const innerLeft = collider.x + collider.radius;
  const innerTop = collider.y + collider.radius;
  const innerRight = collider.x + collider.width - collider.radius;
  const innerBottom = collider.y + collider.height - collider.radius;
  const nearestX = Math.min(innerRight, Math.max(innerLeft, center.x));
  const nearestY = Math.min(innerBottom, Math.max(innerTop, center.y));
  const dx = center.x - nearestX;
  const dy = center.y - nearestY;
  const gap = Math.hypot(dx, dy);
  const reach = collider.radius + radius;
  if (gap >= reach) return null;
  if (gap < 1e-6) {
    const toLeft = center.x - innerLeft;
    const toRight = innerRight - center.x;
    const toTop = center.y - innerTop;
    const toBottom = innerBottom - center.y;
    const smallest = Math.min(toLeft, toRight, toTop, toBottom);
    if (smallest === toLeft) return { x: -(toLeft + reach), y: 0 };
    if (smallest === toRight) return { x: toRight + reach, y: 0 };
    if (smallest === toTop) return { x: 0, y: -(toTop + reach) };
    return { x: 0, y: toBottom + reach };
  }
  return { x: (dx / gap) * (reach - gap), y: (dy / gap) * (reach - gap) };
}

export function segmentCrossesCollider(from: Vec2, to: Vec2, collider: IslandCollider, step = 16): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(length / step));
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const nearestX = Math.min(collider.x + collider.width - collider.radius, Math.max(collider.x + collider.radius, point.x));
    const nearestY = Math.min(collider.y + collider.height - collider.radius, Math.max(collider.y + collider.radius, point.y));
    if (Math.hypot(point.x - nearestX, point.y - nearestY) < collider.radius) return true;
  }
  return false;
}
