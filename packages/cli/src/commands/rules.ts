import { printScript } from '@pinforge/script';
import { openProject } from '../project-file.js';

/**
 * Writes every rule in the game as PinScript, grouped the way the editor
 * groups them. The # headings are comments, so any section pastes straight
 * back into the editor's script view.
 */
export function rules(target: string): string {
  const { project } = openProject(target);
  const sections: string[] = [];

  if (project.globalEvents.length > 0) {
    sections.push(`# Rules for the whole game.\n\n${printScript(project.globalEvents)}`);
  }
  for (const scene of project.scenes) {
    if (scene.events.length === 0) continue;
    sections.push(
      `# Rules for the level "${scene.name ?? scene.id}".\n\n${printScript(scene.events)}`,
    );
  }

  return sections.length > 0 ? sections.join('\n') : `${project.meta.name} has no rules yet.`;
}
