import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  Action,
  CONDITIONS,
  Condition,
  TRIGGERS,
  Trigger,
  loadProject,
  type EventRule,
} from '@pinforge/schema';
import { buildScriptReference, parseScript, printRule, printScript } from '../src/index.js';
import { matchLine } from '../src/parse.js';
import { printAction, printCondition, printTrigger } from '../src/print.js';
import { ACTION_TEMPLATES, CONDITION_TEMPLATES, TRIGGER_TEMPLATES } from '../src/templates.js';
import { tokenizeLine } from '../src/tokens.js';

/**
 * The one property everything else leans on: printing a rule and reading it
 * back gives the same rule. The catalog's examples are the corpus, so a new
 * trigger, condition or action cannot ship without a sentence that survives
 * the round trip.
 */

function reparse(templates: Parameters<typeof matchLine>[0], line: string): unknown {
  const tokens = tokenizeLine(line);
  if ('error' in tokens) throw new Error(`"${line}": ${tokens.error}`);
  const node = matchLine(templates, tokens);
  if (!node) throw new Error(`No sentence matched "${line}".`);
  return node;
}

describe('every example in the catalog survives the round trip', () => {
  for (const [type, entry] of Object.entries(TRIGGERS)) {
    it(`trigger: ${type}`, () => {
      const node = Trigger.parse(entry.example);
      const line = printTrigger(node);
      expect(Trigger.parse(reparse(TRIGGER_TEMPLATES, line))).toEqual(node);
    });
  }

  for (const [type, entry] of Object.entries(CONDITIONS)) {
    it(`condition: ${type}`, () => {
      const node = Condition.parse(entry.example);
      const line = printCondition(node);
      const back = Condition.parse({
        ...(reparse(CONDITION_TEMPLATES, line) as object),
        negate: node.negate,
      });
      expect(back).toEqual(node);
    });
  }

  for (const [type, entry] of Object.entries(ACTIONS)) {
    it(`action: ${type}`, () => {
      const node = Action.parse(entry.example);
      const line = printAction(node);
      expect(Action.parse(reparse(ACTION_TEMPLATES, line))).toEqual(node);
    });
  }
});

describe('docs/script.md', () => {
  const docPath = join(import.meta.dirname, '../../../docs/script.md');

  it('is what the templates produce', () => {
    expect(readFileSync(docPath, 'utf8')).toBe(`${buildScriptReference()}\n`);
  });

  it('opens with an example that really reads', () => {
    const markdown = readFileSync(docPath, 'utf8');
    const block = /```\n([\s\S]*?)```/.exec(markdown);
    expect(block?.[1]).toBeDefined();
    const { rules, issues } = parseScript(block![1]!);
    expect(issues).toEqual([]);
    expect(rules.length).toBeGreaterThan(1);
  });
});

describe('the example game', () => {
  it('prints every rule and reads them all back unchanged', () => {
    const file = join(import.meta.dirname, '../../../examples/first-game/game.pinforge.json');
    const { project } = loadProject(JSON.parse(readFileSync(file, 'utf8')));
    const containers = [project.globalEvents, ...project.scenes.map((scene) => scene.events)];

    for (const rules of containers) {
      if (rules.length === 0) continue;
      const text = printScript(rules);
      const back = parseScript(text);
      expect(back.issues).toEqual([]);
      expect(back.rules).toEqual(rules);
    }
  });
});

describe('reading a script', () => {
  it('reads a small game, comments and blank lines included', () => {
    const text = `
# Collecting things.
rule collect-coin "Collect a coin"
when player touches coin
then remove $other        # the coin, not the player
then add 1 to score
then play the sound sfx-coin

rule win once
when score changes
if score is at least 3
then say "You win!" for 3 seconds
then wait 1 second
then go to the level level-2
`;
    const { rules, issues } = parseScript(text);
    expect(issues).toEqual([]);
    expect(rules).toHaveLength(2);

    const [collect, win] = rules as [EventRule, EventRule];
    expect(collect.name).toBe('Collect a coin');
    expect(collect.when).toEqual({ type: 'collides', subject: 'player', with: 'coin' });
    expect(collect.then).toEqual([
      { type: 'destroy', target: '$other' },
      { type: 'change-variable', variable: 'score', operator: 'add', value: 1 },
      { type: 'play-sound', sound: 'sfx-coin', volume: 1 },
    ]);

    expect(win.once).toBe(true);
    expect(win.if).toEqual([
      { type: 'variable-is', variable: 'score', operator: 'at-least', value: 3, negate: false },
    ]);
    expect(win.then[1]).toEqual({ type: 'wait', seconds: 1 });
  });

  it('understands not, off and messages with quotes in them', () => {
    const text = `
rule quiet off
when the level starts
if not door exists
then say "The door said \\"no\\"." for 1 second
`;
    const { rules, issues } = parseScript(text);
    expect(issues).toEqual([]);
    expect(rules[0]?.enabled).toBe(false);
    expect(rules[0]?.if[0]).toEqual({ type: 'entity-exists', entity: 'door', negate: true });
    expect(rules[0]?.then[0]).toEqual({
      type: 'show-message',
      text: 'The door said "no".',
      seconds: 1,
    });
  });

  it('keeps both optional parts of create straight', () => {
    const { rules, issues } = parseScript(
      'rule pop\nwhen the level starts\nthen create coin at 0 -12 near $self\nthen create coin\n',
    );
    expect(issues).toEqual([]);
    expect(rules[0]?.then[0]).toEqual({
      type: 'spawn',
      entity: 'coin',
      x: 0,
      y: -12,
      relativeTo: '$self',
    });
    expect(rules[0]?.then[1]).toEqual({ type: 'spawn', entity: 'coin', x: 0, y: 0 });
  });

  it('tells one line of speed from a whole one', () => {
    const { rules, issues } = parseScript(
      [
        'rule speeds',
        'when the level starts',
        'then set the speed of player across to -24',
        'then set the speed of player down to 10',
        'then change the speed of player across by 5 down by -10',
        'then set the speed of player',
      ].join('\n'),
    );
    expect(issues).toEqual([]);
    expect(rules[0]?.then).toEqual([
      { type: 'move', target: 'player', mode: 'set', x: -24 },
      { type: 'move', target: 'player', mode: 'set', y: 10 },
      { type: 'move', target: 'player', mode: 'add', x: 5, y: -10 },
      { type: 'move', target: 'player', mode: 'set' },
    ]);
  });
});

