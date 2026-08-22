import { describe, expect, it } from 'vitest';
import type { ProjectInput } from '@pinforge/schema';
import { makeGame, player, steps, stepUntil, type WorldOptions } from './helpers.js';

/**
 * One test per thing three Godot developers found they could not build, each
 * written as the story they were actually trying to tell rather than as a unit
 * of the mechanism underneath. If one of these breaks, a real game breaks with
 * it.
 */

const HAZARD_FLOOR = [
  '..........',
  '..........',
  '..........',
  '..........',
  '..^^^^....',
  '##########',
];

describe('a moment of being hurt, and not hurt again straight away', () => {
  /**
   * The platformer playtester called this arguably the core feel of the genre,
   * and paid for it with four always-on rules and three hand-written
   * properties, because nothing in the engine could count anything down.
   */
  const hero: NonNullable<ProjectInput['entities']> = [
    {
      id: 'player',
      size: { width: 12, height: 16 },
      tags: ['player'],
      properties: [{ id: 'hurt-for', type: 'number', initial: 0, countsDown: true }],
      components: { collider: {}, movement: { mode: 'platform' } },
    },
  ];

  const spikes = () =>
    makeGame({
      rows: HAZARD_FLOOR,
      prototypes: hero,
      entities: [{ id: 'player-1', prototype: 'player', x: 40, y: 64 }],
      variables: [{ id: 'hearts', type: 'number', initial: 10 }],
      events: [
        {
          id: 'hurt',
          when: { type: 'touches-tile', subject: 'player', tag: 'hazard' },
          if: [
            {
              type: 'property-is',
              target: '$self',
              property: 'hurt-for',
              operator: 'at-most',
              value: 0,
            },
          ],
          then: [
            { type: 'change-variable', variable: 'hearts', operator: 'subtract', value: 1 },
            { type: 'set-property', target: '$self', property: 'hurt-for', value: 1 },
          ],
        },
      ],
    });

  it('costs one heart a second on the spikes, not one a step', () => {
    const game = spikes();
    // Three seconds standing in it, so three hearts: the first step, and then
    // one each time the second of grace runs out. Touching a tile is reported
    // every step, so without the countdown this would have cost 180 hearts.
    steps(game, 180);

    expect(game.variable('hearts')).toBe(7);
  });

  it('counts itself down without setting off "when a variable changes"', () => {
    const game = makeGame({
      variables: [
        { id: 'time-left', type: 'number', initial: 2, countsDown: true },
        { id: 'ticks', type: 'number', initial: 0 },
      ],
      events: [
        {
          id: 'noticed',
          when: { type: 'variable-changes', variable: 'time-left' },
          then: [{ type: 'change-variable', variable: 'ticks', value: 1 }],
        },
      ],
    });

    steps(game, 60);
    expect(Number(game.variable('time-left'))).toBeCloseTo(1, 5);
    steps(game, 120);
    // Clamped at zero rather than running into negative numbers.
    expect(game.variable('time-left')).toBe(0);
    // A clock ticking is the engine's own bookkeeping, not something writing
    // to a variable, or every rule watching it would fire sixty times a second.
    expect(game.variable('ticks')).toBe(0);
  });
});

describe("showing a boss's health on screen", () => {
  it('copies a property out to where a text entity can read it', () => {
    // Text only ever puts a variable on screen, so before this there was no
    // way at all to show what one entity was carrying.
    const game = makeGame({
      variables: [{ id: 'boss-health', type: 'number', initial: 0 }],
      prototypes: [
        {
          id: 'player',
          size: { width: 12, height: 16 },
          tags: ['player'],
          components: { collider: {}, movement: { mode: 'platform' } },
        },
        {
          id: 'boss',
          size: { width: 24, height: 24 },
          tags: ['enemy'],
          properties: [{ id: 'hits-left', type: 'number', initial: 3 }],
          components: { collider: { kind: 'trigger' } },
        },
      ],
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 64 },
        { id: 'boss-1', prototype: 'boss', x: 120, y: 56 },
      ],
      events: [
        {
          id: 'show-it',
          when: { type: 'every-frame' },
          then: [
            { type: 'copy-property', from: 'boss', property: 'hits-left', into: 'boss-health' },
          ],
        },
        {
          id: 'wound-it',
          when: { type: 'scene-starts' },
          then: [
            {
              type: 'change-property',
              target: 'boss',
              property: 'hits-left',
              operator: 'subtract',
              value: 1,
            },
          ],
        },
      ],
    });

    steps(game, 3);
    expect(game.variable('boss-health')).toBe(2);
  });
});

