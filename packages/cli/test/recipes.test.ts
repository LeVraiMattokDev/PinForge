import { describe, expect, it } from 'vitest';
import { Game } from '@pinforge/core';
import { RECIPES, errorsAmong, validateProject, type Project, type Recipe } from '@pinforge/schema';
import { openProject } from '../src/index.js';

const STARTER = new URL('../templates/starter', import.meta.url).pathname;

/**
 * A recipe is only worth having if what it drops in actually works, so each one
 * is applied to the starting project and then played. These are the tests that
 * make "add a villager you can talk to" a promise rather than a hope.
 */
function starter(): Project {
  return openProject(STARTER).project;
}

/** The level every recipe here is added to. */
const LEVEL = 'level-1';

function play(project: Project): Game {
  return new Game(project, { seed: 7 });
}

function find(game: Game, prototypeId: string) {
  return game.world.entities.find((one) => one.prototypeId === prototypeId);
}

/** Puts the player on top of something, which is how these are all triggered. */
function walkInto(game: Game, prototypeId: string): void {
  const player = find(game, 'player');
  const target = find(game, prototypeId);
  if (!player || !target) throw new Error(`No player, or no ${prototypeId}, in this level.`);
  player.x = target.x;
  player.y = target.y;
  player.previousX = player.x;
  player.previousY = player.y;
}

describe('every ready-made thing', () => {
  for (const recipe of RECIPES) {
    it(`${recipe.id} leaves the game valid, and playable`, () => {
      const after = recipe.add(starter(), LEVEL);

      expect(errorsAmong(validateProject(after))).toEqual([]);

      const game = play(after);
      for (let step = 0; step < 60; step += 1) game.step();
      expect(game.world.entities.length).toBeGreaterThan(0);
    });

    it(`${recipe.id} can be added twice without a clash`, () => {
      const twice = recipe.add(recipe.add(starter(), LEVEL), LEVEL);
      expect(errorsAmong(validateProject(twice))).toEqual([]);

      // Two of the thing, not one thing with a broken second copy.
      const before = starter().entities.length;
      expect(twice.entities.length).toBe(before + 2);
    });

    it(`${recipe.id} says what it is and what to do next`, () => {
      expect(recipe.label.length).toBeGreaterThan(4);
      expect(recipe.summary.length).toBeGreaterThan(20);
      expect(recipe.afterwards.length).toBeGreaterThan(20);
    });
  }
});

describe('someone to talk to', () => {
  const recipe = RECIPES.find((one) => one.id === 'talking-npc')!;

  it('holds the game still and moves on one press at a time', () => {
    const game = play(recipe.add(starter(), LEVEL));
    for (let step = 0; step < 30; step += 1) game.step();

    walkInto(game, 'villager');
    game.step();

    // The game is held, and the villager is saying something.
    expect(game.paused).toBe(true);
    const first = game.world.message?.text;
    expect(first).toContain('Hello there');

    // Nothing moves on its own, however long you leave it.
    for (let step = 0; step < 200; step += 1) game.step();
    expect(game.paused).toBe(true);
    expect(game.world.message?.text).toBe(first);

    // One press moves it on.
    game.input.press('action');
    game.step();
    expect(game.world.message?.text).not.toBe(first);
    expect(game.paused).toBe(true);

    // The next lets the game go.
    game.input.release('action');
    game.step();
    game.input.press('action');
    game.step();
    expect(game.paused).toBe(false);
  });
});

describe('an enemy that walks about', () => {
  const recipe = RECIPES.find((one) => one.id === 'patrolling-enemy')!;

  it('walks on its own, with no rules written for it', () => {
    const game = play(recipe.add(starter(), LEVEL));
    const startedAt = find(game, 'wanderer')?.x ?? 0;
    for (let step = 0; step < 60; step += 1) game.step();

    expect(find(game, 'wanderer')?.x).not.toBe(startedAt);
  });

  it('is squashed by landing on it', () => {
    const game = play(recipe.add(starter(), LEVEL));
    // Long enough for both of them to have finished falling to the floor.
    for (let step = 0; step < 90; step += 1) game.step();

    const player = find(game, 'player')!;
    const enemy = find(game, 'wanderer')!;
    // Put the player in the air above it and let it fall, because squashing
    // asks whether the player is falling and standing on the floor is not.
    player.x = enemy.x;
    player.y = enemy.y - 28;
    player.previousX = player.x;
    player.previousY = player.y;
    player.velocityY = 0;
    player.onGround = false;

    for (let step = 0; step < 60 && find(game, 'wanderer'); step += 1) game.step();
    expect(find(game, 'wanderer')).toBeUndefined();
    // And it was squashed rather than the level being restarted underneath us.
    expect(game.world.steps).toBeGreaterThan(90);
  });
});

describe('something to collect', () => {
  const recipe = RECIPES.find((one) => one.id === 'collectible')!;

  it('adds to the score and goes away', () => {
    const game = play(recipe.add(starter(), LEVEL));
    for (let step = 0; step < 30; step += 1) game.step();
    const before = Number(game.variable('score'));

    walkInto(game, 'treasure');
    game.step();
    game.step();

    expect(Number(game.variable('score'))).toBe(before + 1);
    expect(find(game, 'treasure')).toBeUndefined();
  });
});

describe('a way to finish the level', () => {
  const recipe = RECIPES.find((one) => one.id === 'level-exit')!;

  it('says so and starts the level again when there is nowhere else to go', () => {
    const game = play(recipe.add(starter(), LEVEL));
    for (let step = 0; step < 30; step += 1) game.step();

    walkInto(game, 'way-out');
    game.step();
    expect(game.world.message?.text).toContain('You made it');

    for (let step = 0; step < 150; step += 1) game.step();
    expect(game.world.steps).toBeLessThan(30);
  });

  it('goes to the next level when the game has one', () => {
    const twoLevels: Project = {
      ...starter(),
      scenes: [
        starter().scenes[0]!,
        { ...starter().scenes[0]!, id: 'level-2', entities: [], events: [] },
      ],
    };
    const game = play(RECIPES.find((one) => one.id === 'level-exit')!.add(twoLevels, LEVEL));
    for (let step = 0; step < 30; step += 1) game.step();

    walkInto(game, 'way-out');
    for (let step = 0; step < 200; step += 1) game.step();

    expect(game.world.scene.id).toBe('level-2');
  });
});

describe('what a recipe refuses to do', () => {
  it('says so plainly when the game has nothing the player drives', () => {
    const nobody: Project = {
      ...starter(),
      entities: starter().entities.map((one) => ({
        ...one,
        components: { ...one.components, movement: undefined },
      })),
    };
    for (const recipe of RECIPES) {
      expect(() => (recipe as Recipe).add(nobody, LEVEL)).toThrow(/player drives/);
    }
  });
});
