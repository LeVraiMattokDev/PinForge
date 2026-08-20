import * as z from 'zod';
import { Id } from '../common.js';
import { TileTag } from '../tilesets.js';
import { EntityRef } from './refs.js';

/**
 * The WHEN half of a rule. A trigger fires; the conditions then decide whether
 * the actions run.
 *
 * Two of them, "lands" and "jumps", only make sense for an entity using
 * platform movement. They are tagged in the catalog, and the editor filters the
 * dropdown rather than showing options that cannot work.
 */
export const Trigger = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('game-starts') }),
  z.strictObject({ type: z.literal('scene-starts') }),
  z.strictObject({ type: z.literal('every-frame') }),
  z.strictObject({ type: z.literal('every-seconds'), seconds: z.number().positive() }),
  z.strictObject({ type: z.literal('action-pressed'), action: Id }),
  z.strictObject({ type: z.literal('action-released'), action: Id }),
  z.strictObject({ type: z.literal('collides'), subject: EntityRef, with: EntityRef }),
  z.strictObject({ type: z.literal('collision-ends'), subject: EntityRef, with: EntityRef }),
  z.strictObject({ type: z.literal('touches-tile'), subject: EntityRef, tag: TileTag }),
  z.strictObject({ type: z.literal('variable-changes'), variable: Id }),
  z.strictObject({ type: z.literal('entity-spawned'), subject: EntityRef }),
  z.strictObject({ type: z.literal('entity-destroyed'), subject: EntityRef }),
  z.strictObject({
    type: z.literal('leaves-scene'),
    subject: EntityRef,
    edge: z.enum(['any', 'top', 'bottom', 'left', 'right']).default('any'),
  }),
  z.strictObject({ type: z.literal('lands'), subject: EntityRef }),
  z.strictObject({ type: z.literal('jumps'), subject: EntityRef }),
  z.strictObject({ type: z.literal('clicked'), subject: EntityRef }),
]);

export type Trigger = z.infer<typeof Trigger>;
export type TriggerType = Trigger['type'];
