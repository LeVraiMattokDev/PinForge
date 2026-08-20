import type { ScaleMode } from '@pinforge/schema';
import type { ImageHandle, Renderer, TextAlign, TextSize } from './renderer.js';

export class Canvas2DImage implements ImageHandle {
  constructor(
    readonly source: CanvasImageSource,
    readonly width: number,
    readonly height: number,
  ) {}
}

const TEXT_PIXELS: Record<TextSize, number> = { small: 6, normal: 8, large: 12 };

export interface Canvas2DOptions {
  scaleMode: ScaleMode;
  pixelArt: boolean;
  /** Shown around the game when the window does not match the viewport shape. */
  frameColor: string;
}

/**
 * The first and, for now, only Renderer. Everything that knows about a canvas
 * lives in this file, so a WebGL backend is a second file rather than a rewrite.
 */
export class Canvas2DRenderer implements Renderer {
  private scaleX = 1;
  private scaleY = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly options: Canvas2DOptions,
  ) {}

  begin(width: number, height: number, backgroundColor: string): void {
    const canvas = this.context.canvas;
    if (this.options.scaleMode === 'stretch') {
      this.scaleX = canvas.width / width;
      this.scaleY = canvas.height / height;
    } else {
      let scale = Math.min(canvas.width / width, canvas.height / height);
      if (this.options.scaleMode === 'integer') scale = Math.max(1, Math.floor(scale));
      this.scaleX = scale;
      this.scaleY = scale;
    }
    this.offsetX = Math.floor((canvas.width - width * this.scaleX) / 2);
    this.offsetY = Math.floor((canvas.height - height * this.scaleY) / 2);

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.imageSmoothingEnabled = !this.options.pixelArt;
    this.context.fillStyle = this.options.frameColor;
    this.context.fillRect(0, 0, canvas.width, canvas.height);
    this.context.setTransform(this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY);
    this.context.save();
    this.context.beginPath();
    this.context.rect(0, 0, width, height);
    this.context.clip();
    this.context.fillStyle = backgroundColor;
    this.context.fillRect(0, 0, width, height);
  }

  sprite(
    image: ImageHandle,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    flipX: boolean,
  ): void {
    const source = (image as Canvas2DImage).source;
    if (!source) return;
    if (flipX) {
      this.context.save();
      this.context.translate(dx + sw, dy);
      this.context.scale(-1, 1);
      this.context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
      this.context.restore();
      return;
    }
    this.context.drawImage(source, sx, sy, sw, sh, dx, dy, sw, sh);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.context.fillStyle = color;
    this.context.fillRect(x, y, width, height);
  }

  text(value: string, x: number, y: number, color: string, size: TextSize, align: TextAlign): void {
    this.context.font = `${TEXT_PIXELS[size]}px monospace`;
    this.context.fillStyle = color;
    this.context.textAlign = align;
    this.context.textBaseline = 'top';
    this.context.fillText(value, x, y);
  }

  end(): void {
    this.context.restore();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Turns a point on the page into a point in the game. */
  toGamePoint(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.context.canvas.getBoundingClientRect();
    const pixelX = ((clientX - bounds.left) / bounds.width) * this.context.canvas.width;
    const pixelY = ((clientY - bounds.top) / bounds.height) * this.context.canvas.height;
    return {
      x: (pixelX - this.offsetX) / this.scaleX,
      y: (pixelY - this.offsetY) / this.scaleY,
    };
  }
}
