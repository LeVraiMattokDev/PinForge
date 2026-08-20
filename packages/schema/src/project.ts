import * as z from 'zod';
import { Asset } from './assets.js';
import { Color, Id, Label, PositiveInt } from './common.js';
import { EntityPrototype } from './entities.js';
import { EventRule } from './events/rules.js';
import { Scene } from './scenes.js';
import { Tileset } from './tilesets.js';
import { VariableDefinition } from './variables.js';

/**
 * The version of the format this build of PinForge writes. Every project file
 * carries it, and packages/schema owns a migration chain keyed on it, so a file
 * written today still opens in a much later version.
 */
export const CURRENT_FORMAT_VERSION = 1;

export const ProjectMeta = z.strictObject({
  name: Label,
  author: z.string().max(120).default(''),
  description: z.string().max(2000).default(''),
  created: z.iso.datetime().optional(),
  modified: z.iso.datetime().optional(),
});

export const SCALE_MODES = ['integer', 'fit', 'stretch'] as const;

export const Viewport = z.strictObject({
  width: PositiveInt.max(4096).default(320),
  height: PositiveInt.max(4096).default(180),
  scaleMode: z.enum(SCALE_MODES).default('integer').meta({
    description:
      'integer only scales by whole numbers, which keeps pixel art crisp. fit allows any scale and adds bars. stretch ignores the shape of the window.',
  }),
});

/**
 * Rules and movement components talk about named actions, never about keys, so
 * rebinding is a settings change and the editor can say "when Jump is pressed".
 * Values are KeyboardEvent.code strings.
 */
export const InputActions = z
  .record(Id, z.array(z.string().min(1).max(32)).min(1).max(8))
  .meta({ description: 'Named controls, each bound to one or more keys.' });

export const DEFAULT_INPUT_ACTIONS: z.infer<typeof InputActions> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
  action: ['KeyE', 'Enter'],
  pause: ['Escape'],
};

export const ProjectSettings = z.strictObject({
  startScene: Id.meta({ description: 'The scene the game opens on.' }),
  viewport: Viewport.prefault({}),
  pixelArt: z.boolean().default(true).meta({
    description: 'Draw images without smoothing, so pixel art stays sharp.',
  }),
  backgroundColor: Color.default('#10141c').meta({
    description: 'Shown around the game when the window does not match the viewport shape.',
  }),
  input: InputActions.default(DEFAULT_INPUT_ACTIONS),
});

export const Project = z
  .strictObject({
    formatVersion: z.literal(CURRENT_FORMAT_VERSION).meta({
      description: 'The version of the PinForge format this file was written in.',
    }),
    meta: ProjectMeta,
    settings: ProjectSettings,
    variables: z.array(VariableDefinition).default([]),
    assets: z.array(Asset).default([]),
    tilesets: z.array(Tileset).default([]),
    entities: z.array(EntityPrototype).default([]),
    /** Rules that run in every scene, so pause and game over live in one place. */
    globalEvents: z.array(EventRule).default([]),
    scenes: z.array(Scene).min(1),
  })
  .meta({
    id: 'https://pinforge.org/schema/pinforge-project.schema.json',
    title: 'PinForge project',
    description: 'A complete PinForge game: settings, assets, entities and scenes in one file.',
  });

export type ProjectMeta = z.infer<typeof ProjectMeta>;
export type ProjectSettings = z.infer<typeof ProjectSettings>;
export type Viewport = z.infer<typeof Viewport>;
export type ScaleMode = (typeof SCALE_MODES)[number];
export type InputActions = z.infer<typeof InputActions>;

/** A project as it is used, with every default filled in. */
export type Project = z.infer<typeof Project>;

/** A project as it may be written by hand, where anything with a default may be left out. */
export type ProjectInput = z.input<typeof Project>;
