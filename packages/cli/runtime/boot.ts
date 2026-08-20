/**
 * The entry point of an exported game. esbuild bundles this together with
 * @pinforge/core into one script, which the exported HTML page inlines.
 *
 * It is deliberately tiny: the export runs the same runtime as the editor's
 * play mode, so anything interesting belongs in core rather than here.
 */
import type { Project } from '@pinforge/schema';
import { Game, attachGame, loadBrowserAssets } from '@pinforge/core';

declare global {
  interface Window {
    PINFORGE_PROJECT?: Project;
  }
}

async function start(): Promise<void> {
  const project = window.PINFORGE_PROJECT;
  const canvas = document.getElementById('pinforge-game');
  if (!project || !(canvas instanceof HTMLCanvasElement)) return;

  const { assets, audio } = await loadBrowserAssets(project);
  const game = new Game(project, {
    assets,
    audio,
    seed: Math.floor(Math.random() * 0xffffffff) || 1,
  });
  attachGame(canvas, game);
}

void start();
