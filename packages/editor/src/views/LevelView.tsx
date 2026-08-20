import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  EntityInstance,
  EntityPrototype,
  Project,
  Scene,
  TileLayer,
  Tileset,
} from '@pinforge/schema';
import { paintTiles, moveInstance } from '../state/commands.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import type { EditorAssets } from '../assets.js';
import { Checkbox, Field, Select, Segmented } from '../ui/controls.js';

export function LevelView({ assets }: { assets: EditorAssets }) {
  const store = useEditor();
  const state = useEditorState();
  const scene = store.scene;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState(true);
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const painting = useRef(false);

  const layer = scene.layers.find((one) => one.id === state.activeLayerId) ?? scene.layers[0];
  const tileset = useMemo(
    () => state.project.tilesets.find((one) => one.id === layer?.tileset),
    [state.project.tilesets, layer?.tileset],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    draw(element, state.project, scene, assets, {
      zoom: state.zoom,
      selected: state.selection.kind === 'instance' ? state.selection.id : undefined,
    });
  }, [assets, scene, state.project, state.selection, state.zoom]);

  const pixelAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / state.zoom,
      y: (event.clientY - bounds.top) / state.zoom,
    };
  };

  const paintAt = (x: number, y: number) => {
    if (!layer) return;
    const column = Math.floor(x / scene.tileSize);
    const row = Math.floor(y / scene.tileSize);
    const tile = state.tool === 'erase' ? null : state.paintTile;
    store.apply(paintTiles(scene.id, layer.id, column, row, tile, state.brushSize));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pixelAt(event);
    if (state.tool === 'paint' || state.tool === 'erase') {
      painting.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      paintAt(point.x, point.y);
      return;
    }
    const hit = topmostAt(state.project, scene, point.x, point.y);
    if (!hit) {
      store.set({ selection: { kind: 'none' } });
      return;
    }
    store.set({ selection: { kind: 'instance', id: hit.id } });
    dragging.current = { id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pixelAt(event);
    if (painting.current) {
      paintAt(point.x, point.y);
      return;
    }
    const drag = dragging.current;
    if (!drag) return;
    const step = snap ? scene.tileSize / 2 : 1;
    const x = Math.round((point.x - drag.offsetX) / step) * step;
    const y = Math.round((point.y - drag.offsetY) / step) * step;
    store.apply(moveInstance(scene.id, drag.id, x, y));
  };

  const stop = () => {
    painting.current = false;
    dragging.current = null;
  };

  return (
    <div className="stage">
      <div className="stage-bar">
        <Segmented
          value={state.tool}
          onChange={(tool) => store.set({ tool })}
          options={[
            { value: 'select', label: 'Move things' },
            { value: 'paint', label: 'Paint tiles' },
            { value: 'erase', label: 'Rub out' },
          ]}
        />
        {scene.layers.length > 1 && state.tool !== 'select' ? (
          <Field label="On layer" inline>
            <Select
              value={state.activeLayerId ?? ''}
              onChange={(activeLayerId) => store.set({ activeLayerId })}
              choices={scene.layers.map((one) => ({ value: one.id, label: one.name ?? one.id }))}
            />
          </Field>
        ) : null}
        {state.tool === 'paint' ? (
          <Field label="Brush" inline>
            <Select
              value={String(state.brushSize)}
              onChange={(value) => store.set({ brushSize: Number(value) })}
              choices={[
                { value: '1', label: '1 tile' },
                { value: '2', label: '2 by 2' },
                { value: '3', label: '3 by 3' },
              ]}
            />
          </Field>
        ) : null}
        {state.tool === 'select' ? (
          <Checkbox
            label="Snap to the grid"
            checked={snap}
            onChange={setSnap}
            hint="Keeps what you drag lined up with the tiles. Turn it off to place something exactly."
          />
        ) : null}
        <span className="spacer" />
        <Field label="Zoom" inline>
          <Select
            value={String(state.zoom)}
            onChange={(value) => store.set({ zoom: Number(value) })}
            choices={[1, 2, 3, 4].map((one) => ({ value: String(one), label: `${one} times` }))}
          />
        </Field>
      </div>

      {state.tool === 'paint' ? (
        <TilePalette
          tileset={tileset}
          assets={assets}
          selected={state.paintTile}
          onSelect={(paintTile) => store.set({ paintTile })}
        />
      ) : null}

      <div className={`canvas-frame${state.tool === 'select' ? ' selecting' : ''}`}>
        <canvas
          ref={canvas}
          width={scene.size.columns * scene.tileSize * state.zoom}
          height={scene.size.rows * scene.tileSize * state.zoom}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
      </div>
    </div>
  );
}

