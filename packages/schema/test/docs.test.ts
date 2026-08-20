import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject, projectJsonSchema } from '../src/index.js';

/**
 * Documentation is a deliverable, so it is tested like one. Every example in
 * the format reference is a real project file, and the committed JSON Schema is
 * the one these definitions produce.
 */
const formatDocPath = new URL('../../../docs/project-format.md', import.meta.url);
const goldenPath = new URL('./golden/coin-run.json', import.meta.url);
const schemaPath = new URL('../schema/pinforge-project.schema.json', import.meta.url);

function annotatedExample(): unknown {
  const markdown = readFileSync(formatDocPath, 'utf8');
  const block = /```jsonc\n([\s\S]*?)```/.exec(markdown);
  if (!block?.[1]) throw new Error('docs/project-format.md has no annotated example.');
  const withoutComments = block[1]
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return JSON.parse(withoutComments) as unknown;
}

describe('docs/project-format.md', () => {
  it('shows an example that really opens', () => {
    expect(() => loadProject(annotatedExample())).not.toThrow();
  });

  it('shows the same game as the golden fixture, comments aside', () => {
    const fixture: unknown = JSON.parse(readFileSync(goldenPath, 'utf8'));
    expect(annotatedExample()).toEqual(fixture);
  });
});

describe('the committed JSON Schema', () => {
  it('is what these definitions produce', () => {
    const committed: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(committed).toEqual(projectJsonSchema());
  });
});
