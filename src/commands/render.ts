import { emittersFor, planAll } from '../emitters/index.js';
import { applyWrites, readRepoFile, readRoster, ROSTER_PATH } from '../util/store.js';
import { dim, green, red, yellow } from '../util/report.js';

export interface RenderArgs {
  root: string;
  emitters?: string[];
  /** Report what would change and exit non-zero if anything would. */
  check?: boolean;
}

/**
 * Regenerates agent files from the roster. Idempotent, so it is safe to run in
 * CI: commit `.agentfit/roster.json`, gitignore the rendered files, and
 * regenerate on checkout.
 */
export function runRender(args: RenderArgs): number {
  const roster = readRoster(args.root);
  if (!roster) {
    process.stderr.write(
      `${red('✕')} no ${ROSTER_PATH} found. Run ${'`agentfit init`'} first.\n`,
    );
    return 1;
  }

  const writes = planAll(roster, readRepoFile(args.root), emittersFor(args.emitters));
  const changed = writes.filter((w) => w.action !== 'unchanged');

  if (args.check) {
    if (changed.length === 0) {
      process.stdout.write(`${green('✓')} rendered files are up to date.\n`);
      return 0;
    }
    process.stdout.write(`${yellow('!')} ${changed.length} file(s) would change:\n`);
    for (const write of changed) {
      process.stdout.write(`  ${write.action === 'create' ? '+' : '~'} ${write.path}\n`);
    }
    process.stdout.write(dim('  Run `agentfit render` to update them.\n'));
    return 1;
  }

  const applied = applyWrites(args.root, writes);
  if (applied.length === 0) {
    process.stdout.write(`${green('✓')} already up to date (${writes.length} files checked).\n`);
    return 0;
  }
  for (const write of applied) {
    process.stdout.write(`  ${write.action === 'create' ? green('+') : yellow('~')} ${write.path}\n`);
  }
  process.stdout.write(`${green('✓')} rendered ${applied.length} file(s).\n`);
  return 0;
}
