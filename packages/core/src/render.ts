import type { Tileset } from '@pinforge/schema';
import type { Game } from './game.js';
import type { Renderer } from './renderer.js';
import { EMPTY_TILE } from './tilemap.js';

const TEXT_LINE_HEIGHT = 10;

/**
 * Draws the current state. Rendering never changes the simulation: it may
 * interpolate between the last two states, which is why entities remember where
 * they were, but nothing here writes back.
 */
export function drawWorld(game: Game, renderer: Renderer, alpha = 1): void {
  const view = game.project.settings.viewport;
  const world = game.world;
  const scene = world.scene;
  const pixelArt = game.project.settings.pixelArt;
  const cameraX = world.camera.x + world.camera.offsetX;
  const cameraY = world.camera.y + world.camera.offsetY;

  renderer.begin(view.width, view.height, scene.background.color);

  const backdrop = scene.background.image ? game.assets.image(scene.background.image) : undefined;
  if (backdrop) {
    renderer.sprite(backdrop, 0, 0, backdrop.width, backdrop.height, 0, 0, false);
  }

  const tilesets = new Map<string, Tileset>(
    game.project.tilesets.map((tileset) => [tileset.id, tileset]),
  );

  const layers = scene.layers;
  let entitiesAfter = layers.length - 1;
  layers.forEach((layer, index) => {
    if (layer.drawEntitiesAfter) entitiesAfter = index;
  });

  if (layers.length === 0) drawEntities(game, renderer, alpha, cameraX, cameraY, pixelArt);
  layers.forEach((layer, index) => {
    if (layer.visible) {
      drawLayer(game, renderer, layer.id, tilesets, cameraX, cameraY, pixelArt);
    }
    if (index === entitiesAfter) drawEntities(game, renderer, alpha, cameraX, cameraY, pixelArt);
  });

  if (world.message) {
    renderer.text(
      world.message.text,
      view.width / 2,
      view.height - 24,
      '#ffffff',
      'normal',
      'center',
    );
  }

  renderer.end();
}

function drawLayer(
  game: Game,
  renderer: Renderer,
  layerId: string,
  tilesets: Map<string, Tileset>,
  cameraX: number,
  cameraY: number,
  pixelArt: boolean,
): void {
  const scene = game.world.scene;
  const layer = scene.layers.find((one) => one.id === layerId);
  const map = game.world.map;
  const grid = map.gridOf(layerId);
  if (!layer || !grid) return;
  const tileset = tilesets.get(layer.tileset);
  const image = tileset ? game.assets.image(tileset.image) : undefined;
  if (!tileset || !image) return;

  const size = map.tileSize;
  const view = game.project.settings.viewport;
  const originX = cameraX * layer.parallax.x;
  const originY = cameraY * layer.parallax.y;

  const firstColumn = Math.max(0, Math.floor(originX / size));
  const lastColumn = Math.min(map.columns - 1, Math.floor((originX + view.width) / size));
  const firstRow = Math.max(0, Math.floor(originY / size));
  const lastRow = Math.min(map.rows - 1, Math.floor((originY + view.height) / size));

  const across = Math.max(
    1,
    Math.floor(
      (image.width - 2 * tileset.margin + tileset.spacing) / (tileset.tileWidth + tileset.spacing),
    ),
  );

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const tile = grid[row * map.columns + column] ?? EMPTY_TILE;
      if (tile === EMPTY_TILE) continue;
      const sourceX = tileset.margin + (tile % across) * (tileset.tileWidth + tileset.spacing);
      const sourceY =
        tileset.margin + Math.floor(tile / across) * (tileset.tileHeight + tileset.spacing);
      renderer.sprite(
        image,
        sourceX,
        sourceY,
        tileset.tileWidth,
        tileset.tileHeight,
        maybeRound(column * size - originX, pixelArt),
        maybeRound(row * size - originY, pixelArt),
        false,
      );
    }
  }
}

function drawEntities(
  game: Game,
  renderer: Renderer,
  alpha: number,
  cameraX: number,
  cameraY: number,
  pixelArt: boolean,
): void {
  for (const entity of game.world.entities) {
    if (entity.destroyed || !entity.visible) continue;

    const drawnX = entity.previousX + (entity.x - entity.previousX) * alpha;
    const drawnY = entity.previousY + (entity.y - entity.previousY) * alpha;
    const screenX = maybeRound(entity.fixedToCamera ? drawnX : drawnX - cameraX, pixelArt);
    const screenY = maybeRound(entity.fixedToCamera ? drawnY : drawnY - cameraY, pixelArt);

    if (entity.text) {
      const anchorX =
        entity.text.align === 'center'
          ? screenX + entity.width / 2
          : entity.text.align === 'right'
            ? screenX + entity.width
            : screenX;
      fillIn(entity.text.content, game)
        .split('\n')
        .forEach((line, index) => {
          renderer.text(
            line,
            anchorX,
            screenY + index * TEXT_LINE_HEIGHT,
            entity.text?.color ?? '#ffffff',
            entity.text?.size ?? 'normal',
            entity.text?.align ?? 'left',
          );
        });
      continue;
    }

    const sprite = entity.sprite;
    if (!sprite) continue;
    const image = game.assets.image(sprite.component.image);
    if (!image) continue;

    const animation = sprite.component.animations.find((one) => one.id === sprite.animation);
    const frame = animation?.frames[sprite.frame] ?? 0;
    const across = Math.max(1, Math.floor(image.width / sprite.component.frameWidth));
    renderer.sprite(
      image,
      (frame % across) * sprite.component.frameWidth,
      Math.floor(frame / across) * sprite.component.frameHeight,
      sprite.component.frameWidth,
      sprite.component.frameHeight,
      screenX + sprite.component.offset.x,
      screenY + sprite.component.offset.y,
      sprite.component.flipToFaceMovement && entity.facing < 0,
    );
  }
}

/** Replaces {name} with the value of that variable. */
export function fillIn(text: string, game: Game): string {
  return text.replace(/\{([a-z0-9-]+)\}/g, (whole, name: string) => {
    const value = game.variable(name);
    return value === undefined ? whole : String(value);
  });
}

function maybeRound(value: number, pixelArt: boolean): number {
  return pixelArt ? Math.round(value) : value;
}
