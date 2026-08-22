import { describe, expect, it } from 'vitest';
import type { ProjectInput } from '@pinforge/schema';
import { FLOOR_ROWS, makeGame, player, steps, stepUntil, type WorldOptions } from './helpers.js';

/**
 * One test per bug that has been fixed, so none of them can come back. Each
 * describes the wrong behaviour it guards against, not just the right one.
 */

function platformPlayer(
  movement: Record<string, unknown> = {},
): NonNullable<ProjectInput['entities']> {
  return [
    {
      id: 'player',
      size: { width: 12, height: 16 },
      tags: ['player'],
      components: { collider: {}, movement: { mode: 'platform', ...movement } },
    },
  ];
}

describe('one-way platforms', () => {
  const rows = ['..........', '..........', '..........', '..===.....', '..........', '##########'];
  // The player starts under the platform, standing on the ground, so a full
  // jump carries it up through the platform from below.
  const below = [{ id: 'player-1', prototype: 'player', x: 32, y: 64 }];

  it('does not report a landing while rising up through one', () => {
    // The wrong behaviour: while the player's feet passed through the platform
    // on the way up, the ground check saw the one-way tile under them and
    // reported a landing in mid air, resetting coyote time and the double jump.
    const game = makeGame({ rows, entities: below });
    steps(game, 60);
    game.input.press('jump');

    for (let index = 0; index < 90; index += 1) {
      game.step();
      const entity = player(game);
      if (entity.velocityY < 0) {
        expect(entity.landed).toBe(false);
        expect(entity.onGround).toBe(false);
      }
    }
  });

  it('does not hand back coyote time while rising up through one', () => {
    const game = makeGame({ rows, entities: below });
    steps(game, 60);
    game.input.press('jump');

    // Taking off spent the coyote time, and mid air is not the ground, so no
    // step of the rise may hand any of it back.
    for (let index = 0; index < 90; index += 1) {
      game.step();
      if (player(game).velocityY < 0) expect(player(game).coyoteLeft).toBe(0);
    }
  });

  it('still lands on top of one and stands there', () => {
    const game = makeGame({ rows, entities: below });
    steps(game, 60);
    game.input.press('jump');

    expect(
      stepUntil(game, (one) => player(one).onGround && player(one).y === 32, 300),
    ).toBeGreaterThan(0);
    steps(game, 60);
    expect(player(game).y).toBe(32);
  });
});

describe('jump settings at their edges', () => {
  it('still jumps when the jump buffer is set to zero', () => {
    // The wrong behaviour: the buffer was counted down before it was read, so
    // a buffer of zero seconds threw the press away and jumping never worked.
    const game = makeGame({ prototypes: platformPlayer({ jumpBufferTime: 0 }) });
    steps(game, 60);
    expect(player(game).onGround).toBe(true);

    game.input.press('jump');
    game.step();
    expect(player(game).velocityY).toBeLessThan(0);
  });

  it('never jumps when the jump count is zero', () => {
    const game = makeGame({ prototypes: platformPlayer({ jumpCount: 0 }) });
    steps(game, 60);
    game.input.press('jump');
    steps(game, 5);

    expect(player(game).velocityY).toBeGreaterThanOrEqual(0);
    expect(player(game).onGround).toBe(true);
  });
});

describe('feeding time in', () => {
  it('ignores time running backwards', () => {
    // The wrong behaviour: a negative frame time was added to the accumulator,
    // which then had to climb back above zero before anything moved again.
    const game = makeGame();
    game.advance(-5);
    game.advance(6 / 60);

    expect(game.world.steps).toBe(6);
  });
});

describe('clicking', () => {
  it('hits what is drawn even while the camera shakes', () => {
    const game = makeGame({
      variables: [{ id: 'hits', type: 'number', initial: 0 }],
      events: [
        {
          id: 'count',
          when: { type: 'clicked', subject: 'player' },
          then: [{ type: 'change-variable', variable: 'hits', value: 1 }],
        },
      ],
    });
    steps(game, 60);

    // The renderer draws at camera.x + camera.offsetX, so clicking must map
    // back through both. The player rests at (32, 64), 12 by 16 pixels.
    game.world.camera.x = 10;
    game.world.camera.offsetX = 4;
    game.world.camera.offsetY = -2;
    game.click(32 - 14, 64 + 2);
    game.step();

    expect(game.variable('hits')).toBe(1);
  });
});

