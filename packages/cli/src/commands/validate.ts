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

  return [
    ...migrations.map((step) => `Brought up to date: ${step}`),
    file,
    `${project.meta.name} looks good: ${scenes} ${scenes === 1 ? 'level' : 'levels'}, ` +
      `${project.entities.length} kinds of thing, ${rules} rules.`,
  ].join('\n');
}
