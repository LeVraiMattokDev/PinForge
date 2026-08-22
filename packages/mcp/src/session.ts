import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { statSync } from 'node:fs';
import {
  ProjectValidationError,
  errorsAmong,
  migrateToCurrent,
  parseProject,
  validateProject,
  warningsAmong,
  type Project,
  type ValidationIssue,
} from '@pinforge/schema';
import { diffJson, type Change } from './diff.js';

export const PROJECT_FILE_NAME = 'game.pinforge.json';

type JsonObject = Record<string, unknown>;

/**
 * The project being worked on, held as the file's own text rather than as a
 * fully expanded project. Mutations edit that text, so a game an assistant
 * touches keeps the shape a person wrote, without every default suddenly
 * appearing in it.
 *
 * There is no private side channel: this reads and writes the same
 * game.pinforge.json the editor and the command line use, through the same
 * validation.
 */
export class ProjectSession {
  private constructor(
    readonly file: string,
    private document: JsonObject,
  ) {}

  static open(target: string): ProjectSession {
    const file = locate(target);
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      throw new Error(`There is no project file at ${file}.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
    }
    const { document } = migrateToCurrent(parsed);
    const session = new ProjectSession(file, document);
    session.check(document);
    return session;
  }

  get directory(): string {
    return dirname(this.file);
  }

  /** The project as the runtime sees it, with every default filled in. */
  get project(): Project {
    return this.check(this.document);
  }

  /** The project as the file holds it. */
  get raw(): JsonObject {
    return structuredClone(this.document);
  }

  /**
   * Applies a change, checks the whole project, and only then writes. A change
   * that would leave the game broken fails with the reasons and touches nothing.
   */
  mutate(change: (document: JsonObject) => void): Change[] {
    const before = structuredClone(this.document);
    const after = structuredClone(this.document);
    change(after);
    this.check(after);

    this.document = after;
    writeFileSync(this.file, `${JSON.stringify(after, null, 2)}\n`);
    return diffJson(before, after);
  }

  /** Anything the last change was legal but unwise about. */
  warnings: readonly ValidationIssue[] = [];

  private check(document: JsonObject): Project {
    const project = parseProject(document);
    const issues = validateProject(project);
    const errors = errorsAmong(issues);
    if (errors.length > 0) {
      throw new ProjectValidationError('That change would leave the game broken.', errors);
    }
    this.warnings = warningsAmong(issues);
    return project;
  }
}

function locate(target: string): string {
  const full = isAbsolute(target) ? target : resolve(process.cwd(), target);
  try {
    if (statSync(full).isDirectory()) return join(full, PROJECT_FILE_NAME);
  } catch {
    throw new Error(`There is nothing at ${target}.`);
  }
  return full;
}

/** Reaches into the raw document for a scene, by id. */
export function sceneIn(document: JsonObject, id: string): JsonObject {
  const scenes = document.scenes;
  if (!Array.isArray(scenes)) throw new Error('This project has no scenes.');
  const scene = scenes.find((one): one is JsonObject => isObject(one) && one.id === id);
  if (!scene) throw new Error(`There is no level called "${id}".`);
  return scene;
}

export function listIn(owner: JsonObject, key: string): unknown[] {
  const existing = owner[key];
  if (Array.isArray(existing)) return existing;
  const created: unknown[] = [];
  owner[key] = created;
  return created;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { JsonObject };
