import { describe, expect, it } from 'vitest';
import type { ProjectInput } from '@pinforge/schema';
import { makeGame, player, stepUntil, steps } from './helpers.js';

const PLAYER: ProjectInput['entities'] = [
  {
    id: 'player',
    size: { width: 12, height: 16 },
    tags: ['player'],
    components: { collider: {}, movement: { mode: 'platform' } },
  },
  {
    id: 'coin',
    size: { width: 8, height: 8 },
    tags: ['pickup'],
    components: { collider: { kind: 'trigger' } },
  },
];

describe('rules about two things touching', () => {
  it('collects a coin: the score goes up and the coin goes away', () => {
    const game = makeGame({
      prototypes: PLAYER,
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 0 },
        { id: 'coin-1', prototype: 'coin', x: 60, y: 68 },
      ],
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
    });

    steps(game, 60);
    game.input.press('right');
    const found = stepUntil(game, (one) => one.variable('score') === 1);

    expect(found).toBeGreaterThan(0);
    expect(game.world.entities.filter((one) => one.prototypeId === 'coin')).toHaveLength(0);
    // The rule fires once, not once per step of the overlap.
    steps(game, 30);
    expect(game.variable('score')).toBe(1);
  });

  it('notices when two things stop touching', () => {
    const game = makeGame({
      variables: [{ id: 'touching', type: 'boolean', initial: false }],
      prototypes: PLAYER,
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 0 },
        { id: 'coin-1', prototype: 'coin', x: 60, y: 68 },
      ],
      events: [
        {
          id: 'on',
          when: { type: 'collides', subject: 'player', with: 'coin' },
          then: [{ type: 'set-variable', variable: 'touching', value: true }],
        },
        {
          id: 'off',
          when: { type: 'collision-ends', subject: 'player', with: 'coin' },
          then: [{ type: 'set-variable', variable: 'touching', value: false }],
        },
      ],
    });

    steps(game, 60);
    game.input.press('right');
    expect(stepUntil(game, (one) => one.variable('touching') === true)).toBeGreaterThan(0);
    expect(stepUntil(game, (one) => one.variable('touching') === false)).toBeGreaterThan(0);
  });
});

describe('rules about tiles', () => {
  it('loses a life on spikes and restarts the level', () => {
    const game = makeGame({
      variables: [{ id: 'lives', type: 'number', initial: 3 }],
      rows: ['..........', '..........', '..........', '..........', '....^.....', '##########'],
      events: [
        {
          id: 'hurt',
          when: { type: 'touches-tile', subject: 'player', tag: 'hazard' },
          then: [
            { type: 'change-variable', variable: 'lives', operator: 'subtract', value: 1 },
            { type: 'restart-scene' },
          ],
        },
      ],
    });

    steps(game, 60);
    game.input.press('right');
    expect(stepUntil(game, (one) => one.variable('lives') === 2)).toBeGreaterThan(0);
    game.input.release('right');
    game.step();

    expect(player(game).x).toBe(32);
    expect(game.world.steps).toBeLessThan(3);
  });
});

