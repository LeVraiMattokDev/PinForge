import type { Action, Condition, EventRule, Trigger } from '@pinforge/schema';
import { quote } from './tokens.js';
import {
  ACTION_TEMPLATES,
  COMPARISON_PHRASES,
  CONDITION_TEMPLATES,
  SINGULARS,
  TRIGGER_TEMPLATES,
  type GroupPart,
  type Node,
  type SlotPart,
  type Template,
  type WordPart,
} from './templates.js';

/**
 * Writes rules back out as PinScript. Printing is the inverse of parsing by
 * construction: both walk the same templates, and the tests hold every example
 * to parse(print(rule)) being the rule again.
 */

export function printScript(rules: readonly EventRule[]): string {
  return rules.map(printRule).join('\n\n') + (rules.length > 0 ? '\n' : '');
}

export function printRule(rule: EventRule): string {
  let header = `rule ${rule.id}`;
  if (rule.name !== undefined) header += ` ${quote(rule.name)}`;
  if (rule.once) header += ' once';
  if (!rule.enabled) header += ' off';

  const lines = [header, printTrigger(rule.when)];
  for (const condition of rule.if) {
    lines.push(`if ${condition.negate ? 'not ' : ''}${printCondition(condition)}`);
  }
  for (const action of rule.then) {
    lines.push(`then ${printAction(action)}`);
  }
  return lines.join('\n');
}

/** The whole trigger line, starting with when or every. */
export function printTrigger(trigger: Trigger): string {
  return render(TRIGGER_TEMPLATES, trigger as unknown as Node);
}

/** The condition phrase alone, without the leading if or not. */
export function printCondition(condition: Condition): string {
  return render(CONDITION_TEMPLATES, condition as unknown as Node);
}

/** The action phrase alone, without the leading then. */
export function printAction(action: Action): string {
  return render(ACTION_TEMPLATES, action as unknown as Node);
}

/**
 * The phrasing a node is written with. The blocks view leans on this too, so a
 * block and the script always say a rule the same way.
 */
export function templateFor(templates: readonly Template[], node: Node): Template | undefined {
  return templates.find(
    (one) =>
      one.type === node.type &&
      one.parseOnly !== true &&
      setMatches(one, node) &&
      (one.printWhen?.(node) ?? true),
  );
}

function render(templates: readonly Template[], node: Node): string {
  const template = templateFor(templates, node);
  if (!template) {
    throw new Error(`No sentence is known for "${node.type}". This is a bug in PinScript.`);
  }

  const words: string[] = [];
  for (const part of template.parts) {
    if (part.kind === 'group') {
      if (skipGroup(part, template, node)) continue;
      for (const inner of part.parts) words.push(...renderPart(inner, node));
      continue;
    }
    words.push(...renderPart(part, node));
  }
  return joinWords(words);
}

function setMatches(template: Template, node: Node): boolean {
  if (!template.set) return true;
  return Object.entries(template.set).every(([field, value]) => node[field] === value);
}

/** A group stays out of the line while every field in it is absent or default. */
function skipGroup(group: GroupPart, template: Template, node: Node): boolean {
  const fields = group.parts.filter((part) => part.kind === 'slot').map((part) => part.field);
  if (fields.every((field) => node[field] === undefined)) return true;
  const omit = template.omit;
  if (!omit) return false;
  return fields.every((field) => node[field] === undefined || node[field] === omit[field]);
}

function renderPart(part: SlotPart | WordPart, node: Node): string[] {
  if (part.kind === 'word') return [part.word];
  const value = node[part.field];
  if (part.slot === 'cmp') {
    const phrase = COMPARISON_PHRASES.find((one) => one.operator === value);
    if (!phrase) throw new Error(`Unknown comparison "${String(value)}".`);
    return [...phrase.words];
  }
  if (value === undefined) {
    throw new Error(`"${node.type}" is missing "${part.field}". This is a bug in PinScript.`);
  }
  if (part.slot === 'text') return [quote(String(value))];
  if (part.slot === 'value' && typeof value === 'string') return [quote(value)];
  return [String(value)];
}

/** Joins with spaces, letting "1 seconds" read as "1 second" on the way out. */
function joinWords(words: string[]): string {
  const fixed = words.map((word, index) => {
    const singular = SINGULARS[word];
    return singular !== undefined && words[index - 1] === '1' ? singular : word;
  });
  return fixed.join(' ');
}
