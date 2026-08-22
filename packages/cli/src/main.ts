#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { create } from './commands/create.js';
import { exportGame } from './commands/export.js';
import { rules } from './commands/rules.js';
import { run } from './commands/run.js';
import { validate } from './commands/validate.js';

const HELP = `pinforge - make and play 2D games

  pinforge new <folder> [--name "My game"]   start a new game from the starter
  pinforge run <game> [--port 4321]          play it in your browser
  pinforge export <game> [--out game.html]   write one HTML file you can share
  pinforge validate <game>                   check the game file and say what is wrong
  pinforge rules <game>                      write every rule as PinScript sentences

<game> is a game.pinforge.json file, or the folder holding one.
`;

async function main(argv: string[]): Promise<number> {
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
    case 'new': {
      const folder = need(target, 'Which folder should the new game go in?');
      create(folder, values.name);
      say(`Made a new game in ${folder}.\n\nNext:\n  pinforge run ${folder}`);
      return 0;
    }
    case 'run': {
      const game = await run(
        need(target, 'Which game should be played?'),
        Number(values.port ?? 4321),
      );
      say(`${game.name} from ${game.file}`);
      say(`Playing at ${game.url}\nPress control and C to stop.`);
      return 0;
    }
    case 'export': {
      const exported = exportGame(need(target, 'Which game should be exported?'), values.out);
      say(`${exported.name} exported to ${exported.file} (${exported.kilobytes} kB).`);
      say('It is one file with nothing else to upload. Open it in a browser, or put it anywhere.');
      return 0;
    }
    case 'validate':
      say(validate(need(target, 'Which game should be checked?')));
      return 0;
    case 'rules':
      say(rules(need(target, 'Which game should be written out?')));
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

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
