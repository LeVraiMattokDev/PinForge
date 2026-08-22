import {
  ACTION_TEMPLATES,
  CONDITION_TEMPLATES,
  TRIGGER_TEMPLATES,
  type Node,
  type SlotPart,
  type Template,
  type WordPart,
} from '@pinforge/script';
import { fieldsFor, type Clause, type FieldSpec } from '../rule-fields.js';

/**
 * The thinking half of the blocks view, kept away from the pointer handling so
 * it can be tested. A block is a PinScript sentence with controls sitting in
 * its slots: the same templates drive the script text, so a block and a line
 * of script are the same thing wearing different clothes.
 */

export const TEMPLATES: Record<Clause, readonly Template[]> = {
  when: TRIGGER_TEMPLATES,
  if: CONDITION_TEMPLATES,
  then: ACTION_TEMPLATES,
};

/** What the palette offers: every phrasing, minus parse-only synonyms. */
export function paletteTemplates(clause: Clause): readonly Template[] {
  return TEMPLATES[clause].filter((one) => one.parseOnly !== true);
}

/** A template's parts with the optional groups opened up, for laying out a block. */
export function flatParts(template: Template): readonly (SlotPart | WordPart)[] {
  return template.parts.flatMap((part) => (part.kind === 'group' ? part.parts : [part]));
}

/** The sentence a palette block wears, with a blank for every slot. */
export function blockLabel(template: Template): string {
  return flatParts(template)
    .map((part) => (part.kind === 'word' ? part.word : '___'))
    .join(' ');
}

/** The schema's description of one slot, which decides what control it gets. */
export function slotSpec(clause: Clause, template: Template, field: string): FieldSpec | undefined {
  return fieldsFor(clause, template.type).find((one) => one.name === field);
}

/**
 * A fresh node for a block just dragged out of the palette. Required slots are
 * filled by the caller's choice function; optional ones stay empty so the
 * schema's own defaults apply.
 */
export function nodeFromTemplate(
  clause: Clause,
  template: Template,
  choose: (spec: FieldSpec) => unknown,
): Node {
  const node: Node = { type: template.type, ...(template.set ?? {}) };
  for (const part of flatParts(template)) {
    if (part.kind !== 'slot') continue;
    if (node[part.field] !== undefined) continue;
    const spec = slotSpec(clause, template, part.field);
    if (!spec || spec.optional) continue;
    node[part.field] = choose(spec);
  }
  return node;
}

// --- list surgery for dropping blocks ---------------------------------------

export function insertAt<T>(list: readonly T[], at: number, item: T): T[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(at, list.length)), 0, item);
  return next;
}

export function removeAt<T>(list: readonly T[], at: number): T[] {
  return list.filter((_, index) => index !== at);
}

/** Moves one item to a new slot, where the slot is counted before the move. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const item = list[from];
  if (item === undefined) return [...list];
  const without = removeAt(list, from);
  return insertAt(without, to > from ? to - 1 : to, item);
}

// --- what is being dragged ---------------------------------------------------

export const DRAG_TYPE = 'application/x-pinforge-block';

export type BlockDrag =
  | { readonly from: 'palette'; readonly clause: Clause; readonly index: number }
  | {
      readonly from: 'rule';
      readonly clause: 'if' | 'then';
      readonly ruleId: string;
      readonly index: number;
    };

export function encodeDrag(drag: BlockDrag): string {
  return JSON.stringify(drag);
}

export function decodeDrag(raw: string): BlockDrag | undefined {
  try {
    const parsed = JSON.parse(raw) as BlockDrag;
    if (parsed.from === 'palette' && parsed.clause && typeof parsed.index === 'number') {
      return parsed;
    }
    if (
      parsed.from === 'rule' &&
      (parsed.clause === 'if' || parsed.clause === 'then') &&
      typeof parsed.ruleId === 'string' &&
      typeof parsed.index === 'number'
    ) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
