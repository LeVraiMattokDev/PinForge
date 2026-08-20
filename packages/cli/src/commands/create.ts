import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject } from '@pinforge/schema';
import { PROJECT_FILE_NAME } from '../project-file.js';

function templateDirectory(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, 'templates', 'starter');
    if (existsSync(candidate)) return candidate;
    directory = dirname(directory);
  }
  throw new Error('The starter template is missing from this copy of PinForge.');
}

/**
 * Copies the starter project, art included. A new user has something playable
 * before they have made a single decision, which is the whole point.
 */
export function create(target: string, name: string | undefined): string {
  const directory = resolve(process.cwd(), target);
  const file = join(directory, PROJECT_FILE_NAME);
  if (existsSync(file)) {
    throw new Error(`There is already a game at ${file}.`);
  }

  mkdirSync(directory, { recursive: true });
  cpSync(templateDirectory(), directory, { recursive: true });

  if (name) {
    const project: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const renamed = { ...(project as Record<string, unknown>) };
    renamed.meta = { ...(renamed.meta as Record<string, unknown>), name };
    parseProject(renamed);
    writeFileSync(file, `${JSON.stringify(renamed, null, 2)}\n`);
  }

  process.stdout.write(`Made a new game in ${directory}.\n\nNext:\n  pinforge run ${target}\n`);
  return file;
}
