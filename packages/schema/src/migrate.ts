import { CURRENT_FORMAT_VERSION } from './project.js';
import { ProjectFormatError } from './errors.js';

export type JsonObject = Record<string, unknown>;

/**
 * One step of the migration chain. A migration takes a document at version
 * `from` and returns the same game at version `to`.
 *
 * The runner, not the migration, writes the new formatVersion, so a migration
 * cannot forget to bump it.
 */
export interface Migration {
  readonly from: number;
  readonly to: number;
  /** One line, in the past tense, describing what changed. Shown to the user. */
  readonly description: string;
  migrate(document: JsonObject): JsonObject;
}

export interface MigrationResult {
  readonly document: JsonObject;
  /** What ran, in order. Empty when the file was already current. */
  readonly applied: readonly string[];
}

/**
 * The chain, in order. It is empty because format version 1 is the first one.
 *
 * To add version 2: append a migration with from: 1, to: 2, raise
 * CURRENT_FORMAT_VERSION, and add a golden file to test/golden that opens the
 * old shape and asserts the new one.
 */
export const MIGRATIONS: readonly Migration[] = [];

export function readFormatVersion(document: unknown): number {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new ProjectFormatError('A PinForge project must be a JSON object.');
  }
  const version = (document as JsonObject).formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError(
      'This file has no formatVersion, so it is not a PinForge project. Every project starts with { "formatVersion": 1 }.',
    );
  }
  return version;
}

export interface MigrateOptions {
  /** Override the chain. Used by the tests, and by nothing else. */
  readonly migrations?: readonly Migration[];
  readonly target?: number;
}

/** Brings a document up to the current format version, or explains why it cannot. */
export function migrateToCurrent(document: unknown, options: MigrateOptions = {}): MigrationResult {
  const migrations = options.migrations ?? MIGRATIONS;
  const target = options.target ?? CURRENT_FORMAT_VERSION;

  let version = readFormatVersion(document);
  if (version > target) {
    throw new ProjectFormatError(
      `This project was made with a newer version of PinForge (format version ${version}). This copy understands format version ${target}. Update PinForge to open it.`,
    );
  }

  let current = structuredClone(document) as JsonObject;
  const applied: string[] = [];

  while (version < target) {
    const step = migrations.find((migration) => migration.from === version);
    if (!step) {
      throw new ProjectFormatError(
        `This project uses format version ${version} and this copy of PinForge has no way to bring it up to version ${target}.`,
      );
    }
    if (step.to <= step.from) {
      throw new ProjectFormatError(
        `The migration from version ${step.from} is registered as going to version ${step.to}, which would never finish. This is a bug in PinForge.`,
      );
    }
    current = step.migrate(current);
    current.formatVersion = step.to;
    applied.push(`${step.from} to ${step.to}: ${step.description}`);
    version = step.to;
  }

  return { document: current, applied };
}
