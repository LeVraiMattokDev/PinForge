import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { loadProject, type Project } from '@pinforge/schema';

export const PROJECT_FILE_NAME = 'game.pinforge.json';

export interface OpenedProject {
  readonly project: Project;
  readonly file: string;
  readonly directory: string;
  readonly migrations: readonly string[];
}

/** Accepts a project file or the folder holding one. */
export function findProjectFile(target: string): string {
  const full = isAbsolute(target) ? target : resolve(process.cwd(), target);
  try {
    if (statSync(full).isDirectory()) return join(full, PROJECT_FILE_NAME);
  } catch {
    throw new Error(`There is nothing at ${target}.`);
  }
  return full;
}

/**
 * Reads, migrates, checks and returns a project, or throws an error written for
 * a person. Every command opens a project through here, so they all fail the
 * same way.
 */
export function openProject(target: string): OpenedProject {
  const file = findProjectFile(target);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Cannot read ${file}. Is that the right path?`);
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON, so nothing can read it yet.\n  ${(error as Error).message}`,
    );
  }

  const { project, applied } = loadProject(document);
  return { project, file, directory: dirname(file), migrations: applied };
}