describe('what a wrong script is told', () => {
  it('names the line of a phrase it cannot read', () => {
    const { issues } = parseScript('rule broken\nwhen the moon is full\nthen add 1 to score\n');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(2);
    expect(issues[0]?.message).toContain('trigger');
  });

  it('refuses a second when line', () => {
    const { issues } = parseScript(
      'rule twice\nwhen the game starts\nwhen the level starts\nthen restart the level\n',
    );
    expect(issues[0]?.line).toBe(3);
    expect(issues[0]?.message).toContain('already has a when');
  });

  it('refuses a rule with nothing to do, and one that never runs', () => {
    const { rules, issues } = parseScript(
      'rule empty\nwhen the game starts\n\nrule lost\nthen restart the level\n',
    );
    expect(rules).toEqual([]);
    expect(issues.map((one) => one.line)).toEqual([1, 4]);
    expect(issues[0]?.message).toContain('no then line');
    expect(issues[1]?.message).toContain('no when line');
  });

  it('refuses lines outside any rule and unknown keywords', () => {
    const { issues } = parseScript(
      'then restart the level\nrule ok\nwhat now\nwhen the game starts\nthen restart the level\n',
    );
    expect(issues.map((one) => one.line)).toEqual([1, 3]);
  });

  it('refuses two rules with the same id', () => {
    const twice = 'rule same\nwhen the game starts\nthen restart the level\n';
    const { rules, issues } = parseScript(twice + '\n' + twice);
    expect(rules).toHaveLength(1);
    expect(issues[0]?.message).toContain('already a rule called');
  });

  it('reports an unclosed quote instead of guessing', () => {
    const { issues } = parseScript('rule oops\nwhen the game starts\nthen say "no end\n');
    expect(issues[0]?.line).toBe(3);
    expect(issues[0]?.message).toContain('never closed');
  });

  it('keeps the good rules when one is broken', () => {
    const { rules, issues } = parseScript(
      'rule good\nwhen the game starts\nthen add 1 to score\n\nrule bad\nwhen nonsense here\nthen add 1 to score\n',
    );
    expect(rules).toHaveLength(1);
    expect(issues).toHaveLength(1);
  });
});

describe('writing a script', () => {
  it('writes flags, names and negation the way it reads them', () => {
    const rule = {
      id: 'the-works',
      name: 'Every corner at once',
      enabled: false,
      once: true,
      when: { type: 'leaves-scene', subject: 'player', edge: 'bottom' },
      if: [
        { type: 'is-on-ground', target: 'player', negate: true },
        { type: 'chance', percent: 25, negate: false },
      ],
      then: [
        { type: 'shake-camera', strength: 8, seconds: 0.3 },
        { type: 'set-tile', layer: 'ground', column: 12, row: 5, tile: null },
        { type: 'stop-sound' },
      ],
    } as unknown as EventRule;

    const text = printRule(rule);
    expect(text).toBe(
      [
        'rule the-works "Every corner at once" once off',
        'when player leaves the level at the bottom',
        'if not player is on the ground',
        'if chance of 25 in 100',
        'then shake the camera with strength 8',
        'then clear the tile at column 12 row 5 on ground',
        'then stop every sound',
      ].join('\n'),
    );

    const back = parseScript(text);
    expect(back.issues).toEqual([]);
    expect(back.rules[0]).toEqual(rule);
  });

  it('leaves defaults unsaid so the sentence stays short', () => {
    const rule = {
      id: 'short',
      enabled: true,
      once: false,
      when: { type: 'leaves-scene', subject: 'player', edge: 'any' },
      if: [],
      then: [
        { type: 'play-sound', sound: 'sfx-coin', volume: 1 },
        { type: 'show-message', text: 'Hello', seconds: 2 },
        { type: 'shake-camera', strength: 4, seconds: 0.3 },
        { type: 'spawn', entity: 'coin', x: 0, y: 0 },
      ],
    } as unknown as EventRule;

    expect(printRule(rule)).toBe(
      [
        'rule short',
        'when player leaves the level',
        'then play the sound sfx-coin',
        'then say "Hello"',
        'then shake the camera',
        'then create coin',
      ].join('\n'),
    );
  });
});
