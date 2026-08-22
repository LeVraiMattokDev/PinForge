import { describe, expect, it } from 'vitest';
import { errorsAmong, parseProject, validateProject, type ProjectInput } from '../src/index.js';

/** A small but complete platformer, used as the starting point for every case below. */
function base(): ProjectInput {
  return {
    formatVersion: 1,
    meta: { name: 'Test game' },
    settings: { startScene: 'level-1' },
    variables: [{ id: 'score', type: 'number', initial: 0 }],
    assets: [
      { id: 'tiles', kind: 'image', source: 'tiles.png' },
      { id: 'hero', kind: 'image', source: 'hero.png' },
      { id: 'ping', kind: 'sound', source: 'ping.wav' },
    ],
    tilesets: [
      {
        id: 'grass',
        image: 'tiles',
        tileWidth: 16,
        tileHeight: 16,
        tiles: [
          { index: 0, tags: ['solid'] },
          { index: 1, tags: ['hazard'] },
        ],
      },
    ],
    entities: [
      {
        id: 'player',
        size: { width: 12, height: 16 },
        tags: ['player'],
        properties: [{ id: 'hits-left', type: 'number', initial: 3 }],
        components: {
          sprite: {
            image: 'hero',
            frameWidth: 16,
            frameHeight: 16,
            defaultAnimation: 'idle',
            animations: [{ id: 'idle', frames: [0] }],
          },
          collider: {},
          movement: { mode: 'platform' },
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
        size: { columns: 4, rows: 2 },
        layers: [
          {
            id: 'ground',
            tileset: 'grass',
            collides: true,
            legend: { '.': null, '#': 0 },
            rows: ['....', '####'],
          },
        ],
        entities: [
          { id: 'player-1', prototype: 'player', x: 0, y: 0 },
          { id: 'coin-1', prototype: 'coin', x: 16, y: 0 },
        ],
        camera: { mode: 'follow', target: 'player-1' },
        events: [],
      },
    ],
  };
}

/** Applies a change to the base project and returns the problems it causes. */
function issuesAfter(change: (project: ProjectInput) => void): { code: string; message: string }[] {
  const project = base();
  change(project);
  return validateProject(parseProject(project)).map(({ code, message }) => ({ code, message }));
}

function codesAfter(change: (project: ProjectInput) => void): string[] {
  return issuesAfter(change).map((issue) => issue.code);
}

describe('a project that makes sense', () => {
  it('has nothing to report', () => {
    expect(validateProject(parseProject(base()))).toEqual([]);
  });
});

describe('names that point at nothing', () => {
  it('catches a missing start scene', () => {
    expect(codesAfter((p) => (p.settings.startScene = 'level-9'))).toEqual(['missing-scene']);
  });

  it('catches an image that was never imported', () => {
    expect(codesAfter((p) => (p.tilesets![0]!.image = 'gone'))).toEqual(['missing-asset']);
  });

  it('catches a copy of an entity that does not exist', () => {
    expect(codesAfter((p) => (p.scenes[0]!.entities![1]!.prototype = 'ghost'))).toEqual([
      'missing-prototype',
    ]);
  });

  it('catches a camera following nothing', () => {
    expect(codesAfter((p) => (p.scenes[0]!.camera = { mode: 'follow', target: 'nobody' }))).toEqual(
      ['missing-entity'],
    );
  });

  it('catches an animation an entity does not have', () => {
    expect(
      codesAfter((p) => (p.entities![0]!.components!.sprite!.defaultAnimation = 'dance')),
    ).toEqual(['missing-animation']);
  });
});

describe('ids', () => {
  it('refuses two scenes with the same id', () => {
    expect(
      codesAfter((p) => p.scenes.push({ id: 'level-1', size: { columns: 1, rows: 1 } })),
    ).toEqual(['duplicate-id']);
  });

  it('refuses a copy whose id is also the name of an entity kind, because rules could not tell them apart', () => {
    expect(codesAfter((p) => (p.scenes[0]!.entities![1]!.id = 'player'))).toEqual([
      'id-shadows-prototype',
    ]);
  });
});

describe('tile layers', () => {
  it('catches a row of the wrong length', () => {
    const issues = issuesAfter((p) => (p.scenes[0]!.layers![0]!.rows = ['....', '###']));
    expect(issues[0]?.code).toBe('wrong-row-length');
    expect(issues[0]?.message).toContain('4 tiles wide');
  });

  it('catches the wrong number of rows', () => {
    expect(codesAfter((p) => (p.scenes[0]!.layers![0]!.rows = ['....']))).toEqual([
      'wrong-row-count',
    ]);
  });

  it('catches a character the legend does not explain', () => {
    const issues = issuesAfter((p) => (p.scenes[0]!.layers![0]!.rows = ['..x.', '####']));
    expect(issues[0]?.code).toBe('missing-legend-entry');
    expect(issues[0]?.message).toContain('"x"');
  });

  it('catches a tileset built on a different grid', () => {
    expect(codesAfter((p) => (p.scenes[0]!.tileSize = 32))).toEqual(['tile-size-mismatch']);
  });
});

describe('rules', () => {
  it('accepts a complete rule', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'collect',
              when: { type: 'collides', subject: 'player', with: 'coin' },
              then: [
                { type: 'play-sound', sound: 'ping' },
                { type: 'change-variable', variable: 'score', value: 1 },
                { type: 'destroy', target: '$other' },
              ],
            },
          ]),
      ),
    ).toEqual([]);
  });

  it('refuses $other when the rule is not about two things touching', () => {
    const issues = issuesAfter(
      (p) =>
        (p.scenes[0]!.events = [
          {
            id: 'oops',
            when: { type: 'lands', subject: 'player' },
            then: [{ type: 'destroy', target: '$other' }],
          },
        ]),
    );
    expect(issues[0]?.code).toBe('no-other');
    expect(issues[0]?.message).toContain('$other');
  });

  it('refuses $self when the rule is not about one entity', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'scene-starts' },
              then: [{ type: 'destroy', target: '$self' }],
            },
          ]),
      ),
    ).toEqual(['no-self']);
  });

  it('refuses to ask something with no movement whether it is on the ground', () => {
    const issues = issuesAfter(
      (p) =>
        (p.scenes[0]!.events = [
          {
            id: 'oops',
            when: { type: 'clicked', subject: 'coin' },
            if: [{ type: 'is-on-ground', target: 'coin' }],
            then: [{ type: 'destroy', target: '$self' }],
          },
        ]),
    );
    expect(issues[0]?.code).toBe('wrong-movement-mode');
    expect(issues[0]?.message).toContain('coin');
  });

  it('refuses to make something with free movement jump', () => {
    expect(
      codesAfter((p) => {
        p.entities![1]!.components!.movement = { mode: 'free' };
        p.scenes[0]!.events = [
          {
            id: 'oops',
            when: { type: 'scene-starts' },
            then: [{ type: 'jump', target: 'coin' }],
          },
        ];
      }),
    ).toEqual(['wrong-movement-mode']);
  });

  it('catches a control, a variable, a sound and a level that were never defined', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'action-pressed', action: 'fire' },
              if: [{ type: 'variable-is', variable: 'ammo', value: 1 }],
              then: [
                { type: 'play-sound', sound: 'bang' },
                { type: 'go-to-scene', scene: 'level-4' },
              ],
            },
          ]),
      ),
    ).toEqual(['missing-input-action', 'missing-variable', 'missing-asset', 'missing-scene']);
  });

  it('catches a rule that switches a rule that does not exist', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'scene-starts' },
              then: [{ type: 'disable-rule', rule: 'nothing' }],
            },
          ]),
      ),
    ).toEqual(['missing-rule']);
  });

  it('catches text put into a number variable', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'scene-starts' },
              then: [{ type: 'set-variable', variable: 'score', value: 'lots' }],
            },
          ]),
      ),
    ).toEqual(['wrong-variable-type']);
  });

  it('catches a property an entity does not have', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'clicked', subject: 'player' },
              then: [{ type: 'set-property', target: '$self', property: 'mood', value: 1 }],
            },
          ]),
      ),
    ).toEqual(['missing-property']);
  });

  it('catches a tag nothing carries', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'collides', subject: 'player', with: 'tag:boss' },
              then: [{ type: 'destroy', target: '$other' }],
            },
          ]),
      ),
    ).toEqual(['missing-tag']);
  });

  it('catches painting a tile outside the level', () => {
    expect(
      codesAfter(
        (p) =>
          (p.scenes[0]!.events = [
            {
              id: 'oops',
              when: { type: 'scene-starts' },
              then: [{ type: 'set-tile', layer: 'ground', column: 9, row: 9, tile: null }],
            },
          ]),
      ),
    ).toEqual(['outside-scene', 'outside-scene']);
  });
});