describe('actions', () => {
  it('waits without stopping the game', () => {
    const game = makeGame({
      events: [
        {
          id: 'sequence',
          when: { type: 'scene-starts' },
          then: [
            { type: 'set-variable', variable: 'score', value: 1 },
            { type: 'wait', seconds: 0.5 },
            { type: 'set-variable', variable: 'score', value: 2 },
          ],
        },
      ],
    });

    steps(game, 10);
    expect(game.variable('score')).toBe(1);
    // The player is still falling while the rule waits.
    expect(player(game).y).toBeGreaterThan(0);
    steps(game, 30);
    expect(game.variable('score')).toBe(2);
  });

  it('creates something next to another entity', () => {
    const game = makeGame({
      prototypes: PLAYER,
      events: [
        {
          id: 'drop',
          when: { type: 'scene-starts' },
          then: [{ type: 'spawn', entity: 'coin', x: 0, y: -20, relativeTo: 'player' }],
        },
      ],
    });

    game.step();
    const coin = game.world.entities.find((one) => one.prototypeId === 'coin');
    expect(coin).toBeDefined();
    expect(coin?.x).toBe(32);
  });

  it('turns another rule off', () => {
    const game = makeGame({
      events: [
        {
          id: 'stop-counting',
          when: { type: 'scene-starts' },
          then: [{ type: 'disable-rule', rule: 'count' }],
        },
        {
          id: 'count',
          when: { type: 'every-frame' },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    steps(game, 10);
    expect(game.variable('score')).toBe(0);
  });
});

describe('triggers', () => {
  it('fires on a timer, the right number of times', () => {
    const game = makeGame({
      events: [
        {
          id: 'tick',
          when: { type: 'every-seconds', seconds: 0.5 },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    // Two ticks by 1.2 seconds; the third is not due until 1.5.
    steps(game, 72);
    expect(game.variable('score')).toBe(2);
  });

  it('runs a rule marked once exactly once', () => {
    const game = makeGame({
      events: [
        {
          id: 'only-once',
          once: true,
          when: { type: 'every-frame' },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    steps(game, 20);
    expect(game.variable('score')).toBe(1);
  });

  it('reacts to a click on an entity', () => {
    const game = makeGame({
      events: [
        {
          id: 'poke',
          when: { type: 'clicked', subject: 'player' },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    steps(game, 60);
    game.click(38, 70);
    game.step();

    expect(game.variable('score')).toBe(1);
  });

  it('only offers ground questions a real answer when the entity is grounded', () => {
    const game = makeGame({
      events: [
        {
          id: 'count-grounded',
          when: { type: 'every-frame' },
          if: [{ type: 'is-on-ground', target: 'player' }],
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    steps(game, 10);
    expect(game.variable('score')).toBe(0);
    steps(game, 60);
    expect(game.variable('score')).toBeGreaterThan(0);
  });
});

describe('scenes', () => {
  const twoScenes: ProjectInput['scenes'] = [
    {
      id: 'level-1',
      tileSize: 16,
      size: { columns: 10, rows: 6 },
      layers: [
        {
          id: 'ground',
          tileset: 'ground',
          collides: true,
          legend: { '.': null, '#': 0 },
          rows: [
            '..........',
            '..........',
            '..........',
            '..........',
            '..........',
            '##########',
          ],
        },
      ],
      entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 0 }],
      events: [
        {
          id: 'next',
          when: { type: 'scene-starts' },
          then: [
            { type: 'change-variable', variable: 'score', value: 5 },
            { type: 'go-to-scene', scene: 'level-2' },
          ],
        },
      ],
    },
    {
      id: 'level-2',
      tileSize: 16,
      size: { columns: 10, rows: 6 },
      entities: [{ id: 'player-1', prototype: 'player', x: 16, y: 0 }],
    },
  ];

  it('moves to another level and keeps the score', () => {
    const game = makeGame({ scenes: twoScenes });
    steps(game, 2);

    expect(game.world.scene.id).toBe('level-2');
    expect(game.variable('score')).toBe(5);
    expect(player(game).x).toBe(16);
  });
});

describe('the camera', () => {
  it('holds still while the target stays in the dead zone, then follows', () => {
    const wide: ProjectInput['scenes'] = [
      {
        id: 'level-1',
        tileSize: 16,
        size: { columns: 30, rows: 6 },
        layers: [
          {
            id: 'ground',
            tileset: 'ground',
            collides: true,
            legend: { '.': null, '#': 0 },
            rows: [
              '.'.repeat(30),
              '.'.repeat(30),
              '.'.repeat(30),
              '.'.repeat(30),
              '.'.repeat(30),
              '#'.repeat(30),
            ],
          },
        ],
        entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 0 }],
        camera: {
          mode: 'follow',
          target: 'player-1',
          deadZone: { width: 32, height: 24 },
          smoothing: 0,
        },
      },
    ];

    const game = makeGame({ scenes: wide });
    steps(game, 60);
    expect(game.world.camera.x).toBe(0);

    game.input.press('right');
    // The dead zone's right edge sits at x = 96 with the camera at 0.
    stepUntil(game, (one) => player(one).x + 6 > 96);
    game.step();
    expect(game.world.camera.x).toBeGreaterThan(0);
  });
});

describe('two rules about the same collision', () => {
  /**
   * The pattern every platformer needs: landing on an enemy squashes it, and
   * walking into one hurts. Both rules watch the same collision and are told
   * apart by whether the player is falling, so the first rule must not be able
   * to make the second one true by changing the player as it runs.
   */
  const rules: NonNullable<ProjectInput['scenes'][number]['events']> = [
    {
      id: 'stomp',
      when: { type: 'collides', subject: 'player', with: 'tag:enemy' },
      if: [{ type: 'is-falling', target: '$self' }],
      then: [
        { type: 'destroy', target: '$other' },
        { type: 'jump', target: '$self', height: 28 },
        { type: 'change-variable', variable: 'score', value: 2 },
      ],
    },
    {
      id: 'hurt',
      when: { type: 'collides', subject: 'player', with: 'tag:enemy' },
      if: [{ type: 'is-falling', target: '$self', negate: true }],
      then: [{ type: 'change-variable', variable: 'lives', operator: 'subtract', value: 1 }],
    },
  ];

  const withEnemy = (playerY: number) =>
    makeGame({
      variables: [
        { id: 'score', type: 'number', initial: 0 },
        { id: 'lives', type: 'number', initial: 3 },
      ],
      prototypes: [
        ...PLAYER,
        {
          id: 'slime',
          size: { width: 12, height: 12 },
          tags: ['enemy'],
          components: {
            collider: {},
            movement: { mode: 'platform', controlledBy: 'rules', jumpHeight: 0 },
          },
        },
      ],
      entities: [
        { id: 'player-1', prototype: 'player', x: 60, y: playerY },
        { id: 'slime-1', prototype: 'slime', x: 60, y: 68 },
      ],
      events: rules,
    });

  it('squashes the enemy without also hurting the player', () => {
    const game = withEnemy(0);
    stepUntil(game, (one) => one.variable('score') === 2);

    expect(game.variable('score')).toBe(2);
    expect(game.variable('lives')).toBe(3);
    expect(game.world.entities.filter((one) => one.prototypeId === 'slime')).toHaveLength(0);
  });

  it('still hurts the player who walks into an enemy', () => {
    const game = withEnemy(64);
    stepUntil(game, (one) => one.variable('lives') === 2, 120);

    expect(game.variable('lives')).toBe(2);
    expect(game.variable('score')).toBe(0);
  });
});
