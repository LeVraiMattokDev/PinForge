import { describe, expect, it } from 'vitest';
import { Game, Tilemap } from '@pinforge/core';
import { openProject } from '../src/index.js';

const EXAMPLE = new URL('../../../examples/first-game', import.meta.url).pathname;

/**
 * Phase two of the plan exists to prove the format survives being written by
 * hand. Loading the example is half of that. The other half is playing it, which
 * is what catches a level that reads fine in a text editor and cannot actually
 * be finished: the first draft of this one had two coins placed higher than a
 * jump reaches, and this file is why that was found.
 */
describe('the example game', () => {
  it('plays: the player runs, jumps, squashes slimes and collects coins', () => {
    const game = new Game(openProject(EXAMPLE).project);
    const player = () => game.world.entities.find((one) => one.prototypeId === 'player');

    let furthest = player()?.x ?? 0;
    game.input.press('right');
    for (let step = 0; step < 420; step += 1) {
      if (step % 40 === 0) game.input.press('jump');
      if (step % 40 === 6) game.input.release('jump');
      game.step();
      furthest = Math.max(furthest, player()?.x ?? 0);
    }

    expect(furthest).toBeGreaterThan(200);
    expect(Number(game.variable('score'))).toBeGreaterThan(0);
  });

  it('puts every coin on something the player can stand on', () => {
    const { project } = openProject(EXAMPLE);

    for (const scene of project.scenes) {
      const map = new Tilemap(scene, project);
      const coins = scene.entities.filter((one) => one.prototype === 'coin');
      expect(coins.length).toBeGreaterThan(0);

      for (const coin of coins) {
        const prototype = project.entities.find((one) => one.id === 'coin');
        const bottom = coin.y + (prototype?.size.height ?? 0);
        const row = Math.floor((bottom + 1) / scene.tileSize);
        const column = Math.floor((coin.x + 4) / scene.tileSize);
        const supported = map.isSolid(column, row) || map.isOneWay(column, row);
        expect(supported, `${scene.id}: ${coin.id} is floating out of reach`).toBe(true);
      }
    }
  });

  it('is deterministic, so a level can be regression tested', () => {
    const script = (game: Game): void => {
      game.input.press('right');
      for (let step = 0; step < 200; step += 1) {
        if (step % 30 === 0) game.input.press('jump');
        if (step % 30 === 5) game.input.release('jump');
        game.step();
      }
    };

    const first = new Game(openProject(EXAMPLE).project);
    const second = new Game(openProject(EXAMPLE).project);
    script(first);
    script(second);

    const state = (game: Game) => ({
      entities: game.world.entities.map(
        (one) => `${one.id}:${one.x.toFixed(4)}:${one.y.toFixed(4)}`,
      ),
      variables: [...game.variableValues.entries()],
    });
    expect(state(first)).toEqual(state(second));
  });
});
