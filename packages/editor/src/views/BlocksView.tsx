import { useState, type DragEvent } from 'react';
import {
  ACTIONS,
  Action,
  CONDITIONS,
  Condition,
  TRIGGERS,
  Trigger,
  type EventRule,
  type Project,
  type Scene,
} from '@pinforge/schema';
import {
  COMPARISON_PHRASES,
  templateFor,
  type Node,
  type SlotPart,
  type Template,
} from '@pinforge/script';
import * as edit from '../state/commands.js';
import { useEditor } from '../state/useStore.js';
import { Button, Note, Panel } from '../ui/controls.js';
import { nextId } from '../panels/Sidebar.js';
import type { Clause, FieldSpec } from '../rule-fields.js';
import {
  allRuleIds,
  defaultFor,
  looseValue,
  optionsFor,
  summarise,
  type Context,
} from './clause-controls.js';
import {
  DRAG_TYPE,
  TEMPLATES,
  blockLabel,
  decodeDrag,
  encodeDrag,
  flatParts,
  insertAt,
  moveItem,
  nodeFromTemplate,
  paletteTemplates,
  removeAt,
  slotSpec,
  type BlockDrag,
} from './blocks-model.js';

/**
 * The same rules as snap-together blocks. Every block is a PinScript sentence
 * with controls sitting in its slots, so dragging blocks and typing script are
 * two hands on one thing. A rule is a stack: a golden when hat, green if
 * blocks, blue then blocks.
 *
 * Dragging: palette to a stack adds, block to block reorders, block to the
 * palette removes it, any block to the empty space starts a new rule.
 */
