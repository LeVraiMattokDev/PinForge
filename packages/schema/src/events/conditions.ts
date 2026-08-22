import * as z from 'zod';
import { Id, NonNegative, Value } from '../common.js';
import { EntityRef } from './refs.js';

export const COMPARISONS = [
  'equals',
  'not-equals',
  'at-least',
  'at-most',
  'greater-than',
  'less-than',
] as const;

export const Comparison = z.enum(COMPARISONS);

/**
 * The IF half of a rule. Conditions are joined by AND; an empty list means
 * always. Every condition takes "negate", so the dropdown holds one entry per
 * idea instead of one per idea and its opposite.
 */
const negate = z.boolean().default(false).meta({ description: 'Require the opposite.' });

export const Condition = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('variable-is'),
    variable: Id,
    operator: Comparison.default('equals'),
    value: Value,
    negate,
  }),
  z.strictObject({
    type: z.literal('variable-compare'),
    left: Id,
    operator: Comparison.default('equals'),
    right: Id,
    negate,
  }),
  z.strictObject({
    type: z.literal('property-is'),
    target: EntityRef,
    property: Id,
    operator: Comparison.default('equals'),
    value: Value,
    negate,
  }),
  z.strictObject({ type: z.literal('has-tag'), target: EntityRef, tag: Id, negate }),
  z.strictObject({ type: z.literal('entity-exists'), entity: EntityRef, negate }),
  z.strictObject({ type: z.literal('action-held'), action: Id, negate }),
  z.strictObject({
    type: z.literal('distance-is'),
    from: EntityRef,
    to: EntityRef,
    operator: z.enum(['at-most', 'at-least']).default('at-most'),
    pixels: NonNegative,
    negate,
  }),
  z.strictObject({
    type: z.literal('chance'),
    percent: z.number().min(0).max(100),
    negate,
  }),
  z.strictObject({ type: z.literal('current-scene-is'), scene: Id, negate }),
  z.strictObject({ type: z.literal('is-on-ground'), target: EntityRef, negate }),
  z.strictObject({ type: z.literal('is-falling'), target: EntityRef, negate }),
]);

export type Comparison = z.infer<typeof Comparison>;
export type Condition = z.infer<typeof Condition>;
export type ConditionType = Condition['type'];
