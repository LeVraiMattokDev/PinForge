/**
 * Regenerates everything that is derived from the Zod definitions:
 *
 *   schema/pinforge-project.schema.json  for tools that cannot import TypeScript
 *   docs/events-reference.md             so the reference cannot drift from the code
 *
 * Continuous integration runs this and fails if the committed copies differ.
 */
import { writeFileSync } from 'node:fs';
import { ACTIONS, CONDITIONS, TRIGGERS, type CatalogEntry } from '../src/events/catalog.js';
import { MOVEMENT_MODES } from '../src/components.js';
import { projectJsonSchema } from '../src/json-schema.js';

const schemaPath = new URL('../schema/pinforge-project.schema.json', import.meta.url);
const referencePath = new URL('../../../docs/events-reference.md', import.meta.url);

writeFileSync(schemaPath, `${JSON.stringify(projectJsonSchema(), null, 2)}\n`);

writeFileSync(referencePath, buildEventsReference());

function buildEventsReference(): string {
  return [
    '<!-- Generated from packages/schema. Run `pnpm generate` after changing the catalog. -->',
    '',
    '# Events reference',
    '',
    'Every rule in PinForge reads as a sentence:',
    '',
    '```',
    'WHEN <trigger> IF <conditions> THEN <actions>',
    '```',
    '',
    'The conditions are joined by "and", and an empty list means always. The actions',
    'run in order, top to bottom. Each entry below shows the words the editor uses,',
    'the name the same thing has inside the project file, and a working example.',
    '',
    'Entities are named with a single string: `$self` is the entity the trigger fired',
    'on, `$other` is the other entity in a collision, `tag:enemy` is anything carrying',
    "that tag, and a plain name is an entity in the level or one of the project's",
    'entity kinds. See [the project format](project-format.md) for the whole file.',
    '',
    section('Triggers', 'The WHEN half. Something happens, and the rule wakes up.', TRIGGERS),
    section(
      'Conditions',
      'The IF half. Checked when the trigger fires, all of them must hold.',
      CONDITIONS,
    ),
    section('Actions', 'The THEN half. What the rule does.', ACTIONS),
  ].join('\n');
}

function section(title: string, blurb: string, entries: Record<string, CatalogEntry>): string {
  const lines = [`## ${title}`, '', blurb, ''];
  for (const [type, entry] of Object.entries(entries)) {
    lines.push(`### ${entry.label}`, '', `\`${type}\``, '', entry.summary, '');
    if (entry.modes.length < MOVEMENT_MODES.length) {
      lines.push(`Only offered for entities using ${entry.modes.join(' or ')} movement.`, '');
    }
    lines.push('```json', JSON.stringify(entry.example), '```', '');
  }
  return lines.join('\n');
}
