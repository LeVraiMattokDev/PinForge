import { validateProject, warningsAmong } from '@pinforge/schema';
import { openProject } from '../project-file.js';

/**
 * Command functions return what happened; only main.ts prints. The MCP server
 * calls into this package over stdio, where anything written to stdout would
 * corrupt the protocol.
 */
export function validate(target: string): string {
  const { project, file, migrations } = openProject(target);
  const scenes = project.scenes.length;
  const rules =
    project.globalEvents.length +
    project.scenes.reduce((total, scene) => total + scene.events.length, 0);

  // Opening the project already refused anything that would stop it running,
  // so whatever is left is legal and worth a second look.
  const warnings = warningsAmong(validateProject(project));

  return [
    ...migrations.map((step) => `Brought up to date: ${step}`),
    file,
    `${project.meta.name} looks good: ${scenes} ${scenes === 1 ? 'level' : 'levels'}, ` +
      `${project.entities.length} kinds of thing, ${rules} rules.`,
    ...(warnings.length === 0
      ? []
      : ['', 'Worth a look:', ...warnings.map((one) => `  ${one.path}\n    ${one.message}`)]),
  ].join('\n');
}
