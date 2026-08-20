/**
 * Everything the runtime is allowed to know about drawing. Game logic never
 * touches a canvas, an image or an audio element, so a WebGL backend can
 * replace the Canvas2D one without any of the simulation changing.
 */
export interface ImageHandle {
  readonly width: number;
  readonly height: number;
}

export interface AssetStore {
  image(id: string): ImageHandle | undefined;
}

export type TextSize = 'small' | 'normal' | 'large';
export type TextAlign = 'left' | 'center' | 'right';

export interface Renderer {
  /** Starts a frame. Coordinates given to the calls below are in game pixels. */
  begin(width: number, height: number, backgroundColor: string): void;
  sprite(
    image: ImageHandle,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    flipX: boolean,
  ): void;
  rect(x: number, y: number, width: number, height: number, color: string): void;
  text(value: string, x: number, y: number, color: string, size: TextSize, align: TextAlign): void;
  end(): void;
}

export interface AudioOutput {
  play(id: string, volume: number): void;
  stop(id?: string): void;
}

export const silentAudio: AudioOutput = { play: () => {}, stop: () => {} };
export const noAssets: AssetStore = { image: () => undefined };
