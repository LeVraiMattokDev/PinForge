import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildHtml, readRuntimeBundle } from '../html.js';
import { inlineAssets } from '../inline.js';
import { openProject } from '../project-file.js';

export function exportGame(target: string, out: string | undefined): string {
  const { project, directory } = openProject(target);
  const html = buildHtml(inlineAssets(project, directory), readRuntimeBundle());
  const file = resolve(process.cwd(), out ?? 'game.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  process.stdout.write(
    `${project.meta.name} exported to ${file} (${(html.length / 1024).toFixed(0)} kB).\n` +
      'It is one file with nothing else to upload. Open it in a browser, or put it anywhere.\n',
  );
  return file;
}
