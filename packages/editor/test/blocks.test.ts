import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  Action,
  CONDITIONS,
  Condition,
  TRIGGERS,
  Trigger,
  parseProject,
  type ProjectInput,
} from '@pinforge/schema';
import { parseScript, printScript } from '@pinforge/script';
import type { FieldSpec } from '../src/rule-fields.js';
import * as edit from '../src/state/commands.js';
import { EditorStore } from '../src/state/store.js';
import { defaults, type Context } from '../src/views/clause-controls.js';
import {
  blockLabel,
  decodeDrag,
  encodeDrag,
  flatParts,
  insertAt,
  moveItem,
  nodeFromTemplate,
  paletteTemplates,
  removeAt,
  slotSpec,
} from '../src/views/blocks-model.js';

function project(): ProjectInput {
  return {
    formatVersion: 1,
    meta: { name: 'Blocks test' },
    settings: { startScene: 'level-1' },
    variables: [{ id: 'score', type: 'number', initial: 0 }],
    assets: [
      { id: 'tiles', kind: 'image', source: 'tiles.png' },
      { id: 'sfx-coin', kind: 'sound', source: 'coin.wav' },
    ],
    tilesets: [
      {
        id: 'world',
        image: 'tiles',
        tileWidth: 16,
        tileHeight: 16,
        tiles: [{ index: 0, tags: ['solid'] }],
      },
    ],
    entities: [
      {
        id: 'player',
        size: { width: 12, height: 16 },
        tags: ['player'],
        components: {
          collider: {},
          movement: { mode: 'platform' },
          sprite: {
            image: 'tiles',
            frameWidth: 16,
            frameHeight: 16,
            animations: [{ id: 'walk', frames: [0] }],
          },
        },
      },
      {
        id: 'coin',
        size: { width: 8, height: 8 },
        tags: ['pickup'],
        components: { collider: { kind: 'trigger' } },
      },
    ],
    scenes: [
      {
        id: 'level-1',
        size: { columns: 6, rows: 4 },
        layers: [
          {
            id: 'ground',
            tileset: 'world',
            collides: true,
            legend: { '.': null },
            rows: ['......', '......', '......', '......'],
          },
        ],
        entities: [{ id: 'player-1', prototype: 'player', x: 0, y: 0 }],
        events: [
          {
            id: 'collect',
            when: { type: 'collides', subject: 'player', with: 'coin' },
            then: [
              { type: 'change-variable', variable: 'score', value: 1 },
              { type: 'destroy', target: '$other' },
            ],
          },
        ],
      },
    ],
  };
}

/** Fills a slot the way the blocks view would, from what the project has. */
function sample(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case 'number':
      return 1;
    case 'tile':
      return 0;
    case 'text':
      return 'Hello';
    case 'value':
      return 1;
    case 'boolean':
      return false;
    case 'enum':
      return spec.options?.[0] ?? '';
    case 'entity':
    case 'prototype':
      return 'player';
    case 'property':
      return 'hits-left';
    case 'variable':
      return 'score';
    case 'scene':
      return 'level-1';
    case 'control':
      return 'jump';
    case 'sound':
      return 'sfx-coin';
    case 'animation':
      return 'walk';
    case 'layer':
      return 'ground';
    case 'rule':
      return 'collect';
    case 'entity-tag':
      return 'player';
    case 'tile-tag':
      return 'solid';
  }
}

describe('the palette', () => {
  it('turns every palette block into something the schema accepts', () => {
    for (const clause of ['when', 'if', 'then'] as const) {
      const schema = clause === 'when' ? Trigger : clause === 'if' ? Condition : Action;
      for (const template of paletteTemplates(clause)) {
        const node = nodeFromTemplate(clause, template, sample);
        const parsed = schema.safeParse(node);
        expect(
          parsed.success,
          `${clause} block "${template.pattern}" made ${JSON.stringify(node)}`,
        ).toBe(true);
      }
    }
  });

  it('wears a sentence with a blank for every slot', () => {
    for (const clause of ['when', 'if', 'then'] as const) {
      for (const template of paletteTemplates(clause)) {
        const label = blockLabel(template);
        expect(label.length).toBeGreaterThan(2);
        const slots = flatParts(template).filter((part) => part.kind === 'slot').length;
        expect(label.split('___').length - 1).toBe(slots);
      }
    }
  });

  it('knows the schema field behind every slot of every block', () => {
    for (const clause of ['when', 'if', 'then'] as const) {
      for (const template of paletteTemplates(clause)) {
        for (const part of flatParts(template)) {
          if (part.kind !== 'slot') continue;
          expect(
            slotSpec(clause, template, part.field),
            `${template.type} has no field "${part.field}"`,
          ).toBeDefined();
        }
      }
    }
  });
});

