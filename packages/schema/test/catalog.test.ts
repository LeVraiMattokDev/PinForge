import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  Action,
  CONDITIONS,
  Condition,
  MOVEMENT_MODES,
  TRIGGERS,
  Trigger,
  type CatalogEntry,
} from '../src/index.js';

function variantTypes(union: {
  options: readonly { shape: { type: { value: unknown } } }[];
}): string[] {
  return union.options.map((option) => String(option.shape.type.value)).sort();
}

/**
 * The catalog is what the editor, the MCP server and docs/events-reference.md
 * are built from. If it and the schema ever disagree, one of those three starts
 * lying, so the two lists are compared in both directions.
 */
describe('the rule catalog', () => {
  it.each([
    ['triggers', TRIGGERS, Trigger],
    ['conditions', CONDITIONS, Condition],
    ['actions', ACTIONS, Action],
  ] as const)('describes every %s and nothing else', (_name, catalog, union) => {
    expect(Object.keys(catalog).sort()).toEqual(variantTypes(union));
  });

  it.each([
    ['trigger', TRIGGERS, Trigger],
    ['condition', CONDITIONS, Condition],
    ['action', ACTIONS, Action],
  ] as const)('has a working example for every %s', (_name, catalog, union) => {
    for (const [type, entry] of Object.entries(catalog)) {
      const result = union.safeParse(entry.example);
      expect(result.success, `${type}: ${result.error?.message ?? ''}`).toBe(true);
      expect((entry.example as { type: string }).type).toBe(type);
    }
  });

  it('writes a plain language label and summary for every entry', () => {
    const entries: CatalogEntry[] = [
      ...Object.values(TRIGGERS),
      ...Object.values(CONDITIONS),
      ...Object.values(ACTIONS),
    ];

    for (const entry of entries) {
      expect(entry.label.length).toBeGreaterThan(2);
      expect(entry.summary.endsWith('.')).toBe(true);
      expect(entry.modes.length).toBeGreaterThan(0);
    }
  });

  it('limits exactly the ground related entries to platform movement', () => {
    const platformOnly = [
      ...Object.entries(TRIGGERS),
      ...Object.entries(CONDITIONS),
      ...Object.entries(ACTIONS),
    ]
      .filter(([, entry]) => entry.modes.length < MOVEMENT_MODES.length)
      .map(([type]) => type)
      .sort();

    expect(platformOnly).toEqual(['is-falling', 'is-on-ground', 'jump', 'jumps', 'lands']);
  });
});
