import type { Tilemap } from './tilemap.js';

const EPSILON = 1e-6;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Collision is resolved as two separate passes, X first and then Y, and that
 * ordering is load bearing.
 *
 * Resolving both axes at once, or picking whichever axis overlaps less, gives
 * the two classic platformer bugs: catching on the seam between two floor tiles
 * while running along them, and being shoved sideways off a ledge when landing
 * on its corner. Doing X to completion, then Y to completion, cannot produce
 * either, because each pass only ever pushes back along the axis it moved.
 *
 * Do not "simplify" this into a single pass.
 *
 * Both passes advance in sub-steps of at most one tile so that nothing can
 * tunnel through a wall at high speed.
 */
export function moveOnX(body: Box, dx: number, map: Tilemap, collideWithTiles: boolean): boolean {
  if (dx === 0) return false;
  if (!collideWithTiles) {
    body.x += dx;
    return false;
  }

  const limit = map.tileSize;
  let remaining = dx;

  while (Math.abs(remaining) > EPSILON) {
    const amount = Math.max(-limit, Math.min(limit, remaining));
    remaining -= amount;
    body.x += amount;

    const top = Math.floor(body.y / map.tileSize);
    const bottom = Math.floor((body.y + body.height - EPSILON) / map.tileSize);
    const movingRight = amount > 0;
    const column = movingRight
      ? Math.floor((body.x + body.width - EPSILON) / map.tileSize)
      : Math.floor(body.x / map.tileSize);

    for (let row = top; row <= bottom; row += 1) {
      if (!map.isSolid(column, row)) continue;
      body.x = movingRight ? column * map.tileSize - body.width : (column + 1) * map.tileSize;
      return true;
    }
  }
  return false;
}

export interface VerticalHit {
  below: boolean;
  above: boolean;
}

export function moveOnY(
  body: Box,
  dy: number,
  map: Tilemap,
  collideWithTiles: boolean,
): VerticalHit {
  const hit: VerticalHit = { below: false, above: false };
  if (dy === 0) return hit;
  if (!collideWithTiles) {
    body.y += dy;
    return hit;
  }

  const limit = map.tileSize;
  let remaining = dy;

  while (Math.abs(remaining) > EPSILON) {
    const amount = Math.max(-limit, Math.min(limit, remaining));
    remaining -= amount;
    // A one-way tile only stops something that was already above it, which is
    // what lets a wooden platform be jumped up through and stood on.
    const bottomBefore = body.y + body.height;
    body.y += amount;

    const left = Math.floor(body.x / map.tileSize);
    const right = Math.floor((body.x + body.width - EPSILON) / map.tileSize);
    const movingDown = amount > 0;
    const row = movingDown
      ? Math.floor((body.y + body.height - EPSILON) / map.tileSize)
      : Math.floor(body.y / map.tileSize);

    for (let column = left; column <= right; column += 1) {
      const blocked = movingDown
        ? map.isSolid(column, row) ||
          (map.isOneWay(column, row) && bottomBefore <= row * map.tileSize + EPSILON)
        : map.isSolid(column, row);
      if (!blocked) continue;
      if (movingDown) {
        body.y = row * map.tileSize - body.height;
        hit.below = true;
      } else {
        body.y = (row + 1) * map.tileSize;
        hit.above = true;
      }
      return hit;
    }
  }
  return hit;
}

/** Whether something solid holds this box up right now. */
export function standingOn(body: Box, map: Tilemap): boolean {
  const row = Math.floor((body.y + body.height + 0.5) / map.tileSize);
  const left = Math.floor(body.x / map.tileSize);
  const right = Math.floor((body.x + body.width - EPSILON) / map.tileSize);
  for (let column = left; column <= right; column += 1) {
    if (map.isSolid(column, row) || map.isOneWay(column, row)) return true;
  }
  return false;
}

/** Whether the ground continues in front of this box, used by patrolling. */
export function groundAhead(body: Box, direction: number, map: Tilemap): boolean {
  const probeX = direction > 0 ? body.x + body.width + 1 : body.x - 1;
  const column = Math.floor(probeX / map.tileSize);
  const row = Math.floor((body.y + body.height + 0.5) / map.tileSize);
  return map.isSolid(column, row) || map.isOneWay(column, row);
}
