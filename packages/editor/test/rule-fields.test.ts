import { describe, expect, it } from 'vitest';
import { ACTIONS, Action, CONDITIONS, Condition, TRIGGERS, Trigger } from '@pinforge/schema';
import { fieldsFor, type Clause } from '../src/rule-fields.js';

interface Union {
  options: readonly { shape: Record<string, unknown> }[];
}

function shapeOf(union: Union, type: string): Record<string, unknown> {
  const option = union.options.find((one) => (one.shape.type as { value: string }).value === type);
  if (!option) throw new Error(`No schema for ${type}`);
  return option.shape;
}

const GROUPS: [Clause, Record<string, unknown>, Union][] = [
  ['when', TRIGGERS, Trigger as unknown as Union],
  ['if', CONDITIONS, Condition as unknown as Union],
  ['then', ACTIONS, Action as unknown as Union],
];

/**
 * The editor works out a rule's form from the schema rather than describing
 * every trigger, condition and action a second time. These tests are what makes
 * that safe: a field added to the schema turns up in the form, and the editor
 * cannot invent one that does not exist.
 */
describe('rule forms', () => {
  it('covers exactly the fields the schema has, for every kind of rule part', () => {
    for (const [clause, catalog, union] of GROUPS) {
      for (const type of Object.keys(catalog)) {
        const fromSchema = Object.keys(shapeOf(union, type))
          .filter((name) => name !== 'type')
          .sort();
        const fromForm = fieldsFor(clause, type)
          .map((field) => field.name)
          .sort();
        expect(fromForm, `${clause} ${type}`).toEqual(fromSchema);
      }
    }
  });

  it('writes a label in words for every field', () => {
    for (const [clause, catalog] of GROUPS) {
      for (const type of Object.keys(catalog)) {
        for (const field of fieldsFor(clause, type)) {
          expect(field.label, `${type}.${field.name}`).not.toBe(field.name);
          expect(field.label, `${type}.${field.name}`).toMatch(/^[A-Z]/);
        }
      }
    }
  });

  it('knows which list each name should be picked from', () => {
    const kind = (clause: Clause, type: string, name: string) =>
      fieldsFor(clause, type).find((field) => field.name === name)?.kind;

    expect(kind('when', 'collides', 'subject')).toBe('entity');
    expect(kind('when', 'collides', 'with')).toBe('entity');
    expect(kind('when', 'touches-tile', 'tag')).toBe('tile-tag');
    expect(kind('if', 'has-tag', 'tag')).toBe('entity-tag');
    expect(kind('then', 'spawn', 'entity')).toBe('prototype');
    expect(kind('if', 'entity-exists', 'entity')).toBe('entity');
    expect(kind('then', 'play-sound', 'sound')).toBe('sound');
    expect(kind('then', 'go-to-scene', 'scene')).toBe('scene');
    expect(kind('when', 'action-pressed', 'action')).toBe('control');
    expect(kind('then', 'set-tile', 'tile')).toBe('tile');
    expect(kind('then', 'change-variable', 'variable')).toBe('variable');
    expect(kind('if', 'is-on-ground', 'negate')).toBe('boolean');
    expect(kind('then', 'show-message', 'seconds')).toBe('number');
  });

  it('offers the choices an enumerated field allows', () => {
    const operator = fieldsFor('if', 'variable-is').find((field) => field.name === 'operator');
    expect(operator?.kind).toBe('enum');
    expect(operator?.options).toEqual([
      'equals',
      'not-equals',
      'at-least',
      'at-most',
      'greater-than',
      'less-than',
    ]);
  });

  it('marks a field the schema lets you leave out', () => {
    const height = fieldsFor('then', 'jump').find((field) => field.name === 'height');
    expect(height?.optional).toBe(true);
    const target = fieldsFor('then', 'jump').find((field) => field.name === 'target');
    expect(target?.optional).toBe(false);
  });
});