describe('an enemy that comes after the player', () => {
  it('turns towards whichever side the player is on', () => {
    // Nothing in the vocabulary could read a coordinate, so the shoot-em-up
    // playtester gave up on aiming entirely and shipped fixed patterns.
    const chase = (playerX: number) =>
      makeGame({
        prototypes: [
          {
            id: 'player',
            size: { width: 12, height: 16 },
            tags: ['player'],
            components: { collider: {}, movement: { mode: 'platform' } },
          },
          {
            id: 'hunter',
            size: { width: 12, height: 12 },
            tags: ['enemy'],
            components: {
              collider: { kind: 'trigger', collidesWithTiles: false },
              movement: { mode: 'free', controlledBy: 'rules', maxSpeed: 40, acceleration: 0 },
            },
          },
        ],
        entities: [
          { id: 'player-1', prototype: 'player', x: playerX, y: 64 },
          { id: 'hunter-1', prototype: 'hunter', x: 80, y: 40 },
        ],
        events: [
          {
            id: 'go-left',
            when: { type: 'every-frame' },
            if: [{ type: 'position-compare', subject: 'hunter', side: 'right', of: 'player' }],
            then: [{ type: 'move', target: 'hunter', x: -40 }],
          },
          {
            id: 'go-right',
            when: { type: 'every-frame' },
            if: [{ type: 'position-compare', subject: 'hunter', side: 'left', of: 'player' }],
            then: [{ type: 'move', target: 'hunter', x: 40 }],
          },
        ],
      });

    const hunter = (game: ReturnType<typeof makeGame>) =>
      game.world.entities.find((one) => one.prototypeId === 'hunter')!;

    const towardsLeft = chase(16);
    steps(towardsLeft, 30);
    expect(hunter(towardsLeft).x).toBeLessThan(80);

    const towardsRight = chase(144);
    steps(towardsRight, 30);
    expect(hunter(towardsRight).x).toBeGreaterThan(80);
  });
});

describe('a top-down guard that walks back and forth by itself', () => {
  /**
   * Platform movement has had this behind one checkbox all along. Without it
   * for free movement, the top-down playtester spent four invisible entities
   * and six rules on two guards.
   */
  const room = ['##########', '#........#', '#........#', '#........#', '#........#', '##########'];

  const guard = (direction: 'left' | 'up'): NonNullable<ProjectInput['entities']> => [
    {
      id: 'guard',
      size: { width: 12, height: 12 },
      tags: ['enemy'],
      components: {
        collider: {},
        movement: {
          mode: 'free',
          controlledBy: 'rules',
          maxSpeed: 40,
          acceleration: 0,
          axes: direction === 'up' ? 'vertical' : 'horizontal',
          patrol: { direction },
        },
      },
    },
  ];

  it('turns around at a wall, across and down, with no rules at all', () => {
    for (const direction of ['left', 'up'] as const) {
      const game = makeGame({
        rows: room,
        prototypes: guard(direction),
        entities: [{ id: 'guard-1', prototype: 'guard', x: 50, y: 50 }],
        events: [],
      });
      const it = () => game.world.entities[0]!;

      const seen = new Set<number>();
      for (let step = 0; step < 600; step += 1) {
        game.step();
        seen.add(it().patrolDirection);
        // Inside the walls: 16 to 144 across, 16 to 80 down, less its own size.
        // Collision treats anything within a micro-pixel of a tile edge as
        // touching rather than inside it, so that is the tolerance here too.
        const slack = 0.001;
        expect(it().x).toBeGreaterThanOrEqual(16 - slack);
        expect(it().x).toBeLessThanOrEqual(144 - 12 + slack);
        expect(it().y).toBeGreaterThanOrEqual(16 - slack);
        expect(it().y).toBeLessThanOrEqual(80 - 12 + slack);
      }
      // It really did go both ways, rather than sitting still against a wall.
      expect(seen, `patrolling ${direction}`).toEqual(new Set([1, -1]));
    }
  });
});

