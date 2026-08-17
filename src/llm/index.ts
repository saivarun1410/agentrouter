import { CATALOG } from '../catalog/index.js';
import { scan, type ScanOptions, type ScanResult } from '../engine/scan.js';
import { adaptProposals, type AdaptedProposals } from './adapt.js';
import { proposeArchetypes, DEFAULT_LLM_MODEL, type LlmOptions } from './client.js';

export { proposeArchetypes, adaptProposals, DEFAULT_LLM_MODEL };
export type { LlmOptions, AdaptedProposals };

export interface LlmScanResult extends ScanResult {
  /** Ids of model-proposed archetypes that survived the gate. */
  proposedIds: string[];
  /** Proposals rejected before the gate, with reasons. */
  discarded: AdaptedProposals['discarded'];
}

/**
 * A deterministic scan, then a model pass that may propose additional
 * archetypes — which are re-gated against the same evidence alongside the
 * catalog. The model widens the field of candidates; it never widens the bar.
 */
export async function scanWithProposals(
  options: ScanOptions & { llm?: LlmOptions },
): Promise<LlmScanResult> {
  const base = scan(options);
  const proposals = await proposeArchetypes(base.evidence, base.repoName, options.llm ?? {});
  const { archetypes, discarded } = adaptProposals(proposals, base.evidence);

  if (archetypes.length === 0) {
    return { ...base, proposedIds: [], discarded };
  }

  // Re-gate with the proposals in the running, reusing the evidence already
  // collected so the two passes cannot disagree about what the repository says.
  const combined = scan({
    ...options,
    evidence: base.evidence,
    archetypes: [...(options.archetypes ?? CATALOG), ...archetypes],
  });

  const proposedIds = new Set(archetypes.map((a) => a.id));
  return {
    ...combined,
    proposedIds: [...combined.admitted, ...combined.deferred]
      .map((a) => a.archetype.id)
      .filter((id) => proposedIds.has(id)),
    discarded,
  };
}
