import { MECHANISMS } from '../types.js';

/**
 * The shape the model must return.
 *
 * Structured outputs (`output_config.format`) rather than tool use: there is
 * exactly one response and no agentic loop, so a constrained response format is
 * the right primitive — a tool call here would be a loop that never runs.
 *
 * Note the schema requires each claim to cite `evidence` refs. Those citations
 * are what the adapter verifies against real records, so a proposal that
 * invents its justification cannot survive the gate.
 */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'kebab-case identifier, e.g. "flaky-test-hunter"' },
          title: { type: 'string' },
          purpose: { type: 'string', description: 'One sentence: what this agent is for.' },
          invokeWhen: { type: 'string', description: 'When a caller should reach for it.' },
          tools: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
            },
          },
          model: { type: 'string', enum: ['haiku', 'sonnet', 'opus', 'inherit'] },
          alternativeKind: { type: 'string', enum: ['skill', 'rule'] },
          alternativeReason: {
            type: 'string',
            description: 'Why this collapses into a skill or rule when the evidence is absent.',
          },
          claims: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mechanism: { type: 'string', enum: [...MECHANISMS] },
                rationale: { type: 'string' },
                evidence: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Exact evidence refs from the supplied list. Do not invent refs.',
                },
              },
              required: ['mechanism', 'rationale', 'evidence'],
              additionalProperties: false,
            },
          },
          method: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ordered steps the agent follows.',
          },
          verification: { type: 'string', description: 'How the agent proves it is done.' },
          boundaries: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'id',
          'title',
          'purpose',
          'invokeWhen',
          'tools',
          'model',
          'alternativeKind',
          'alternativeReason',
          'claims',
          'method',
          'verification',
          'boundaries',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
} as const;

export interface ProposalClaim {
  mechanism: string;
  rationale: string;
  evidence: string[];
}

export interface Proposal {
  id: string;
  title: string;
  purpose: string;
  invokeWhen: string;
  tools: string[];
  model: string;
  alternativeKind: 'skill' | 'rule';
  alternativeReason: string;
  claims: ProposalClaim[];
  method: string[];
  verification: string;
  boundaries: string[];
}

export interface ProposalResponse {
  proposals: Proposal[];
}
