import { ACTIONS, CONDITIONS, TRIGGERS, type CatalogEntry } from '@pinforge/schema';
import {
  ACTION_TEMPLATES,
  CONDITION_TEMPLATES,
  TRIGGER_TEMPLATES,
  type Part,
  type SlotPart,
  type Template,
  type WordPart,
} from './templates.js';

/**
 * Builds docs/script.md from the same templates the parser and printer walk,
 * so the reference cannot drift from the language. Continuous integration
 * regenerates it and fails if the committed copy differs.
 */
export function buildScriptReference(): string {
  return [
    '<!-- Generated from packages/script. Run `pnpm generate` after changing the templates. -->',
    '',
    '# Writing rules as text',
    '',
    'Every rule in PinForge reads as a sentence, and PinScript is that sentence',
    'written down. It is not a second language: the dropdowns, the blocks and the',
    'script are three faces of the same rules, and anything one of them can say,',
    'the others can too.',
    '',
    'The editor shows it under **Rules, then Script**: the rules as text, an Apply',
    'button, and every problem listed with its line number. Nothing changes until',
    'every line reads. From the command line, `pinforge rules <game>` writes every',
    'rule in a game this way, ready to paste back into the editor or into a chat.',
    '',
    '## A whole rule',
    '',
    '```',
    '# Comments start with a hash mark.',
    'rule collect-coin "Collect a coin"',
    'when player touches coin',
    'then remove $other',
    'then add 1 to score',
    '',
    'rule win once',
    'when score changes',
    'if score is at least 3',
    'then say "You win!" for 3 seconds',
    'then go to the level level-2',
    '```',
    '',
    'A rule starts with `rule` and its id, then an optional name in quotes, then',
    'optionally `once` (run at most once per level) and `off` (keep the rule but',
    'never run it). After that come its lines, in any amount of whitespace:',
    '',
    '- exactly one `when` line, the trigger;',
    '- any number of `if` lines, which must all be true;',
    '- one or more `then` lines, run in order, top to bottom.',
    '',
    'Blank lines and comments go anywhere. The next `rule` line starts the next',
    'rule.',
    '',
    '## What goes in a slot',
    '',
    'The sentences below write their slots as `<name>`, and parts in `[square',
    'brackets]` can be left out. When PinForge writes script for you, it leaves a',
    'part out whenever it still holds its everyday value.',
    '',
    '- An entity slot takes `$self` (the entity the trigger fired on), `$other`',
    '  (the other entity in a collision), `tag:enemy` (anything carrying that',
    "  tag), or a plain name: an entity in the level, or one of the project's",
    '  entity kinds.',
    '- Names are ids: lowercase letters, numbers and dashes, like `sfx-coin`.',
    '- A value is a number, `true`, `false`, or text in quotes.',
    '- Text goes in double quotes. Inside them, write `\\"` for a quote, `\\\\` for',
    '  a backslash and `\\n` for a line break.',
    '- A comparison is written out: `is`, `is not`, `is at least`, `is at most`,',
    '  `is more than` or `is less than`.',
    '- `not` before a condition turns it around: `if not player is on the ground`.',
    '- `1 second` and `1 pixel` read as well as their plurals.',
    '',
    section(
      'Triggers',
      'The WHEN half. Something happens, and the rule wakes up.',
      TRIGGER_TEMPLATES,
      TRIGGERS,
      '',
    ),
    section(
      'Conditions',
      'The IF half. Checked when the trigger fires, all of them must hold.',
      CONDITION_TEMPLATES,
      CONDITIONS,
      'if ',
    ),
    section('Actions', 'The THEN half. What the rule does.', ACTION_TEMPLATES, ACTIONS, 'then '),
  ].join('\n');
}

function section(
  title: string,
  lead: string,
  templates: readonly Template[],
  entries: Record<string, CatalogEntry>,
  prefix: string,
): string {
  const lines = [`## ${title}`, '', lead, ''];

  const seen = new Set<string>();
  for (const template of templates) {
    if (template.parseOnly === true || seen.has(template.type)) continue;
    seen.add(template.type);
    const entry = entries[template.type];
    if (!entry) continue;

    const phrasings = templates.filter(
      (one) => one.type === template.type && one.parseOnly !== true,
    );
    lines.push(`### ${entry.label}`, '', entry.summary, '', '```');
    for (const phrasing of phrasings) lines.push(`${prefix}${sentence(phrasing)}`);
    lines.push('```', '');
  }

  return lines.join('\n');
}

function sentence(template: Template): string {
  return template.parts.map((part) => renderPart(part)).join(' ');
}

function renderPart(part: Part): string {
  if (part.kind === 'word') return part.word;
  if (part.kind === 'group') {
    return `[${part.parts.map((inner) => renderPart(inner)).join(' ')}]`;
  }
  return renderSlot(part);
}

function renderSlot(part: SlotPart | WordPart): string {
  if (part.kind === 'word') return part.word;
  if (part.slot === 'cmp') return '<is / is not / is at least / ...>';
  if (part.slot === 'enum' && part.values) return `<${part.values.join(' / ')}>`;
  return `<${part.field}>`;
}
