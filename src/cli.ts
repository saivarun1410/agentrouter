#!/usr/bin/env node
import { runScan } from './commands/scan.js';
import { runInit } from './commands/init.js';
import { runRender } from './commands/render.js';
import { runTune } from './commands/tune.js';
import { runRefresh } from './commands/refresh.js';
import { GENERATOR } from './engine/scan.js';
import { bold, dim, red } from './util/report.js';

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string[]>;
}

const HELP = `${bold('agentfit')} — derive a repository's subagent roster from evidence.

${bold('Usage')}
  agentfit <command> [options]

${bold('Commands')}
  scan        Analyse the repository and report the proposed roster. Writes nothing.
  init        Choose from the proposed agents and write them.
  render      Regenerate agent files from .agentfit/roster.json. Idempotent.
  tune        Record a standing correction against an agent, then re-render.
  refresh     Re-scan and reconcile the roster with the repository as it is now.

${bold('Options')}
  -C, --root <dir>        Repository root (default: cwd)
      --budget <n>        Maximum agents to propose (default: 5)
      --emitters <list>   Comma-separated: claude-code, agents-md (default: both)
      --evidence          scan: show every supporting record, not just the first two
      --json              scan: machine-readable output
      --llm               scan: also let a model propose archetypes (same gate applies)
      --llm-model <id>    scan: model for --llm (default: claude-opus-5)
      --llm-effort <lvl>  scan: low | medium | high | xhigh | max (default: high)
  -y, --yes               init: accept all proposals and write without prompting
      --check             render: report drift and exit non-zero instead of writing
      --apply             refresh: write the reconciled roster
      --prune             refresh: also remove agents whose evidence has disappeared
      --constraint <text> tune: a standing correction (repeatable)
      --remove <n>        tune: drop correction #n
      --list              tune: list an agent's standing corrections
  -h, --help              Show this help
  -v, --version           Show version

${bold('Examples')}
  agentfit scan --evidence
  agentfit init
  agentfit tune test-triage --constraint "never re-run the full suite to check one class"
  agentfit refresh --apply --prune
`;

async function main(argv: string[]): Promise<number> {
  const args = parse(argv);

  // Version is checked first: `agentfit --version` parses to no command, which
  // would otherwise fall into the empty-command branch and print help instead.
  if (args.flags.has('version') || args.flags.has('v')) {
    process.stdout.write(`${GENERATOR}\n`);
    return 0;
  }
  if (args.flags.has('help') || args.flags.has('h') || args.command === 'help' || !args.command) {
    process.stdout.write(HELP);
    return 0;
  }

  const root = first(args, ['root', 'C']) ?? process.cwd();
  const budget = numeric(first(args, ['budget']));
  const emitters = first(args, ['emitters'])?.split(',').map((e) => e.trim()).filter(Boolean);

  switch (args.command) {
    case 'scan':
      await runScan({
        root,
        budget,
        showEvidence: args.flags.has('evidence'),
        json: args.flags.has('json'),
        llm: args.flags.has('llm'),
        llmModel: first(args, ['llm-model']),
        llmEffort: first(args, ['llm-effort']),
      });
      return 0;

    case 'init':
      return runInit({
        root,
        budget,
        emitters,
        yes: args.flags.has('yes') || args.flags.has('y'),
      });

    case 'render':
      return runRender({ root, emitters, check: args.flags.has('check') });

    case 'tune': {
      const id = args.positional[0];
      if (!id) {
        process.stderr.write(`${red('✕')} tune needs an agent id. Try \`agentfit tune --help\`.\n`);
        return 1;
      }
      return runTune({
        root,
        id,
        constraints: args.flags.get('constraint') ?? [],
        remove: numeric(first(args, ['remove'])),
        list: args.flags.has('list'),
        emitters,
      });
    }

    case 'refresh':
      return runRefresh({
        root,
        budget,
        emitters,
        apply: args.flags.has('apply'),
        prune: args.flags.has('prune'),
      });

    default:
      process.stderr.write(`${red('✕')} unknown command "${args.command}".\n${dim('Run `agentfit --help`.')}\n`);
      return 1;
  }
}

function parse(argv: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith('-')) {
      if (!command) command = token;
      else positional.push(token);
      continue;
    }
    const [name, inline] = splitFlag(token);
    const next = argv[i + 1];
    const takesValue = inline !== undefined || (next !== undefined && !next.startsWith('-'));
    const value = inline ?? (takesValue ? (next as string) : '');
    if (inline === undefined && takesValue) i++;
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }

  return { command, positional, flags };
}

function splitFlag(token: string): [string, string | undefined] {
  const stripped = token.replace(/^--?/, '');
  const eq = stripped.indexOf('=');
  if (eq === -1) return [stripped, undefined];
  return [stripped.slice(0, eq), stripped.slice(eq + 1)];
}

function first(args: ParsedArgs, names: string[]): string | undefined {
  for (const name of names) {
    const values = args.flags.get(name);
    if (values && values[0]) return values[0];
  }
  return undefined;
}

function numeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${red('✕')} ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
