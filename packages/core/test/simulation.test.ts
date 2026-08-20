import { describe, expect, it } from 'vitest';
import { FLOOR_ROWS, makeGame, player, snapshot, stepUntil, steps } from './helpers.js';

/**
 * Deterministic simulation tests: a starting state, a scripted sequence of
 * inputs, and an assertion about the exact state after a fixed number of steps.
 * These are the regression net for everything about movement and collision.
 *
 * The ground is the bottom row of a six row scene on a sixteen pixel grid, so
 * its top edge is at y = 80 and a sixteen pixel tall player rests at y = 64.
 */
const RESTING_Y = 64;

describe('gravity and ground', () => {
  it('falls and comes to rest exactly on top of the ground', () => {
    const game = makeGame();
    steps(game, 120);

    expect(player(game).y).toBe(RESTING_Y);
    expect(player(game).onGround).toBe(true);
    expect(player(game).velocityY).toBe(0);
  });

  it('does not fall through the floor at terminal speed', () => {
    const game = makeGame({
      entities: [{ id: 'player-1', prototype: 'player', x: 32, y: -4000 }],
    });
    steps(game, 600);

    expect(player(game).y).toBeLessThanOrEqual(RESTING_Y);
    expect(player(game).y).toBeGreaterThan(-4000);
  });
});

describe('jumping', () => {
  it('reaches roughly the height it was asked for', () => {
    const game = makeGame();
    steps(game, 60);

    game.input.press('jump');
    let highest = player(game).y;
    for (let index = 0; index < 90; index += 1) {
      game.step();
      highest = Math.min(highest, player(game).y);
    }

    // 44 pixels was asked for. A fixed step loses a little at the top.
    expect(RESTING_Y - highest).toBeGreaterThan(39);
    expect(RESTING_Y - highest).toBeLessThan(47);
  });

  it('comes back down and lands again', () => {
    const game = makeGame();
    steps(game, 60);
    game.input.press('jump');
    steps(game, 2);
    game.input.release('jump');

    expect(
      stepUntil(game, (one) => player(one).onGround && player(one).y === RESTING_Y),
    ).toBeGreaterThan(0);
  });

  it('cuts the jump short when the button is released early', () => {
    const full = makeGame();
    steps(full, 60);
    full.input.press('jump');
    let fullPeak = RESTING_Y;
    for (let index = 0; index < 90; index += 1) {
      full.step();
      fullPeak = Math.min(fullPeak, player(full).y);
    }

    const cut = makeGame();
    steps(cut, 60);
    cut.input.press('jump');
    cut.step();
    cut.input.release('jump');
    let cutPeak = RESTING_Y;
    for (let index = 0; index < 90; index += 1) {
      cut.step();
      cutPeak = Math.min(cutPeak, player(cut).y);
    }

    expect(cutPeak).toBeGreaterThan(fullPeak);
  });

  it('still jumps just after walking off a ledge', () => {
    // Ground under the first four columns only.
    const rows = [...FLOOR_ROWS.slice(0, 5), '####......'];
    const game = makeGame({ rows });
    steps(game, 60);
    game.input.press('right');
    stepUntil(game, (one) => !player(one).onGround);

    // Three steps is 0.05 seconds, inside the tenth of a second of coyote time.
    steps(game, 3);
    game.input.press('jump');
    game.step();

    expect(player(game).velocityY).toBeLessThan(0);
  });

  it('does not jump long after walking off a ledge', () => {
    const rows = [...FLOOR_ROWS.slice(0, 5), '####......'];
    const game = makeGame({ rows });
    steps(game, 60);
    game.input.press('right');
    stepUntil(game, (one) => !player(one).onGround);

    steps(game, 20);
    game.input.press('jump');
    game.step();

    expect(player(game).velocityY).toBeGreaterThan(0);
  });

  it('remembers a jump pressed just before landing', () => {
    const game = makeGame({
      entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 0 }],
    });
    // Press while still in the air but close to the ground.
    stepUntil(game, (one) => player(one).y > RESTING_Y - 8);
    game.input.press('jump');
    game.step();
    game.input.release('jump');
    expect(player(game).onGround).toBe(false);

    const jumped = stepUntil(game, (one) => player(one).velocityY < 0, 20);
    expect(jumped).toBeGreaterThan(-1);
  });
});

