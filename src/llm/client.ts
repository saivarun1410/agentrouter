import type Anthropic from '@anthropic-ai/sdk';
import { MECHANISM_DESCRIPTIONS, MECHANISMS, evidenceRef, type Evidence } from '../types.js';
import { CATALOG } from '../catalog/index.js';
import { PROPOSAL_SCHEMA, type Proposal, type ProposalResponse } from './schema.js';

export const DEFAULT_LLM_MODEL = 'claude-opus-5';
const MAX_TOKENS = 16_000;

export interface LlmOptions {
  model?: string;
  /** `low` | `medium` | `high` | `xhigh` | `max`. */
  effort?: string;
}

/**
 * The SDK is an optional peer dependency, so the deterministic path stays
 * install-free. Loading it lazily means `agentfit scan` never pays for it and
 * only `--llm` requires it to be present.
 */
async function loadClient(): Promise<Anthropic> {
  let module: typeof import('@anthropic-ai/sdk');
  try {
    module = await import('@anthropic-ai/sdk');
  } catch {
    throw new Error(
      '--llm needs the Anthropic SDK, which agentfit does not install by default.\n' +
        '  Install it alongside agentfit:  npm install @anthropic-ai/sdk',
    );
  }
  // Zero-arg construction resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
  // `ant auth login` profile — so an unset API key does not mean unauthenticated.
  // Credentials are not checked here: the SDK resolves them when the request is
  // made, so the actionable error belongs around the call, not the constructor.
  return new module.default();
}

/** The SDK's own auth message names fields, not remedies. Add the remedies. */
function describeFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/authentication|api[_ -]?key|credential|401/i.test(message)) {
    return new Error(
      `--llm could not authenticate: ${message}\n` +
        '  Sign in with `ant auth login`, or export ANTHROPIC_API_KEY.\n' +
        '  Every other agentfit command runs offline and needs neither.',
    );
  }
  return error instanceof Error ? error : new Error(message);
}

const SYSTEM = `You extend a repository-analysis tool called agentfit, which decides which subagents a codebase justifies.

agentfit's central rule: a subagent only earns its existence when it changes the outcome through one of five mechanisms.

${MECHANISMS.map((m) => `- ${m}: ${MECHANISM_DESCRIPTIONS[m]}`).join('\n')}

A candidate satisfying none of them is not an agent — it is a skill (a procedure run in the same context) or a rule (a constraint that applies always rather than on invocation).

You are given typed evidence records gathered from one repository. Propose agents that a fixed catalog would miss: work this specific repository repeats that is not covered by the archetypes already listed.

Hard requirements:
- Every claim must cite evidence refs copied EXACTLY from the supplied list. Citations are verified against the real records; a proposal citing a ref that does not exist is discarded in full.
- Do not propose an agent whose job is already covered by an existing catalog archetype.
- Do not propose agents organised around a directory, language, or framework. Those are locations, not tasks.
- Every claim must independently justify the agent, because the gate admits on any single satisfied claim. Do not pair a strict mechanism with a weak one.
- Propose nothing rather than something speculative. An empty list is the correct answer for most repositories.`;

export async function proposeArchetypes(
  evidence: Evidence[],
  repoName: string,
  options: LlmOptions = {},
): Promise<Proposal[]> {
  if (evidence.length === 0) return [];
  const client = await loadClient();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: options.model ?? DEFAULT_LLM_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      output_config: {
        effort: (options.effort ?? 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
        format: {
          type: 'json_schema',
          schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: 'user', content: buildPrompt(evidence, repoName) }],
    });
  } catch (error) {
    throw describeFailure(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('the model declined this request; run without --llm');
  }
  return parseProposals(response);
}

function buildPrompt(evidence: Evidence[], repoName: string): string {
  const records = evidence
    .map((e) => `${evidenceRef(e)}  [${e.confidence}]  ${e.value}`)
    .join('\n');

  return [
    `Repository: ${repoName}`,
    '',
    'Archetypes already in the catalog (do not duplicate these):',
    CATALOG.map((a) => `- ${a.id}: ${a.purpose}`).join('\n'),
    '',
    `Evidence records (${evidence.length}). Cite refs exactly as written, including the part after "@":`,
    records,
    '',
    'Propose only agents this evidence genuinely justifies. Return an empty array if none.',
  ].join('\n');
}

function parseProposals(response: Anthropic.Message): Proposal[] {
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') return [];
  try {
    return (JSON.parse(text.text) as ProposalResponse).proposals ?? [];
  } catch (error) {
    throw new Error(
      `the model returned output that was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
