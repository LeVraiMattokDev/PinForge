import { useState } from 'react';
import {
  ACTIONS,
  Action,
  CONDITIONS,
  Condition,
  KNOWN_TILE_TAGS,
  TRIGGERS,
  Trigger,
  type CatalogEntry,
  type EventRule,
  type Project,
  type Scene,
} from '@pinforge/schema';
import * as edit from '../state/commands.js';
import { fieldsFor, readable, type Clause, type FieldSpec } from '../rule-fields.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import {
  Button,
  Checkbox,
  Field,
  Note,
  NumberInput,
  Panel,
  Segmented,
  Select,
  TextInput,
} from '../ui/controls.js';
import { nextId } from '../panels/Sidebar.js';

type Node = Record<string, unknown> & { type: string };

/**
 * Rules read as a sentence and are built from dropdowns. There is no node graph
 * and there will not be one: a sentence can be read by someone who has never
 * programmed, and a graph cannot.
 *
 * Which fields a trigger, condition or action has comes from the schema, so
 * this file never has to be updated when the vocabulary grows.
 */
export function RulesView() {
  const store = useEditor();
  const state = useEditorState();
  const scene = store.scene;
  const [where, setWhere] = useState<'level' | 'everywhere'>('level');
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const sceneId = where === 'level' ? scene.id : undefined;
  const rules = sceneId === undefined ? state.project.globalEvents : scene.events;

  return (
    <div className="column" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <Panel>
        <div className="stage-bar">
          <Segmented
            value={where}
            onChange={setWhere}
            options={[
              { value: 'level', label: `Rules for ${scene.name ?? scene.id}` },
              { value: 'everywhere', label: 'Rules for the whole game' },
            ]}
          />
          <span className="spacer" />
          <Button
            kind="primary"
            onClick={() => {
              const id = nextId(allRuleIds(state.project), 'rule');
              store.apply(
                edit.addRule(
                  {
                    id,
                    name: 'New rule',
                    enabled: true,
                    once: false,
                    when: { type: 'scene-starts' },
                    if: [],
                    then: [{ type: 'show-message', text: 'Hello', seconds: 2 }],
                  },
                  sceneId,
                ),
              );
              setEditing(id);
            }}
          >
            Add a rule
          </Button>
        </div>
        <Note>
          {sceneId === undefined
            ? 'These run in every level. Pausing, losing a life and starting again belong here rather than copied into each level.'
            : 'These run only in this level.'}
        </Note>
      </Panel>

      {rules.length === 0 ? (
        <Panel>
          <Note>
            No rules yet. A rule is a sentence: when something happens, then something else does.
          </Note>
        </Panel>
      ) : null}

      {rules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          index={index}
          count={rules.length}
          sceneId={sceneId}
          scene={scene}
          project={state.project}
          editing={editing === rule.id}
          onEdit={() => setEditing(editing === rule.id ? undefined : rule.id)}
        />
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  count,
  sceneId,
  scene,
  project,
  editing,
  onEdit,
}: {
  rule: EventRule;
  index: number;
  count: number;
  sceneId: string | undefined;
  scene: Scene;
  project: Project;
  editing: boolean;
  onEdit: () => void;
}) {
  const store = useEditor();
  const change = (next: EventRule) => store.apply(edit.updateRule(next, sceneId));
  const context: Context = {
    project,
    scene,
    sceneId,
    allowSelf: 'subject' in rule.when,
    allowOther: rule.when.type === 'collides' || rule.when.type === 'collision-ends',
  };

  return (
    <div className={`rule${editing ? ' editing' : ''}`}>
      <div className="rule-head">
        <strong>{rule.name ?? rule.id}</strong>
        {rule.enabled ? null : <span className="chip">switched off</span>}
        {rule.once ? <span className="chip">once only</span> : null}
        <span className="rule-actions">
          <Button
            small
            kind="quiet"
            disabled={index === 0}
            onClick={() => store.apply(edit.moveRule(rule.id, sceneId, -1))}
            title="Move it earlier"
          >
            Up
          </Button>
          <Button
            small
            kind="quiet"
            disabled={index === count - 1}
            onClick={() => store.apply(edit.moveRule(rule.id, sceneId, 1))}
            title="Move it later"
          >
            Down
          </Button>
          <Button small kind="quiet" onClick={onEdit}>
            {editing ? 'Done' : 'Change'}
          </Button>
          <Button
            small
            kind="danger"
            onClick={() => store.apply(edit.removeRule(rule.id, sceneId))}
          >
            Delete
          </Button>
        </span>
      </div>

      <div className="rule-sentence">
        <span className="word">WHEN</span>{' '}
        <span>{summarise('when', rule.when as Node, TRIGGERS)}</span>
        {rule.if.length > 0 ? (
          <>
            <span className="word">IF</span>
            <span>
              {rule.if.map((one) => summarise('if', one as Node, CONDITIONS)).join(' and ')}
            </span>
          </>
        ) : null}
        <span className="word">THEN</span>
        <span>{rule.then.map((one) => summarise('then', one as Node, ACTIONS)).join(', ')}</span>
      </div>

      {editing ? (
        <>
          <div className="grid-two" style={{ marginTop: 14 }}>
            <Field label="What this rule is for">
              <TextInput
                value={rule.name ?? ''}
                onChange={(name) => change({ ...rule, name: name || undefined })}
              />
            </Field>
            <div>
              <Checkbox
                label="Switched on"
                checked={rule.enabled}
                onChange={(enabled) => change({ ...rule, enabled })}
              />
              <Checkbox
                label="Only the first time"
                checked={rule.once}
                onChange={(once) => change({ ...rule, once })}
                hint="Runs at most once each time the level starts."
              />
            </div>
          </div>

          <div className="clause">
            <div className="clause-head">
              <span className="word">WHEN</span>
              <Select
                value={rule.when.type}
                onChange={(type) =>
                  change({ ...rule, when: Trigger.parse(defaults('when', type, context)) })
                }
                choices={choicesOf(TRIGGERS)}
              />
            </div>
            <Fields
              clause="when"
              node={rule.when as Node}
              context={{ ...context, allowSelf: false, allowOther: false }}
              onChange={(node) => change({ ...rule, when: Trigger.parse(node) })}
            />
            <Note>{TRIGGERS[rule.when.type].summary}</Note>
          </div>

          <div className="clause">
            <div className="clause-head">
              <span className="word">IF</span>
              <Select
                value=""
                placeholder="Add something that must be true"
                onChange={(type) =>
                  change({
                    ...rule,
                    if: [...rule.if, Condition.parse(defaults('if', type, context))],
                  })
                }
                choices={choicesOf(CONDITIONS)}
              />
            </div>
            {rule.if.length === 0 ? <Note>Nothing else has to be true.</Note> : null}
            {rule.if.map((condition, at) => (
              <div key={at} className="panel plain" style={{ marginBottom: 8 }}>
                <div className="clause-head">
                  <strong>{CONDITIONS[condition.type].label}</strong>
                  <span className="spacer" />
                  <Button
                    small
                    kind="quiet"
                    onClick={() => change({ ...rule, if: rule.if.filter((_, one) => one !== at) })}
                  >
                    Remove
                  </Button>
                </div>
                <Fields
                  clause="if"
                  node={condition as Node}
                  context={context}
                  onChange={(node) =>
                    change({
                      ...rule,
                      if: rule.if.map((one, at2) => (at2 === at ? Condition.parse(node) : one)),
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="clause">
            <div className="clause-head">
              <span className="word">THEN</span>
              <Select
                value=""
                placeholder="Add something that happens"
                onChange={(type) =>
                  change({
                    ...rule,
                    then: [...rule.then, Action.parse(defaults('then', type, context))],
                  })
                }
                choices={choicesOf(ACTIONS)}
              />
            </div>
            {rule.then.map((action, at) => (
              <div key={at} className="panel plain" style={{ marginBottom: 8 }}>
                <div className="clause-head">
                  <strong>{ACTIONS[action.type].label}</strong>
                  <span className="spacer" />
                  <Button
                    small
                    kind="quiet"
                    disabled={rule.then.length === 1}
                    onClick={() =>
                      change({ ...rule, then: rule.then.filter((_, one) => one !== at) })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Fields
                  clause="then"
                  node={action as Node}
                  context={context}
                  onChange={(node) =>
                    change({
                      ...rule,
                      then: rule.then.map((one, at2) => (at2 === at ? Action.parse(node) : one)),
                    })
                  }
                />
                <Note>{ACTIONS[action.type].summary}</Note>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

interface Context {
  project: Project;
  scene: Scene;
  sceneId: string | undefined;
  allowSelf: boolean;
  allowOther: boolean;
}

function Fields({
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

function FieldControl({
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

  if (field.kind === 'text') {
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

function optionsFor(field: FieldSpec, context: Context): { value: string; label: string }[] {
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

function entityTags(project: Project): Set<string> {
  const tags = new Set<string>();
  for (const prototype of project.entities) for (const tag of prototype.tags) tags.add(tag);
  for (const scene of project.scenes) {
    for (const instance of scene.entities) for (const tag of instance.tags) tags.add(tag);
  }
  return tags;
}

function tileTags(project: Project): Set<string> {
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
function defaults(clause: Clause, type: string, context: Context): Node {
  const node: Node = { type };
  for (const field of fieldsFor(clause, type)) {
    if (field.optional) continue;
    if (field.kind === 'boolean') {
      node[field.name] = false;
    } else if (field.kind === 'number') {
      node[field.name] = field.name === 'seconds' || field.name === 'percent' ? 1 : 0;
    } else if (field.kind === 'text') {
      node[field.name] = 'Hello';
    } else if (field.kind === 'value') {
      node[field.name] = 1;
    } else if (field.kind === 'tile') {
      node[field.name] = null;
    } else {
      node[field.name] = optionsFor(field, context)[0]?.value ?? '';
    }
  }
  return node;
}

function choicesOf(entries: Record<string, CatalogEntry>): { value: string; label: string }[] {
  return Object.entries(entries).map(([type, entry]) => ({ value: type, label: entry.label }));
}

function summarise(clause: Clause, node: Node, entries: Record<string, CatalogEntry>): string {
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
function spoken(value: string): string {
  if (value === '$self') return 'it';
  if (value === '$other') return 'the other thing';
  if (value.startsWith('tag:')) return `anything tagged ${value.slice(4)}`;
  return value;
}

function looseValue(raw: string): number | boolean | string {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return raw;
}

function allRuleIds(project: Project): string[] {
  return [
    ...project.globalEvents.map((one) => one.id),
    ...project.scenes.flatMap((one) => one.events.map((two) => two.id)),
  ];
}