describe('the dropdown starting points', () => {
  it('fills a valid starting point for every choice in the three dropdowns', () => {
    // "A property is" used to start as property: "Hello", which is not an id,
    // so picking it threw instead of doing anything. Every choice must start
    // schema-valid whenever the project has something for it to point at.
    const parsed = parseProject(project());
    const context: Context = {
      project: parsed,
      scene: parsed.scenes[0]!,
      sceneId: 'level-1',
      allowSelf: true,
      allowOther: true,
    };

    for (const type of Object.keys(TRIGGERS)) {
      const node = defaults('when', type, context);
      expect(Trigger.safeParse(node).success, `when ${type}: ${JSON.stringify(node)}`).toBe(true);
    }
    for (const type of Object.keys(CONDITIONS)) {
      const node = defaults('if', type, context);
      expect(Condition.safeParse(node).success, `if ${type}: ${JSON.stringify(node)}`).toBe(true);
    }
    for (const type of Object.keys(ACTIONS)) {
      const node = defaults('then', type, context);
      expect(Action.safeParse(node).success, `then ${type}: ${JSON.stringify(node)}`).toBe(true);
    }
  });
});

describe('list surgery', () => {
  const letters = ['a', 'b', 'c', 'd'];

  it('inserts, removes and clamps', () => {
    expect(insertAt(letters, 2, 'x')).toEqual(['a', 'b', 'x', 'c', 'd']);
    expect(insertAt(letters, 99, 'x')).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(removeAt(letters, 1)).toEqual(['a', 'c', 'd']);
  });

  it('moves an item to the slot counted before the move', () => {
    expect(moveItem(letters, 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(letters, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(letters, 1, 1)).toEqual(letters);
    expect(moveItem(letters, 9, 0)).toEqual(letters);
  });

  it('sends a drag description there and back', () => {
    const drag = { from: 'rule', clause: 'then', ruleId: 'collect', index: 1 } as const;
    expect(decodeDrag(encodeDrag(drag))).toEqual(drag);
    expect(decodeDrag('not json')).toBeUndefined();
    expect(decodeDrag('{"from":"elsewhere"}')).toBeUndefined();
  });
});

describe('rewriting rules through the store', () => {
  it('applies a whole script as one undoable step', () => {
    const editor = new EditorStore(parseProject(project()));
    const text = [
      'rule collect "Collect a coin"',
      'when player touches coin',
      'then add 2 to score',
      'then remove $other',
      '',
      'rule celebrate',
      'when score changes',
      'if score is at least 10',
      'then say "Ten!"',
    ].join('\n');

    const parsed = parseScript(text);
    expect(parsed.issues).toEqual([]);
    editor.apply(edit.setRules(parsed.rules, 'level-1'));

    const scene = editor.getState().project.scenes[0]!;
    expect(scene.events).toHaveLength(2);
    expect(scene.events[0]?.then[0]).toEqual({
      type: 'change-variable',
      variable: 'score',
      operator: 'add',
      value: 2,
    });

    editor.undo();
    expect(editor.getState().project.scenes[0]?.events).toHaveLength(1);
  });

  it('refuses a script that points at nothing, and says why', () => {
    const editor = new EditorStore(parseProject(project()));
    const parsed = parseScript('rule ghost\nwhen dragon touches player\nthen remove $other\n');
    expect(parsed.issues).toEqual([]);

    editor.apply(edit.setRules(parsed.rules, 'level-1'));
    expect(editor.getState().problem).toContain('dragon');
    expect(editor.getState().project.scenes[0]?.events).toHaveLength(1);
  });

  it('moves an action between two rules in one step', () => {
    const editor = new EditorStore(parseProject(project()));
    const more = parseScript(
      'rule cheer\nwhen score changes\nthen play the sound sfx-coin\nthen shake the camera\n',
    );
    editor.apply(edit.addRule(more.rules[0]!, 'level-1'));

    const scene = () => editor.getState().project.scenes[0]!;
    const [collect, cheer] = scene().events as [
      (typeof more.rules)[number],
      (typeof more.rules)[number],
    ];
    const moved = cheer.then[0]!;
    editor.apply(
      edit.updateRules(
        [
          { ...cheer, then: cheer.then.filter((_, at) => at !== 0) },
          { ...collect, then: [...collect.then, moved] },
        ],
        'level-1',
      ),
    );

    expect(scene().events[0]?.then).toHaveLength(3);
    expect(scene().events[1]?.then).toHaveLength(1);

    editor.undo();
    expect(scene().events[0]?.then).toHaveLength(2);
    expect(scene().events[1]?.then).toHaveLength(2);
  });

  it('prints the rules the script view starts from', () => {
    const editor = new EditorStore(parseProject(project()));
    const text = printScript(editor.getState().project.scenes[0]!.events);

    expect(text).toContain('rule collect');
    expect(text).toContain('when player touches coin');
    expect(text).toContain('then add 1 to score');

    const back = parseScript(text);
    expect(back.issues).toEqual([]);
    expect(back.rules).toEqual(editor.getState().project.scenes[0]!.events);
  });
});
