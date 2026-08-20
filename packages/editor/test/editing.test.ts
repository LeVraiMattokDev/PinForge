import { describe, expect, it, vi } from 'vitest';
import { parseProject, type ProjectInput } from '@pinforge/schema';
import * as edit from '../src/state/commands.js';
import { EditorStore } from '../src/state/store.js';
import { makeAutosaver, projectFileName } from '../src/state/storage.js';

function project(): ProjectInput {
  return {
    formatVersion: 1,
    meta: { name: 'Test game' },
    settings: { startScene: 'level-1' },
    variables: [{ id: 'score', type: 'number', initial: 0 }],
    assets: [{ id: 'tiles', kind: 'image', source: 'tiles.png' }],
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
        components: { collider: {}, movement: { mode: 'platform' } },
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
      },
    ],
  };
}

function store(): EditorStore {
  return new EditorStore(parseProject(project()));
}

describe('the command layer', () => {
  it('applies a change and can take it back', () => {
    const editor = store();
    expect(editor.getState().undoLabel).toBeUndefined();

    editor.apply(edit.setProjectName('Renamed'));
    expect(editor.getState().project.meta.name).toBe('Renamed');
    expect(editor.getState().undoLabel).toBe('Rename the game');

    editor.undo();
    expect(editor.getState().project.meta.name).toBe('Test game');
    expect(editor.getState().redoLabel).toBe('Rename the game');

    editor.redo();
    expect(editor.getState().project.meta.name).toBe('Renamed');
  });

  it('undoes and redoes a whole sequence, in order', () => {
    const editor = store();
    editor.apply(edit.addVariable({ id: 'lives', type: 'number', initial: 3 }));
    editor.apply(edit.placeInstance('level-1', parsedInstance('coin-1')));
    editor.apply(edit.moveInstance('level-1', 'coin-1', 32, 16));

    expect(editor.getState().project.scenes[0]?.entities).toHaveLength(2);

    editor.undo();
    editor.undo();
    expect(editor.getState().project.scenes[0]?.entities).toHaveLength(1);
    expect(editor.getState().project.variables).toHaveLength(2);

    editor.undo();
    expect(editor.getState().project.variables).toHaveLength(1);
    expect(editor.getState().undoLabel).toBeUndefined();
  });

  it('collapses a brush drag into one step', () => {
    const editor = store();
    for (let column = 0; column < 5; column += 1) {
      editor.apply(edit.paintTiles('level-1', 'ground', column, 3, 0));
    }

    expect(editor.getState().project.scenes[0]?.layers[0]?.rows[3]).toBe('#####.');

    editor.undo();
    expect(editor.getState().project.scenes[0]?.layers[0]?.rows[3]).toBe('......');
  });

  it('keeps separate strokes separate', () => {
    const editor = store();
    editor.apply(edit.paintTiles('level-1', 'ground', 0, 3, 0));
    editor.apply(edit.setProjectName('Between the strokes'));
    editor.apply(edit.paintTiles('level-1', 'ground', 1, 3, 0));

    editor.undo();
    expect(editor.getState().project.scenes[0]?.layers[0]?.rows[3]).toBe('#.....');
  });

  it('gives a tile a legend character when the layer has never used it', () => {
    const editor = store();
    editor.apply(edit.paintTiles('level-1', 'ground', 0, 0, 0));

    expect(editor.getState().project.scenes[0]?.layers[0]?.legend).toEqual({ '.': null, '#': 0 });
  });

  it('throws away the redo history once something new is done', () => {
    const editor = store();
    editor.apply(edit.setProjectName('One'));
    editor.undo();
    editor.apply(edit.setProjectName('Two'));

    expect(editor.getState().redoLabel).toBeUndefined();
    expect(editor.getState().project.meta.name).toBe('Two');
  });
});

describe('changes that would break the game', () => {
  it('is refused, with a reason, and changes nothing', () => {
    const editor = store();
    const scene = editor.getState().project.scenes[0]!;

    editor.apply(edit.updateScene({ ...scene, tileSize: 32 }));

    expect(editor.getState().problem).toContain('16 by 16 pixel tiles');
    expect(editor.getState().project.scenes[0]?.tileSize).toBe(16);
    expect(editor.getState().undoLabel).toBeUndefined();
  });

  it('will not leave a game with no levels', () => {
    const editor = store();
    editor.apply(edit.removeScene('level-1'));

    expect(editor.getState().problem).toBe('A game needs at least one level.');
    expect(editor.getState().project.scenes).toHaveLength(1);
  });

  it('refuses two things in a level with the same name', () => {
    const editor = store();
    editor.apply(edit.placeInstance('level-1', parsedInstance('player-1')));

    expect(editor.getState().problem).toContain('already');
  });

  it('takes copies away with the kind of thing they came from', () => {
    const editor = store();
    editor.apply(edit.removePrototype('player'));

    expect(editor.getState().project.entities).toHaveLength(0);
    expect(editor.getState().project.scenes[0]?.entities).toHaveLength(0);
    expect(editor.getState().problem).toBeUndefined();
  });

  it('keeps every layer the right shape when a level is resized', () => {
    const editor = store();
    editor.apply(edit.resizeScene('level-1', 8, 6));

    const layer = editor.getState().project.scenes[0]?.layers[0];
    expect(layer?.rows).toHaveLength(6);
    expect(layer?.rows.every((row) => row.length === 8)).toBe(true);
    expect(editor.getState().problem).toBeUndefined();
  });
});

describe('opening a file', () => {
  it('refuses one that is not a project, and keeps what is open', () => {
    const editor = store();
    editor.replaceProject({ formatVersion: 1, meta: {} });

    expect(editor.getState().problem).toBeDefined();
    expect(editor.getState().project.meta.name).toBe('Test game');
  });

  it('clears the undo history, because the old steps belong to another game', () => {
    const editor = store();
    editor.apply(edit.setProjectName('Changed'));
    editor.replaceProject(project());

    expect(editor.getState().undoLabel).toBeUndefined();
    expect(editor.getState().changedSinceSave).toBe(false);
  });
});

describe('saving', () => {
  it('waits for a pause before autosaving, and only saves once', () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const autosaver = makeAutosaver((one) => saved.push(one.meta.name));
    const editor = store();

    autosaver.schedule(editor.getState().project);
    editor.apply(edit.setProjectName('Later'));
    autosaver.schedule(editor.getState().project);
    vi.advanceTimersByTime(2000);

    expect(saved).toEqual(['Later']);
    vi.useRealTimers();
  });

  it('names the file after the game', () => {
    expect(projectFileName(parseProject(project()))).toBe('test-game.pinforge.json');
  });
});

function parsedInstance(id: string) {
  return {
    id,
    prototype: 'player',
    x: 0,
    y: 0,
    fixedToCamera: false,
    tags: [],
    properties: {},
    overrides: {},
  };
}
