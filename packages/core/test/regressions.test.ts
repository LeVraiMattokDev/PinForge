import { describe, expect, it } from 'vitest';
import type { ProjectInput } from '@pinforge/schema';
import { makeGame, player, steps, stepUntil } from './helpers.js';

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