export function BlocksView({
  rules,
  sceneId,
  scene,
  project,
}: {
  rules: readonly EventRule[];
  sceneId: string | undefined;
  scene: Scene;
  project: Project;
}) {
  const store = useEditor();
  const [drag, setDrag] = useState<BlockDrag | undefined>(undefined);

  const refuse = (message: string): void => store.set({ problem: message });

  const choose = (context: Context) => (spec: FieldSpec) =>
    spec.kind === 'tile' ? 0 : defaultFor(spec, context);

  const contextFor = (rule: EventRule | undefined): Context => ({
    project,
    scene,
    sceneId,
    allowSelf: rule !== undefined && 'subject' in rule.when,
    allowOther:
      rule !== undefined && (rule.when.type === 'collides' || rule.when.type === 'collision-ends'),
  });

  const paletteNode = (
    payload: BlockDrag & { from: 'palette' },
    rule?: EventRule,
  ): Node | undefined => {
    const template = paletteTemplates(payload.clause)[payload.index];
    if (!template) return undefined;
    return nodeFromTemplate(payload.clause, template, choose(contextFor(rule)));
  };

  /** A dropped when block replaces the stack's hat. */
  const dropOnHat = (rule: EventRule, payload: BlockDrag): void => {
    if (payload.from !== 'palette' || payload.clause !== 'when') return;
    const node = paletteNode(payload);
    if (!node) return;
    const parsed = Trigger.safeParse(node);
    if (!parsed.success) {
      refuse(parsed.error.issues[0]?.message ?? 'That block cannot be filled in yet.');
      return;
    }
    store.apply(edit.updateRule({ ...rule, when: parsed.data }, sceneId));
  };

  /** A drop into the if or then part of a stack, at one slot. */
  const dropOnList = (
    rule: EventRule,
    clause: 'if' | 'then',
    at: number,
    payload: BlockDrag,
  ): void => {
    if (payload.clause !== clause) return;

    if (payload.from === 'palette') {
      const node = paletteNode(payload, rule);
      if (!node) return;
      if (clause === 'if') {
        const parsed = Condition.safeParse(node);
        if (!parsed.success) {
          refuse(parsed.error.issues[0]?.message ?? 'That block cannot be filled in yet.');
          return;
        }
        store.apply(edit.updateRule({ ...rule, if: insertAt(rule.if, at, parsed.data) }, sceneId));
      } else {
        const parsed = Action.safeParse(node);
        if (!parsed.success) {
          refuse(parsed.error.issues[0]?.message ?? 'That block cannot be filled in yet.');
          return;
        }
        store.apply(
          edit.updateRule({ ...rule, then: insertAt(rule.then, at, parsed.data) }, sceneId),
        );
      }
      return;
    }

    const source = rules.find((one) => one.id === payload.ruleId);
    if (!source) return;

    if (source.id === rule.id) {
      const next =
        clause === 'if'
          ? { ...rule, if: moveItem(rule.if, payload.index, at) }
          : { ...rule, then: moveItem(rule.then, payload.index, at) };
      store.apply(edit.updateRule(next, sceneId));
      return;
    }

    if (clause === 'then' && source.then.length <= 1) {
      refuse('A rule needs at least one then block, so this one cannot be moved away.');
      return;
    }
    const moved = clause === 'if' ? source.if[payload.index] : source.then[payload.index];
    if (moved === undefined) return;
    const emptied =
      clause === 'if'
        ? { ...source, if: removeAt(source.if, payload.index) }
        : { ...source, then: removeAt(source.then, payload.index) };
    const filled =
      clause === 'if'
        ? { ...rule, if: insertAt(rule.if, at, moved as Condition) }
        : { ...rule, then: insertAt(rule.then, at, moved as Action) };
    store.apply(edit.updateRules([emptied, filled], sceneId));
  };

  /** Dropping any palette block on the empty space starts a new rule around it. */
  const dropOnNewRule = (payload: BlockDrag): void => {
    if (payload.from !== 'palette') return;
    const node = paletteNode(payload);
    if (!node) return;

    const id = nextId(allRuleIds(project), 'rule');
    const base: EventRule = {
      id,
      name: 'New rule',
      enabled: true,
      once: false,
      when: { type: 'scene-starts' },
      if: [],
      then: [{ type: 'show-message', text: 'Hello', seconds: 2 }],
    };

    if (payload.clause === 'when') {
      const parsed = Trigger.safeParse(node);
      if (!parsed.success) return refuse('That block cannot be filled in yet.');
      store.apply(edit.addRule({ ...base, when: parsed.data }, sceneId));
    } else if (payload.clause === 'if') {
      const parsed = Condition.safeParse(node);
      if (!parsed.success) return refuse('That block cannot be filled in yet.');
      store.apply(edit.addRule({ ...base, if: [parsed.data] }, sceneId));
    } else {
      const parsed = Action.safeParse(node);
      if (!parsed.success) return refuse('That block cannot be filled in yet.');
      store.apply(edit.addRule({ ...base, then: [parsed.data] }, sceneId));
    }
  };

  /** Dragging a block back to the palette throws it away, like Scratch. */
  const dropOnPalette = (payload: BlockDrag): void => {
    if (payload.from !== 'rule') return;
    const rule = rules.find((one) => one.id === payload.ruleId);
    if (!rule) return;
    if (payload.clause === 'then' && rule.then.length <= 1) {
      refuse('A rule needs at least one then block. Remove the whole rule instead.');
      return;
    }
    const next =
      payload.clause === 'if'
        ? { ...rule, if: removeAt(rule.if, payload.index) }
        : { ...rule, then: removeAt(rule.then, payload.index) };
    store.apply(edit.updateRule(next, sceneId));
  };

  const withPayload = (handle: (payload: BlockDrag) => void) => (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDrag(undefined);
    const payload = decodeDrag(event.dataTransfer.getData(DRAG_TYPE));
    if (payload) handle(payload);
  };

  const allow = (event: DragEvent): void => {
    if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault();
  };

  return (
    <div className="blocks">
      <aside
        className={`block-palette${drag?.from === 'rule' ? ' trash' : ''}`}
        onDragOver={allow}
        onDrop={withPayload(dropOnPalette)}
      >
        {drag?.from === 'rule' ? (
          <div className="palette-trash">Drop it here to remove it</div>
        ) : null}
        <PaletteSection
          clause="when"
          title="When"
          hint="What sets the rule off. Drop it on a stack's top block to swap it."
          drag={drag}
          setDrag={setDrag}
        />
        <PaletteSection
          clause="if"
          title="Only if"
          hint="Everything here must also be true."
          drag={drag}
          setDrag={setDrag}
        />
        <PaletteSection
          clause="then"
          title="Then"
          hint="What happens, top to bottom."
          drag={drag}
          setDrag={setDrag}
        />
      </aside>

      <div className="block-canvas">
        {rules.length === 0 ? (
          <Panel>
            <Note>
              No rules yet. Drag a golden when block here to start one, or any blue then block.
            </Note>
          </Panel>
        ) : null}
        {rules.map((rule, index) => (
          <BlockStack
            key={rule.id}
            rule={rule}
            index={index}
            count={rules.length}
            sceneId={sceneId}
            context={contextFor(rule)}
            drag={drag}
            setDrag={setDrag}
            onDropHat={(payload) => dropOnHat(rule, payload)}
            onDropList={(clause, at, payload) => dropOnList(rule, clause, at, payload)}
          />
        ))}
        <div
          className={`new-rule-zone${drag?.from === 'palette' ? ' ready' : ''}`}
          onDragOver={allow}
          onDrop={withPayload(dropOnNewRule)}
        >
          Drop a block here to start a new rule
        </div>
      </div>
    </div>
  );
}

