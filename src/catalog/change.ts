import type { Archetype } from '../types.js';
import { claim, commandFrom } from './claims.js';
import { buildBody } from './body.js';

export const migrationAuthor: Archetype = {
  id: 'migration-author',
  title: 'Migration author',
  purpose: 'Writes schema migrations that follow this repository\'s existing naming, ordering, and reversibility conventions.',
  invokeWhen:
    'Use when a change requires a database schema migration. Handles version numbering, naming, and the repository\'s forward-only or reversible policy.',
  claims: [
    claim(
      'durable-rubric',
      ['schema-migrations', 'migration-cadence'],
      'migration conventions — ordering, naming, reversibility — are fixed and checkable, so the definition of done does not move between invocations',
      { min: 2 },
    ),
    claim(
      'tool-scoping',
      ['schema-migrations'],
      'authoring migrations touches one directory under a strict naming rule, and confining the agent to it prevents incidental edits elsewhere',
    ),
  ],
  tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  model: 'sonnet',
  alternative: {
    kind: 'skill',
    reason:
      'a repo that has written two migrations in its lifetime has no established convention to encode, and the naming rule is a one-paragraph procedure',
  },
  body(ctx) {
    const dirs = ctx.all
      .filter((e) => e.kind === 'schema-migrations')
      .map((e) => e.data?.['dir'] as string)
      .filter(Boolean);
    const dir = dirs[0] ?? '<the migrations directory>';
    return buildBody(ctx, {
      role: `You author database schema migrations for this repository. Migrations are append-only history that runs against production exactly once, so convention compliance matters more here than anywhere else in the codebase.`,
      method: [
        `List the existing migrations in \`${dir}\` and read the three most recent in full. They define the naming scheme, the version sequence, and the house style for reversibility.`,
        'Derive the next version identifier from the highest existing one. Never reuse or renumber an existing version, even one that is unreleased.',
        'Write the migration to match the observed convention exactly — the same naming pattern, comment style, and statement ordering.',
        'State explicitly whether the migration is reversible under the repository\'s policy, and follow that policy rather than your own preference.',
        'Check whether any application-side mapping, validation, or fixture must change in the same commit, and report what you found.',
      ],
      verification: verificationFor(ctx),
      boundaries: [
        `Only create files under \`${dir}\`. Report any application-side change that is needed; do not make it yourself unless asked.`,
        'Never edit or delete an existing migration. If one is wrong, write a new migration that corrects it.',
        'Never write a destructive statement (DROP, TRUNCATE, a non-additive column change) without calling it out explicitly in your report.',
      ],
    });
  },
};

function verificationFor(ctx: Parameters<Archetype['body']>[0]): string {
  const command = commandFrom(ctx.all, ['test-command']);
  return command
    ? `Run \`${command}\` to confirm the migration applies against a disposable database before reporting completion.`
    : 'Apply the migration against a disposable database before reporting completion. Never validate against a developer or shared instance.';
}

export const dependencyAuditor: Archetype = {
  id: 'dependency-auditor',
  title: 'Dependency auditor',
  purpose: 'Reviews dependency updates and advisories, and reports which ones actually matter here.',
  invokeWhen:
    'Use for dependency upgrades, lockfile churn, and vulnerability advisories — when the question is which of many available updates are worth taking.',
  claims: [
    claim(
      'context-isolation',
      ['recurring-work-type', 'security-scan'],
      'audit and outdated-dependency output is long, highly repetitive, and almost entirely discarded on the way to a decision',
      { where: (e) => e.kind === 'security-scan' || e.data?.['type'] === 'deps' || e.data?.['type'] === 'chore' },
    ),
    claim(
      'effort-tier',
      ['recurring-work-type'],
      'reconciling version numbers against advisories is mechanical work that does not need the main thread\'s reasoning budget',
      { where: (e) => e.data?.['type'] === 'deps' || e.data?.['type'] === 'chore' },
    ),
  ],
  tools: ['Bash', 'Read', 'Grep', 'Edit'],
  model: 'haiku',
  alternative: {
    kind: 'skill',
    reason:
      'without recurring dependency work in the history there is no standing workload to isolate, and an occasional upgrade is better handled inline',
  },
  body(ctx) {
    return buildBody(ctx, {
      role:
        'You audit this repository\'s dependencies. Your job is to separate the updates that matter from the ones that merely exist, because the default output of every dependency tool is noise.',
      method: [
        'Enumerate outdated packages and open advisories using the repository\'s own tooling.',
        'For each advisory, determine whether the vulnerable code path is actually reachable from this repository. An advisory in an unused transitive path is not an action item.',
        'Separate the results into: security-relevant, blocking a needed feature, and routine drift.',
        'For each recommended upgrade, note whether it is a major version and what its breaking changes are. Never recommend a major bump without naming what breaks.',
        'Report the shortlist with reasons. Apply changes only when the caller asks for them.',
      ],
      verification:
        'After any change to a manifest or lockfile, run the repository\'s test command and report the result. An upgrade you did not verify is a proposal, not a change.',
      boundaries: [
        'Do not bulk-upgrade. Every version change must have a stated reason.',
        'Do not touch a lockfile by hand — use the package manager.',
        'Do not report an advisory count as a finding. Counts are not decisions.',
      ],
    });
  },
};
