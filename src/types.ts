/**
 * Core vocabulary for agentrouter.
 *
 * The central claim of this tool: a subagent only earns its existence when it
 * changes the outcome through one of five mechanisms. Anything that satisfies
 * none of them is a skill (a procedure) or a rule (a constraint) — not an agent.
 */

export const MECHANISMS = [
  'context-isolation',
  'tool-scoping',
  'effort-tier',
  'durable-rubric',
  'parallelism',
] as const;

export type Mechanism = (typeof MECHANISMS)[number];

export const MECHANISM_DESCRIPTIONS: Record<Mechanism, string> = {
  'context-isolation':
    'the task emits high-volume output (test logs, build output, search dumps) that would otherwise pollute the main thread',
  'tool-scoping':
    'the task needs a narrower or unusual tool set than the main thread — most often read-only',
  'effort-tier':
    'the task is mechanical enough to run on a cheaper model, or hard enough to deserve a more expensive one',
  'durable-rubric':
    'the task has a definition of done that is stable across invocations and checkable',
  'parallelism':
    'the task runs over N independent targets that can be worked at the same time',
};

export type Confidence = 'high' | 'medium' | 'low';

export const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * A single typed observation about the repository. Probes emit these; nothing
 * else in the pipeline is allowed to read the filesystem. Keeping observation
 * separate from judgement is what makes the roster testable against fixtures.
 */
export interface Evidence {
  /** Probe that produced this record. */
  probe: string;
  /** Machine-readable category, e.g. 'test-command', 'recurring-work-type'. */
  kind: string;
  /** Human-readable value, shown in reports. */
  value: string;
  /** Where it came from: 'path/to/file.yml:42', or 'git log'. */
  source: string;
  confidence: Confidence;
  /** Optional structured payload for archetypes that need more than `value`. */
  data?: Record<string, unknown>;
}

/** A compact reference to evidence, persisted in the roster for provenance. */
export type EvidenceRef = string;

export function evidenceRef(e: Evidence): EvidenceRef {
  return `${e.probe}:${e.kind}@${e.source}`;
}

/**
 * An archetype's argument that it satisfies one mechanism. `find` returns the
 * evidence supporting the claim; an empty array means the claim fails, and the
 * mechanism is reported as unsatisfied in the rejection.
 */
export interface MechanismClaim {
  mechanism: Mechanism;
  /** Why this evidence implies the mechanism. Shown in reports. */
  rationale: string;
  find(evidence: Evidence[]): Evidence[];
}

export interface RenderContext {
  /** Evidence that survived the gate, grouped by the mechanism it supported. */
  support: MechanismSupport[];
  /** All evidence, for archetypes that want detail the gate did not need. */
  all: Evidence[];
  repoName: string;
}

export interface Archetype {
  id: string;
  /** Title case, human-facing. */
  title: string;
  /** One line: what this agent is for. Becomes part of the description. */
  purpose: string;
  /** When to invoke it — becomes the `description` field the harness matches on. */
  invokeWhen: string;
  claims: MechanismClaim[];
  tools: string[];
  model: 'haiku' | 'sonnet' | 'opus' | 'inherit';
  /**
   * What this candidate collapses into when no mechanism is satisfied.
   * Printed verbatim in the rejection, which is the whole point of the
   * "reject loudly" contract.
   */
  alternative: {
    kind: 'skill' | 'rule';
    reason: string;
  };
  /** Builds the agent's system prompt body from surviving evidence. */
  body(ctx: RenderContext): string;
}

export interface MechanismSupport {
  mechanism: Mechanism;
  rationale: string;
  evidence: Evidence[];
}

export interface Admission {
  archetype: Archetype;
  support: MechanismSupport[];
  score: number;
}

export interface Rejection {
  archetypeId: string;
  title: string;
  /** Mechanisms the archetype claimed but could not support with evidence. */
  unsatisfied: Mechanism[];
  /** e.g. 'This is a skill, not an agent.' */
  verdict: string;
  detail: string;
}

/**
 * The persisted spec. `.claude/agents/*.md` is build output rendered from this;
 * this file is the source of truth. Tuning appends to `constraints` here rather
 * than editing rendered markdown, so regeneration can never drop a correction.
 */
export interface AgentSpec {
  id: string;
  name: string;
  description: string;
  tools: string[];
  model: string;
  mechanisms: Mechanism[];
  evidence: EvidenceRef[];
  /** The alternative considered and rejected, kept for the audit trail. */
  rejectedAlternative: string;
  /** Generated prompt body. Regenerated on refresh. */
  body: string;
  /** User tunings. Append-only, never regenerated, always rendered last. */
  constraints: string[];
  version: number;
  generatedAt: string;
  generator: string;
}

export interface Roster {
  schema: 1;
  repo: {
    root: string;
    name: string;
    scannedAt: string;
    head: string | null;
  };
  agents: AgentSpec[];
  rejections: Rejection[];
}
