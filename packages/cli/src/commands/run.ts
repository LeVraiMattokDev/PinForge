import { createServer } from 'node:http';
import { buildHtml, readRuntimeBundle } from '../html.js';
import { inlineAssets } from '../inline.js';
import { openProject } from '../project-file.js';

/**
 * Serves the game the same way `export` writes it, so what is played here is
 * exactly what ships.
 */
export function run(target: string, port: number): void {
  const { project, directory, file } = openProject(target);
  const html = buildHtml(inlineAssets(project, directory), readRuntimeBundle());

  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  });

  server.listen(port, () => {
    process.stdout.write(`${project.meta.name} from ${file}\n`);
    process.stdout.write(`Playing at http://localhost:${port}\nPress control and C to stop.\n`);
  });
}
