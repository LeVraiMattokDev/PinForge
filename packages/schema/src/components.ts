import * as z from 'zod';
import {
  Color,
  Id,
  Label,
  NonNegative,
  PositiveInt,
  Ratio,
  Seconds,
  Vec2,
  optionalVersionOf,
} from './common.js';

/**
 * The component set is deliberately tiny and concrete: sprite, collider,
 * movement, text. An entity may carry at most one of each. Adding a fifth
 * component is a product decision, not a refactor.
 */

export const Animation = z.strictObject({
  id: Id,
  name: Label.optional(),
  frames: z
    .array(z.number().int().min(0))
    .min(1)
    .meta({ description: 'Frame numbers in the sprite sheet, counting from 0.' }),
  fps: z.number().positive().max(120).default(8),
  loop: z.boolean().default(true),
});

export const SpriteComponent = z.strictObject({
  image: Id.meta({ description: 'The id of an image asset.' }),
  frameWidth: PositiveInt,
  frameHeight: PositiveInt,
  /** Where the art sits relative to the top left of the collision box, so art may overhang it. */
  offset: Vec2.default({ x: 0, y: 0 }),
  flipToFaceMovement: z.boolean().default(false).meta({
    description:
      'Mirror the art when the entity moves left, so only one direction has to be drawn.',
  }),
  defaultAnimation: Id.optional(),
  animations: z.array(Animation).default([]),
});

export const COLLIDER_KINDS = ['solid', 'trigger', 'none'] as const;

export const ColliderComponent = z.strictObject({
  kind: z.enum(COLLIDER_KINDS).default('solid').meta({
    description:
      'solid is pushed back out of solid tiles, trigger passes through tiles and only reports overlaps to rules, none never collides at all. Entities never push each other apart, whatever their collider says: two of them are always free to overlap, and that overlap is what a rule about two things touching is for. Something that must physically block the player belongs in a tile layer.',
  }),
  collidesWithTiles: z.boolean().default(true),
});

const ACCELERATION_NOTE =
  'Pixels per second squared. 0 means the entity reaches its top speed instantly.';

/** Fields both movement modes share. */
const sharedMovementShape = {
  controlledBy: z.enum(['player', 'rules']).default('player').meta({
    description:
      'player reads the input actions from the project settings. rules means only event rules move this entity.',
  }),
  maxSpeed: NonNegative.default(90),
  acceleration: NonNegative.default(600).meta({ description: ACCELERATION_NOTE }),
  deceleration: NonNegative.default(900).meta({ description: ACCELERATION_NOTE }),
};

export const PatrolConfig = z.strictObject({
  direction: z.enum(['left', 'right', 'up', 'down']).default('left').meta({
    description:
      'Which way it sets off. up and down are for free movement, which has no gravity to fall with.',
  }),
  turnAtWalls: z.boolean().default(true),
  turnAtLedges: z.boolean().default(true).meta({
    description: 'Turn around rather than walk off an edge. Platform movement only.',
  }),
});

const platformMovementShape = {
  ...sharedMovementShape,
  airControl: Ratio.default(0.7).meta({
    description: 'How much of the acceleration still applies while in the air, from 0 to 1.',
  }),
  gravity: NonNegative.default(900).meta({ description: 'Downward acceleration while rising.' }),
  fallGravityMultiplier: z.number().min(1).default(1.7).meta({
    description:
      'Falling is faster than rising by this factor. It is the single biggest reason a jump feels solid rather than floaty.',
  }),
  maxFallSpeed: NonNegative.default(320),
  /**
   * A jump is authored as a height in pixels, not as an impulse: "clear three
   * tiles" is a thought a beginner can have, "start at -280 px/s" is not. The
   * runtime derives the impulse from this height and the rising gravity.
   */
  jumpHeight: NonNegative.default(44).meta({
    description: 'How high a jump reaches, in pixels.',
  }),
  jumpCount: z.number().int().min(0).max(8).default(1).meta({
    description:
      'How many jumps are available before touching the ground again. 2 is a double jump.',
  }),
  variableJumpHeight: z.boolean().default(true).meta({
    description: 'Releasing the jump button early cuts the jump short.',
  }),
  coyoteTime: Seconds.max(1).default(0.1).meta({
    description: 'A jump still works for this long after walking off a ledge.',
  }),
  jumpBufferTime: Seconds.max(1).default(0.12).meta({
    description: 'A jump pressed this long before landing still fires on landing.',
  }),
  patrol: PatrolConfig.optional().meta({
    description: 'Walk back and forth without any event rules. Used by most simple enemies.',
  }),
};

const freeMovementShape = {
  ...sharedMovementShape,
  axes: z.enum(['both', 'horizontal', 'vertical']).default('both'),
  patrol: PatrolConfig.optional().meta({
    description:
      'Move back and forth along one axis without any event rules, turning at walls. The same idea platform movement has, for a game with no gravity.',
  }),
};

/**
 * The one component that differs between 2D genres, and the reason there is a
 * single runtime rather than one per genre.
 */
export const PlatformMovementComponent = z.strictObject({
  mode: z.literal('platform'),
  ...platformMovementShape,
});

export const FreeMovementComponent = z.strictObject({
  mode: z.literal('free'),
  ...freeMovementShape,
});

export const MovementComponent = z
  .discriminatedUnion('mode', [PlatformMovementComponent, FreeMovementComponent])
  .meta({
    description:
      'platform adds gravity, ground detection and jumping. free moves on both axes with no gravity, for a puzzle or top down game.',
  });

export const MOVEMENT_MODES = ['platform', 'free'] as const;

export const TextComponent = z.strictObject({
  content: z.string().max(200).default('Text').meta({
    description: 'The text to show. {score} is replaced by the value of the variable called score.',
  }),
  color: Color.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  size: z.enum(['small', 'normal', 'large']).default('normal'),
});

export const Components = z.strictObject({
  sprite: SpriteComponent.optional(),
  collider: ColliderComponent.optional(),
  movement: MovementComponent.optional(),
  text: TextComponent.optional(),
});

export const COMPONENT_NAMES = ['sprite', 'collider', 'movement', 'text'] as const;

export type ComponentName = (typeof COMPONENT_NAMES)[number];
export type MovementMode = (typeof MOVEMENT_MODES)[number];
export type ColliderKind = (typeof COLLIDER_KINDS)[number];
export type Animation = z.infer<typeof Animation>;
export type SpriteComponent = z.infer<typeof SpriteComponent>;
export type ColliderComponent = z.infer<typeof ColliderComponent>;
export type MovementComponent = z.infer<typeof MovementComponent>;
export type PlatformMovementComponent = z.infer<typeof PlatformMovementComponent>;
export type FreeMovementComponent = z.infer<typeof FreeMovementComponent>;
export type TextComponent = z.infer<typeof TextComponent>;
export type Components = z.infer<typeof Components>;

/**
 * Every movement field with no default applied, used by scene instance
 * overrides. Both modes are merged into one shape: an override cannot change
 * the mode, and validation reports a field that does not belong to the
 * prototype's actual mode.
 */
const movementOverrideShape = { ...platformMovementShape, ...freeMovementShape };

export const MovementOverride = optionalVersionOf(z.strictObject(movementOverrideShape));

/** Field names an instance may override on a movement component. */
export const MOVEMENT_OVERRIDE_FIELDS = Object.keys(movementOverrideShape);

/** Field names that only exist on one of the two modes, used to report a mismatch. */
export const MOVEMENT_FIELDS_BY_MODE: Record<MovementMode, readonly string[]> = {
  platform: Object.keys(platformMovementShape),
  free: Object.keys(freeMovementShape),
};
