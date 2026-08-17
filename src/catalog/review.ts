import type { Archetype } from '../types.js';
import { claim, commandFrom, valuesOf } from './claims.js';
import { buildBody } from './body.js';

export const conventionReviewer: Archetype = {
  id: 'convention-reviewer',
  title: 'Convention reviewer',
  purpose: 'Reviews a diff against the conventions this repository already enforces mechanically.',
  invokeWhen:
    'Use before committing or opening a PR, to check a change against the repository\'s own enforced standards. Read-only: reports violations, does not fix them.',
  claims: [
    claim(
      'durable-rubric',
      ['mechanized-rule', 'gated-convention'],
      'the repository already mechanised its standards, so the definition of done is written down, executable, and stable between invocations',
    ),
    claim(
      'tool-scoping',
      ['mechanized-rule', 'gated-convention'],
      'a reviewer that cannot write cannot quietly "fix" what it was asked to judge, which keeps the review honest',
    ),
  ],
  tools: ['Read', 'Grep', 'Glob', 'Bash'],
  model: 'sonnet',
  alternative: {
    kind: 'rule',
    reason:
      'with no mechanised check to grade against, this is a set of constraints that should apply to every edit continuously — which is a rules file, not something invoked after the fact',
  },
  body(ctx) {
    const checks = ctx.all
      .filter((e) => e.kind === 'mechanized-rule' && typeof e.data?.['command'] === 'string')
      .map((e) => e.data?.['command'] as string);
    const architectural = ctx.all.some((e) => e.data?.['architectural'] === true);

    return buildBody(ctx, {
      role:
        'You review changes against the standards this repository enforces. You report violations; you never fix them. The separation matters — a reviewer that edits its own subject cannot be trusted about what it found.',
      method: [
        'Get the diff under review with `git diff` (or `git diff <base>...HEAD` for a branch). Review only what changed, plus whatever context is needed to judge it.',
        checks.length > 0
          ? `Run the repository's own checks first and treat their output as authoritative: ${checks.map((c) => `\`${c}\``).join(', ')}.`
          : 'Run the repository\'s lint and format checks first and treat their output as authoritative.',
        'Then review what the mechanised checks cannot see: naming, responsibility boundaries, error handling, and whether new code follows the pattern of the code around it.',
        architectural
          ? 'Verify dependency direction explicitly — this repository has an architecture test, so a violation here is a build failure, not a matter of taste.'
          : 'Verify that new code does not import across an established layer boundary in the wrong direction.',
        'Report findings most severe first. For each, give the file, the line, and what specifically is wrong.',
      ],
      verification:
        checks.length > 0
          ? `A review is complete when every mechanised check has been run and its result reported. Never report a clean review without having run: ${checks.map((c) => `\`${c}\``).join(', ')}.`
          : 'A review is complete when the repository\'s own checks have been run and reported alongside your judgement.',
      boundaries: [
        'Do not edit files. This agent is read-only by design.',
        'Do not report style preferences that the repository has not adopted. If a check does not enforce it and the conventions do not state it, it is not a finding.',
        'Do not restate the rules back at the caller. Report only what this diff violates.',
      ],
    });
  },
};

export const docsContractKeeper: Archetype = {
  id: 'docs-contract-keeper',
  title: 'Docs contract keeper',
  purpose: 'Keeps the documents this repository requires to be updated in step with the code.',
  invokeWhen:
    'Use after completing a unit of work that the repository requires to be recorded — status documents, decision records, changelogs named in the repository conventions.',
  claims: [
    claim(
      'durable-rubric',
      ['docs-contract'],
      'the repository states which documents must be updated and when, which is a checkable obligation rather than a matter of judgement',
    ),
  ],
  tools: ['Read', 'Edit', 'Grep', 'Glob'],
  model: 'haiku',
  alternative: {
    kind: 'rule',
    reason:
      'without a stated documentation obligation there is nothing to check against, and "keep the docs current" is a standing constraint belonging in the rules file',
  },
  body(ctx) {
    const targets = valuesOf(ctx.all, ['docs-contract'], 4);
    return buildBody(ctx, {
      role:
        'You maintain the documents this repository requires to be kept current. You are invoked at the end of a unit of work, and your output is an accurate record of what actually happened — not a summary of what was intended.',
      method: [
        targets.length > 0
          ? `The repository names these obligations: ${targets.map((t) => `\n   - ${t}`).join('')}`
          : 'Identify the documents the repository conventions require to be updated.',
        'Read the target document first and match its existing structure, heading style, and level of detail. A section that does not look like its neighbours is wrong even when its content is right.',
        'Record what changed, which decisions were made and why, which commands were run, and what the next step is.',
        'State outcomes truthfully. If tests failed or a step was skipped, write that down — a status document that records only successes is worse than none.',
      ],
      verification:
        'Re-read your addition in the context of the whole document. It should be legible to someone who was not present for the work.',
      boundaries: [
        'Never record secrets, credentials, tokens, or full customer identifiers.',
        'Do not rewrite existing entries. Append; history in these documents is the point.',
        'Do not claim work was verified unless you can point to the run that verified it.',
      ],
    });
  },
};