describe('instances', () => {
  it('catches a property set to the wrong kind of value', () => {
    expect(
      codesAfter((p) => (p.scenes[0]!.entities![0]!.properties = { 'hits-left': 'three' })),
    ).toEqual(['wrong-property-type']);
  });

  it('catches a change to a component the entity does not have', () => {
    expect(
      codesAfter((p) => (p.scenes[0]!.entities![1]!.overrides = { movement: { maxSpeed: 4 } })),
    ).toEqual(['missing-component']);
  });

  it('catches a movement setting that belongs to the other mode', () => {
    const issues = issuesAfter(
      (p) => (p.scenes[0]!.entities![0]!.overrides = { movement: { axes: 'both' } }),
    );
    expect(issues[0]?.code).toBe('wrong-movement-field');
    expect(issues[0]?.message).toContain('axes');
  });
});

/**
 * The trap two playtesters found independently, each with a working
 * reproduction: a rule that asks something about a group and then acts on the
 * whole group. It is legal, so it is warned about rather than refused.
 */
describe('a rule that checks one of a group and then acts on all of them', () => {
  const withRule = (rule: NonNullable<ProjectInput['scenes'][number]['events']>[number]) => {
    const project = base();
    project.entities = [
      ...project.entities!,
      {
        id: 'slime',
        size: { width: 12, height: 12 },
        tags: ['enemy'],
        properties: [{ id: 'hits-left', type: 'number', initial: 3 }],
        components: { collider: { kind: 'trigger' } },
      },
    ];
    project.scenes![0]!.entities = [
      ...project.scenes![0]!.entities!,
      { id: 'slime-1', prototype: 'slime', x: 40, y: 60 },
    ];
    project.scenes![0]!.events = [rule];
    return validateProject(parseProject(project));
  };

  it('is warned about, not refused', () => {
    const issues = withRule({
      id: 'wipe',
      when: { type: 'every-frame' },
      if: [
        {
          type: 'property-is',
          target: 'tag:enemy',
          property: 'hits-left',
          operator: 'at-most',
          value: 0,
        },
      ],
      then: [{ type: 'destroy', target: 'tag:enemy' }],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.code).toBe('group-broadcast');
    expect(issues[0]?.message).toContain('every single one');
    // A warning must never stop the game opening.
    expect(errorsAmong(issues)).toEqual([]);
  });

  it('says nothing about the same rule written about one entity', () => {
    const issues = withRule({
      id: 'squash',
      when: { type: 'collides', subject: 'player', with: 'slime' },
      if: [
        {
          type: 'property-is',
          target: '$other',
          property: 'hits-left',
          operator: 'at-most',
          value: 0,
        },
      ],
      then: [{ type: 'destroy', target: '$other' }],
    });

    expect(issues).toEqual([]);
  });

  it('says nothing when the check is not about the group being acted on', () => {
    const issues = withRule({
      id: 'clear-them',
      when: { type: 'every-frame' },
      if: [{ type: 'variable-is', variable: 'score', operator: 'at-least', value: 10 }],
      then: [{ type: 'destroy', target: 'tag:enemy' }],
    });

    expect(issues).toEqual([]);
  });

  it('says nothing about a check on one particular copy', () => {
    const issues = withRule({
      id: 'one-slime',
      when: { type: 'every-frame' },
      if: [
        {
          type: 'property-is',
          target: 'slime-1',
          property: 'hits-left',
          operator: 'at-most',
          value: 0,
        },
      ],
      then: [{ type: 'destroy', target: 'slime-1' }],
    });

    expect(issues).toEqual([]);
  });
});