describe('collision', () => {
  it('runs along a floor made of many tiles without catching on the seams', () => {
    const game = makeGame();
    steps(game, 60);
    game.input.press('right');

    let previousX = player(game).x;
    for (let index = 0; index < 60; index += 1) {
      game.step();
      const current = player(game);
      // The X pass never lifts the player, and never stalls on a tile edge.
      expect(current.y).toBe(RESTING_Y);
      expect(current.x).toBeGreaterThan(previousX);
      previousX = current.x;
    }
  });

  it('stops against a wall instead of entering it', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '.....#....',
      '.....#....',
      '##########',
    ];
    const game = makeGame({ rows });
    steps(game, 60);
    game.input.press('right');
    steps(game, 120);

    // The wall's left edge is at x = 80, and the player is 12 wide.
    expect(player(game).x).toBe(68);
    expect(player(game).velocityX).toBe(0);
  });

  it('jumps up through a one-way platform and lands on top of it', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..===.....',
      '..........',
      '##########',
    ];
    const game = makeGame({ rows });
    steps(game, 60);
    game.input.press('jump');
    steps(game, 2);
    game.input.release('jump');

    const landed = stepUntil(game, (one) => player(one).onGround && player(one).y === 32, 200);
    expect(landed).toBeGreaterThan(0);
  });

  it('does not fall through a one-way platform it is standing on', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..===.....',
      '..........',
      '##########',
    ];
    const game = makeGame({
      rows,
      entities: [{ id: 'player-1', prototype: 'player', x: 36, y: 16 }],
    });
    steps(game, 120);

    expect(player(game).y).toBe(32);
    expect(player(game).onGround).toBe(true);
  });
});

describe('patrolling', () => {
  it('turns around at a wall and at a ledge', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '.......#..',
      '.......#..',
      '..#####...',
    ];
    const game = makeGame({
      rows,
      prototypes: [
        {
          id: 'slime',
          size: { width: 12, height: 12 },
          tags: ['enemy'],
          components: {
            collider: {},
            movement: {
              mode: 'platform',
              controlledBy: 'rules',
              maxSpeed: 40,
              jumpHeight: 0,
              patrol: { direction: 'right' },
            },
          },
        },
      ],
      entities: [{ id: 'slime-1', prototype: 'slime', x: 40, y: 60 }],
    });

    const slime = () => game.world.entities[0]!;
    const seen = new Set<number>();
    for (let index = 0; index < 600; index += 1) {
      game.step();
      seen.add(slime().patrolDirection);
      // The platform runs from x = 32 to x = 112 and there is a wall at x = 112.
      expect(slime().x).toBeGreaterThanOrEqual(28);
      expect(slime().x).toBeLessThanOrEqual(116);
    }
    expect(seen).toEqual(new Set([1, -1]));
  });
});

describe('determinism', () => {
  it('produces the same state from the same script, twice', () => {
    const script = (game: ReturnType<typeof makeGame>): void => {
      steps(game, 10);
      game.input.press('right');
      steps(game, 25);
      game.input.press('jump');
      steps(game, 5);
      game.input.release('jump');
      steps(game, 40);
      game.input.release('right');
      game.input.press('left');
      steps(game, 30);
    };

    const first = makeGame();
    const second = makeGame();
    script(first);
    script(second);

    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(first)).not.toEqual(snapshot(makeGame()));
  });

  it('reaches the same state whether time arrives evenly or in lumps', () => {
    const stepped = makeGame();
    steps(stepped, 60);

    // Five uneven lumps adding up to one second. advance() never runs more than
    // a quarter of a second at once, so the lumps stay under that on purpose.
    const advanced = makeGame();
    for (const lump of [0.2, 0.1, 0.25, 0.2, 0.25]) advanced.advance(lump);

    expect(snapshot(advanced)).toEqual(snapshot(stepped));
  });
});
