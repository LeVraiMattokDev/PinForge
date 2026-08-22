import type { Comparison } from '@pinforge/schema';

/**
 * Every trigger, condition and action is one sentence, and this table is the
 * only place those sentences are written down. The parser matches a line
 * against it and the printer writes a line from it, so the two can never
 * disagree about what the language is.
 *
 * A pattern is words and slots. {field:kind} captures one value into that
 * field of the node. [ ... ] is an optional part; when it is left out, the
 * schema's own default fills the field in.
 */

export type SlotKind = 'ref' | 'id' | 'number' | 'value' | 'text' | 'enum' | 'cmp';

export interface SlotPart {
  readonly kind: 'slot';
  readonly field: string;
  readonly slot: SlotKind;
  readonly values?: readonly string[];
}

export interface WordPart {
  readonly kind: 'word';
  readonly word: string;
}

export interface GroupPart {
  readonly kind: 'group';
  readonly parts: readonly (SlotPart | WordPart)[];
}

export type Part = SlotPart | WordPart | GroupPart;

export type Node = Record<string, unknown> & { type: string };

export interface Template {
  readonly type: string;
  readonly pattern: string;
  readonly parts: readonly Part[];
  /** Values this phrasing implies, merged into the parsed node. */
  readonly set?: Readonly<Record<string, unknown>>;
  /** A group is left out of the printed line while its fields equal these. */
  readonly omit?: Readonly<Record<string, unknown>>;
  /** Accepted when read, never chosen when writing. */
  readonly parseOnly?: boolean;
  /** Picks between phrasings of one type when writing. */
  readonly printWhen?: (node: Node) => boolean;
}

/** "is at least" and friends, longest first so "is" cannot shadow the rest. */
export const COMPARISON_PHRASES: readonly { words: readonly string[]; operator: Comparison }[] = [
  { words: ['is', 'at', 'least'], operator: 'at-least' },
  { words: ['is', 'at', 'most'], operator: 'at-most' },
  { words: ['is', 'more', 'than'], operator: 'greater-than' },
  { words: ['is', 'less', 'than'], operator: 'less-than' },
  { words: ['is', 'not'], operator: 'not-equals' },
  { words: ['is'], operator: 'equals' },
];

/** Words that read better in the singular after a one. */
export const SINGULARS: Readonly<Record<string, string>> = {
  seconds: 'second',
  pixels: 'pixel',
};

interface TemplateOptions {
  readonly set?: Readonly<Record<string, unknown>>;
  readonly omit?: Readonly<Record<string, unknown>>;
  readonly parseOnly?: boolean;
  readonly printWhen?: (node: Node) => boolean;
}

function template(type: string, pattern: string, options: TemplateOptions = {}): Template {
  return { type, pattern, parts: compile(pattern), ...options };
}

function compile(pattern: string): Part[] {
  const words = pattern.replace(/\[/g, ' [ ').replace(/\]/g, ' ] ').split(/\s+/).filter(Boolean);
  const parts: Part[] = [];
  let group: (SlotPart | WordPart)[] | undefined;

  for (const word of words) {
    if (word === '[') {
      if (group) throw new Error(`Optional parts cannot nest in "${pattern}".`);
      group = [];
      continue;
    }
    if (word === ']') {
      if (!group || group.length === 0) throw new Error(`An empty [ ] in "${pattern}".`);
      parts.push({ kind: 'group', parts: group });
      group = undefined;
      continue;
    }
    const part = compileWord(word, pattern);
    if (group) group.push(part);
    else parts.push(part);
  }
  if (group) throw new Error(`A [ was opened and never closed in "${pattern}".`);
  return parts;
}

function compileWord(word: string, pattern: string): SlotPart | WordPart {
  if (!word.startsWith('{')) return { kind: 'word', word };
  const match = /^\{([a-zA-Z]+):([a-z]+)(?::([a-z|-]+))?\}$/.exec(word);
  if (!match) throw new Error(`Cannot read the slot "${word}" in "${pattern}".`);
  const [, field, slot, values] = match;
  return {
    kind: 'slot',
    field: field!,
    slot: slot as SlotKind,
    ...(values === undefined ? {} : { values: values.split('|') }),
  };
}

/**
 * The order within each list matters twice: the parser takes the first pattern
 * that swallows the whole line, and the printer takes the first pattern whose
 * printWhen and set agree with the node.
 */

export const TRIGGER_TEMPLATES: readonly Template[] = [
  template('game-starts', 'when the game starts'),
  template('scene-starts', 'when the level starts'),
  template('scene-starts', 'when the scene starts', { parseOnly: true }),
  template('every-frame', 'every frame'),
  template('every-seconds', 'every {seconds:number} seconds'),
  template('action-pressed', 'when {action:id} is pressed'),
  template('action-released', 'when {action:id} is released'),
  template('touches-tile', 'when {subject:ref} touches a {tag:id} tile'),
  template('collides', 'when {subject:ref} touches {with:ref}'),
  template('collision-ends', 'when {subject:ref} stops touching {with:ref}'),
  template('variable-changes', 'when {variable:id} changes'),
  template('entity-spawned', 'when {subject:ref} appears'),
  template('entity-destroyed', 'when {subject:ref} is removed'),
  template(
    'leaves-scene',
    'when {subject:ref} leaves the level [ at the {edge:enum:top|bottom|left|right} ]',
    { omit: { edge: 'any' } },
  ),
  template('lands', 'when {subject:ref} lands'),
  template('jumps', 'when {subject:ref} jumps'),
  template('clicked', 'when {subject:ref} is clicked'),
];

