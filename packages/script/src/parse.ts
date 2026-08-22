import {
  Action,
  Condition,
  ENTITY_REF_PATTERN,
  EventRule,
  ID_PATTERN,
  Trigger,
} from '@pinforge/schema';
import { isNumberToken, tokenizeLine, type Token } from './tokens.js';
import {
  ACTION_TEMPLATES,
  COMPARISON_PHRASES,
  CONDITION_TEMPLATES,
  SINGULARS,
  TRIGGER_TEMPLATES,
  type Node,
  type SlotPart,
  type Template,
  type WordPart,
} from './templates.js';

export interface ScriptIssue {
  readonly line: number;
  readonly message: string;
}

export interface ParsedScript {
  readonly rules: EventRule[];
  readonly issues: readonly ScriptIssue[];
}

/**
 * Reads a whole script into event rules. Parsing never throws: every problem
 * comes back as an issue naming its line, so the editor can show all of them
 * at once and keep the rules that did read.
 */
export function parseScript(text: string): ParsedScript {
  const rules: EventRule[] = [];
  const issues: ScriptIssue[] = [];
  const seenIds = new Set<string>();
  let draft: Draft | undefined;

  const finish = (): void => {
    if (!draft) return;
    const rule = finishRule(draft, issues);
    if (rule) {
      if (seenIds.has(rule.id)) {
        issues.push({
          line: draft.headerLine,
          message: `There is already a rule called "${rule.id}" in this script. Ids must be unique.`,
        });
      } else {
        seenIds.add(rule.id);
        rules.push(rule);
      }
    }
    draft = undefined;
  };

  text.split('\n').forEach((line, index) => {
    const at = index + 1;
    const tokens = tokenizeLine(line);
    if ('error' in tokens) {
      issues.push({ line: at, message: tokens.error });
      return;
    }
    if (tokens.length === 0) return;

    const first = tokens[0]!;
    const keyword = first.quoted ? '' : first.text.toLowerCase();

    if (keyword === 'rule') {
      finish();
      draft = readHeader(tokens, at, issues);
      return;
    }
    if (!draft) {
      issues.push({
        line: at,
        message: 'This line is outside any rule. Start one with: rule <id>',
      });
      return;
    }
    if (keyword === 'when' || keyword === 'every') {
      if (draft.when) {
        issues.push({ line: at, message: `The rule "${draft.id}" already has a when line.` });
        return;
      }
      draft.whenTried = true;
      const node = matchLine(TRIGGER_TEMPLATES, tokens);
      if (!node) {
        issues.push({
          line: at,
          message: 'Could not read this trigger. One example: when player touches coin',
        });
        return;
      }
      const parsed = Trigger.safeParse(node);
      if (!parsed.success) {
        issues.push({ line: at, message: firstZodMessage(parsed.error) });
        return;
      }
      draft.when = parsed.data;
      return;
    }
    if (keyword === 'if') {
      let rest = tokens.slice(1);
      let negate = false;
      if (rest[0] && !rest[0].quoted && rest[0].text.toLowerCase() === 'not') {
        negate = true;
        rest = rest.slice(1);
      }
      const node = matchLine(CONDITION_TEMPLATES, rest);
      if (!node) {
        issues.push({
          line: at,
          message: 'Could not read this condition. One example: if score is at least 3',
        });
        return;
      }
      const parsed = Condition.safeParse({ ...node, negate });
      if (!parsed.success) {
        issues.push({ line: at, message: firstZodMessage(parsed.error) });
        return;
      }
      draft.if.push(parsed.data);
      return;
    }
    if (keyword === 'then') {
      const node = matchLine(ACTION_TEMPLATES, tokens.slice(1));
      if (!node) {
        issues.push({
          line: at,
          message: 'Could not read this action. One example: then add 1 to score',
        });
        return;
      }
      const parsed = Action.safeParse(node);
      if (!parsed.success) {
        issues.push({ line: at, message: firstZodMessage(parsed.error) });
        return;
      }
      draft.then.push(parsed.data);
      return;
    }
    issues.push({
      line: at,
      message: 'Every line starts with rule, when, every, if or then.',
    });
  });

  finish();
  return { rules, issues };
}

interface Draft {
  id: string;
  name: string | undefined;
  once: boolean;
  enabled: boolean;
  when: Trigger | undefined;
  /** A when line was seen, even if it could not be read. */
  whenTried: boolean;
  if: Condition[];
  then: Action[];
  headerLine: number;
}

function readHeader(tokens: Token[], line: number, issues: ScriptIssue[]): Draft {
  const draft: Draft = {
    id: '',
    name: undefined,
    once: false,
    enabled: true,
    when: undefined,
    whenTried: false,
    if: [],
    then: [],
    headerLine: line,
  };

  const id = tokens[1];
  if (!id || id.quoted || !ID_PATTERN.test(id.text)) {
    issues.push({
      line,
      message: 'A rule needs an id made of lowercase letters, numbers and dashes: rule my-rule',
    });
  } else {
    draft.id = id.text;
  }

  for (const token of tokens.slice(2)) {
    if (token.quoted) {
      draft.name = token.text;
    } else if (token.text === 'once') {
      draft.once = true;
    } else if (token.text === 'off') {
      draft.enabled = false;
    } else {
      issues.push({
        line,
        message: `After the id, a rule line only takes a "name in quotes", once, or off. "${token.text}" is none of those.`,
      });
    }
  }
  return draft;
}

