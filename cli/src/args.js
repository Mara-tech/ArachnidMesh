import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const VERBS = ['install', 'update', 'configure', 'remove', 'doctor'];

const HELP = `
  arachnid-mesh — install and update agent tooling into your project

  Usage
    npx @mara-tech/arachnid-mesh [verb] [options]

  Verbs
    install     add components to this project
    update      refresh installed components
    configure   change answers without touching versions
    remove      take components out
    doctor      check the installation is complete and coherent

  Options
    -p, --project <dir>    project to work on            (default: cwd)
    -c, --component <ids>  comma-separated, e.g. notion-backlog/go
    -s, --set <k=v>        answer a question; repeatable
        --config <file>    JSON file of answers
    -y, --yes              non-interactive: no prompts, no confirmation
    -h, --help             this text
    -v, --version

  Non-interactive example
    npx @mara-tech/arachnid-mesh install --yes \\
      --component notion-backlog/go,notion-backlog/go-auto \\
      --set mainBranch=main --set localChecks="npm test"
`;

export function parseArgs(argv) {
  const options = {
    verb: null,
    projectRoot: process.cwd(),
    components: [],
    answers: {},
    yes: false,
    help: false,
    version: false,
  };

  const rest = [...argv];

  while (rest.length) {
    const arg = rest.shift();

    if (VERBS.includes(arg) && !options.verb) {
      options.verb = arg;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '-p' || arg === '--project') {
      options.projectRoot = resolve(rest.shift() ?? '.');
    } else if (arg === '-c' || arg === '--component') {
      options.components.push(...(rest.shift() ?? '').split(',').filter(Boolean));
    } else if (arg === '-s' || arg === '--set') {
      const pair = rest.shift() ?? '';
      const index = pair.indexOf('=');
      if (index === -1) throw new Error(`--set expects key=value, got "${pair}"`);
      options.answers[pair.slice(0, index)] = pair.slice(index + 1);
    } else if (arg === '--config') {
      const path = resolve(rest.shift() ?? '');
      if (!existsSync(path)) throw new Error(`--config file not found: ${path}`);
      Object.assign(options.answers, JSON.parse(readFileSync(path, 'utf8')));
    } else {
      throw new Error(`Unknown argument: ${arg}\nRun with --help.`);
    }
  }

  return options;
}

export function helpText() {
  return HELP;
}
