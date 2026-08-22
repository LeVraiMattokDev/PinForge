import { parseProject, type ProjectInput } from '@pinforge/schema';
import { Game } from '../src/index.js';

/**
 * A tiny world: ten tiles across, six down, solid ground along the bottom row,
 * one player standing near the left. Tile 0 is solid, tile 1 is a hazard and
 * tile 2 is a one-way platform.
 *
 *   legend  .  empty   #  solid   ^  hazard   =  one-way
 */
export const FLOOR_ROWS = [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '##########',
];

export interface WorldOptions {
  rows?: string[];
  entities?: ProjectInput['scenes'][number]['entities'];
  prototypes?: ProjectInput['entities'];
  events?: NonNullable<ProjectInput['scenes'][number]['events']>;
  globalEvents?: ProjectInput['globalEvents'];
  tilesets?: ProjectInput['tilesets'];
  variables?: ProjectInput['variables'];
  camera?: ProjectInput['scenes'][number]['camera'];
  scenes?: ProjectInput['scenes'];
  seed?: number;
}

export function makeGame(options: WorldOptions = {}): Game {
  const input: ProjectInput = {
    formatVersion: 1,
    meta: { name: 'Simulation test' },
    settings: { startScene: 'level-1', viewport: { width: 160, height: 96 } },
    variables: options.variables ?? [{ id: 'score', type: 'number', initial: 0 }],
    tilesets: options.tilesets ?? [
      {
        id: 'ground',
        image: 'tiles',
        tileWidth: 16,
        tileHeight: 16,
        tiles: [
          { index: 0, tags: ['solid'] },
          { index: 1, tags: ['hazard'] },
          { index: 2, tags: ['one-way'] },
        ],
      },
    ],
    assets: [{ id: 'tiles', kind: 'image', source: 'tiles.png' }],
    entities: options.prototypes ?? [
      {
        id: 'player',
        size: { width: 12, height: 16 },
        tags: ['player'],
        components: { collider: {}, movement: { mode: 'platform' } },
      },
    ],
    globalEvents: options.globalEvents ?? [],
    scenes: options.scenes ?? [
      {
        id: 'level-1',
        tileSize: 16,
        size: { columns: 10, rows: 6 },
        layers: [
          {
            id: 'ground',
            tileset: 'ground',
            collides: true,
            legend: { '.': null, '#': 0, '^': 1, '=': 2 },
            rows: options.rows ?? FLOOR_ROWS,
          },
        ],
        entities: options.entities ?? [{ id: 'player-1', prototype: 'player', x: 32, y: 0 }],
        camera: options.camera ?? { mode: 'fixed' },
        events: options.events ?? [],
      },
    ],
  };
  return new Game(parseProject(input), { seed: options.seed ?? 7 });
}

export function steps(game: Game, count: number): void {
  for (let index = 0; index < count; index += 1) game.step();
}

/** Steps until the test is satisfied, or gives up so a failure is not a hang. */
export function stepUntil(game: Game, done: (game: Game) => boolean, limit = 600): number {
  for (let index = 0; index < limit; index += 1) {
    if (done(game)) return index;
    game.step();
  }
  return -1;
}

export function player(game: Game) {
  const entity = game.world.entities.find((one) => one.prototypeId === 'player');
  if (!entity) throw new Error('The test world has no player.');
  return entity;
}

/** Everything that must be identical between two runs of the same script. */
export function snapshot(game: Game): unknown {
  return {
    scene: game.world.scene.id,
    steps: game.world.steps,
    camera: { x: game.world.camera.x, y: game.world.camera.y },
    variables: [...game.variableValues.entries()],
    entities: game.world.entities.map((entity) => ({
      id: entity.id,
      x: entity.x,
      y: entity.y,
      velocityX: entity.velocityX,
      velocityY: entity.velocityY,
      onGround: entity.onGround,
      facing: entity.facing,
      properties: [...entity.properties.entries()],
    })),
  };
}
