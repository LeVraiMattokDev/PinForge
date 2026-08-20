import { Canvas2DImage, type AssetStore, type ImageHandle } from '@pinforge/core';
import type { Project } from '@pinforge/schema';

interface Entry {
  source: string;
  image: Canvas2DImage | undefined;
}

/**
 * Loads the project's pictures so the editor can draw with them. A picture that
 * fails to load is not an error: the level still draws, with a box where the art
 * would be, which is far more useful while making a game than a blank screen.
 */
export class EditorAssets implements AssetStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly onLoaded: () => void) {}

  sync(project: Project): void {
    for (const asset of project.assets) {
      if (asset.kind !== 'image') continue;
      const existing = this.entries.get(asset.id);
      if (existing?.source === asset.source) continue;

      const entry: Entry = { source: asset.source, image: undefined };
      this.entries.set(asset.id, entry);
      const image = new Image();
      image.onload = () => {
        entry.image = new Canvas2DImage(image, image.naturalWidth, image.naturalHeight);
        this.onLoaded();
      };
      image.src = asset.source;
    }
  }

  image(id: string): ImageHandle | undefined {
    return this.entries.get(id)?.image;
  }

  drawable(id: string): Canvas2DImage | undefined {
    return this.entries.get(id)?.image;
  }
}