function PaletteSection({
  clause,
  title,
  hint,
  drag,
  setDrag,
}: {
  clause: Clause;
  title: string;
  hint: string;
  drag: BlockDrag | undefined;
  setDrag: (drag: BlockDrag | undefined) => void;
}) {
  if (drag?.from === 'rule') return null;
  return (
    <section className="palette-section">
      <h3>{title}</h3>
      <p className="note">{hint}</p>
      {paletteTemplates(clause).map((template, index) => (
        <div
          key={`${template.type}-${index}`}
          className={`block palette ${clauseClass(clause)}`}
          draggable
          title={entrySummary(clause, template)}
          onDragStart={(event) => {
            const payload: BlockDrag = { from: 'palette', clause, index };
            event.dataTransfer.setData(DRAG_TYPE, encodeDrag(payload));
            event.dataTransfer.effectAllowed = 'copy';
            setDrag(payload);
          }}
          onDragEnd={() => setDrag(undefined)}
        >
          {blockLabel(template)}
        </div>
      ))}
    </section>
  );
}

function entrySummary(clause: Clause, template: Template): string {
  const entries = clause === 'when' ? TRIGGERS : clause === 'if' ? CONDITIONS : ACTIONS;
  return (entries as Record<string, { summary: string }>)[template.type]?.summary ?? '';
}

function clauseClass(clause: Clause): string {
  return clause === 'when' ? 'hat' : clause === 'if' ? 'condition' : 'action';
}

