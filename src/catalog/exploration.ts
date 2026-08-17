import type { Archetype } from '../types.js';
import { claim, claimRequiring, valuesOf } from './claims.js';
import { buildBody } from './body.js';

export const codebaseExplorer: Archetype = {
  id: 'codebase-explorer',
  title: 'Codebase explorer',
  purpose: 'Answers "where is X handled?" by searching broadly and returning the conclusion, not the search.',
  invokeWhen:
    'Use when locating code requires sweeping many files or guessing at several naming conventions, and only the answer is needed — not the intermediate matches.',
  claims: [
    claim(
      'context-isolation',
      ['repo-size'],
      'a broad search over a repository this size produces hundreds of matches, of which one or two answer the question and the rest are pure context cost',
      { where: (e) => e.data?.['large'] === true },
    ),
    claim(
      'tool-scoping',
      ['repo-size'],
      'exploration needs read and search only; withholding write access makes it safe to run speculatively',
      { where: (e) => e.data?.['large'] === true },
    ),
  ],
  tools: ['Read', 'Grep', 'Glob'],
  model: 'haiku',
  alternative: {
    kind: 'skill',
    reason:
      'in a small repository the main thread can read the relevant files directly, and delegating the search costs more than it saves',
  },
  body(ctx) {
    const languages = valuesOf(ctx.all, ['language'], 3);
    return buildBody(ctx, {
      role:
        'You locate things in this codebase. You are given a question about where something lives or how it is wired, and you return the answer with file references — never the transcript of your search.',
      method: [
        'Start from the most specific term in the question and search for it directly.',
        `Then search for the concept under this repository's naming conventions${languages.length ? ` (${languages.join(', ')})` : ''}, not only the caller's wording. The code rarely uses the same words as the question.`,
        'Read excerpts to confirm a match is genuine. A grep hit is a candidate, not an answer.',
        'Follow the call path far enough to distinguish where something is defined from where it is actually used.',
        'Report the answer as a short list of `path:line` references with one line of explanation each.',
      ],
      verification:
        'Before reporting, confirm that you can explain how each reference relates to the question. If you cannot, you found a keyword, not the mechanism.',
      boundaries: [
        'Do not edit or create files. This agent is read-only.',
        'Do not dump search output. Ten confirmed references beat two hundred candidate matches.',
        'If the thing does not exist, say so plainly and name where it would go if it did.',
      ],
    });
  },
};

export const packageFanout: Archetype = {
  id: 'package-fanout',
  title: 'Package fan-out worker',
  purpose: 'Applies one well-specified change to a single package, so many packages can be worked in parallel.',
  invokeWhen:
    'Use when the same mechanical change must land across many packages or modules — a config bump, a lint fix, an API rename. One invocation handles one package.',
  claims: [
    claimRequiring(
      'parallelism',
      ['workspace-packages'],
      ['matrix-job'],
      'the repository is split into independent packages, so the same change can be applied to many of them at once instead of in sequence',
    ),
    claim(
      'effort-tier',
      ['workspace-packages'],
      'applying a specified change to one package is mechanical, and running it on a cheaper model keeps a wide fan-out affordable',
    ),
  ],
  tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'],
  model: 'haiku',
  alternative: {
    kind: 'skill',
    reason:
      'a single-package repository has nothing to fan out across, and the change is better made directly than delegated one target at a time',
  },
  body(ctx) {
    const packages = valuesOf(ctx.all, ['workspace-packages'], 1);
    return buildBody(ctx, {
      role: `You apply one specified change to exactly one package in this repository${packages.length ? ` (${packages[0]})` : ''}. You are one of several running at once, so staying inside your assigned package is not a preference — it is what makes the parallel run safe.`,
      method: [
        'Confirm which package you were assigned. If the assignment is ambiguous, stop and say so rather than guessing.',
        'Read the change specification you were given and the equivalent code in your package before editing anything.',
        'Apply the change. Match the conventions of the package you are in, which may differ from its neighbours.',
        'Build or test your package alone, not the whole repository.',
        'Report the files you changed, the verification you ran, and anything that made your package different from the specification\'s assumptions.',
      ],
      verification:
        'Run the narrowest build or test scoped to your package. A repository-wide run from a fan-out worker wastes the parallelism it exists to provide.',
      boundaries: [
        'Never edit files outside your assigned package. Another worker owns them right now.',
        'Never edit shared root configuration, lockfiles, or CI workflows — those belong to the caller coordinating the fan-out.',
        'If the change does not apply cleanly to your package, report why instead of improvising a variant.',
      ],
    });
  },
};
