import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ProjectValidationError } from '@pinforge/schema';
import { Workspace, diffJson } from '../src/index.js';

const workspace = mkdtempSync(join(tmpdir(), 'pinforge-mcp-'));
const EXAMPLE = new URL('../../../examples/first-game', import.meta.url).pathname;
let counter = 0;

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

function freshProject(): { tools: Workspace; file: string } {
  counter += 1;
  const directory = join(workspace, `game-${counter}`);
  const tools = new Workspace();
  tools.createProject(directory, 'Test game');
  return { tools, file: join(directory, 'game.pinforge.json') };
}

describe('opening a project', () => {
  it('describes a game a person wrote', () => {
    const tools = new Workspace();
    const summary = tools.open(EXAMPLE);

    expect(summary).toContain('Coin Run');
    expect(summary).toContain('level-1');
    expect(summary).toContain('Rules that run everywhere: 12');
  });

  it('refuses to work before a project is open', () => {
    expect(() => new Workspace().describe()).toThrow(/No project is open/);
  });

  it('reads a level exactly as the file holds it, tile rows included', () => {
    const tools = new Workspace();
    tools.open(EXAMPLE);
    const scene = JSON.parse(tools.readScene('level-1'));

    expect(scene.size).toEqual({ columns: 40, rows: 12 });
    expect(scene.layers[1].rows[11]).toBe('#'.repeat(40));
  });

  it('lists the whole rule vocabulary with working examples', () => {
    const tools = new Workspace();
    const text = tools.ruleVocabulary('actions');

    expect(text).toContain('change-variable');
    expect(text).toContain('Only for platform movement.');
    expect(text).not.toContain('## triggers');
  });
});