function TilePalette({
  tileset,
  assets,
  selected,
  onSelect,
}: {
  tileset: Tileset | undefined;
  assets: EditorAssets;
  selected: number | null;
  onSelect: (tile: number) => void;
}) {
  if (!tileset) {
    return (
      <p className="note">
        This level has no tile layer yet. Add one from the level panel on the left.
      </p>
    );
  }
  const image = assets.drawable(tileset.image);
  if (!image) {
    return <p className="note">Loading the tiles for {tileset.name ?? tileset.id}…</p>;
  }

  const across = Math.max(
    1,
    Math.floor(
      (image.width - 2 * tileset.margin + tileset.spacing) / (tileset.tileWidth + tileset.spacing),
    ),
  );
  const down = Math.max(
    1,
    Math.floor(
      (image.height - 2 * tileset.margin + tileset.spacing) /
        (tileset.tileHeight + tileset.spacing),
    ),
  );
  const scale = 36 / tileset.tileWidth;

  return (
    <div className="palette">
      {Array.from({ length: across * down }, (_, tile) => {
        const definition = tileset.tiles.find((one) => one.index === tile);
        const sourceX = tileset.margin + (tile % across) * (tileset.tileWidth + tileset.spacing);
        const sourceY =
          tileset.margin + Math.floor(tile / across) * (tileset.tileHeight + tileset.spacing);
        return (
          <button
            key={tile}
            type="button"
            aria-pressed={selected === tile}
            title={definition?.name ?? `Tile ${tile}`}
            onClick={() => onSelect(tile)}
          >
            <span
              className="swatch"
              style={{
                backgroundImage: `url(${cssUrl(tileset, assets)})`,
                backgroundSize: `${image.width * scale}px ${image.height * scale}px`,
                backgroundPosition: `-${sourceX * scale}px -${sourceY * scale}px`,
              }}
            />
            <span className="caption">{definition?.tags[0] ?? definition?.name ?? ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function cssUrl(tileset: Tileset, assets: EditorAssets): string {
  const drawable = assets.drawable(tileset.image);
  const source = drawable?.source as HTMLImageElement | undefined;
  return source?.src ?? '';
}

export function topmostAt(
  project: Project,
  scene: Scene,
  x: number,
  y: number,
): EntityInstance | undefined {
  const prototypes = new Map(project.entities.map((one) => [one.id, one]));
  for (let index = scene.entities.length - 1; index >= 0; index -= 1) {
    const instance = scene.entities[index];
    if (!instance) continue;
    const prototype = prototypes.get(instance.prototype);
    if (!prototype) continue;
    if (
      x >= instance.x &&
      x <= instance.x + prototype.size.width &&
      y >= instance.y &&
      y <= instance.y + prototype.size.height
    ) {
      return instance;
    }
  }
  return undefined;
}

/**
 * The design time view of a level. This is not the runtime: it draws the level
 * as it is written rather than as it is played, so it ignores parallax, shows a
 * grid, and draws a labelled box wherever a picture is missing so that
 * everything remains visible and selectable.
 */
function draw(
  canvas: HTMLCanvasElement,
  project: Project,
  scene: Scene,
  assets: EditorAssets,
  options: { zoom: number; selected: string | undefined },
): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(options.zoom, 0, 0, options.zoom, 0, 0);
  context.imageSmoothingEnabled = false;
  const width = scene.size.columns * scene.tileSize;
  const height = scene.size.rows * scene.tileSize;
  context.fillStyle = scene.background.color;
  context.fillRect(0, 0, width, height);

  for (const layer of scene.layers) {
    if (layer.visible) drawLayer(context, project, scene, layer, assets);
  }

  drawGrid(context, scene, width, height);

  const prototypes = new Map(project.entities.map((one) => [one.id, one]));
  for (const instance of scene.entities) {
    const prototype = prototypes.get(instance.prototype);
    if (prototype) drawInstance(context, instance, prototype, assets);
  }

  const selected = scene.entities.find((one) => one.id === options.selected);
  const prototype = selected ? prototypes.get(selected.prototype) : undefined;
  if (selected && prototype) {
    context.strokeStyle = '#2c6e8a';
    context.lineWidth = 2 / options.zoom;
    context.strokeRect(
      selected.x - 1 / options.zoom,
      selected.y - 1 / options.zoom,
      prototype.size.width + 2 / options.zoom,
      prototype.size.height + 2 / options.zoom,
    );
  }
}

function drawLayer(
  context: CanvasRenderingContext2D,
  project: Project,
  scene: Scene,
  layer: TileLayer,
  assets: EditorAssets,
): void {
  const tileset = project.tilesets.find((one) => one.id === layer.tileset);
  const image = tileset ? assets.drawable(tileset.image) : undefined;

  layer.rows.forEach((row, rowIndex) => {
    [...row].forEach((character, columnIndex) => {
      const tile = layer.legend[character];
      if (tile === null || tile === undefined) return;
      const x = columnIndex * scene.tileSize;
      const y = rowIndex * scene.tileSize;
      if (!tileset || !image) {
        context.fillStyle = '#9aa4ae';
        context.fillRect(x, y, scene.tileSize, scene.tileSize);
        return;
      }
      const across = Math.max(
        1,
        Math.floor(
          (image.width - 2 * tileset.margin + tileset.spacing) /
            (tileset.tileWidth + tileset.spacing),
        ),
      );
      context.drawImage(
        image.source,
        tileset.margin + (tile % across) * (tileset.tileWidth + tileset.spacing),
        tileset.margin + Math.floor(tile / across) * (tileset.tileHeight + tileset.spacing),
        tileset.tileWidth,
        tileset.tileHeight,
        x,
        y,
        tileset.tileWidth,
        tileset.tileHeight,
      );
    });
  });
}

function drawGrid(
  context: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
): void {
  context.strokeStyle = 'rgba(28, 35, 46, 0.09)';
  context.lineWidth = 0.5;
  context.beginPath();
  for (let column = 0; column <= scene.size.columns; column += 1) {
    context.moveTo(column * scene.tileSize, 0);
    context.lineTo(column * scene.tileSize, height);
  }
  for (let row = 0; row <= scene.size.rows; row += 1) {
    context.moveTo(0, row * scene.tileSize);
    context.lineTo(width, row * scene.tileSize);
  }
  context.stroke();
}

function drawInstance(
  context: CanvasRenderingContext2D,
  instance: EntityInstance,
  prototype: EntityPrototype,
  assets: EditorAssets,
): void {
  const sprite = prototype.components.sprite;
  const image = sprite ? assets.drawable(sprite.image) : undefined;

  if (sprite && image) {
    const animation =
      sprite.animations.find((one) => one.id === sprite.defaultAnimation) ?? sprite.animations[0];
    const frame = animation?.frames[0] ?? 0;
    const across = Math.max(1, Math.floor(image.width / sprite.frameWidth));
    context.drawImage(
      image.source,
      (frame % across) * sprite.frameWidth,
      Math.floor(frame / across) * sprite.frameHeight,
      sprite.frameWidth,
      sprite.frameHeight,
      instance.x + sprite.offset.x,
      instance.y + sprite.offset.y,
      sprite.frameWidth,
      sprite.frameHeight,
    );
    return;
  }

  // No picture, or a text label: draw something selectable and legible.
  context.fillStyle = 'rgba(44, 110, 138, 0.16)';
  context.fillRect(instance.x, instance.y, prototype.size.width, prototype.size.height);
  context.strokeStyle = '#2c6e8a';
  context.lineWidth = 1;
  context.strokeRect(
    instance.x + 0.5,
    instance.y + 0.5,
    prototype.size.width - 1,
    prototype.size.height - 1,
  );
  context.fillStyle = '#1d4d61';
  context.font = '8px ui-monospace, monospace';
  context.textBaseline = 'top';
  const label = prototype.components.text?.content ?? prototype.name ?? prototype.id;
  context.fillText(
    label.slice(0, Math.max(2, Math.floor(prototype.size.width / 4))),
    instance.x + 2,
    instance.y + 2,
  );
}