describe('a wave of enemies that does not arrive in a line', () => {
  const dropper = (spreadX: number): WorldOptions => ({
    prototypes: [
      {
        id: 'player',
        size: { width: 12, height: 16 },
        tags: ['player'],
        components: { collider: {}, movement: { mode: 'platform' } },
      },
      {
        id: 'drone',
        size: { width: 8, height: 8 },
        tags: ['enemy'],
        components: { collider: { kind: 'trigger', collidesWithTiles: false } },
      },
    ],
    entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 64 }],
    events: [
      {
        id: 'wave',
        when: { type: 'every-frame' },
        then: [{ type: 'spawn', entity: 'drone', x: 80, y: 8, spreadX }],
      },
    ],
  });

  it('scatters them, instead of needing one rule per lane', () => {
    // Faking this with a lane per spot cost the shoot-em-up playtester sixteen
    // near-identical rules.
    const game = makeGame(dropper(60));
    steps(game, 20);

    const spots = game.world.entities
      .filter((one) => one.prototypeId === 'drone')
      .map((one) => one.x);
    expect(spots.length).toBeGreaterThan(10);
    expect(new Set(spots).size).toBeGreaterThan(5);
    for (const x of spots) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(140);
    }
  });

  it('scatters them the same way twice, because the game stays reproducible', () => {
    const first = makeGame({ ...dropper(60), seed: 5 });
    const second = makeGame({ ...dropper(60), seed: 5 });
    steps(first, 20);
    steps(second, 20);

    const spots = (game: ReturnType<typeof makeGame>) =>
      game.world.entities.filter((one) => one.prototypeId === 'drone').map((one) => one.x);
    expect(spots(first)).toEqual(spots(second));
  });
});

describe('a locked door', () => {
  /**
   * A solid tile can never be *touched*, because being solid is exactly what
   * keeps anything out of its cell. The top-down playtester proved it by
   * leaning on the door for six hundred steps and getting nothing, then spent
   * two invisible sensor entities per door working around it.
   */
  const doorway = [
    '..........',
    '..........',
    '..........',
    '..........',
    '.....D....',
    '##########',
  ];

  const game = () =>
    makeGame({
      rows: doorway,
      tilesets: [
        {
          id: 'ground',
          image: 'tiles',
          tileWidth: 16,
          tileHeight: 16,
          tiles: [
            { index: 0, tags: ['solid'] },
            { index: 3, tags: ['solid', 'door'] },
          ],
        },
      ],
      scenes: [
        {
          id: 'level-1',
          tileSize: 16,
          size: { columns: 10, rows: 6 },
          layers: [
            {
              id: 'ground',
              tileset: 'ground',
              collides: true,
              legend: { '.': null, '#': 0, D: 3 },
              rows: doorway,
            },
          ],
          entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 64 }],
          camera: { mode: 'fixed' },
          events: [
            {
              id: 'open-it',
              when: { type: 'blocked-by-tile', subject: 'player', tag: 'door' },
              if: [{ type: 'variable-is', variable: 'score', operator: 'at-least', value: 1 }],
              then: [{ type: 'set-tile', layer: 'ground', column: 5, row: 4, tile: null }],
            },
          ],
        },
      ],
    });

  it('stays shut while the player has no key, and notices them at it', () => {
    const shut = game();
    steps(shut, 60);
    shut.input.press('right');
    steps(shut, 120);

    // Stopped one pixel short of the door's column, which is at x = 80.
    expect(player(shut).x).toBe(68);
    expect(shut.world.map.isSolid(5, 4)).toBe(true);
  });

  it('opens once the player has the key, and lets them through', () => {
    const opened = game();
    steps(opened, 60);
    opened.setVariable('score', 1);
    opened.input.press('right');

    expect(stepUntil(opened, (one) => !one.world.map.isSolid(5, 4), 300)).toBeGreaterThan(-1);
    steps(opened, 90);
    expect(player(opened).x).toBeGreaterThan(80);
  });
});