describe('repeating timers', () => {
  it('fires a tiny interval at most once per step instead of freezing', () => {
    // The wrong behaviour: an interval far below one step meant millions of
    // firings had become due every step, and the game locked up counting them.
    const game = makeGame({
      events: [
        {
          id: 'tick',
          when: { type: 'every-seconds', seconds: 0.000001 },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });
    steps(game, 3);

    expect(game.variable('score')).toBeLessThanOrEqual(3);
    expect(game.variable('score')).toBeGreaterThan(0);
  });
});

/**
 * Everything about an entity that has just stopped existing. These four bugs
 * were one bug wearing four coats: the engine could not decide whether
 * something removed was still addressable, and answered differently in every
 * place it was asked.
 */
describe('something that has just been removed', () => {
  const PAIR: NonNullable<ProjectInput['entities']> = [
    {
      id: 'player',
      size: { width: 12, height: 16 },
      tags: ['player'],
      components: { collider: {}, movement: { mode: 'platform' } },
    },
    {
      id: 'slime',
      size: { width: 12, height: 12 },
      tags: ['enemy'],
      components: { collider: { kind: 'trigger' } },
    },
    {
      id: 'coin',
      size: { width: 8, height: 8 },
      tags: ['pickup'],
      components: { collider: { kind: 'trigger' } },
    },
  ];

  /** A player standing on the floor with a slime already touching it. */
  const touching = [
    { id: 'player-1', prototype: 'player', x: 100, y: 64 },
    { id: 'slime-1', prototype: 'slime', x: 104, y: 68 },
  ];

  it('sets off "when something is removed"', () => {
    // The wrong behaviour: the trigger was documented, offered in the editor
    // and in PinScript, and could never fire once, because the guard that
    // skips a rule about a removed entity skipped every one of its firings.
    const game = makeGame({
      variables: [{ id: 'score', type: 'number', initial: 0 }],
      prototypes: PAIR,
      entities: touching,
      events: [
        {
          id: 'take',
          when: { type: 'collides', subject: 'player', with: 'slime' },
          then: [{ type: 'destroy', target: '$other' }],
        },
        {
          id: 'mourn',
          when: { type: 'entity-destroyed', subject: 'slime' },
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    expect(stepUntil(game, (one) => one.variable('score') === 1, 60)).toBeGreaterThan(-1);
  });

  it('can still say where it was, whichever order the actions are in', () => {
    // The wrong behaviour: $other stopped resolving the moment it was
    // destroyed, so "remove the enemy, then drop a coin where it was" dropped
    // the coin at the top left corner of the level. Silently, and only when
    // the two actions were written in that order.
    const drop = (first: 'destroy' | 'spawn') =>
      makeGame({
        prototypes: PAIR,
        entities: touching,
        events: [
          {
            id: 'squash',
            when: { type: 'collides', subject: 'player', with: 'slime' },
            then:
              first === 'destroy'
                ? [
                    { type: 'destroy', target: '$other' },
                    { type: 'spawn', entity: 'coin', x: 0, y: -8, relativeTo: '$other' },
                  ]
                : [
                    { type: 'spawn', entity: 'coin', x: 0, y: -8, relativeTo: '$other' },
                    { type: 'destroy', target: '$other' },
                  ],
          },
        ],
      });

    for (const order of ['destroy', 'spawn'] as const) {
      const game = drop(order);
      steps(game, 10);
      const coin = game.world.entities.find((one) => one.prototypeId === 'coin');
      expect(coin, `${order} first: no coin was dropped`).toBeDefined();
      // The slime stood at x = 104, y = 68.
      expect(coin?.x, `${order} first`).toBe(104);
      expect(coin?.y, `${order} first`).toBe(60);
    }
  });

  it('does not claim to still exist', () => {
    const game = makeGame({
      variables: [{ id: 'score', type: 'number', initial: 0 }],
      prototypes: PAIR,
      entities: touching,
      events: [
        {
          id: 'squash',
          when: { type: 'collides', subject: 'player', with: 'slime' },
          then: [{ type: 'destroy', target: '$other' }],
        },
        {
          id: 'gone',
          when: { type: 'entity-destroyed', subject: 'slime' },
          // Reading where it was must work; asking whether it is still there
          // must answer no.
          if: [{ type: 'entity-exists', entity: '$self', negate: true }],
          then: [{ type: 'change-variable', variable: 'score', value: 1 }],
        },
      ],
    });

    expect(stepUntil(game, (one) => one.variable('score') === 1, 60)).toBeGreaterThan(-1);
  });

  it('ends the overlap it was part of', () => {
    // The wrong behaviour: a rule tracking "am I standing in the fire" with a
    // pair of collides and collision-ends rules stayed stuck on yes forever
    // once the fire was removed, because the ending was never reported.
    const game = makeGame({
      variables: [{ id: 'touching', type: 'boolean', initial: false }],
      prototypes: PAIR,
      entities: touching,
      events: [
        {
          id: 'on',
          when: { type: 'collides', subject: 'player', with: 'slime' },
          then: [
            { type: 'set-variable', variable: 'touching', value: true },
            { type: 'destroy', target: '$other' },
          ],
        },
        {
          id: 'off',
          when: { type: 'collision-ends', subject: 'player', with: 'slime' },
          then: [{ type: 'set-variable', variable: 'touching', value: false }],
        },
      ],
    });

    expect(stepUntil(game, (one) => one.variable('touching') === true, 60)).toBeGreaterThan(-1);
    expect(stepUntil(game, (one) => one.variable('touching') === false, 60)).toBeGreaterThan(-1);
  });
});

describe('turning a rule off', () => {
  const ticker = (id: string) => ({
    id,
    when: { type: 'every-frame' } as const,
    then: [{ type: 'change-variable' as const, variable: 'score', value: 1 }],
  });

  /** Two levels, so a rule can be watched across a change of scene. */
  const twoLevels = (events: NonNullable<ProjectInput['scenes'][number]['events']>) =>
    [1, 2].map((number) => ({
      id: `level-${number}`,
      tileSize: 16,
      size: { columns: 10, rows: 6 },
      layers: [
        {
          id: 'ground',
          tileset: 'ground',
          collides: true,
          legend: { '.': null, '#': 0 },
          rows: FLOOR_ROWS,
        },
      ],
      entities: [{ id: `player-${number}`, prototype: 'player', x: 32, y: 0 }],
      camera: { mode: 'fixed' as const },
      events: number === 1 ? events : [],
    }));

  it('keeps a rule for the whole game switched off across a restart', () => {
    // The wrong behaviour: every off switch lived on the level being played, so
    // losing a life and starting again brought back the rule the game had
    // just turned off.
    const game = makeGame({
      globalEvents: [ticker('ticker')],
      events: [
        {
          id: 'silence',
          when: { type: 'scene-starts' },
          then: [{ type: 'disable-rule', rule: 'ticker' }],
        },
      ],
    });

    steps(game, 5);
    const stopped = game.variable('score');
    game.restartScene();
    steps(game, 10);
    expect(game.variable('score')).toBe(stopped);
  });

  it('keeps a rule for the whole game switched off across a change of level', () => {
    const game = makeGame({
      globalEvents: [ticker('ticker')],
      scenes: twoLevels([
        {
          id: 'silence',
          when: { type: 'scene-starts' },
          then: [{ type: 'disable-rule', rule: 'ticker' }],
        },
      ]),
    });

    steps(game, 5);
    const stopped = game.variable('score');
    game.goToScene('level-2');
    steps(game, 10);
    expect(game.variable('score')).toBe(stopped);
  });

  it("brings a level's own rule back with the level, like once only does", () => {
    const game = makeGame({
      events: [
        ticker('ticker'),
        {
          id: 'silence',
          when: { type: 'every-seconds', seconds: 0.05 },
          then: [{ type: 'disable-rule', rule: 'ticker' }],
        },
      ],
    });

    steps(game, 10);
    const stopped = game.variable('score');
    game.restartScene();
    // The first step carries the change of level out and runs no rules; the
    // level is only really running on the one after it.
    steps(game, 2);
    // The level came back, and so did its own rule, for at least one step
    // before the level switched it off again.
    expect(Number(game.variable('score'))).toBeGreaterThan(Number(stopped));
  });
});

describe('leaving the level', () => {
  /** A scene with no floor at all, so the player simply falls out of it. */
  const bottomless = Array(6).fill('.'.repeat(10));

  it('costs one life per fall, not one per step spent outside', () => {
    // The wrong behaviour: the trigger fired on every step the entity was
    // outside, so a single fall took sixty-odd lives a second. The example
    // game only survived it by restarting the level in the same rule.
    const game = makeGame({
      rows: bottomless,
      variables: [{ id: 'lives', type: 'number', initial: 3 }],
      events: [
        {
          id: 'fell',
          when: { type: 'leaves-scene', subject: 'player', edge: 'bottom' },
          then: [{ type: 'change-variable', variable: 'lives', operator: 'subtract', value: 1 }],
        },
      ],
    });

    steps(game, 120);
    expect(game.variable('lives')).toBe(2);
  });

  it('fires again when the entity comes back and leaves once more', () => {
    const game = makeGame({
      rows: bottomless,
      variables: [{ id: 'lives', type: 'number', initial: 3 }],
      events: [
        {
          id: 'fell',
          when: { type: 'leaves-scene', subject: 'player', edge: 'bottom' },
          then: [{ type: 'change-variable', variable: 'lives', operator: 'subtract', value: 1 }],
        },
      ],
    });

    steps(game, 120);
    expect(game.variable('lives')).toBe(2);

    // Put it back inside and let it fall out a second time.
    const entity = player(game);
    entity.y = 0;
    entity.previousY = 0;
    entity.velocityY = 0;
    steps(game, 120);
    expect(game.variable('lives')).toBe(1);
  });
});

describe('waiting, when the level changes underneath', () => {
  /** Two levels, so something can change the level while a rule is waiting. */
  const rooms = (events: NonNullable<WorldOptions['events']>) =>
    [1, 2].map((number) => ({
      id: `level-${number}`,
      tileSize: 16,
      size: { columns: 10, rows: 6 },
      layers: [
        {
          id: 'ground',
          tileset: 'ground',
          collides: true,
          legend: { '.': null, '#': 0 },
          rows: FLOOR_ROWS,
        },
      ],
      entities: [{ id: `player-${number}`, prototype: 'player', x: 32, y: 64 }],
      camera: { mode: 'fixed' as const },
      events: number === 1 ? events : [],
    }));

  it('finishes the rest of the rule even so', () => {
    // The wrong behaviour: changing the level threw away every rule that was
    // part way through a wait, from any rule, without a word. So the shape the
    // documentation itself teaches for losing a game — say something, wait,
    // then put the score and the lives back — silently did nothing whenever
    // anything else changed the level inside that pause.
    const game = makeGame({
      variables: [{ id: 'hearts', type: 'number', initial: 0 }],
      scenes: rooms([
        {
          id: 'game-over',
          when: { type: 'scene-starts' },
          then: [
            { type: 'show-message', text: 'You ran out of hearts', seconds: 3 },
            { type: 'wait', seconds: 1 },
            { type: 'set-variable', variable: 'hearts', value: 3 },
          ],
        },
      ]),
    });

    game.step();
    expect(game.variable('hearts')).toBe(0);
    game.goToScene('level-2');
    steps(game, 120);

    expect(game.world.scene.id).toBe('level-2');
    expect(game.variable('hearts')).toBe(3);
  });

  it('lets go of the entities it was about, rather than reaching into the level it left', () => {
    const game = makeGame({
      variables: [{ id: 'hearts', type: 'number', initial: 0 }],
      prototypes: [
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
      ],
      scenes: rooms([
        {
          id: 'late-spawn',
          when: { type: 'scene-starts' },
          then: [
            { type: 'wait', seconds: 0.2 },
            // $self means nothing here, so this must land nowhere rather than
            // at a position measured in a level that no longer exists.
            { type: 'spawn', entity: 'coin', x: 0, y: 0, relativeTo: '$self' },
            { type: 'set-variable', variable: 'hearts', value: 3 },
          ],
        },
      ]),
    });

    game.step();
    game.goToScene('level-2');
    steps(game, 60);

    // The rest of the rule ran...
    expect(game.variable('hearts')).toBe(3);
    // ...and the action that needed an entity quietly did nothing.
    expect(game.world.entities.filter((one) => one.prototypeId === 'coin')).toHaveLength(0);
  });
});

describe('placing something next to something else', () => {
  it('places nothing when the thing to place it next to is not there', () => {
    // The wrong behaviour: an anchor that pointed at nothing fell back to the
    // top left of the level, so a rule meant to drop treasure beside the boss
    // dropped it in the corner instead, with nothing said.
    const game = makeGame({
      prototypes: [
        {
          id: 'player',
          size: { width: 12, height: 16 },
          tags: ['player'],
          components: { collider: {}, movement: { mode: 'platform' } },
        },
        {
          id: 'boss',
          size: { width: 16, height: 16 },
          tags: ['enemy'],
          components: { collider: { kind: 'trigger' } },
        },
        {
          id: 'coin',
          size: { width: 8, height: 8 },
          tags: ['pickup'],
          components: { collider: { kind: 'trigger' } },
        },
      ],
      // No boss anywhere in this level.
      entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 64 }],
      events: [
        {
          id: 'treasure',
          when: { type: 'scene-starts' },
          then: [{ type: 'spawn', entity: 'coin', x: 0, y: -8, relativeTo: 'boss' }],
        },
      ],
    });
    steps(game, 3);

    expect(game.world.entities.filter((one) => one.prototypeId === 'coin')).toHaveLength(0);
  });

  it('still means the top left of the level when nothing is named', () => {
    const game = makeGame({
      prototypes: [
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
      ],
      entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 64 }],
      events: [
        {
          id: 'treasure',
          when: { type: 'scene-starts' },
          then: [{ type: 'spawn', entity: 'coin', x: 24, y: 16 }],
        },
      ],
    });
    steps(game, 3);

    const coin = game.world.entities.find((one) => one.prototypeId === 'coin');
    expect(coin?.x).toBe(24);
    expect(coin?.y).toBe(16);
  });
});

/**
 * Pausing. The editor tells people that pausing belongs in the rules for the
 * whole game, the getting started guide and the format reference both name it,
 * and the format ships a pause key bound to escape by default — and until now
 * there was no way to pause anything.
 */
describe('pausing', () => {
  const pausable = (events: NonNullable<WorldOptions['events']>) =>
    makeGame({
      variables: [{ id: 'score', type: 'number', initial: 0 }],
      events,
    });

  it('freezes what moves and stops the timers', () => {
    const game = pausable([
      {
        id: 'pause',
        when: { type: 'action-pressed', action: 'pause' },
        then: [{ type: 'pause-game' }],
      },
      {
        id: 'ticking',
        when: { type: 'every-frame' },
        then: [{ type: 'change-variable', variable: 'score', value: 1 }],
      },
    ]);

    steps(game, 20);
    expect(Number(game.variable('score'))).toBeGreaterThan(0);

    // The step the press lands in has already moved things by the time the
    // rules run, so it finishes; the freeze holds from the next step on.
    game.input.press('pause');
    game.step();
    expect(game.paused).toBe(true);

    const frozenY = player(game).y;
    const frozenScore = game.variable('score');
    const frozenSteps = game.world.steps;
    steps(game, 60);

    // Nothing moved, nothing ticked, and the clock did not advance.
    expect(player(game).y).toBe(frozenY);
    expect(game.variable('score')).toBe(frozenScore);
    expect(game.world.steps).toBe(frozenSteps);
  });

  it('still hears the player, so a rule can start the game again', () => {
    const game = pausable([
      {
        id: 'pause',
        when: { type: 'action-pressed', action: 'pause' },
        then: [{ type: 'pause-game' }],
      },
      {
        id: 'unpause',
        when: { type: 'action-released', action: 'pause' },
        then: [{ type: 'resume-game' }],
      },
      {
        id: 'ticking',
        when: { type: 'every-frame' },
        then: [{ type: 'change-variable', variable: 'score', value: 1 }],
      },
    ]);

    steps(game, 5);
    game.input.press('pause');
    steps(game, 30);
    expect(game.paused).toBe(true);
    const held = game.variable('score');

    game.input.release('pause');
    steps(game, 10);

    expect(game.paused).toBe(false);
    expect(Number(game.variable('score'))).toBeGreaterThan(Number(held));
  });

  it('freezes a player who is holding a direction down', () => {
    // The whole point of doing this in the engine: a rule cannot stop a
    // player-controlled entity from reading the keyboard, so a pause built out
    // of rules leaves the player walking around a frozen world.
    const game = pausable([
      {
        id: 'pause',
        when: { type: 'action-pressed', action: 'pause' },
        then: [{ type: 'pause-game' }],
      },
    ]);

    steps(game, 30);
    game.input.press('right');
    steps(game, 10);
    const movedTo = player(game).x;
    expect(movedTo).toBeGreaterThan(32);

    game.input.press('pause');
    game.step();
    const frozenX = player(game).x;
    steps(game, 60);

    expect(game.paused).toBe(true);
    expect(player(game).x).toBe(frozenX);
    // And it really was still walking when the pause landed.
    expect(frozenX).toBeGreaterThan(movedTo);
  });

  it('lets a rule part way through a wait carry on, so a cutscene works', () => {
    const game = pausable([
      {
        id: 'cutscene',
        when: { type: 'scene-starts' },
        then: [
          { type: 'pause-game' },
          { type: 'show-message', text: 'Look out!', seconds: 1 },
          { type: 'wait', seconds: 0.5 },
          { type: 'resume-game' },
        ],
      },
      {
        id: 'ticking',
        when: { type: 'every-frame' },
        then: [{ type: 'change-variable', variable: 'score', value: 1 }],
      },
    ]);

    game.step();
    expect(game.paused).toBe(true);
    const held = game.variable('score');
    steps(game, 20);
    // Frozen: the every-frame rule did not run while the pause held.
    expect(game.variable('score')).toBe(held);

    steps(game, 30);
    expect(game.paused).toBe(false);
    expect(Number(game.variable('score'))).toBeGreaterThan(Number(held));
  });

  it('never opens a new level frozen', () => {
    const game = makeGame({
      variables: [{ id: 'score', type: 'number', initial: 0 }],
      scenes: [1, 2].map((number) => ({
        id: `level-${number}`,
        tileSize: 16,
        size: { columns: 10, rows: 6 },
        layers: [
          {
            id: 'ground',
            tileset: 'ground',
            collides: true,
            legend: { '.': null, '#': 0 },
            rows: FLOOR_ROWS,
          },
        ],
        entities: [{ id: `player-${number}`, prototype: 'player', x: 32, y: 0 }],
        camera: { mode: 'fixed' as const },
        events:
          number === 1
            ? [
                {
                  id: 'freeze',
                  when: { type: 'scene-starts' as const },
                  then: [{ type: 'pause-game' as const }],
                },
              ]
            : [],
      })),
    });

    game.step();
    expect(game.paused).toBe(true);
    game.goToScene('level-2');
    steps(game, 3);

    expect(game.paused).toBe(false);
  });
});

/**
 * A best score that survives a replay. A playtester building an arcade game
 * reached for "if this run beat my best, remember it", found that every value
 * in the whole vocabulary was a fixed number, and shipped eight threshold
 * rules that ratchet a *band* instead — so the game could say "best band: 250"
 * but never "best: 287".
 */
describe('comparing and copying one variable with another', () => {
  const arcade = () =>
    makeGame({
      variables: [
        { id: 'score', type: 'number', initial: 0 },
        { id: 'high-score', type: 'number', initial: 0 },
      ],
      events: [
        {
          id: 'remember-the-best',
          when: { type: 'variable-changes', variable: 'score' },
          if: [
            {
              type: 'variable-compare',
              left: 'score',
              operator: 'greater-than',
              right: 'high-score',
            },
          ],
          then: [{ type: 'copy-variable', from: 'score', into: 'high-score' }],
        },
      ],
    });

  it('remembers the exact best score, not a band', () => {
    const game = arcade();
    game.setVariable('score', 287);
    steps(game, 3);
    expect(game.variable('high-score')).toBe(287);
  });

  it('leaves the best alone when the run was worse', () => {
    const game = arcade();
    game.setVariable('score', 287);
    steps(game, 3);
    game.setVariable('score', 40);
    steps(game, 3);

    expect(game.variable('high-score')).toBe(287);
  });

  it('still reads a fixed number on the right, rather than a variable called 3', () => {
    // The sentence "score is at least 3" has to keep meaning the number three
    // now that "score is at least high-score" is also a sentence.
    const game = makeGame({
      variables: [
        { id: 'score', type: 'number', initial: 0 },
        { id: 'fired', type: 'boolean', initial: false },
      ],
      events: [
        {
          id: 'threshold',
          when: { type: 'every-frame' },
          if: [{ type: 'variable-is', variable: 'score', operator: 'at-least', value: 3 }],
          then: [{ type: 'set-variable', variable: 'fired', value: true }],
        },
      ],
    });
    steps(game, 3);
    expect(game.variable('fired')).toBe(false);
    game.setVariable('score', 5);
    steps(game, 2);
    expect(game.variable('fired')).toBe(true);
  });
});
