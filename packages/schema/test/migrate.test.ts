import { describe, expect, it } from 'vitest';
import {
  CURRENT_FORMAT_VERSION,
  MIGRATIONS,
  ProjectFormatError,
  migrateToCurrent,
  readFormatVersion,
  type JsonObject,
  type Migration,
} from '../src/index.js';

/**
 * There is nothing to migrate yet, so the runner is tested against a made up
 * chain. It is built now, before the first breaking change, because the day a
 * migration is needed is the worst day to find out the runner does not work.
 */
const fakeChain: Migration[] = [
  {
    from: 1,
    to: 2,
    description: 'renamed the title to a name',
    migrate: (document) => {
      const { title, ...rest } = document as { title?: string };
      return { ...rest, name: title ?? 'Untitled' };
    },
  },
  {
    from: 2,
    to: 3,
    description: 'added a list of scenes',
    migrate: (document) => ({ ...document, scenes: [] }),
  },
];

describe('reading the format version', () => {
  it('refuses anything that is not an object', () => {
    expect(() => readFormatVersion([])).toThrow(/must be a JSON object/);
    expect(() => readFormatVersion('a string')).toThrow(/must be a JSON object/);
  });

  it('explains what is missing rather than crashing', () => {
    expect(() => readFormatVersion({ meta: {} })).toThrow(/no formatVersion/);
  });
});

describe('migrating', () => {
  it('does nothing to a file that is already current', () => {
    const document = { formatVersion: CURRENT_FORMAT_VERSION, meta: { name: 'Now' } };

    const result = migrateToCurrent(document);

    expect(result.applied).toEqual([]);
    expect(result.document).toEqual(document);
  });

  it('runs every step in order and writes the new version itself', () => {
    const result = migrateToCurrent(
      { formatVersion: 1, title: 'Old' },
      { migrations: fakeChain, target: 3 },
    );

    expect(result.document).toEqual({ formatVersion: 3, name: 'Old', scenes: [] });
    expect(result.applied).toEqual([
      '1 to 2: renamed the title to a name',
      '2 to 3: added a list of scenes',
    ]);
  });

  it('leaves the document it was given untouched', () => {
    const document: JsonObject = { formatVersion: 1, title: 'Old' };

    migrateToCurrent(document, { migrations: fakeChain, target: 3 });

    expect(document).toEqual({ formatVersion: 1, title: 'Old' });
  });

  it('says so plainly when the file is from a newer PinForge', () => {
    expect(() => migrateToCurrent({ formatVersion: 99 })).toThrow(ProjectFormatError);
    expect(() => migrateToCurrent({ formatVersion: 99 })).toThrow(/newer version of PinForge/);
  });

  it('stops when a step is missing instead of half migrating', () => {
    expect(() =>
      migrateToCurrent({ formatVersion: 1 }, { migrations: [fakeChain[1]!], target: 3 }),
    ).toThrow(/no way to bring it up to version 3/);
  });

  it('refuses a chain that would never finish', () => {
    const backwards: Migration[] = [
      { from: 1, to: 1, description: 'goes nowhere', migrate: (document) => document },
    ];

    expect(() =>
      migrateToCurrent({ formatVersion: 1 }, { migrations: backwards, target: 2 }),
    ).toThrow(/never finish/);
  });
});

describe('the real chain', () => {
  it('is empty, because version 1 is the first format', () => {
    expect(CURRENT_FORMAT_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual([]);
  });

  it('has no gaps and only ever moves forward', () => {
    let version = 1;
    for (const migration of MIGRATIONS) {
      expect(migration.from).toBe(version);
      expect(migration.to).toBeGreaterThan(migration.from);
      version = migration.to;
    }
    expect(version).toBe(CURRENT_FORMAT_VERSION);
  });
});
