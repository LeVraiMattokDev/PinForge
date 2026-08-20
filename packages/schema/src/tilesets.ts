import * as z from 'zod';
import { Id, Label, NonNegativeInt, PositiveInt } from './common.js';

/**
 * Tile behaviour comes from tags, never from a tile number. The runtime knows
 * about three of them; every other tag is free form and only exists for event
 * rules to react to, so a project can invent "ice" or "water" without the
 * engine changing.
 */
export const KNOWN_TILE_TAGS = ['solid', 'one-way', 'hazard'] as const;

export const TileTag = z
  .string()
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'A tag must use lowercase letters, numbers and dashes.')
  .meta({ description: 'A tile tag such as "solid", "one-way" or "hazard".' });

export const TileDefinition = z.strictObject({
  index: NonNegativeInt.meta({
    description:
      'Position in the tileset image, counting from 0, left to right then top to bottom.',
  }),
  name: Label.optional(),
  tags: z.array(TileTag).max(16).default([]),
});

export const Tileset = z.strictObject({
  id: Id,
  name: Label.optional(),
  image: Id.meta({ description: 'The id of an image asset.' }),
  tileWidth: PositiveInt,
  tileHeight: PositiveInt,
  margin: NonNegativeInt.default(0).meta({
    description: 'Empty pixels around the outside of the grid in the image.',
  }),
  spacing: NonNegativeInt.default(0).meta({
    description: 'Empty pixels between neighbouring tiles in the image.',
  }),
  /** Only tiles that need a name or a tag are listed. The rest are plain decoration. */
  tiles: z.array(TileDefinition).default([]),
});

export type TileTag = z.infer<typeof TileTag>;
export type TileDefinition = z.infer<typeof TileDefinition>;
export type Tileset = z.infer<typeof Tileset>;
