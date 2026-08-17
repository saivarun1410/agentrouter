import {
  CONFIDENCE_WEIGHT,
  type Admission,
  type Archetype,
  type Evidence,
  type Mechanism,
  type MechanismSupport,
  type Rejection,
} from '../types.js';

export interface GateResult {
  admitted: Admission[];
  rejected: Rejection[];
}

/**
 * The mechanism gate.
 *
 * An archetype is admitted when the evidence supports at least one of its
 * mechanism claims. Nothing else counts — not language match, not directory
 * shape, not how plausible the agent sounds. This single rule is what stops the
 * tool from generating one agent per folder, which is the failure mode that
 * makes generated rosters worthless.
 */
export function gate(archetypes: Archetype[], evidence: Evidence[]): GateResult {
  const admitted: Admission[] = [];
  const rejected: Rejection[] = [];

  for (const archetype of archetypes) {
    const support: MechanismSupport[] = [];
    const unsatisfied: Mechanism[] = [];

    for (const claim of archetype.claims) {
      const found = claim.find(evidence);
      if (found.length > 0) {
        support.push({ mechanism: claim.mechanism, rationale: claim.rationale, evidence: found });
      } else {
        unsatisfied.push(claim.mechanism);
      }
    }

    if (support.length === 0) {
      rejected.push(reject(archetype, unsatisfied));
      continue;
    }
    admitted.push({ archetype, support, score: score(support) });
  }

  return { admitted, rejected };
}

function reject(archetype: Archetype, unsatisfied: Mechanism[]): Rejection {
  const noun = archetype.alternative.kind === 'skill' ? 'a skill' : 'a rule';
  return {
    archetypeId: archetype.id,
    title: archetype.title,
    unsatisfied,
    verdict: `This is ${noun}, not an agent.`,
    detail: archetype.alternative.reason,
  };
}

/**
 * Ranks by how well-evidenced the archetype is, not by how many mechanisms it
 * claims. Breadth of mechanisms breaks ties, so an agent justified two
 * different ways outranks one justified twice over by the same signal.
 */
function score(support: MechanismSupport[]): number {
  let total = 0;
  for (const s of support) {
    // Diminishing returns: the fourth piece of evidence for one mechanism does
    // not make the case meaningfully stronger than the third.
    const weights = s.evidence
      .map((e) => CONFIDENCE_WEIGHT[e.confidence])
      .sort((a, b) => b - a)
      .slice(0, 3);
    total += weights.reduce((sum, w) => sum + w, 0);
  }
  return total + support.length;
}
