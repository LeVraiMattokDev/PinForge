import * as z from 'zod';
import {
  ColliderComponent,
  Components,
  MovementOverride,
  SpriteComponent,
  TextComponent,
} from './components.js';
import { Id, Label, Size, Value, optionalVersionOf } from './common.js';
import { TileTag } from './tilesets.js';
import { VariableDefinition } from './variables.js';

export const EntityPrototype = z.strictObject({
  id: Id,
  name: Label.optional(),
  /** The collision box, and the box a sprite is positioned against. Always axis aligned. */
  size: Size,
  tags: z.array(TileTag).max(16).default([]),
  /** Custom per entity state, shown in the inspector and readable by event rules. */
  properties: z.array(VariableDefinition).default([]),
  components: Components.default({}),
});

/**
 * A partial patch over the prototype's components, so one slower slime does not
 * need a second prototype. Only the fields present are changed; nothing is
 * filled in from a default.
 */
export const ComponentOverrides = z.strictObject({
  sprite: optionalVersionOf(SpriteComponent).optional(),
  collider: optionalVersionOf(ColliderComponent).optional(),
  movement: MovementOverride.optional(),
  text: optionalVersionOf(TextComponent).optional(),
});

export const EntityInstance = z.strictObject({
  id: Id,
  name: Label.optional(),
  prototype: Id.meta({ description: 'The id of the entity prototype this is a copy of.' }),
  x: z.number().meta({ description: 'Left edge of the collision box, in pixels.' }),
  y: z.number().meta({ description: 'Top edge of the collision box, in pixels.' }),
  fixedToCamera: z.boolean().default(false).meta({
    description: 'Stay put on screen instead of scrolling with the level. Used for score labels.',
  }),
  /** Extra tags for this copy only, on top of the ones the prototype carries. */
  tags: z.array(TileTag).max(16).default([]),
  properties: z.record(Id, Value).default({}),
  overrides: ComponentOverrides.default({}),
});

export type EntityPrototype = z.infer<typeof EntityPrototype>;
export type EntityInstance = z.infer<typeof EntityInstance>;
export type ComponentOverrides = z.infer<typeof ComponentOverrides>;
