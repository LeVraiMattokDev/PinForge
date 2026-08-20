import * as z from 'zod';
import { Project } from './project.js';

/**
 * JSON Schema is generated from the Zod definitions and committed, so an editor,
 * a linter or the MCP server can check a project file without importing any
 * TypeScript. Continuous integration regenerates it and fails if the committed
 * copy has drifted.
 *
 * It describes the format as it is written, not as it is loaded: every field
 * with a default may be left out. That is what a person typing a file by hand
 * wants a validator to accept.
 */
export const PROJECT_SCHEMA_ID = 'https://pinforge.org/schema/pinforge-project.schema.json';

export function projectJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(Project, { io: 'input', target: 'draft-2020-12' });
  return { $schema: generated.$schema, $id: PROJECT_SCHEMA_ID, ...generated };
}
