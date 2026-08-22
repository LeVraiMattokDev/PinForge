import { KNOWN_TILE_TAGS, type CatalogEntry, type Project, type Scene } from '@pinforge/schema';
import { fieldsFor, readable, type Clause, type FieldSpec } from '../rule-fields.js';
import { Checkbox, Field, NumberInput, Select, TextInput } from '../ui/controls.js';

export type Node = Record<string, unknown> & { type: string };

/**
 * What the sentence view and the blocks view both need to edit a trigger,
 * condition or action: which choices exist in this project, a control for each
 * kind of field, and a filled-in starting point for a newly chosen one. Kept
 * here so the two views can never offer different choices for the same thing.
 */
export interface Context {
  project: Project;
  scene: Scene;
  sceneId: string | undefined;
  allowSelf: boolean;
  allowOther: boolean;
}

export function Fields({
  clause,
  node,
  context,
  onChange,
}: {
  clause: Clause;
  node: Node;
  context: Context;
  onChange: (node: Node) => void;
}) {
  const fields = fieldsFor(clause, node.type);
  if (fields.length === 0) return null;
  return (
    <div className="grid-two">
      {fields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          value={node[field.name]}
          context={context}
          onChange={(value) => onChange({ ...node, [field.name]: value })}
        />
      ))}
    </div>
  );
}

