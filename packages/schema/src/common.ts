import * as z from 'zod';

/**
 * Primitive building blocks shared by every part of the project format.
 *
 * Two conventions hold everywhere:
 *   - Units are pixels, time is seconds, speed is pixels per second and
 *     acceleration is pixels per second squared.
 *   - The Y axis points down. y = 0 is the top of the scene, which matches both
 *     the canvas and the tile grid, so nothing is ever flipped.
 */

/** Ids are lowercase, dash separated and stable. They are what everything refers to. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const Id = z
  .string()
  .max(64)
  .regex(
    ID_PATTERN,
    'An id must use lowercase letters, numbers and dashes, and start with a letter or a number.',
  )
  .meta({ description: 'A stable identifier, for example "player" or "level-1".' });

/** A human readable label. Shown in the editor, never used to refer to anything. */
export const Label = z.string().min(1).max(120);

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const Color = z
  .string()
  .regex(HEX_COLOR_PATTERN, 'A colour must be written as #rrggbb, for example #10141c.')
  .meta({ description: 'A colour written as #rrggbb.' });

export const Vec2 = z.strictObject({ x: z.number(), y: z.number() });

export const Size = z.strictObject({
  width: z.number().positive(),
  height: z.number().positive(),
});

export const PositiveInt = z.number().int().positive();
export const NonNegativeInt = z.number().int().min(0);
export const NonNegative = z.number().min(0);

/** A duration in seconds. */
export const Seconds = z.number().min(0).meta({ description: 'A duration in seconds.' });

/** A ratio between 0 and 1. */
export const Ratio = z.number().min(0).max(1);

/** A value a variable or a custom property can hold. */
export const Value = z.union([z.number(), z.boolean(), z.string().max(500)]);

export type Vec2 = z.infer<typeof Vec2>;
export type Size = z.infer<typeof Size>;
export type Value = z.infer<typeof Value>;

/**
 * Boundary helper. Builds the "every field optional, no defaults applied"
 * version of an object schema, which is what an instance override needs: an
 * override says "change exactly these fields", so a missing field must stay
 * missing rather than reappearing as its default value.
 *
 * `.partial()` cannot be used because it keeps defaults, so `{}` would parse
 * back into a full set of values and silently overwrite the prototype.
 */
export function optionalVersionOf<S extends z.ZodRawShape>(
  schema: z.ZodObject<S>,
): z.ZodObject<OptionalShape<S>> {
  const fields = schema.shape as unknown as Record<string, z.ZodType>;
  const shape = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, stripDefault(field).optional()]),
  );
  // Object.fromEntries erases the mapping the type above describes, so the
  // result is asserted once, here, rather than spreading casts over callers.
  return z.strictObject(shape as unknown as OptionalShape<S>);
}

export type OptionalShape<S extends z.ZodRawShape> = {
  [K in keyof S]: z.ZodOptional<UnwrapDefault<S[K]>>;
};

type UnwrapDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

function stripDefault(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  while (current instanceof z.ZodDefault) {
    current = current.def.innerType as z.ZodType;
  }
  return current;
}
