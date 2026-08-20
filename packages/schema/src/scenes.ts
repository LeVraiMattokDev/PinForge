import * as z from 'zod';
import { Color, Id, Label, NonNegativeInt, PositiveInt, Ratio, Size, Vec2 } from './common.js';
import { EntityInstance } from './entities.js';
import { EventRule } from './events/rules.js';
import { EntityRef } from './events/refs.js';

/**
 * A tile layer is a picture you can read.
 *
 * `legend` maps one character to one tile number in the layer's tileset, and
 * `null` means empty. `rows` is the level itself, one string per row of the
 * grid. A grid of numbers would store the same thing and nobody could read it,
 * which matters because levels are written by hand in the example project and
 * by an assistant over MCP.
 *
 * The cost is that a legend key is a single printable character, so one layer
 * holds at most 94 distinct tiles. Extra layers are free.
 */
export const LegendKey = z
  .string()
  .regex(/^[!-~]$/, 'A legend key must be a single printable character other than a space.');

export const TileLayer = z.strictObject({
  id: Id,
  name: Label.optional(),
  tileset: Id,
  collides: z.boolean().default(false).meta({
    description: 'Whether entities are stopped by the solid tiles on this layer.',
  }),
  visible: z.boolean().default(true),
  parallax: Vec2.default({ x: 1, y: 1 }).meta({
    description:
      'How fast the layer scrolls compared to the world. 1 moves with it, 0.5 lags behind.',
  }),
  drawEntitiesAfter: z.boolean().default(false).meta({
    description: 'Draw entities on top of this layer. Layers after it are drawn in front of them.',
  }),
  legend: z.record(LegendKey, NonNegativeInt.nullable()).meta({
    description: 'Which tile each character stands for. null means an empty cell.',
  }),
  rows: z.array(z.string().max(1024)).min(1).meta({
    description: 'One string per row of the grid, each exactly as long as the scene is wide.',
  }),
});

export const CameraFollow = z.strictObject({
  mode: z.literal('follow'),
  target: EntityRef,
  deadZone: Size.default({ width: 64, height: 40 }).meta({
    description:
      'The camera holds still while the target stays inside this box in the middle of the screen.',
  }),
  smoothing: Ratio.default(0.15).meta({
    description: 'How gently the camera catches up. 0 is instant.',
  }),
  offset: Vec2.default({ x: 0, y: 0 }),
  clampToScene: z.boolean().default(true),
});

export const CameraFixed = z.strictObject({
  mode: z.literal('fixed'),
  x: z.number().default(0),
  y: z.number().default(0),
  clampToScene: z.boolean().default(true),
});

export const CameraAutoScroll = z.strictObject({
  mode: z.literal('auto-scroll'),
  speed: Vec2.default({ x: 20, y: 0 }).meta({ description: 'Pixels per second.' }),
  offset: Vec2.default({ x: 0, y: 0 }),
  clampToScene: z.boolean().default(true),
});

export const Camera = z.discriminatedUnion('mode', [CameraFollow, CameraFixed, CameraAutoScroll]);

export const CAMERA_MODES = ['follow', 'fixed', 'auto-scroll'] as const;

export const SceneBackground = z.strictObject({
  color: Color.default('#10141c'),
  image: Id.optional().meta({ description: 'An image asset drawn behind every layer.' }),
});

export const Scene = z.strictObject({
  id: Id,
  name: Label.optional(),
  /** One tile size for the whole scene. Every layer uses it, so there is one number to think about. */
  tileSize: PositiveInt.default(16),
  size: z.strictObject({
    columns: PositiveInt.meta({ description: 'Width of the scene in tiles.' }),
    rows: PositiveInt.meta({ description: 'Height of the scene in tiles.' }),
  }),
  background: SceneBackground.prefault({}),
  layers: z.array(TileLayer).default([]),
  entities: z.array(EntityInstance).default([]),
  camera: Camera.prefault({ mode: 'fixed' }),
  events: z.array(EventRule).default([]),
});

export type TileLayer = z.infer<typeof TileLayer>;
export type Camera = z.infer<typeof Camera>;
export type CameraMode = (typeof CAMERA_MODES)[number];
export type Scene = z.infer<typeof Scene>;
export type SceneInput = z.input<typeof Scene>;
