import * as z from 'zod';
import { Action, Condition, Trigger } from '@pinforge/schema';

export type FieldKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'entity'
  | 'prototype'
  | 'variable'
  | 'scene'
  | 'control'
  | 'sound'
  | 'animation'
  | 'layer'
  | 'rule'
  | 'entity-tag'
  | 'tile-tag'
  | 'value'
  | 'tile'
  | 'property';

export interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly kind: FieldKind;
  readonly options?: readonly string[];
  readonly optional: boolean;
}

export type Clause = 'when' | 'if' | 'then';

/**
 * The form for a trigger, condition or action is worked out from the schema
 * rather than described a second time here. Only the words a person reads, and
 * which list a name should be picked from, live in this file, so adding an
 * action to the schema gives it a working form with no editor change at all.
 */
const WORDS: Record<string, { label: string; hint?: string; kind?: FieldKind }> = {
  subject: { label: 'Which thing', kind: 'entity' },
  with: { label: 'Touches', kind: 'entity' },
  target: { label: 'Which thing', kind: 'entity' },
  from: { label: 'From', kind: 'entity' },
  to: { label: 'To', kind: 'entity' },
  relativeTo: {
    label: 'Placed next to',
    kind: 'entity',
    hint: 'Leave empty to use the top left corner of the level.',
  },
  entity: { label: 'Which thing', kind: 'entity' },
  variable: { label: 'Variable', kind: 'variable' },
  scene: { label: 'Level', kind: 'scene' },
  action: {
    label: 'Control',
    kind: 'control',
    hint: 'Controls are named in Settings, so keys can be changed without touching any rule.',
  },
  sound: { label: 'Sound', kind: 'sound' },
  animation: { label: 'Animation', kind: 'animation' },
  layer: { label: 'Layer', kind: 'layer' },
  rule: { label: 'Rule', kind: 'rule' },
  tag: { label: 'Tag', kind: 'entity-tag' },
  tile: { label: 'Tile', kind: 'tile', hint: 'Leave it empty to rub the tile out.' },
  value: { label: 'Value', kind: 'value' },
  text: { label: 'Message' },
  operator: { label: 'How' },
  mode: { label: 'How' },
  edge: { label: 'Which edge' },
  seconds: { label: 'Seconds' },
  percent: { label: 'Chance out of a hundred' },
  pixels: { label: 'Distance in pixels' },
  height: { label: 'Height in pixels' },
  strength: { label: 'Strength' },
  volume: { label: 'Volume', hint: '1 is full volume, 0.5 is half.' },
  column: { label: 'Column' },
  row: { label: 'Row' },
  width: { label: 'Width' },
  visible: { label: 'Show it' },
  property: {
    label: 'Property',
    kind: 'property',
    hint: 'The name of a custom property on that entity, like hits-left.',
  },
  x: { label: 'Across', hint: 'Pixels from the left. Sixteen pixels is one tile.' },
  y: { label: 'Down', hint: 'Pixels from the top. Down is positive.' },
  negate: {
    label: 'Require the opposite',
    hint: 'Turns the check around, so "is on the ground" becomes "is not on the ground".',
  },
};

/** Where the schema alone cannot say which list a name comes from. */
const BY_TYPE: Record<string, FieldKind> = {
  'spawn.entity': 'prototype',
  'touches-tile.tag': 'tile-tag',
  'move.x': 'number',
  'move.y': 'number',
};

const SHAPES: Record<Clause, Map<string, z.ZodRawShape>> = {
  when: shapesOf(Trigger),
  if: shapesOf(Condition),
  then: shapesOf(Action),
};

function shapesOf(union: {
  options: readonly { shape: z.ZodRawShape }[];
}): Map<string, z.ZodRawShape> {
  const shapes = new Map<string, z.ZodRawShape>();
  for (const option of union.options) {
    const discriminator = option.shape.type as unknown as { value: string };
    shapes.set(discriminator.value, option.shape);
  }
  return shapes;
}

export function fieldsFor(clause: Clause, type: string): FieldSpec[] {
  const shape = SHAPES[clause].get(type);
  if (!shape) return [];

  const fields: FieldSpec[] = [];
  for (const [name, field] of Object.entries(shape)) {
    if (name === 'type') continue;
    const words = WORDS[name] ?? { label: sentence(name) };
    const { inner, optional } = unwrap(field as z.ZodType);
    const kind = BY_TYPE[`${type}.${name}`] ?? words.kind ?? kindOf(inner);
    fields.push({
      name,
      label: words.label,
      ...(words.hint === undefined ? {} : { hint: words.hint }),
      kind,
      ...(kind === 'enum' ? { options: enumValues(inner) } : {}),
      optional,
    });
  }
  return fields;
}

function unwrap(field: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = field;
  let optional = false;
  while (['optional', 'default', 'nullable', 'prefault'].includes(inner.def.type)) {
    if (inner.def.type !== 'nullable') optional = true;
    inner = (inner.def as unknown as { innerType: z.ZodType }).innerType;
  }
  return { inner, optional };
}

function kindOf(inner: z.ZodType): FieldKind {
  switch (inner.def.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'enum';
    case 'union':
      return 'value';
    default:
      return 'text';
  }
}

function enumValues(inner: z.ZodType): string[] {
  const entries = (inner.def as unknown as { entries?: Record<string, string> }).entries;
  return entries ? Object.values(entries) : [];
}

function sentence(name: string): string {
  const spaced = name.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** "at-most" reads better in a dropdown as "at most". */
export function readable(value: string): string {
  const words = value.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
