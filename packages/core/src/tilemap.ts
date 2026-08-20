import type { Project, Scene, Tileset } from '@pinforge/schema';

export const EMPTY_TILE = -1;

interface Layer {
  readonly id: string;
  readonly grid: Int32Array;
  readonly collides: boolean;
  readonly tileTags: ReadonlyMap<number, readonly string[]>;
}

/**
 * The decoded grid. The file stores a legend and rows of characters because
 * that is readable; the runtime wants numbers, so the translation happens once
 * when a scene loads.
 */
export class Tilemap {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly widthInPixels: number;
  readonly heightInPixels: number;

  private readonly layers: Layer[];
  private readonly solid: Uint8Array;
  private readonly oneWay: Uint8Array;
  private readonly tagged = new Map<string, Uint8Array>();

  constructor(scene: Scene, project: Project) {
    this.columns = scene.size.columns;
    this.rows = scene.size.rows;
    this.tileSize = scene.tileSize;
    this.widthInPixels = this.columns * this.tileSize;
    this.heightInPixels = this.rows * this.tileSize;

    const tagsByTileset = new Map<string, ReadonlyMap<number, readonly string[]>>();
    for (const tileset of project.tilesets) tagsByTileset.set(tileset.id, tileTags(tileset));

    this.layers = scene.layers.map((layer) => {
      const grid = new Int32Array(this.columns * this.rows).fill(EMPTY_TILE);
      layer.rows.forEach((row, rowIndex) => {
        [...row].forEach((character, columnIndex) => {
          const tile = layer.legend[character];
          if (tile !== null && tile !== undefined)
            grid[rowIndex * this.columns + columnIndex] = tile;
        });
      });
      return {
        id: layer.id,
        grid,
        collides: layer.collides,
        tileTags: tagsByTileset.get(layer.tileset) ?? new Map(),
      };
    });

    const size = this.columns * this.rows;
    this.solid = new Uint8Array(size);
    this.oneWay = new Uint8Array(size);
    for (const layer of this.layers) {
      for (const tags of layer.tileTags.values()) {
        for (const tag of tags) {
          if (!this.tagged.has(tag)) this.tagged.set(tag, new Uint8Array(size));
        }
      }
    }
    for (let cell = 0; cell < size; cell += 1) this.recompute(cell);
  }

  private recompute(cell: number): void {
    this.solid[cell] = 0;
    this.oneWay[cell] = 0;
    for (const cells of this.tagged.values()) cells[cell] = 0;

    for (const layer of this.layers) {
      const tile = layer.grid[cell] ?? EMPTY_TILE;
      if (tile === EMPTY_TILE) continue;
      for (const tag of layer.tileTags.get(tile) ?? []) {
        const cells = this.tagged.get(tag);
        if (cells) cells[cell] = 1;
        if (!layer.collides) continue;
        if (tag === 'solid') this.solid[cell] = 1;
        if (tag === 'one-way') this.oneWay[cell] = 1;
      }
    }
  }

  private inside(column: number, row: number): boolean {
    return column >= 0 && column < this.columns && row >= 0 && row < this.rows;
  }

  isSolid(column: number, row: number): boolean {
    return this.inside(column, row) && this.solid[row * this.columns + column] === 1;
  }

  isOneWay(column: number, row: number): boolean {
    return this.inside(column, row) && this.oneWay[row * this.columns + column] === 1;
  }

  hasTag(tag: string, column: number, row: number): boolean {
    if (!this.inside(column, row)) return false;
    return this.tagged.get(tag)?.[row * this.columns + column] === 1;
  }

  get tags(): readonly string[] {
    return [...this.tagged.keys()];
  }

  tileAt(layerId: string, column: number, row: number): number {
    if (!this.inside(column, row)) return EMPTY_TILE;
    const layer = this.layers.find((one) => one.id === layerId);
    return layer?.grid[row * this.columns + column] ?? EMPTY_TILE;
  }

  setTile(layerId: string, column: number, row: number, tile: number | null): void {
    if (!this.inside(column, row)) return;
    const layer = this.layers.find((one) => one.id === layerId);
    if (!layer) return;
    const cell = row * this.columns + column;
    layer.grid[cell] = tile ?? EMPTY_TILE;
    this.recompute(cell);
  }

  /** The decoded grid of a layer, for drawing. */
  gridOf(layerId: string): Int32Array | undefined {
    return this.layers.find((one) => one.id === layerId)?.grid;
  }
}

function tileTags(tileset: Tileset): ReadonlyMap<number, readonly string[]> {
  const tags = new Map<number, readonly string[]>();
  for (const tile of tileset.tiles) {
    if (tile.tags.length > 0) tags.set(tile.index, tile.tags);
  }
  return tags;
}
