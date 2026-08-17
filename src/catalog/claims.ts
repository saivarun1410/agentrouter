import type { Evidence, Mechanism, MechanismClaim } from '../types.js';

export interface ClaimOptions {
  /** Minimum matching records before the claim is considered supported. */
  min?: number;
  /** Extra filter beyond the kind match. */
  where?: (e: Evidence) => boolean;
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
  const { min = 1, where } = options;
  return {
    mechanism,
    rationale,
    find(evidence: Evidence[]): Evidence[] {
      const matches = evidence.filter((e) => kinds.includes(e.kind) && (where ? where(e) : true));
      return matches.length >= min ? matches : [];
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