function finishRule(draft: Draft, issues: ScriptIssue[]): EventRule | undefined {
  if (draft.id === '') return undefined;
  if (!draft.when) {
    // A when line that could not be read was already complained about.
    if (!draft.whenTried) {
      issues.push({
        line: draft.headerLine,
        message: `The rule "${draft.id}" has no when line, so it would never run.`,
      });
    }
    return undefined;
  }
  if (draft.then.length === 0) {
    issues.push({
      line: draft.headerLine,
      message: `The rule "${draft.id}" has no then line, so it would do nothing.`,
    });
    return undefined;
  }
  const parsed = EventRule.safeParse({
    id: draft.id,
    ...(draft.name === undefined ? {} : { name: draft.name }),
    enabled: draft.enabled,
    once: draft.once,
    when: draft.when,
    if: draft.if,
    then: draft.then,
  });
  if (!parsed.success) {
    issues.push({ line: draft.headerLine, message: firstZodMessage(parsed.error) });
    return undefined;
  }
  return parsed.data;
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'This line does not fit the project format.';
}

// --- matching a line against the templates -----------------------------------

/** The first template that swallows every token wins. */
export function matchLine(
  templates: readonly Template[],
  tokens: readonly Token[],
): Node | undefined {
  for (const template of templates) {
    const node = matchTemplate(template, tokens);
    if (node) return node;
  }
  return undefined;
}

function matchTemplate(template: Template, tokens: readonly Token[]): Node | undefined {
  const node: Node = { type: template.type, ...template.set };
  let at = 0;

  for (const part of template.parts) {
    if (part.kind === 'group') {
      const next = tokens[at];
      if (next === undefined || !canStart(part.parts[0]!, next)) continue;
      for (const inner of part.parts) {
        const after = matchPart(inner, tokens, at, node);
        if (after === undefined) return undefined;
        at = after;
      }
      continue;
    }
    const after = matchPart(part, tokens, at, node);
    if (after === undefined) return undefined;
    at = after;
  }

  return at === tokens.length ? node : undefined;
}

/** Whether a token could begin this part, used to decide entering a [ group ]. */
function canStart(part: SlotPart | WordPart, token: Token): boolean {
  if (part.kind === 'word') return wordMatches(part.word, token);
  if (part.slot === 'cmp') return !token.quoted && token.text === 'is';
  return readSlot(part, token) !== NO_MATCH;
}

/** Matches one part at a position. Returns the position after it, or undefined. */
function matchPart(
  part: SlotPart | WordPart,
  tokens: readonly Token[],
  at: number,
  node: Node,
): number | undefined {
  if (part.kind === 'word') {
    const token = tokens[at];
    return token !== undefined && wordMatches(part.word, token) ? at + 1 : undefined;
  }
  if (part.slot === 'cmp') {
    for (const phrase of COMPARISON_PHRASES) {
      if (phrase.words.every((word, index) => wordAt(tokens, at + index) === word)) {
        node[part.field] = phrase.operator;
        return at + phrase.words.length;
      }
    }
    return undefined;
  }
  const token = tokens[at];
  if (token === undefined) return undefined;
  const value = readSlot(part, token);
  if (value === NO_MATCH) return undefined;
  node[part.field] = value;
  return at + 1;
}

function wordAt(tokens: readonly Token[], at: number): string | undefined {
  const token = tokens[at];
  return token === undefined || token.quoted ? undefined : token.text.toLowerCase();
}

function wordMatches(word: string, token: Token): boolean {
  if (token.quoted) return false;
  const text = token.text.toLowerCase();
  return text === word || SINGULARS[word] === text;
}

const NO_MATCH = Symbol('no-match');

function readSlot(part: SlotPart, token: Token): unknown {
  switch (part.slot) {
    case 'ref':
      return !token.quoted && ENTITY_REF_PATTERN.test(token.text) ? token.text : NO_MATCH;
    case 'id':
      return !token.quoted && ID_PATTERN.test(token.text) ? token.text : NO_MATCH;
    case 'number':
      return isNumberToken(token) ? Number(token.text) : NO_MATCH;
    case 'value': {
      if (token.quoted) return token.text;
      if (token.text === 'true') return true;
      if (token.text === 'false') return false;
      if (isNumberToken(token)) return Number(token.text);
      return NO_MATCH;
    }
    case 'text':
      return token.quoted ? token.text : NO_MATCH;
    case 'enum':
      return !token.quoted && part.values?.includes(token.text) ? token.text : NO_MATCH;
    case 'cmp':
      return NO_MATCH;
  }
}
