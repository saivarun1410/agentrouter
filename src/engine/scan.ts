import { basename, resolve } from 'node:path';
import { CATALOG } from '../catalog/index.js';
import { collectEvidence } from '../probes/index.js';
import { createContext } from '../probes/context.js';
import { gate } from './gate.js';
import {
  evidenceRef,
  type Admission,
  type AgentSpec,
  type Archetype,
  type Evidence,
  type Rejection,
  type Roster,
} from '../types.js';

export const GENERATOR = 'agentfit@0.1.0';

/**
 * Deliberately small. A roster the user will not read is a roster they will not
 * curate, and an uncurated roster is deleted wholesale on the first bad
 * suggestion. Over-budget candidates are reported, not silently dropped.
 */
export const DEFAULT_BUDGET = 5;

export interface ScanOptions {
  root: string;
  budget?: number;
  archetypes?: Archetype[];
}

export interface ScanResult {
  root: string;
  repoName: string;
  head: string | null;
  evidence: Evidence[];
  admitted: Admission[];
  /** Admitted on the evidence, but ranked below the budget cutoff. */
  deferred: Admission[];
  rejected: Rejection[];
}

export function scan(options: ScanOptions): ScanResult {
  const root = resolve(options.root);
  const budget = options.budget ?? DEFAULT_BUDGET;
  const ctx = createContext(root);
  const evidence = collectEvidence(root);
  const { admitted, rejected } = gate(options.archetypes ?? CATALOG, evidence);

  const ranked = [...admitted].sort((a, b) => b.score - a.score || a.archetype.id.localeCompare(b.archetype.id));

  return {
    root,
    repoName: basename(root),
    head: ctx.git(['rev-parse', '--short', 'HEAD'])?.trim() ?? null,
    evidence,
    admitted: ranked.slice(0, budget),
    deferred: ranked.slice(budget),
    rejected,
  };
}

export function toSpec(admission: Admission, result: ScanResult): AgentSpec {
  const { archetype, support } = admission;
  const body = archetype.body({
    support,
    all: result.evidence,
    repoName: result.repoName,
  });

  const supportingEvidence = support.flatMap((s) => s.evidence);

  return {
    id: archetype.id,
    name: archetype.id,
    description: `${archetype.purpose} ${archetype.invokeWhen}`,
    tools: archetype.tools,
    model: archetype.model,
    mechanisms: support.map((s) => s.mechanism),
    evidence: [...new Set(supportingEvidence.map(evidenceRef))],
    rejectedAlternative: `${archetype.alternative.kind} — rejected because ${archetype.alternative.reason}`,
    body,
    constraints: [],
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: GENERATOR,
  };
}

export function buildRoster(result: ScanResult, selected: Admission[]): Roster {
  return {
    schema: 1,
    repo: {
      root: result.root,
      name: result.repoName,
      scannedAt: new Date().toISOString(),
      head: result.head,
    },
    agents: selected.map((a) => toSpec(a, result)),
    rejections: result.rejected,
  };
}
