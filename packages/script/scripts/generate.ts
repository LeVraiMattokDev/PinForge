/**
 * Regenerates docs/script.md from the sentence templates, so the language
 * reference cannot drift from the language. Continuous integration runs this
 * and fails if the committed copy differs.
 */
import { writeFileSync } from 'node:fs';
import { buildScriptReference } from '../src/reference.js';

const referencePath = new URL('../../../docs/script.md', import.meta.url);

writeFileSync(referencePath, `${buildScriptReference()}\n`);
