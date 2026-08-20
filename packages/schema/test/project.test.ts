import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUT_ACTIONS,
  ProjectFormatError,
  parseProject,
  type ProjectInput,
} from '../src/index.js';

function minimal(): ProjectInput {
  return {
    formatVersion: 1,
    meta: { name: 'The smallest possible game' },
    settings: { startScene: 'level-1' },
    scenes: [{ id: 'level-1', size: { columns: 4, rows: 3 } }],
  };
}

describe('parsing a project', () => {
  it('fills in every default, so a hand written file can stay short', () => {
    const project = parseProject(minimal());

    expect(project.settings.viewport).toEqual({ width: 320, height: 180, scaleMode: 'integer' });
    expect(project.settings.input).toEqual(DEFAULT_INPUT_ACTIONS);
    expect(project.settings.pixelArt).toBe(true);
    expect(project.scenes[0]?.tileSize).toBe(16);
    expect(project.scenes[0]?.camera).toEqual({ mode: 'fixed', x: 0, y: 0, clampToScene: true });
    expect(project.scenes[0]?.background).toEqual({ color: '#10141c' });
    expect(project.meta.author).toBe('');
  });

  it('rejects an unknown key and says where it is', () => {
    const project = { ...minimal(), meta: { name: 'Typo', colour: '#ffffff' } };

    expect(() => parseProject(project)).toThrow(ProjectFormatError);
    expect(() => parseProject(project)).toThrow(/meta.*colour/s);
  });

  it('rejects an id that is not a slug', () => {
    const project = minimal();
    project.scenes = [{ id: 'Level One', size: { columns: 4, rows: 3 } }];

    expect(() => parseProject(project)).toThrow(/lowercase letters/);
  });

  it('refuses a file from another format version, so migration is not skipped by accident', () => {
    expect(() => parseProject({ ...minimal(), formatVersion: 2 })).toThrow(ProjectFormatError);
  });

  it('needs at least one scene', () => {
    expect(() => parseProject({ ...minimal(), scenes: [] })).toThrow(ProjectFormatError);
  });
});

describe('platform movement defaults', () => {
  it('gives coyote time, jump buffering and heavier falling without being asked', () => {
    const project = minimal();
    project.entities = [
      {
        id: 'player',
        size: { width: 12, height: 16 },
        components: { movement: { mode: 'platform' } },
      },
    ];

    const movement = parseProject(project).entities[0]?.components.movement;

    expect(movement).toMatchObject({
      mode: 'platform',
      coyoteTime: 0.1,
      jumpBufferTime: 0.12,
      fallGravityMultiplier: 1.7,
      jumpHeight: 44,
      variableJumpHeight: true,
    });
  });
});

describe('instance overrides', () => {
  it('changes only the fields it names, and never brings defaults with it', () => {
    const project = minimal();
    project.entities = [
      {
        id: 'slime',
        size: { width: 14, height: 12 },
        components: { movement: { mode: 'platform' } },
      },
    ];
    project.scenes = [
      {
        id: 'level-1',
        size: { columns: 4, rows: 3 },
        entities: [
          {
            id: 'slime-1',
            prototype: 'slime',
            x: 0,
            y: 0,
            overrides: { movement: { maxSpeed: 16 } },
          },
        ],
      },
    ];

    const instance = parseProject(project).scenes[0]?.entities[0];

    expect(instance?.overrides).toEqual({ movement: { maxSpeed: 16 } });
  });
});