describe('mutations', () => {
  let tools: Workspace;
  let file: string;

  beforeEach(() => {
    ({ tools, file } = freshProject());
  });

  it('reports exactly what changed, and writes it', () => {
    const changes = tools.moveEntity('level-1', 'coin-1', 40, 60);

    expect(changes).toEqual([
      { path: '/scenes/0/entities/1/x', kind: 'changed', before: 104, after: 40 },
      { path: '/scenes/0/entities/1/y', kind: 'changed', before: 40, after: 60 },
    ]);
    const written = JSON.parse(readFileSync(file, 'utf8'));
    expect(written.scenes[0].entities[1].x).toBe(40);
  });

  it('refuses a change that would break the game, and leaves the file alone', () => {
    const before = readFileSync(file, 'utf8');

    expect(() =>
      tools.addRule(
        {
          id: 'broken',
          when: { type: 'scene-starts' },
          then: [{ type: 'change-variable', variable: 'coins-collected', value: 1 }],
        },
        'level-1',
      ),
    ).toThrow(ProjectValidationError);

    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('says which reference is wrong, in words', () => {
    expect(() =>
      tools.addRule({
        id: 'broken',
        when: { type: 'collides', subject: 'player', with: 'dragon' },
        then: [{ type: 'destroy', target: '$other' }],
      }),
    ).toThrow(/no entity called "dragon"/);
  });

  it('adds a variable and a rule that uses it', () => {
    tools.addVariable({ id: 'lives', type: 'number', initial: 3 });
    const changes = tools.addRule({
      id: 'fell-out',
      name: 'Falling costs a life',
      when: { type: 'leaves-scene', subject: 'player', edge: 'bottom' },
      then: [
        { type: 'change-variable', variable: 'lives', operator: 'subtract', value: 1 },
        { type: 'restart-scene' },
      ],
    });

    // The starter has no rules that run everywhere, so the whole list is new.
    expect(changes[0]?.kind).toBe('added');
    expect(changes[0]?.path).toBe('/globalEvents');
    expect(tools.validate()).toContain('valid PinForge project');
  });

  it('paints a rectangle of tiles with the character the legend already uses', () => {
    tools.paintTiles({ scene: 'level-1', layer: 'ground', column: 2, row: 8, width: 4, tile: 3 });

    const scene = JSON.parse(tools.readScene('level-1'));
    expect(scene.layers[0].legend['^']).toBe(3);
    expect(scene.layers[0].rows[8]).toBe('..^^^^..............');
  });

  it('gives a tile the legend has never seen a character of its own', () => {
    tools.paintTiles({ scene: 'level-1', layer: 'ground', column: 5, row: 7, width: 3, tile: 1 });

    const scene = JSON.parse(tools.readScene('level-1'));
    // #, = and ^ are spoken for, so dirt gets the next free character.
    expect(scene.layers[0].legend['+']).toBe(1);
    expect(scene.layers[0].rows[7]).toBe('.....+++............');
  });

  it('paints nothing back over tiles when asked for null', () => {
    tools.paintTiles({
      scene: 'level-1',
      layer: 'ground',
      column: 0,
      row: 9,
      width: 20,
      tile: null,
    });

    const scene = JSON.parse(tools.readScene('level-1'));
    expect(scene.layers[0].rows[9]).toBe('.'.repeat(20));
  });

  it('refuses to paint outside the level', () => {
    expect(() =>
      tools.paintTiles({
        scene: 'level-1',
        layer: 'ground',
        column: 19,
        row: 0,
        width: 4,
        tile: 0,
      }),
    ).toThrow(/Column 20 is outside/);
  });

  it('adds a level with a layer ready to paint', () => {
    tools.createScene({ id: 'level-2', columns: 12, rows: 6, tileset: 'world' });
    tools.paintTiles({ scene: 'level-2', layer: 'ground', column: 0, row: 5, width: 12, tile: 0 });

    const scene = JSON.parse(tools.readScene('level-2'));
    expect(scene.layers[0].rows).toHaveLength(6);
    expect(scene.layers[0].rows[5]).toBe('#'.repeat(12));
  });

  it('adds a kind of thing, places it, and takes it away again', () => {
    tools.createEntity({
      id: 'crate',
      name: 'Crate',
      size: { width: 16, height: 16 },
      components: { collider: { kind: 'solid' } },
    });
    tools.placeEntity('level-1', { id: 'crate-1', prototype: 'crate', x: 64, y: 128 });

    expect(JSON.parse(tools.readScene('level-1')).entities).toHaveLength(6);

    const changes = tools.removeEntity('level-1', 'crate-1');
    expect(changes[0]?.kind).toBe('removed');
    expect(JSON.parse(tools.readScene('level-1')).entities).toHaveLength(5);
  });

  it('patches a kind of thing without disturbing the rest of it', () => {
    const changes = tools.modifyEntity('player', { components: { movement: { jumpHeight: 70 } } });

    expect(changes).toEqual([
      {
        path: '/entities/0/components/movement/jumpHeight',
        kind: 'added',
        after: 70,
      },
    ]);
    const project = JSON.parse(readFileSync(file, 'utf8'));
    expect(project.entities[0].components.movement).toEqual({ mode: 'platform', jumpHeight: 70 });
    expect(project.entities[0].components.sprite.image).toBe('player-art');
  });

  it('exports the game it has been editing', () => {
    const out = join(workspace, 'exported.html');
    tools.modifyEntity('player', { components: { movement: { maxSpeed: 150 } } });

    expect(tools.exportGame(out)).toContain('one file');
    const html = readFileSync(out, 'utf8');
    expect(html).toContain('"maxSpeed":150');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('the diff', () => {
  it('reports additions, removals and changes with their paths', () => {
    const changes = diffJson({ a: 1, b: { c: 2 }, d: [1, 2] }, { a: 1, b: { c: 3 }, d: [1] });

    expect(changes).toEqual([
      { path: '/b/c', kind: 'changed', before: 2, after: 3 },
      { path: '/d/1', kind: 'removed', before: 2 },
    ]);
  });

  it('summarises a value too big to read back', () => {
    const changes = diffJson({}, { source: `data:image/png;base64,${'A'.repeat(4000)}` });

    expect(String(changes[0]?.after)).toContain('4022 characters');
  });
});