export function FieldControl({
  field,
  value,
  context,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  context: Context;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === 'boolean') {
    return (
      <Checkbox
        label={field.label}
        hint={field.hint}
        checked={value === true}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (field.kind === 'number') {
    return (
      <Field label={field.label} hint={field.hint}>
        <NumberInput step={0.1} value={typeof value === 'number' ? value : 0} onChange={onChange} />
      </Field>
    );
  }

  if (field.kind === 'tile') {
    return (
      <Field label={field.label} hint={field.hint}>
        <TextInput
          value={value === null || value === undefined ? '' : String(value)}
          placeholder="empty"
          onChange={(raw) => onChange(raw.trim() === '' ? null : Number(raw))}
        />
      </Field>
    );
  }

  if (field.kind === 'value') {
    return (
      <Field label={field.label} hint="A number, some words, or true or false.">
        <TextInput value={String(value ?? '')} onChange={(raw) => onChange(looseValue(raw))} />
      </Field>
    );
  }

  if (field.kind === 'text' || field.kind === 'property') {
    return (
      <Field label={field.label} hint={field.hint}>
        <TextInput value={String(value ?? '')} onChange={onChange} />
      </Field>
    );
  }

  const choices = optionsFor(field, context);
  return (
    <Field label={field.label} hint={field.hint}>
      <Select
        value={String(value ?? '')}
        placeholder={field.optional ? 'Nothing' : undefined}
        choices={choices}
        onChange={(next) => onChange(next === '' ? undefined : next)}
      />
    </Field>
  );
}

export function optionsFor(field: FieldSpec, context: Context): { value: string; label: string }[] {
  const { project, scene } = context;
  const plain = (values: readonly string[]) => values.map((one) => ({ value: one, label: one }));

  switch (field.kind) {
    case 'enum':
      return (field.options ?? []).map((one) => ({ value: one, label: readable(one) }));
    case 'entity': {
      const options: { value: string; label: string }[] = [];
      if (context.allowSelf) options.push({ value: '$self', label: 'the thing this is about' });
      if (context.allowOther) options.push({ value: '$other', label: 'the other thing' });
      for (const prototype of project.entities) {
        options.push({ value: prototype.id, label: `any ${prototype.name ?? prototype.id}` });
      }
      for (const instance of scene.entities) {
        options.push({ value: instance.id, label: `this one: ${instance.name ?? instance.id}` });
      }
      for (const tag of entityTags(project)) {
        options.push({ value: `tag:${tag}`, label: `anything tagged ${tag}` });
      }
      return options;
    }
    case 'prototype':
      return project.entities.map((one) => ({ value: one.id, label: one.name ?? one.id }));
    case 'variable':
      return project.variables.map((one) => ({ value: one.id, label: one.name ?? one.id }));
    case 'scene':
      return project.scenes.map((one) => ({ value: one.id, label: one.name ?? one.id }));
    case 'control':
      return plain(Object.keys(project.settings.input));
    case 'sound':
      return project.assets
        .filter((one) => one.kind === 'sound')
        .map((one) => ({ value: one.id, label: one.name ?? one.id }));
    case 'animation':
      return plain([
        ...new Set(
          project.entities.flatMap(
            (one) => one.components.sprite?.animations.map((a) => a.id) ?? [],
          ),
        ),
      ]);
    case 'layer':
      return scene.layers.map((one) => ({ value: one.id, label: one.name ?? one.id }));
    case 'rule':
      return [...scene.events, ...project.globalEvents].map((one) => ({
        value: one.id,
        label: one.name ?? one.id,
      }));
    case 'entity-tag':
      return plain([...entityTags(project)]);
    case 'tile-tag':
      return plain([...tileTags(project)]);
    default:
      return [];
  }
}

export function entityTags(project: Project): Set<string> {
  const tags = new Set<string>();
  for (const prototype of project.entities) for (const tag of prototype.tags) tags.add(tag);
  for (const scene of project.scenes) {
    for (const instance of scene.entities) for (const tag of instance.tags) tags.add(tag);
  }
  return tags;
}

export function tileTags(project: Project): Set<string> {
  const tags = new Set<string>(KNOWN_TILE_TAGS);
  for (const tileset of project.tilesets) {
    for (const tile of tileset.tiles) for (const tag of tile.tags) tags.add(tag);
  }
  return tags;
}

/**
 * A starting point for a newly chosen trigger, condition or action, filled in
 * from what this project actually has. A field with nothing to point at is left
 * empty and the change is refused with a message saying what is missing.
 */
export function defaults(clause: Clause, type: string, context: Context): Node {
  const node: Node = { type };
  for (const field of fieldsFor(clause, type)) {
    if (field.optional) continue;
    node[field.name] = defaultFor(field, context);
  }
  return node;
}

/** What a freshly placed field starts out holding. */
export function defaultFor(field: FieldSpec, context: Context): unknown {
  if (field.kind === 'boolean') return false;
  if (field.kind === 'number') {
    return field.name === 'seconds' || field.name === 'percent' ? 1 : 0;
  }
  if (field.kind === 'text') return 'Hello';
  // A valid id, so the change is refused with "has no property called
  // my-property" rather than choking on the placeholder itself.
  if (field.kind === 'property') return 'my-property';
  if (field.kind === 'value') return 1;
  if (field.kind === 'tile') return null;
  return optionsFor(field, context)[0]?.value ?? '';
}

export function choicesOf(
  entries: Record<string, CatalogEntry>,
): { value: string; label: string }[] {
  return Object.entries(entries).map(([type, entry]) => ({ value: type, label: entry.label }));
}

export function summarise(
  clause: Clause,
  node: Node,
  entries: Record<string, CatalogEntry>,
): string {
  const entry = entries[node.type];
  const details = fieldsFor(clause, node.type)
    .filter((field) =>
      [
        'entity',
        'prototype',
        'variable',
        'scene',
        'control',
        'sound',
        'entity-tag',
        'tile-tag',
        'rule',
        'value',
        'text',
        'property',
      ].includes(field.kind),
    )
    .map((field) => node[field.name])
    .filter((one) => one !== undefined && one !== '')
    .map((one) => spoken(String(one)));
  const label = entry?.label ?? node.type;
  return details.length > 0
    ? `${label.toLowerCase()} (${details.join(', ')})`
    : label.toLowerCase();
}

/** $self and $other are how the file writes it; a sentence should say what it means. */
export function spoken(value: string): string {
  if (value === '$self') return 'it';
  if (value === '$other') return 'the other thing';
  if (value.startsWith('tag:')) return `anything tagged ${value.slice(4)}`;
  return value;
}

export function looseValue(raw: string): number | boolean | string {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return raw;
}

export function allRuleIds(project: Project): string[] {
  return [
    ...project.globalEvents.map((one) => one.id),
    ...project.scenes.flatMap((one) => one.events.map((two) => two.id)),
  ];
}
