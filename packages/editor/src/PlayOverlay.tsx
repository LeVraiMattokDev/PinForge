import { useEffect, useRef, useState } from 'react';
import { Game, attachGame, loadBrowserAssets, type Attachment } from '@pinforge/core';
import type { Project } from '@pinforge/schema';
import { Button } from './ui/controls.js';

/**
 * Play mode runs @pinforge/core, the same runtime the exported game uses. There
 * is no second implementation of anything a player can see, so what happens
 * here is what happens in the export.
 *
 * It starts on the level being edited rather than the level the game starts on,
 * because that is the one being worked on.
 */
export function PlayOverlay({
  project,
  sceneId,
  onStop,
}: {
  project: Project;
  sceneId: string;
  onStop: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  useEffect(() => {
    let attachment: Attachment | undefined;
    let cancelled = false;

    const start = async (): Promise<void> => {
      try {
        const from: Project = {
          ...project,
          settings: { ...project.settings, startScene: sceneId },
        };
        const { assets, audio } = await loadBrowserAssets(from);
        if (cancelled || !canvas.current) return;
        const game = new Game(from, { assets, audio, seed: Date.now() & 0xffffff || 1 });
        attachment = attachGame(canvas.current, game);
      } catch (error) {
        setProblem((error as Error).message);
      }
    };
    void start();

    return () => {
      cancelled = true;
      attachment?.stop();
    };
  }, [project, sceneId, attempt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onStop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStop]);

  const width = project.settings.viewport.width * 3;
  const height = project.settings.viewport.height * 3;

  return (
    <div className="play">
      <div className="play-inner">
        {problem === undefined ? (
          <canvas ref={canvas} style={{ width, height }} />
        ) : (
          <p style={{ color: '#fff', maxWidth: 400 }}>{problem}</p>
        )}
        <div className="play-bar">
          <Button kind="primary" onClick={() => setAttempt(attempt + 1)}>
            Start again
          </Button>
          <Button onClick={onStop}>Stop</Button>
          <span className="keys">Arrow keys or WASD to move, space to jump, escape to stop.</span>
        </div>
      </div>
    </div>
  );
}
