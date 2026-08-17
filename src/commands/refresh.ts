import { scan, toSpec, type ScanResult } from '../engine/scan.js';
import { evidenceRef, type AgentSpec, type Roster } from '../types.js';
import { readRoster, writeRoster, ROSTER_PATH } from '../util/store.js';
import { bold, cyan, dim, green, heading, indentWrap, red, yellow } from '../util/report.js';
import { runRender } from './render.js';

export interface RefreshArgs {
  root: string;
  budget?: number;
  emitters?: string[];
  apply?: boolean;
  /** Also delete agents whose evidence has disappeared. */
  prune?: boolean;
}

interface Diff {
  added: string[];
  amended: string[];
  retired: string[];
  unchanged: string[];
}

/**
 * Reconciles the roster with the repository as it is now.
 *
 * This is what the provenance in the roster is for: because each spec records
 * the evidence that justified it, a re-scan can tell the difference between an
 * agent that has drifted and one whose reason for existing has gone away.
 */
export function runRefresh(args: RefreshArgs): number {
  const roster = readRoster(args.root);
  if (!roster) {
    process.stderr.write(`${red('✕')} no ${ROSTER_PATH} found. Run \`agentfit init\` first.\n`);
    return 1;
  }

  const result = scan({ root: args.root, budget: args.budget });
  const diff = computeDiff(roster, result);
  report(diff, roster, result);

  if (!args.apply) {
    process.stdout.write(
      `\n${dim('This was a dry run. Re-run with --apply to update the roster')}` +
        `${args.prune ? '' : dim(' (add --prune to remove retired agents)')}${dim('.')}\n`,
    );
    return 0;
  }

  applyDiff(roster, result, diff, args.prune ?? false);
  writeRoster(args.root, roster);
  process.stdout.write(`\n${green('✓')} roster updated.\n`);
  return runRender({ root: args.root, emitters: args.emitters });
}

function computeDiff(roster: Roster, result: ScanResult): Diff {
  const current = new Map(roster.agents.map((a) => [a.id, a]));
  const admitted = new Map(result.admitted.map((a) => [a.archetype.id, a]));

  const added = [...admitted.keys()].filter((id) => !current.has(id));
  const retired = [...current.keys()].filter((id) => !admitted.has(id));
  const amended: string[] = [];
  const unchanged: string[] = [];

  for (const [id, spec] of current) {
    const admission = admitted.get(id);
    if (!admission) continue;
    const fresh = toSpec(admission, result);
    const evidenceChanged =
      JSON.stringify([...spec.evidence].sort()) !== JSON.stringify([...fresh.evidence].sort());
    if (evidenceChanged || spec.body !== fresh.body) amended.push(id);
    else unchanged.push(id);
  }

  return { added, amended, retired, unchanged };
}

function report(diff: Diff, roster: Roster, result: ScanResult): void {
  const out = (line = '') => process.stdout.write(`${line}\n`);
  out(heading(`Refresh — ${result.repoName}`));
  out(dim(`roster written ${roster.repo.scannedAt}, ${roster.agents.length} agents`));

  if (diff.added.length === 0 && diff.amended.length === 0 && diff.retired.length === 0) {
    out(`\n${green('✓')} the roster still matches the repository. Nothing to do.`);
    return;
  }

  for (const id of diff.added) {
    const admission = result.admitted.find((a) => a.archetype.id === id);
    out(`\n  ${green('+')} ${bold(id)} ${dim('— newly justified')}`);
    if (admission) {
      out(indentWrap(admission.archetype.purpose, '    '));
      for (const s of admission.support) {
        out(dim(`    ${s.mechanism}: ${s.evidence[0]?.value ?? ''}`));
      }
    }
  }

  for (const id of diff.amended) {
    out(`\n  ${yellow('~')} ${bold(id)} ${dim('— evidence or generated body changed')}`);
    const spec = roster.agents.find((a) => a.id === id);
    const admission = result.admitted.find((a) => a.archetype.id === id);
    if (!spec || !admission) continue;
    const fresh = toSpec(admission, result);
    for (const ref of fresh.evidence.filter((r) => !spec.evidence.includes(r))) {
      out(dim(`    + ${ref}`));
    }
    for (const ref of spec.evidence.filter((r) => !fresh.evidence.includes(r))) {
      out(dim(`    - ${ref}`));
    }
    if (spec.constraints.length > 0) {
      out(cyan(`    ${spec.constraints.length} standing correction(s) will be preserved.`));
    }
  }

  for (const id of diff.retired) {
    out(`\n  ${red('-')} ${bold(id)} ${dim('— no longer justified by any evidence')}`);
    const spec = roster.agents.find((a) => a.id === id);
    if (spec) {
      out(indentWrap(dim(`was justified by: ${spec.mechanisms.join(', ')}`), '    '));
      if (spec.constraints.length > 0) {
        out(indentWrap(
          yellow(`has ${spec.constraints.length} standing correction(s) — pruning discards them.`),
          '    ',
        ));
      }
    }
  }

  if (diff.unchanged.length > 0) {
    process.stdout.write(`\n${dim(`  unchanged: ${diff.unchanged.join(', ')}`)}\n`);
  }
}

function applyDiff(roster: Roster, result: ScanResult, diff: Diff, prune: boolean): void {
  for (const id of diff.added) {
    const admission = result.admitted.find((a) => a.archetype.id === id);
    if (admission) roster.agents.push(toSpec(admission, result));
  }

  for (const id of diff.amended) {
    const spec = roster.agents.find((a) => a.id === id);
    const admission = result.admitted.find((a) => a.archetype.id === id);
    if (!spec || !admission) continue;
    Object.assign(spec, regenerate(spec, toSpec(admission, result)));
  }

  if (prune) {
    roster.agents = roster.agents.filter((a) => !diff.retired.includes(a.id));
  }

  roster.rejections = result.rejected;
  roster.repo.scannedAt = new Date().toISOString();
  roster.repo.head = result.head;
}

/** Regenerated content replaces the body; user corrections carry across. */
function regenerate(existing: AgentSpec, fresh: AgentSpec): AgentSpec {
  return {
    ...fresh,
    constraints: existing.constraints,
    version: existing.version + 1,
  };
}
