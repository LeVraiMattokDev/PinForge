import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Project } from '@pinforge/schema';

const RUNTIME_RELATIVE = join('runtime', 'pinforge-runtime.js');

/** Finds the bundled browser runtime, whether running from source or from dist. */
export function readRuntimeBundle(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, RUNTIME_RELATIVE);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    directory = dirname(directory);
  }
  throw new Error('The browser runtime has not been built. Run "pnpm build" and try again.');
}

/**
 * One HTML file, no requests. The project is embedded as JSON with its assets
 * already inlined, and the runtime is the same one the editor plays with.
 */
export function buildHtml(project: Project, runtime: string): string {
  const title = escapeHtml(project.meta.name);
  const project_json = JSON.stringify(project).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: ${project.settings.backgroundColor};
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
        image-rendering: ${project.settings.pixelArt ? 'pixelated' : 'auto'};
        touch-action: none;
      }
    </style>
  </head>
  <body>
    <canvas id="pinforge-game"></canvas>
    <script>
      window.PINFORGE_PROJECT = ${project_json};
    </script>
    <script>
${runtime}
    </script>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    return '&quot;';
  });
}
