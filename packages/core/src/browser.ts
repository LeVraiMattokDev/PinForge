import type { Project } from '@pinforge/schema';
import { Canvas2DImage, Canvas2DRenderer } from './canvas2d.js';
import { Game } from './game.js';
import { actionsForKey } from './input.js';
import { drawWorld } from './render.js';
import type { AssetStore, AudioOutput } from './renderer.js';

/** Turns an asset source into something a browser can fetch. */
export type SourceResolver = (source: string) => string;

export function relativeTo(base: string): SourceResolver {
  return (source) =>
    /^(data:|https?:|blob:|\/)/.test(source) ? source : `${base.replace(/\/$/, '')}/${source}`;
}

interface Sound {
  url: string;
  volume: number;
  loop: boolean;
}

export interface LoadedAssets {
  assets: AssetStore;
  audio: AudioOutput;
}

/**
 * Loads every asset a project names. A missing file is not fatal: the game runs
 * without that picture, which is far more useful while making one than a blank
 * screen and an error.
 */
export async function loadBrowserAssets(
  project: Project,
  resolve: SourceResolver = (source) => source,
): Promise<LoadedAssets> {
  const images = new Map<string, Canvas2DImage>();
  const sounds = new Map<string, Sound>();

  await Promise.all(
    project.assets.map(async (asset) => {
      const url = resolve(asset.source);
      if (asset.kind === 'image') {
        const image = await loadImage(url);
        if (image) images.set(asset.id, image);
        return;
      }
      sounds.set(asset.id, { url, volume: asset.volume, loop: asset.loop });
    }),
  );

  return {
    assets: { image: (id) => images.get(id) },
    audio: createAudio(sounds),
  };
}

function loadImage(url: string): Promise<Canvas2DImage | undefined> {
  return new Promise((settle) => {
    const image = new Image();
    image.onload = () => settle(new Canvas2DImage(image, image.naturalWidth, image.naturalHeight));
    image.onerror = () => settle(undefined);
    image.src = url;
  });
}

function createAudio(sounds: ReadonlyMap<string, Sound>): AudioOutput {
  const playing = new Map<string, HTMLAudioElement[]>();
  return {
    play(id, volume) {
      const sound = sounds.get(id);
      if (!sound) return;
      const element = new Audio(sound.url);
      element.volume = Math.max(0, Math.min(1, sound.volume * volume));
      element.loop = sound.loop;
      const others = playing.get(id) ?? [];
      others.push(element);
      playing.set(id, others);
      element.addEventListener('ended', () => {
        const list = playing.get(id);
        if (list)
          playing.set(
            id,
            list.filter((one) => one !== element),
          );
      });
      void element.play().catch(() => {});
    },
    stop(id) {
      for (const [key, elements] of playing) {
        if (id !== undefined && key !== id) continue;
        for (const element of elements) element.pause();
        playing.set(key, []);
      }
    },
  };
}

export interface Attachment {
  readonly renderer: Canvas2DRenderer;
  stop(): void;
}

/**
 * Runs a game on a canvas: keyboard, pointer, resizing and the frame loop. This
 * is the only host the runtime has, and the exported HTML uses exactly it.
 */
export function attachGame(canvas: HTMLCanvasElement, game: Game): Attachment {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot give PinForge a 2D canvas.');

  const settings = game.project.settings;
  const renderer = new Canvas2DRenderer(context, {
    scaleMode: settings.viewport.scaleMode,
    pixelArt: settings.pixelArt,
    frameColor: settings.backgroundColor,
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    const actions = actionsForKey(settings.input, event.code);
    if (actions.length === 0) return;
    event.preventDefault();
    for (const action of actions) game.input.press(action);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    for (const action of actionsForKey(settings.input, event.code)) game.input.release(action);
  };
  const onBlur = (): void => game.input.releaseAll();
  const onPointerDown = (event: PointerEvent): void => {
    const point = renderer.toGamePoint(event.clientX, event.clientY);
    game.click(point.x, point.y);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);

  let running = true;
  let last = performance.now();
  const frame = (now: number): void => {
    if (!running) return;
    const seconds = (now - last) / 1000;
    last = now;

    const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    game.advance(seconds);
    drawWorld(game, renderer, game.alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    renderer,
    stop() {
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      game.audio.stop();
    },
  };
}
