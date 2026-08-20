import { openProject } from '../project-file.js';

export function validate(target: string): void {
  const { project, file, migrations } = openProject(target);
  for (const step of migrations) {
    process.stdout.write(`Brought up to date: ${step}\n`);
  }
  const scenes = project.scenes.length;
  const rules =
    project.globalEvents.length +
    project.scenes.reduce((total, scene) => total + scene.events.length, 0);
  process.stdout.write(
    `${file}\n${project.meta.name} looks good: ${scenes} ${scenes === 1 ? 'level' : 'levels'}, ` +
      `${project.entities.length} kinds of thing, ${rules} rules.\n`,
  );
}
