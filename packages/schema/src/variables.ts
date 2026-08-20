import * as z from 'zod';
import { Id, Label } from './common.js';

/**
 * A variable definition. The same shape describes a global variable (score,
 * lives) and a custom property on an entity, because they are the same idea at
 * two scopes.
 *
 * The type and the starting value are one discriminated union rather than a
 * free value plus a separate check, so "type: number, initial: hello" is a
 * structural error with a precise message instead of a later surprise.
 */
export const VariableDefinition = z.discriminatedUnion('type', [
  z.strictObject({
    id: Id,
    name: Label.optional(),
    type: z.literal('number'),
    initial: z.number().default(0),
  }),
  z.strictObject({
    id: Id,
    name: Label.optional(),
    type: z.literal('boolean'),
    initial: z.boolean().default(false),
  }),
  z.strictObject({
    id: Id,
    name: Label.optional(),
    type: z.literal('text'),
    initial: z.string().max(500).default(''),
  }),
]);

export const VARIABLE_TYPES = ['number', 'boolean', 'text'] as const;

export type VariableType = (typeof VARIABLE_TYPES)[number];
export type VariableDefinition = z.infer<typeof VariableDefinition>;
export type VariableDefinitionInput = z.input<typeof VariableDefinition>;
