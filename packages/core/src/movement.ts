import type { FreeMovementComponent, PlatformMovementComponent } from '@pinforge/schema';
import { groundAhead, moveOnX, moveOnY, standingOn } from './collision.js';
import type { InputState } from './input.js';
import type { Tilemap } from './tilemap.js';
import type { Entity } from './world.js';

/** The simulation advances in steps of exactly this length. Never a frame time. */
export const STEP_SECONDS = 1 / 60;

export function stepMovement(
  entity: Entity,
  map: Tilemap,
  input: InputState,
  seconds: number,
): void {
  entity.jumped = false;
  entity.landed = false;

  const collide = entity.collider?.kind === 'solid' && entity.collider.collidesWithTiles;
  const movement = entity.movement;

  if (!movement) {
    // No movement component, but a rule may still have given it a speed.
    moveOnX(entity, entity.velocityX * seconds, map, collide);
    moveOnY(entity, entity.velocityY * seconds, map, collide);
    return;
  }
  if (movement.mode === 'free') {
    stepFree(entity, movement, map, input, seconds, collide);
    return;
  }
  stepPlatform(entity, movement, map, input, seconds, collide);
}

/**
 * Movement with no gravity and no ground: a puzzle game, a top down game, or a
 * shoot-em-up alongside an auto scrolling camera. The same acceleration and
 * deceleration mean an acceleration of 0 gives the instant, snappy response a
 * puzzle wants, and a high number gives something that drifts.
 */
function stepFree(
  entity: Entity,
  movement: FreeMovementComponent,
  map: Tilemap,
  input: InputState,
  seconds: number,
  collide: boolean,
): void {
  const byPlayer = movement.controlledBy === 'player';
  const horizontal = movement.axes !== 'vertical';
  const vertical = movement.axes !== 'horizontal';

  if (byPlayer) {
    const wantedX = horizontal
      ? (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0)
      : 0;
    const wantedY = vertical ? (input.isHeld('down') ? 1 : 0) - (input.isHeld('up') ? 1 : 0) : 0;
    entity.velocityX = approach(
      entity.velocityX,
      wantedX * movement.maxSpeed,
      (wantedX === 0 ? movement.deceleration : movement.acceleration) * seconds,
    );
    entity.velocityY = approach(
      entity.velocityY,
      wantedY * movement.maxSpeed,
      (wantedY === 0 ? movement.deceleration : movement.acceleration) * seconds,
    );
    if (wantedX !== 0) entity.facing = wantedX > 0 ? 1 : -1;
  }

  if (!horizontal) entity.velocityX = 0;
  if (!vertical) entity.velocityY = 0;

  // X to completion, then Y to completion, for the same reason as platforming.
  if (moveOnX(entity, entity.velocityX * seconds, map, collide)) entity.velocityX = 0;
  const hit = moveOnY(entity, entity.velocityY * seconds, map, collide);
  if (hit.below || hit.above) entity.velocityY = 0;
}

function stepPlatform(
  entity: Entity,
  movement: PlatformMovementComponent,
  map: Tilemap,
  input: InputState,
  seconds: number,
  collide: boolean,
): void {
  const byPlayer = movement.controlledBy === 'player';

  let direction = 0;
  if (byPlayer) {
    direction = (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0);
  } else if (movement.patrol) {
    direction = entity.patrolDirection;
  }

  const target = direction * movement.maxSpeed;
  const rate = direction === 0 ? movement.deceleration : movement.acceleration;
  const effective = entity.onGround ? rate : rate * movement.airControl;
  entity.velocityX = approach(entity.velocityX, target, effective * seconds);
  if (direction !== 0) entity.facing = direction > 0 ? 1 : -1;

  if (byPlayer) {
    if (input.wasPressed('jump')) {
      // The press itself always counts for this step; the buffer time only
      // decides how long it keeps counting afterwards.
      entity.jumpBufferLeft = Math.max(movement.jumpBufferTime, seconds);
    }
    if (
      input.wasReleased('jump') &&
      movement.variableJumpHeight &&
      entity.velocityY < 0 &&
      !entity.jumpCut
    ) {
      // Letting go early cuts the jump short.
      entity.velocityY *= 0.5;
      entity.jumpCut = true;
    }
  }

  const fromGround = entity.onGround || entity.coyoteLeft > 0;
  if (
    entity.jumpBufferLeft > 0 &&
    movement.jumpHeight > 0 &&
    (fromGround ? movement.jumpCount > 0 : entity.airJumpsLeft > 0)
  ) {
    if (!fromGround) entity.airJumpsLeft -= 1;
    // A jump is authored as a height in pixels; the impulse comes from it.
    entity.velocityY = -Math.sqrt(2 * movement.gravity * movement.jumpHeight);
    entity.jumpBufferLeft = 0;
    entity.coyoteLeft = 0;
    entity.onGround = false;
    entity.jumped = true;
    entity.jumpCut = false;
  }
  entity.jumpBufferLeft = Math.max(0, entity.jumpBufferLeft - seconds);

  // Falling is heavier than rising, which is most of why a jump feels solid.
  const scale = entity.velocityY > 0 ? movement.fallGravityMultiplier : 1;
  entity.velocityY = Math.min(
    movement.maxFallSpeed,
    entity.velocityY + movement.gravity * scale * seconds,
  );

  // X to completion, then Y to completion. See collision.ts for why.
  const hitWall = moveOnX(entity, entity.velocityX * seconds, map, collide);
  if (hitWall) entity.velocityX = 0;

  const wasOnGround = entity.onGround;
  const vertical = moveOnY(entity, entity.velocityY * seconds, map, collide);
  if (vertical.below || vertical.above) entity.velocityY = 0;

  // Rising is never standing: without this, feet passing up through a one-way
  // platform would count as a landing in mid air.
  entity.onGround =
    collide && (vertical.below || (entity.velocityY >= 0 && standingOn(entity, map)));
  if (entity.onGround && !wasOnGround) entity.landed = true;
  if (entity.onGround) {
    entity.coyoteLeft = movement.coyoteTime;
    entity.airJumpsLeft = Math.max(0, movement.jumpCount - 1);
    entity.jumpCut = false;
  } else {
    entity.coyoteLeft = Math.max(0, entity.coyoteLeft - seconds);
  }

  const patrol = movement.patrol;
  if (patrol && !byPlayer) {
    const atLedge =
      patrol.turnAtLedges && entity.onGround && !groundAhead(entity, entity.patrolDirection, map);
    if ((patrol.turnAtWalls && hitWall) || atLedge) {
      entity.patrolDirection = entity.patrolDirection > 0 ? -1 : 1;
    }
  }
}

/** Moves current towards target by at most maxDelta. A maxDelta of 0 is instant. */
function approach(current: number, target: number, maxDelta: number): number {
  if (maxDelta <= 0) return target;
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
