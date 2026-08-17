import type { Archetype } from '../types.js';
import { claim, commandFrom } from './claims.js';
import { buildBody } from './body.js';

const TEST_COMMAND_KINDS = ['test-command'];

export const testTriage: Archetype = {
  id: 'test-triage',
  title: 'Test triage',
  purpose: 'Runs the test suite, reads the full output, and reports only what failed and why.',
  invokeWhen:
    'Use when tests need to be run and diagnosed — after a change, on a red suite, or to confirm a fix. Returns a minimal failure summary rather than raw log output.',
  claims: [
    claim(
      'context-isolation',
      ['long-running-job', 'test-command'],
      'the suite emits far more output than its conclusion is worth, and that output would otherwise sit in the main thread for the rest of the session',
      { where: (e) => e.kind === 'long-running-job' || e.data?.['slow'] === true },
    ),
    claim(
      'tool-scoping',
      ['test-command'],
      'triage needs to execute and read, but has no reason to hold write access while diagnosing',
    ),
  ],
  tools: ['Bash', 'Read', 'Grep', 'Glob'],
  model: 'sonnet',
  alternative: {
    kind: 'skill',
    reason:
      'with a fast suite the output fits comfortably in the main thread, so a written procedure is enough and a separate agent only adds a round trip',
  },
  body(ctx) {
    const command = commandFrom(ctx.all, TEST_COMMAND_KINDS) ?? '<the repository test command>';
    return buildBody(ctx, {
      role:
        'You run this repository\'s tests and diagnose failures. Your value is compression: you read everything the suite prints, and return only the part that determines what to do next.',
      method: [
        `Run \`${command}\`. If the caller named a narrower target, run that instead — never widen the scope you were given.`,
        'Read the complete output, including stack traces and any setup or teardown errors that precede the first assertion failure.',
        'Group failures by root cause, not by test name. Several tests failing on one broken fixture is one finding, not several.',
        'For each finding, report the failing assertion, the file and line, and the shortest reproduction available.',
        'Re-run only the narrowest failing target to confirm a diagnosis. Do not re-run the full suite to check one class.',
      ],
      verification: `A report is complete when every failure in the run maps to a stated root cause. If a failure is unexplained, say so explicitly rather than omitting it.\n\nCommand: \`${command}\``,
      boundaries: [
        'Do not fix the code. Diagnose and report; the caller decides what to change.',
        'Do not paste raw log output into your report. Quote the specific lines that carry the diagnosis.',
        'Do not report a suite as passing unless you saw it pass in this run.',
      ],
    });
  },
};

export const ciFailureAnalyst: Archetype = {
  id: 'ci-failure-analyst',
  title: 'CI failure analyst',
  purpose: 'Pulls a failed CI run, reads the logs, and reports whether the failure is real or infrastructural.',
  invokeWhen:
    'Use when a CI job has failed and the cause is not obvious from the job name — especially to distinguish a genuine regression from a flake, a cache miss, or a runner problem.',
  claims: [
    claim(
      'context-isolation',
      ['ci-job', 'long-running-job'],
      'CI logs run to thousands of lines across several jobs, and almost none of it survives into the answer',
      { min: 2, distinctBy: 'job' },
    ),
    // Same threshold as the claim above, deliberately. The gate admits on ANY
    // satisfied claim, so an archetype's loosest claim is its real admission
    // bar — a strict mechanism paired with a lax one is only as strict as the
    // lax one. Every claim must independently justify the agent's existence.
    claim(
      'tool-scoping',
      ['ci-job'],
      'reading a run needs shell and network access to the CI provider, but no write access to the working tree',
      { min: 2, distinctBy: 'job' },
    ),
  ],
  tools: ['Bash', 'Read', 'Grep'],
  model: 'sonnet',
  alternative: {
    kind: 'skill',
    reason:
      'a repo with one short CI job produces logs small enough to read inline, and the routine is better captured as a procedure',
  },
  body(ctx) {
    const jobs = ctx.all.filter((e) => e.kind === 'ci-job').map((e) => e.value).slice(0, 8);
    return buildBody(ctx, {
      role:
        'You investigate failed CI runs for this repository and report the cause. The question you always answer first is whether the failure is a real regression or an environmental one, because that determines who has to act.',
      method: [
        'Identify the failing run and job. If the caller did not name one, use `gh run list --status failure --limit 5` to find the most recent.',
        'Fetch the failing job log with `gh run view <id> --log-failed`. Read the failure and the fifty lines preceding it — setup failures surface long before the assertion that reports them.',
        'Classify the failure: genuine regression, flaky test, dependency or network fault, cache or runner problem, or configuration drift.',
        'Check whether the same job failed on other recent runs. A failure reproducing across unrelated commits is environmental until proven otherwise.',
        'Report the classification, the evidence for it, and the single next action.',
        jobs.length > 0 ? `Known jobs in this repository: ${jobs.join(', ')}.` : 'Enumerate the repository jobs before assuming which one matters.',
      ],
      verification:
        'Your classification must cite a specific log line. A classification you cannot point at is a guess — label it as one.',
      boundaries: [
        'Do not re-run CI to see if a failure disappears before you have read the log.',
        'Do not modify workflow files. Report what should change and let the caller decide.',
        'Never echo secrets, tokens, or environment values that appear in log output.',
      ],
    });
  },
};
