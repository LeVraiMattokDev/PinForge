import * as z from 'zod';
import { Id, Label, Ratio } from './common.js';

/**
 * Where the bytes of an asset come from. Three forms, one field:
 *   - "assets/player.png"   a path relative to the project file
 *   - "data:image/png;..."  inlined, which is what the browser editor writes
 *                           because it has no filesystem, and what the HTML
 *                           export produces for every asset
 *   - "builtin:grass"       an asset from the starter pack shipped with PinForge
 *
 * Keeping these in one field means exporting is a transformation of the same
 * format rather than a second format.
 */
export const AssetSource = z
  .string()
  .min(1)
  .max(8 * 1024 * 1024)
  .meta({
    description:
      'A path relative to the project file, a data: URI, or builtin:<name> for a bundled asset.',
  });

export const ImageAsset = z.strictObject({
  id: Id,
  kind: z.literal('image'),
  name: Label.optional(),
  source: AssetSource,
});

export const SoundAsset = z.strictObject({
  id: Id,
  kind: z.literal('sound'),
  name: Label.optional(),
  source: AssetSource,
  volume: Ratio.default(1),
  loop: z.boolean().default(false),
});

export const Asset = z.discriminatedUnion('kind', [ImageAsset, SoundAsset]);

export const ASSET_KINDS = ['image', 'sound'] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];
export type Asset = z.infer<typeof Asset>;
export type ImageAsset = z.infer<typeof ImageAsset>;
export type SoundAsset = z.infer<typeof SoundAsset>;
