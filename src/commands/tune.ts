import { readRoster, writeRoster, ROSTER_PATH } from '../util/store.js';
import { bold, dim, green, red } from '../util/report.js';
import { runRender } from './render.js';

export interface TuneArgs {
  root: string;
  id: string;
  constraints: string[];
  /** Remove a standing correction by its 1-based index. */
  remove?: number;
  list?: boolean;
  emitters?: string[];
}

/**
 * Records a correction against an agent's spec.
 *
 * Corrections are appended, never merged into the generated body. Folding a
 * correction into the prose means the next regeneration silently discards it —
 * the failure that makes hand-tuned generated agents drift back to their
 * original behaviour a few edits later.
 */
export function runTune(args: TuneArgs): number {
  const roster = readRoster(args.root);
  if (!roster) {
    process.stderr.write(`${red('✕')} no ${ROSTER_PATH} found. Run \`agentfit init\` first.\n`);
    return 1;
  }

  const spec = roster.agents.find((a) => a.id === args.id || a.name === args.id);
  if (!spec) {
    const known = roster.agents.map((a) => a.id).join(', ') || '(none)';
    process.stderr.write(`${red('✕')} no agent "${args.id}" in this roster. Known: ${known}\n`);
    return 1;
  }

  if (args.list) {
    process.stdout.write(`${bold(spec.id)} — ${spec.constraints.length} standing correction(s)\n`);
    spec.constraints.forEach((c, i) => process.stdout.write(`  ${i + 1}. ${c}\n`));
    return 0;
  }

  if (args.remove !== undefined) {
    if (args.remove < 1 || args.remove > spec.constraints.length) {
      process.stderr.write(`${red('✕')} no correction #${args.remove} on ${spec.id}.\n`);
      return 1;
    }
    const [removed] = spec.constraints.splice(args.remove - 1, 1);
    process.stdout.write(`${green('✓')} removed: ${dim(String(removed))}\n`);
  }

  for (const constraint of args.constraints) {
    const text = constraint.trim();
    if (!text) continue;
    if (spec.constraints.includes(text)) {
      process.stdout.write(`${dim('· already present, skipped:')} ${text}\n`);
      continue;
    }
    spec.constraints.push(text);
    process.stdout.write(`${green('+')} ${text}\n`);
  }

  spec.version += 1;
  writeRoster(args.root, roster);
  process.stdout.write(`${dim(`${spec.id} is now spec v${spec.version}.`)}\n`);

  return runRender({ root: args.root, emitters: args.emitters });
}