describe('a checkpoint, built out of what the engine already has', () => {
  /**
   * The platformer playtester reported this as "not a feature": restarting the
   * level is all or nothing, so a checkpoint meant hardcoded coordinates, and
   * respawning gave no grace, which they found by having a patrolling enemy
   * hit the player on the very step they came back.
   *
   * No new vocabulary was added for it. This is the recipe, and it is a test so
   * that it stays true.
   */
  it('puts the player back at the flag with their score, their hearts and a moment of grace', () => {
    const game = makeGame({
      rows: HAZARD_FLOOR,
      variables: [
        { id: 'hearts', type: 'number', initial: 1 },
        { id: 'score', type: 'number', initial: 40 },
      ],
      prototypes: [
        {
          id: 'player',
          size: { width: 12, height: 16 },
          tags: ['player'],
          properties: [{ id: 'safe-for', type: 'number', initial: 0, countsDown: true }],
          components: { collider: {}, movement: { mode: 'platform' } },
        },
        {
          id: 'flag',
          size: { width: 8, height: 16 },
          tags: ['checkpoint'],
          components: { collider: { kind: 'trigger', collidesWithTiles: false } },
        },
      ],
      entities: [
        { id: 'player-1', prototype: 'player', x: 40, y: 64 },
        // The flag stands well clear of the spikes.
        { id: 'flag-1', prototype: 'flag', x: 130, y: 64 },
      ],
      events: [
        {
          id: 'hurt',
          when: { type: 'touches-tile', subject: 'player', tag: 'hazard' },
          if: [
            {
              type: 'property-is',
              target: '$self',
              property: 'safe-for',
              operator: 'at-most',
              value: 0,
            },
          ],
          then: [
            { type: 'change-variable', variable: 'hearts', operator: 'subtract', value: 1 },
            { type: 'set-property', target: '$self', property: 'safe-for', value: 1 },
          ],
        },
        {
          id: 'back-to-the-flag',
          when: { type: 'variable-changes', variable: 'hearts' },
          if: [{ type: 'variable-is', variable: 'hearts', operator: 'at-most', value: 0 }],
          then: [
            // Measured from the flag rather than typed in as coordinates.
            { type: 'teleport', target: 'player', x: 0, y: 0, relativeTo: 'flag-1' },
            { type: 'set-variable', variable: 'hearts', value: 3 },
            { type: 'set-property', target: 'player', property: 'safe-for', value: 1 },
          ],
        },
      ],
    });

    steps(game, 10);

    // Back at the flag, not at the start of the level, which is only possible
    // because the last heart really was lost.
    expect(player(game).x).not.toBe(40);
    expect(player(game).x).toBe(130);
    expect(game.variable('hearts')).toBe(3);
    // The score is a variable, so it was never in danger.
    expect(game.variable('score')).toBe(40);
    // And it came back safe, so anything sitting on the spot cannot take the
    // three hearts straight back off it.
    expect(Number(player(game).properties.get('safe-for'))).toBeGreaterThan(0);
  });
});
