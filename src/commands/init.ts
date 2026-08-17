import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { buildRoster, scan, type ScanResult } from '../engine/scan.js';
import { emittersFor, planAll } from '../emitters/index.js';
import { applyWrites, readRepoFile, readRoster, writeRoster, ROSTER_PATH } from '../util/store.js';
import { bold, cyan, dim, green, heading, indentWrap, yellow } from '../util/report.js';
import type { Admission } from '../types.js';
import { printReport } from './scan.js';

export interface InitArgs {
  root: string;
  budget?: number;
  emitters?: string[];
  /** Skip both prompts: take every proposed agent and write without asking. */
  yes?: boolean;
}

export async function runInit(args: InitArgs): Promise<number> {
  const existing = readRoster(args.root);
  if (existing) {
    process.stdout.write(
      `${yellow('!')} ${ROSTER_PATH} already exists (${existing.agents.length} agents).\n` +
        `  Use ${bold('agentfit refresh')} to reconcile it with the current repository,\n` +
        `  or ${bold('agentfit render')} to rewrite the agent files from it.\n`,
    );
    return 1;
  }

  const result = scan({ root: args.root, budget: args.budget });
  printReport(result, false);

  if (result.admitted.length === 0) {
    process.stdout.write(
      `${dim('No agents to install. That is a real answer: this repository has no work')}\n` +
        `${dim('shaped like an agent yet. Re-run after CI, tests, or conventions land.')}\n`,
    );
    return 0;
  }

  const selected = args.yes ? result.admitted : await promptSelection(result);
  if (selected.length === 0) {
    process.stdout.write(`${dim('Nothing selected. No files written.')}\n`);
    return 0;
  }

  const roster = buildRoster(result, selected);
  const writes = planAll(roster, readRepoFile(args.root), emittersFor(args.emitters));

  process.stdout.write(heading('Planned writes') + '\n');
  process.stdout.write(`  ${green('+')} ${ROSTER_PATH} ${dim('(source of truth)')}\n`);
  for (const write of writes) {
    const mark = write.action === 'create' ? green('+') : write.action === 'update' ? yellow('~') : dim('=');
    process.stdout.write(`  ${mark} ${write.path} ${dim(`(${write.action}, ${write.contents.length} bytes)`)}\n`);
  }
  process.stdout.write('\n');

  if (!args.yes && !(await confirm('Write these files?'))) {
    process.stdout.write(`${dim('Aborted. No files written.')}\n`);
    return 0;
  }

  writeRoster(args.root, roster);
  const applied = applyWrites(args.root, writes);

  process.stdout.write(
    `\n${green('✓')} wrote ${applied.length + 1} files.\n` +
      `${dim(`  Edit ${ROSTER_PATH} or run \`agentfit tune <id> --constraint "..."\`, then \`agentfit render\`.`)}\n`,
  );
  return 0;
}

async function promptSelection(result: ScanResult): Promise<Admission[]> {
  if (!stdin.isTTY) return result.admitted;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    process.stdout.write(heading('Select agents to install') + '\n');
    result.admitted.forEach((admission, i) => {
      process.stdout.write(`  ${cyan(String(i + 1))}. ${bold(admission.archetype.id)}\n`);
      process.stdout.write(indentWrap(dim(admission.archetype.purpose), '     ') + '\n');
    });
    process.stdout.write('\n');

    const answer = (
      await rl.question(dim('Numbers (e.g. "1 3"), "all", or "none": '))
    ).trim().toLowerCase();

    if (answer === '' || answer === 'all' || answer === 'a') return result.admitted;
    if (answer === 'none' || answer === 'n' || answer === 'q') return [];

    const picked = new Set(
      answer
        .split(/[\s,]+/)
        .map((token) => Number.parseInt(token, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= result.admitted.length),
    );
    return [...picked].sort((a, b) => a - b).map((n) => result.admitted[n - 1] as Admission);
  } finally {
    rl.close();
  }
}

async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(dim(`${question} [Y/n] `))).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
