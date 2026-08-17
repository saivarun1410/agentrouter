import type { Evidence } from '../types.js';
import { isEntirelyGenerated, stripManagedBlocks } from '../util/managed.js';
import type { Probe, ProbeContext } from './context.js';

const RULE_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'CONTRIBUTING.md', '.github/copilot-instructions.md'];

/**
 * Phrasing that indicates a standing obligation to update a document.
 * The lookbehind matters: without it the path match can start partway through
 * `docs/implementation-status.md` and capture `status.md`.
 */
const DOCS_CONTRACT = /\b(update|maintain|record|append to|keep .* current)\b[^.\n]{0,60}?(?<![\w./-])([\w-]+(?:[/.][\w-]+)*\.md)\b/gi;

/**
 * Reads rules the repo has already written down. These are used to *subtract*:
 * a constraint already stated in CLAUDE.md must be referenced by generated
 * agents, never restated, or the two copies diverge on the first edit.
 */
export const repoRulesProbe: Probe = {
  name: 'repo-rules',
  run(ctx: ProbeContext): Evidence[] {
    const evidence: Evidence[] = [];

    for (const file of RULE_FILES) {
      const stored = ctx.read(file);
      if (!stored) continue;
      // Never treat agentfit's own output as repository evidence.
      if (isEntirelyGenerated(stored)) continue;
      const raw = stripManagedBlocks(stored);
      const lines = raw.split('\n').length;
      evidence.push({
        probe: 'repo-rules',
        kind: 'stated-rules',
        value: `${file} (${lines} lines)`,
        source: file,
        confidence: lines > 40 ? 'high' : 'medium',
        data: { file, lines },
      });
      evidence.push(...docsContracts(raw, file));
    }
    return evidence;
  },
};

function docsContracts(raw: string, file: string): Evidence[] {
  const found = new Map<string, string>();
  for (const match of raw.matchAll(DOCS_CONTRACT)) {
    const target = match[2];
    if (!target || found.has(target)) continue;
    found.set(target, match[0].trim());
  }
  return [...found.entries()].slice(0, 3).map(([target, phrase]) => ({
    probe: 'repo-rules',
    kind: 'docs-contract',
    value: `${target} must be kept current ("${truncate(phrase, 70)}")`,
    source: file,
    confidence: 'high' as const,
    data: { target },
  }));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