function BlockStack({
  rule,
  index,
  count,
  sceneId,
  context,
  drag,
  setDrag,
  onDropHat,
  onDropList,
}: {
  rule: EventRule;
  index: number;
  count: number;
  sceneId: string | undefined;
  context: Context;
  drag: BlockDrag | undefined;
  setDrag: (drag: BlockDrag | undefined) => void;
  onDropHat: (payload: BlockDrag) => void;
  onDropList: (clause: 'if' | 'then', at: number, payload: BlockDrag) => void;
}) {
  const store = useEditor();
  const change = (next: EventRule) => store.apply(edit.updateRule(next, sceneId));

  const allow = (event: DragEvent): void => {
    if (event.dataTransfer.types.includes(DRAG_TYPE)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const handle = (act: (payload: BlockDrag) => void) => (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDrag(undefined);
    const payload = decodeDrag(event.dataTransfer.getData(DRAG_TYPE));
    if (payload) act(payload);
  };

  const slot = (clause: 'if' | 'then', at: number) => (
    <div
      className={`block-slot${drag && drag.clause === clause ? ' ready' : ''}`}
      onDragOver={allow}
      onDrop={handle((payload) => onDropList(clause, at, payload))}
    />
  );

  return (
    <section className="block-stack">
      <header className="stack-head">
        <input
          className="stack-name"
          value={rule.name ?? ''}
          placeholder={rule.id}
          aria-label="What this rule is for"
          onChange={(event) => change({ ...rule, name: event.target.value || undefined })}
        />
        <button
          type="button"
          className={`chip toggle${rule.once ? ' on' : ''}`}
          title="Runs at most once each time the level starts."
          onClick={() => change({ ...rule, once: !rule.once })}
        >
          once
        </button>
        <button
          type="button"
          className={`chip toggle${rule.enabled ? '' : ' on'}`}
          title="A switched off rule stays here but never runs."
          onClick={() => change({ ...rule, enabled: !rule.enabled })}
        >
          off
        </button>
        <span className="spacer" />
        <Button
          small
          kind="quiet"
          disabled={index === 0}
          onClick={() => store.apply(edit.moveRule(rule.id, sceneId, -1))}
          title="Run this rule earlier"
        >
          Up
        </Button>
        <Button
          small
          kind="quiet"
          disabled={index === count - 1}
          onClick={() => store.apply(edit.moveRule(rule.id, sceneId, 1))}
          title="Run this rule later"
        >
          Down
        </Button>
        <Button small kind="danger" onClick={() => store.apply(edit.removeRule(rule.id, sceneId))}>
          Delete
        </Button>
      </header>

      <div
        className={`block hat${drag?.from === 'palette' && drag.clause === 'when' ? ' ready' : ''}`}
        onDragOver={allow}
        onDrop={handle(onDropHat)}
      >
        <BlockSentence
          clause="when"
          node={rule.when as unknown as Node}
          context={{ ...context, allowSelf: false, allowOther: false }}
          onChange={(node) => {
            const parsed = Trigger.safeParse(node);
            if (parsed.success) change({ ...rule, when: parsed.data });
          }}
        />
      </div>

      <div className="block-section">
        {rule.if.map((condition, at) => (
          <div key={at}>
            {slot('if', at)}
            <div
              className="block condition"
              draggable
              onDragStart={(event) => {
                const payload: BlockDrag = {
                  from: 'rule',
                  clause: 'if',
                  ruleId: rule.id,
                  index: at,
                };
                event.dataTransfer.setData(DRAG_TYPE, encodeDrag(payload));
                event.dataTransfer.effectAllowed = 'move';
                setDrag(payload);
              }}
              onDragEnd={() => setDrag(undefined)}
            >
              <button
                type="button"
                className={`negate${condition.negate ? ' on' : ''}`}
                title="Turns the check around."
                onClick={() =>
                  change({
                    ...rule,
                    if: rule.if.map((one, at2) =>
                      at2 === at ? { ...one, negate: !one.negate } : one,
                    ),
                  })
                }
              >
                not
              </button>
              <BlockSentence
                clause="if"
                node={condition as unknown as Node}
                context={context}
                onChange={(node) => {
                  const parsed = Condition.safeParse(node);
                  if (parsed.success) {
                    change({
                      ...rule,
                      if: rule.if.map((one, at2) => (at2 === at ? parsed.data : one)),
                    });
                  }
                }}
              />
              <button
                type="button"
                className="block-remove"
                title="Remove this block"
                onClick={() => change({ ...rule, if: rule.if.filter((_, at2) => at2 !== at) })}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {slot('if', rule.if.length)}
      </div>

      <div className="block-section">
        {rule.then.map((action, at) => (
          <div key={at}>
            {slot('then', at)}
            <div
              className="block action"
              draggable
              onDragStart={(event) => {
                const payload: BlockDrag = {
                  from: 'rule',
                  clause: 'then',
                  ruleId: rule.id,
                  index: at,
                };
                event.dataTransfer.setData(DRAG_TYPE, encodeDrag(payload));
                event.dataTransfer.effectAllowed = 'move';
                setDrag(payload);
              }}
              onDragEnd={() => setDrag(undefined)}
            >
              <BlockSentence
                clause="then"
                node={action as unknown as Node}
                context={context}
                onChange={(node) => {
                  const parsed = Action.safeParse(node);
                  if (parsed.success) {
                    change({
                      ...rule,
                      then: rule.then.map((one, at2) => (at2 === at ? parsed.data : one)),
                    });
                  }
                }}
              />
              <button
                type="button"
                className="block-remove"
                title="Remove this block"
                disabled={rule.then.length === 1}
                onClick={() => change({ ...rule, then: rule.then.filter((_, at2) => at2 !== at) })}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {slot('then', rule.then.length)}
      </div>
    </section>
  );
}

/** One block's face: the sentence's words, with a control in every slot. */
function BlockSentence({
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
  const template = templateFor(TEMPLATES[clause], node);
  if (!template) {
    const entries = clause === 'when' ? TRIGGERS : clause === 'if' ? CONDITIONS : ACTIONS;
    return <span className="block-words">{summarise(clause, node, entries)}</span>;
  }

  return (
    <span className="block-words">
      {flatParts(template).map((part, at) =>
        part.kind === 'word' ? (
          <span key={at}>{part.word}</span>
        ) : (
          <SlotControl
            key={at}
            clause={clause}
            template={template}
            part={part}
            node={node}
            context={context}
            onChange={onChange}
          />
        ),
      )}
    </span>
  );
}

function SlotControl({
  clause,
  template,
  part,
  node,
  context,
  onChange,
}: {
  clause: Clause;
  template: Template;
  part: SlotPart;
  node: Node;
  context: Context;
  onChange: (node: Node) => void;
}) {
  const value = node[part.field];
  const put = (next: unknown) => onChange({ ...node, [part.field]: next });
  const spec = slotSpec(clause, template, part.field);

  if (part.slot === 'cmp') {
    return (
      <select
        className="hole"
        value={String(value ?? 'equals')}
        aria-label={part.field}
        onChange={(event) => put(event.target.value)}
      >
        {COMPARISON_PHRASES.map((one) => (
          <option key={one.operator} value={one.operator}>
            {one.words.join(' ')}
          </option>
        ))}
      </select>
    );
  }

  if (part.slot === 'number' || spec?.kind === 'number' || spec?.kind === 'tile') {
    return (
      <input
        className="hole hole-number"
        type="number"
        step="any"
        aria-label={part.field}
        value={typeof value === 'number' ? value : ''}
        placeholder={spec?.optional ? '—' : '0'}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            put(spec?.optional ? undefined : spec?.kind === 'tile' ? null : 0);
            return;
          }
          const next = Number(raw);
          if (Number.isFinite(next)) put(next);
        }}
      />
    );
  }

  if (
    part.slot === 'text' ||
    part.slot === 'value' ||
    spec?.kind === 'value' ||
    spec?.kind === 'property' ||
    spec === undefined
  ) {
    return (
      <input
        className="hole hole-text"
        type="text"
        aria-label={part.field}
        value={String(value ?? '')}
        onChange={(event) =>
          put(part.slot === 'text' ? event.target.value : looseValue(event.target.value))
        }
      />
    );
  }

  const choices =
    part.slot === 'enum' && (spec.options === undefined || spec.options.length === 0)
      ? (part.values ?? []).map((one) => ({ value: one, label: one }))
      : optionsFor(spec, context);
  return (
    <select
      className="hole"
      value={String(value ?? '')}
      aria-label={part.field}
      onChange={(event) => put(event.target.value === '' ? undefined : event.target.value)}
    >
      {spec.optional ? <option value="">—</option> : null}
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}
