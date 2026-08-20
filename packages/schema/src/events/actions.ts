import * as z from 'zod';
import { Id, NonNegative, NonNegativeInt, Ratio, Seconds, Value } from '../common.js';
import { EntityRef } from './refs.js';

export const ARITHMETIC = ['add', 'subtract', 'multiply', 'divide', 'set'] as const;

export const Arithmetic = z.enum(ARITHMETIC);

/**
 * The THEN half of a rule. Actions run in order, top to bottom. "wait" pauses
 * the rest of that rule's list without pausing the game, which is what makes
 * "show a message, wait, load the next scene" readable as one sentence.
 */
export const Action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('destroy'), target: EntityRef }),
  z.strictObject({
    type: z.literal('spawn'),
    entity: Id.meta({ description: 'The id of an entity prototype.' }),
    x: z.number().default(0),
    y: z.number().default(0),
    relativeTo: EntityRef.optional().meta({
      description: 'Place it relative to this entity instead of the top left of the scene.',
    }),
  }),
  z.strictObject({
    type: z.literal('move'),
    target: EntityRef,
    mode: z.enum(['set', 'add']).default('set'),
    x: z.number().optional().meta({ description: 'Horizontal speed in pixels per second.' }),
    y: z.number().optional().meta({ description: 'Vertical speed in pixels per second.' }),
  }),
  z.strictObject({
    type: z.literal('teleport'),
    target: EntityRef,
    x: z.number().default(0),
    y: z.number().default(0),
    relativeTo: EntityRef.optional(),
  }),
  z.strictObject({
    type: z.literal('jump'),
    target: EntityRef,
    height: NonNegative.optional().meta({
      description: 'Jump this high instead of the height set on the entity.',
    }),
  }),
  z.strictObject({ type: z.literal('set-variable'), variable: Id, value: Value }),
  z.strictObject({
    type: z.literal('change-variable'),
    variable: Id,
    operator: Arithmetic.default('add'),
    value: z.number(),
  }),
  z.strictObject({
    type: z.literal('set-property'),
    target: EntityRef,
    property: Id,
    value: Value,
  }),
  z.strictObject({
    type: z.literal('change-property'),
    target: EntityRef,
    property: Id,
    operator: Arithmetic.default('add'),
    value: z.number(),
  }),
  z.strictObject({ type: z.literal('play-animation'), target: EntityRef, animation: Id }),
  z.strictObject({ type: z.literal('set-visible'), target: EntityRef, visible: z.boolean() }),
  z.strictObject({ type: z.literal('play-sound'), sound: Id, volume: Ratio.default(1) }),
  z.strictObject({
    type: z.literal('stop-sound'),
    sound: Id.optional().meta({ description: 'Leave empty to stop every sound.' }),
  }),
  z.strictObject({
    type: z.literal('show-message'),
    text: z.string().min(1).max(200),
    seconds: Seconds.max(60).default(2),
  }),
  z.strictObject({ type: z.literal('go-to-scene'), scene: Id }),
  z.strictObject({ type: z.literal('restart-scene') }),
  z.strictObject({ type: z.literal('set-camera-target'), target: EntityRef }),
  z.strictObject({
    type: z.literal('shake-camera'),
    strength: NonNegative.max(64).default(4),
    seconds: Seconds.max(10).default(0.3),
  }),
  z.strictObject({
    type: z.literal('set-tile'),
    layer: Id,
    column: NonNegativeInt,
    row: NonNegativeInt,
    tile: NonNegativeInt.nullable().meta({ description: 'A tile number, or null to clear it.' }),
  }),
  z.strictObject({ type: z.literal('enable-rule'), rule: Id }),
  z.strictObject({ type: z.literal('disable-rule'), rule: Id }),
  z.strictObject({ type: z.literal('wait'), seconds: Seconds.max(60) }),
]);

export type Arithmetic = z.infer<typeof Arithmetic>;
export type Action = z.infer<typeof Action>;
export type ActionType = Action['type'];
