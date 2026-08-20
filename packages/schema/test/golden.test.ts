import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/index.js';

/**
 * Golden files pin down what opening a project actually produces, including
 * every default that gets filled in. A change to a default value, or to the
 * shape of the format, shows up here as a diff a person has to look at and
 * agree with. When the chain grows, an old file goes in as the input and its
 * migrated result becomes the expectation.
 *
 * Run with UPDATE_GOLDEN=1 to rewrite the expectations after a deliberate change.
 */
const directory = new URL('./golden/', import.meta.url);
const inputs = readdirSync(directory)
  .filter((name) => name.endsWith('.json') && !name.endsWith('.loaded.json'))
  .sort();

describe('golden projects', () => {
  it('has files to check', () => {
    expect(inputs.length).toBeGreaterThan(0);
  });

  it.each(inputs)('%s opens into exactly the expected project', (name) => {
    const input: unknown = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    const { project, applied } = loadProject(input);

    const expectedPath = new URL(name.replace(/\.json$/, '.loaded.json'), directory);
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(expectedPath, `${JSON.stringify(project, null, 2)}\n`);
    }

    const expected: unknown = JSON.parse(readFileSync(expectedPath, 'utf8'));
    expect(project).toEqual(expected);
    expect(applied).toEqual([]);
  });
});
