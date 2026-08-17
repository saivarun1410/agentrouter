import type { Evidence, Mechanism, MechanismClaim } from '../types.js';

export interface ClaimOptions {
  /** Minimum matching records before the claim is considered supported. */
  min?: number;
  /** Extra filter beyond the kind match. */
  where?: (e: Evidence) => boolean;
  /**
   * Count distinct values of this `data` key rather than raw records.
   *
   * Without it, one CI job that is both a `ci-job` and a `long-running-job`
   * counts twice and satisfies `min: 2` on its own — letting an archetype in
   * on exactly the evidence its own rejection text says is insufficient.
   */
  distinctBy?: string;
}

/**
 * Builds a claim that a mechanism is satisfied by evidence of certain kinds.
 *
 * Claims are deliberately mechanical. If a mechanism cannot be argued for from
 * typed evidence, the archetype should not claim it — an unsupported claim
 * becomes a loud rejection, which is the correct outcome, not a failure.
 */
export function claim(
  mechanism: Mechanism,
  kinds: string[],
  rationale: string,
  options: ClaimOptions = {},
): MechanismClaim {
  const { min = 1, where, distinctBy } = options;
  return {
    mechanism,
    rationale,
    find(evidence: Evidence[]): Evidence[] {
      const matches = evidence.filter((e) => kinds.includes(e.kind) && (where ? where(e) : true));
      const count = distinctBy
        ? new Set(matches.map((e) => String(e.data?.[distinctBy] ?? e.value))).size
        : matches.length;
      return count >= min ? matches : [];
    },
  };
}

/**
 * A claim that cannot stand on supporting evidence alone.
 *
 * Some signals only reinforce a mechanism, never establish it. A CI build
 * matrix looks like parallelism but means "the same work across several
 * runtimes" — it is not N independent targets an agent could be fanned out
 * over. Treating the two as interchangeable admits a fan-out agent into a
 * single-package repository, which is precisely the false positive this tool
 * exists to avoid.
 */
export function claimRequiring(
  mechanism: Mechanism,
  requiredKinds: string[],
  reinforcingKinds: string[],
  rationale: string,
  options: ClaimOptions = {},
): MechanismClaim {
  const base = claim(mechanism, requiredKinds, rationale, options);
  return {
    mechanism,
    rationale,
    find(evidence: Evidence[]): Evidence[] {
      const required = base.find(evidence);
      if (required.length === 0) return [];
      return [...required, ...evidence.filter((e) => reinforcingKinds.includes(e.kind))];
    },
  };
}

/** Convenience for `data.command`-carrying evidence, which most agents need. */
export function commandFrom(evidence: Evidence[], kinds: string[]): string | null {
  const withCommand = evidence.filter(
    (e) => kinds.includes(e.kind) && typeof e.data?.['command'] === 'string',
  );
  // Prefer a command explicitly marked slow — that is the one worth isolating.
  const slow = withCommand.find((e) => e.data?.['slow'] === true);
  const chosen = slow ?? withCommand[0];
  return chosen ? (chosen.data?.['command'] as string) : null;
}

export function valuesOf(evidence: Evidence[], kinds: string[], limit = 5): string[] {
  return evidence.filter((e) => kinds.includes(e.kind)).slice(0, limit).map((e) => e.value);
}
