#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { create } from './commands/create.js';
import { exportGame } from './commands/export.js';
import { run } from './commands/run.js';
import { validate } from './commands/validate.js';

const HELP = `pinforge - make and play 2D games

  pinforge new <folder> [--name "My game"]   start a new game from the starter
  pinforge run <game> [--port 4321]          play it in your browser
  pinforge export <game> [--out game.html]   write one HTML file you can share
  pinforge validate <game>                   check the game file and say what is wrong

<game> is a game.pinforge.json file, or the folder holding one.
`;

function main(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      port: { type: 'string', short: 'p' },
      name: { type: 'string', short: 'n' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, target] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command ? 0 : 1;
  }

  switch (command) {
    case 'new':
      create(need(target, 'Which folder should the new game go in?'), values.name);
      return 0;
    case 'run':
      run(need(target, 'Which game should be played?'), Number(values.port ?? 4321));
      return 0;
    case 'export':
      exportGame(need(target, 'Which game should be exported?'), values.out);
      return 0;
    case 'validate':
      validate(need(target, 'Which game should be checked?'));
      return 0;
    default:
      process.stderr.write(`There is no command called "${command}".\n\n${HELP}`);
      return 1;
  }
}

function need(value: string | undefined, question: string): string {
  if (!value) throw new Error(question);
  return value;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
