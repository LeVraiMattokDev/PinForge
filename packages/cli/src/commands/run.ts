import { createServer } from 'node:http';
import { buildHtml, readRuntimeBundle } from '../html.js';
import { inlineAssets } from '../inline.js';
import { openProject } from '../project-file.js';

export interface RunningGame {
  readonly url: string;
  readonly name: string;
  readonly file: string;
  close(): void;
}

/**
 * Serves the game the same way `export` writes it, so what is played here is
 * exactly what ships.
 */
export function run(target: string, port: number): Promise<RunningGame> {
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

  return new Promise((settle, fail) => {
    server.once('error', fail);
    server.listen(port, () => {
      settle({
        url: `http://localhost:${port}`,
        name: project.meta.name,
        file,
        close: () => server.close(),
      });
    });
  });
}
