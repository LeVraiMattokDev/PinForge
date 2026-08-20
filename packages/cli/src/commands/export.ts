import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildHtml, readRuntimeBundle } from '../html.js';
import { inlineAssets } from '../inline.js';
import { openProject } from '../project-file.js';

export interface ExportedGame {
  readonly file: string;
  readonly name: string;
  readonly kilobytes: number;
}

export function exportGame(target: string, out: string | undefined): ExportedGame {
  const { project, directory } = openProject(target);
  const html = buildHtml(inlineAssets(project, directory), readRuntimeBundle());
  const file = resolve(process.cwd(), out ?? 'game.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return { file, name: project.meta.name, kilobytes: Math.round(html.length / 1024) };
}
