import * as z from 'zod';
import { ID_PATTERN } from '../common.js';

/**
 * How a rule points at an entity. One string, resolved in this order:
 *
 *   "$self"      the entity the trigger fired on
 *   "$other"     the other entity in a collision
 *   "tag:enemy"  any entity carrying that tag
 *   "player-1"   an instance in the current scene
 *   "coin"       an entity prototype, meaning any entity of that kind
 *
 * Instances win over prototypes, and validation refuses a project where an
 * instance id shadows a prototype id, so the order can never surprise anyone.
 */
export const ENTITY_REF_PATTERN = /^(\$self|\$other|tag:[a-z0-9][a-z0-9-]*|[a-z0-9][a-z0-9-]*)$/;

export const EntityRef = z
  .string()
  .max(70)
  .regex(
    ENTITY_REF_PATTERN,
    'Point at an entity with $self, $other, tag:<tag>, an instance id or a prototype id.',
  )
  .meta({
    description: 'An entity: $self, $other, tag:<tag>, an instance id or a prototype id.',
  });

export type EntityRef = z.infer<typeof EntityRef>;

export type ResolvedRef =
  | { kind: 'self' }
  | { kind: 'other' }
  | { kind: 'tag'; tag: string }
  | { kind: 'named'; id: string };

/** Splits a reference into its parts. Assumes the string already matched the schema. */
export function parseEntityRef(ref: string): ResolvedRef | undefined {
  if (ref === '$self') return { kind: 'self' };
  if (ref === '$other') return { kind: 'other' };
  if (ref.startsWith('tag:')) {
    const tag = ref.slice('tag:'.length);
    return ID_PATTERN.test(tag) ? { kind: 'tag', tag } : undefined;
  }
  return ID_PATTERN.test(ref) ? { kind: 'named', id: ref } : undefined;
}
