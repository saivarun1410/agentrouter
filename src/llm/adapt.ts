import {
  MECHANISMS,
  evidenceRef,
  type Archetype,
  type Evidence,
  type Mechanism,
  type MechanismClaim,
} from '../types.js';
import { buildBody } from '../catalog/body.js';
import { CATALOG } from '../catalog/index.js';
import type { Proposal } from './schema.js';

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface AdaptedProposals {
  archetypes: Archetype[];
  /** Proposals thrown out before the gate ever saw them, with the reason. */
  discarded: Array<{ id: string; reason: string }>;
}

/**
 * Converts model proposals into archetypes the gate can judge.
 *
 * The model may propose, but it may not bypass the gate. Every claim it makes
 * is rebuilt so that `find` returns only evidence records that actually exist
 * with the cited ref — so a fabricated citation yields an unsupported claim,
 * and a proposal built entirely on fabrication is rejected exactly as a
 * catalog archetype with no evidence would be.
 */
export function adaptProposals(proposals: Proposal[], evidence: Evidence[]): AdaptedProposals {
  const byRef = new Map<string, Evidence[]>();
  for (const record of evidence) {
    const ref = evidenceRef(record);
    byRef.set(ref, [...(byRef.get(ref) ?? []), record]);
  }

  const archetypes: Archetype[] = [];
  const discarded: AdaptedProposals['discarded'] = [];
  const taken = new Set(CATALOG.map((a) => a.id));

  for (const proposal of proposals) {
    const reason = structuralProblem(proposal, taken);
    if (reason) {
      discarded.push({ id: proposal.id, reason });
      continue;
    }

    const claims = proposal.claims
      .filter((claim) => MECHANISMS.includes(claim.mechanism as Mechanism))
      .map((claim) => verifiedClaim(claim.mechanism as Mechanism, claim.rationale, claim.evidence, byRef));

    const cited = proposal.claims.flatMap((c) => c.evidence);
    const invented = cited.filter((ref) => !byRef.has(ref));
    if (invented.length === cited.length && cited.length > 0) {
      discarded.push({
        id: proposal.id,
        reason: `every cited evidence ref was fabricated (${invented.length} of ${cited.length})`,
      });
      continue;
    }

    taken.add(proposal.id);
    archetypes.push(toArchetype(proposal, claims));
  }

  return { archetypes, discarded };
}

function structuralProblem(proposal: Proposal, taken: Set<string>): string | null {
  if (!ID_PATTERN.test(proposal.id)) return `"${proposal.id}" is not a kebab-case id`;
  if (taken.has(proposal.id)) return 'duplicates an existing archetype id';
  if (proposal.claims.length === 0) return 'claimed no mechanism';
  if (proposal.tools.length === 0) return 'requested no tools';
  return null;
}

function verifiedClaim(
  mechanism: Mechanism,
  rationale: string,
  citedRefs: string[],
  byRef: Map<string, Evidence[]>,
): MechanismClaim {
  // Resolved once, against the same evidence the gate will judge: the claim can
  // only ever be supported by records that were actually observed.
  const supporting = citedRefs.flatMap((ref) => byRef.get(ref) ?? []);
  return {
    mechanism,
    rationale,
    find: () => supporting,
  };
}

function toArchetype(proposal: Proposal, claims: MechanismClaim[]): Archetype {
  return {
    id: proposal.id,
    title: proposal.title,
    purpose: proposal.purpose,
    invokeWhen: proposal.invokeWhen,
    claims,
    tools: proposal.tools,
    model: proposal.model as Archetype['model'],
    alternative: { kind: proposal.alternativeKind, reason: proposal.alternativeReason },
    body: (ctx) =>
      buildBody(ctx, {
        role: `${proposal.purpose} ${proposal.invokeWhen}`,
        method: proposal.method,
        verification: proposal.verification,
        boundaries: [
          ...proposal.boundaries,
          'You were proposed by a model rather than drawn from the catalog. Report anything in these instructions that does not match what you find in the repository.',
        ],
      }),
  };
}