export const CONDITION_TEMPLATES: readonly Template[] = [
  template('action-held', '{action:id} is held'),
  template('is-on-ground', '{target:ref} is on the ground'),
  template('is-falling', '{target:ref} is falling'),
  template('entity-exists', '{entity:ref} exists'),
  template('has-tag', '{target:ref} has the tag {tag:id}'),
  template('distance-is', '{from:ref} is within {pixels:number} pixels of {to:ref}', {
    set: { operator: 'at-most' },
  }),
  template('distance-is', '{from:ref} is at least {pixels:number} pixels from {to:ref}', {
    set: { operator: 'at-least' },
  }),
  template('chance', 'chance of {percent:number} in 100'),
  template('current-scene-is', 'the level is {scene:id}'),
  template('property-is', '{property:id} of {target:ref} {operator:cmp} {value:value}'),
  template('variable-is', '{variable:id} {operator:cmp} {value:value}'),
];

export const ACTION_TEMPLATES: readonly Template[] = [
  template('destroy', 'remove {target:ref}'),
  template('spawn', 'create {entity:id} [ at {x:number} {y:number} ] [ near {relativeTo:ref} ]', {
    omit: { x: 0, y: 0 },
  }),
  template('teleport', 'teleport {target:ref} to {x:number} {y:number} [ near {relativeTo:ref} ]'),
  template(
    'move',
    'set the speed of {target:ref} [ across to {x:number} ] [ down to {y:number} ]',
    {
      set: { mode: 'set' },
    },
  ),
  template(
    'move',
    'change the speed of {target:ref} [ across by {x:number} ] [ down by {y:number} ]',
    { set: { mode: 'add' } },
  ),
  template('jump', 'make {target:ref} jump [ {height:number} pixels high ]'),
  template('set-variable', 'set {variable:id} to {value:value}'),
  template('change-variable', 'add {value:number} to {variable:id}', { set: { operator: 'add' } }),
  template('change-variable', 'subtract {value:number} from {variable:id}', {
    set: { operator: 'subtract' },
  }),
  template('change-variable', 'multiply {variable:id} by {value:number}', {
    set: { operator: 'multiply' },
  }),
  template('change-variable', 'divide {variable:id} by {value:number}', {
    set: { operator: 'divide' },
  }),
  template('change-variable', 'change {variable:id} to {value:number}', {
    set: { operator: 'set' },
  }),
  template('set-property', 'set {property:id} of {target:ref} to {value:value}'),
  template('change-property', 'add {value:number} to {property:id} of {target:ref}', {
    set: { operator: 'add' },
  }),
  template('change-property', 'subtract {value:number} from {property:id} of {target:ref}', {
    set: { operator: 'subtract' },
  }),
  template('change-property', 'multiply {property:id} of {target:ref} by {value:number}', {
    set: { operator: 'multiply' },
  }),
  template('change-property', 'divide {property:id} of {target:ref} by {value:number}', {
    set: { operator: 'divide' },
  }),
  template('change-property', 'change {property:id} of {target:ref} to {value:number}', {
    set: { operator: 'set' },
  }),
  template('play-animation', 'play the {animation:id} animation on {target:ref}'),
  template('set-visible', 'show {target:ref}', { set: { visible: true } }),
  template('set-visible', 'hide {target:ref}', { set: { visible: false } }),
  template('play-sound', 'play the sound {sound:id} [ at volume {volume:number} ]', {
    omit: { volume: 1 },
  }),
  template('stop-sound', 'stop the sound {sound:id}', {
    printWhen: (node) => node.sound !== undefined,
  }),
  template('stop-sound', 'stop every sound', {
    printWhen: (node) => node.sound === undefined,
  }),
  template('show-message', 'say {text:text} [ for {seconds:number} seconds ]', {
    omit: { seconds: 2 },
  }),
  template('go-to-scene', 'go to the level {scene:id}'),
  template('restart-scene', 'restart the level'),
  template('set-camera-target', 'make the camera follow {target:ref}'),
  template(
    'shake-camera',
    'shake the camera [ for {seconds:number} seconds ] [ with strength {strength:number} ]',
    { omit: { seconds: 0.3, strength: 4 } },
  ),
  template(
    'set-tile',
    'paint tile {tile:number} at column {column:number} row {row:number} on {layer:id}',
    { printWhen: (node) => node.tile !== null },
  ),
  template('set-tile', 'clear the tile at column {column:number} row {row:number} on {layer:id}', {
    set: { tile: null },
    printWhen: (node) => node.tile === null,
  }),
  template('enable-rule', 'turn on the rule {rule:id}'),
  template('disable-rule', 'turn off the rule {rule:id}'),
  template('wait', 'wait {seconds:number} seconds'),
];
