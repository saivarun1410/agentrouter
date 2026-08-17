import { scan, type ScanResult } from '../engine/scan.js';
import { MECHANISM_DESCRIPTIONS } from '../types.js';
import { bold, cyan, dim, green, heading, indentWrap, red, yellow } from '../util/report.js';

export interface ScanArgs {
  root: string;
  budget?: number;
  showEvidence?: boolean;
  json?: boolean;
  /** Ask a model to propose additional archetypes, still subject to the gate. */
  llm?: boolean;
  llmModel?: string;
  llmEffort?: string;
}

export async function runScan(args: ScanArgs): Promise<ScanResult> {
  const result = args.llm ? await scanProposed(args) : scan({ root: args.root, budget: args.budget });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, replacer, 2)}\n`);
    return result;
  }
  printReport(result, args.showEvidence ?? false);
  return result;
}

async function scanProposed(args: ScanArgs): Promise<ScanResult> {
  const { scanWithProposals } = await import('../llm/index.js');
  const result = await scanWithProposals({
    root: args.root,
    budget: args.budget,
    llm: { model: args.llmModel, effort: args.llmEffort },
  });

  if (!args.json) {
    const out = (line = '') => process.stdout.write(`${line}\n`);
    out(heading('Model-proposed archetypes'));
    out(
      result.proposedIds.length > 0
        ? dim(`  admitted after the same gate: ${result.proposedIds.join(', ')}`)
        : dim('  the model proposed nothing that survived the gate.'),
    );
    for (const { id, reason } of result.discarded) {
      out(`  ${red('✕')} ${id} ${dim('— discarded before the gate:')} ${dim(reason)}`);
    }
  }
  return result;
}

/** Archetypes carry functions; strip them so `--json` stays serialisable. */
function replacer(key: string, value: unknown): unknown {
  if (key === 'claims' || key === 'body') return undefined;
  return value;
}

export function printReport(result: ScanResult, showEvidence: boolean): void {
  const out = (line = '') => process.stdout.write(`${line}\n`);

  out(heading(`agentrouter — ${result.repoName}`));
  out(dim(`${result.root}${result.head ? ` @ ${result.head}` : ''}`));
  out(dim(`${result.evidence.length} evidence records from ${countProbes(result)} probes`));

  out(heading(`Proposed agents (${result.admitted.length})`));
  if (result.admitted.length === 0) {
    out(dim('  Nothing in the catalog was justified by this repository\'s evidence.'));
  }
  for (const admission of result.admitted) {
    const { archetype, support } = admission;
    out(`\n  ${green('●')} ${bold(archetype.id)} ${dim(`· score ${admission.score}`)}`);
    out(indentWrap(archetype.purpose, '    '));
    for (const s of support) {
      out(`    ${cyan(s.mechanism)} ${dim('—')} ${dim(truncate(s.rationale, 88))}`);
      const shown = showEvidence ? s.evidence : s.evidence.slice(0, 2);
      for (const e of shown) {
        out(dim(`      · ${e.value}  (${e.source})`));
      }
      if (!showEvidence && s.evidence.length > 2) {
        out(dim(`      · …${s.evidence.length - 2} more`));
      }
    }
    out(dim(`    tools: ${archetype.tools.join(', ')}   model: ${archetype.model}`));
  }

  if (result.deferred.length > 0) {
    out(heading(`Justified but over budget (${result.deferred.length})`));
    out(dim('  Raise --budget to include these.'));
    for (const admission of result.deferred) {
      out(`  ${yellow('○')} ${admission.archetype.id} ${dim(`· score ${admission.score}`)}`);
    }
  }

  out(heading(`Rejected (${result.rejected.length})`));
  for (const rejection of result.rejected) {
    out(`\n  ${red('✕')} ${bold(rejection.archetypeId)} ${dim('—')} ${rejection.verdict}`);
    out(indentWrap(rejection.detail, '    '));
    const unmet = rejection.unsatisfied
      .map((m) => `${m} (${MECHANISM_DESCRIPTIONS[m]})`)
      .join('; ');
    out(indentWrap(dim(`unsatisfied: ${unmet}`), '    '));
  }

  out();
  out(dim('Next: `agentrouter init` to choose from the proposed agents and write them.'));
  out();
}

function countProbes(result: ScanResult): number {
  return new Set(result.evidence.map((e) => e.probe)).size;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
