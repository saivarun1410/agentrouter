import type { Evidence } from '../types.js';
import type { Probe, ProbeContext } from './context.js';

const SUBJECT_SAMPLE = 500;
const FILE_SAMPLE = 300;

/** Below this, a commit type is noise rather than a standing workload. */
const RECURRENCE_THRESHOLD = 8;
const HIGH_CONFIDENCE_RECURRENCE = 20;

const MIGRATION_PATH = /(^|\/)(migrations?|db\/migrate|flyway|liquibase|alembic)(\/|$)/i;

/**
 * The differentiating probe. Static analysis says what a repo *is*; history says
 * what work actually repeats in it, which is the only question that decides
 * whether an agent will ever be invoked twice.
 */
export const gitHistoryProbe: Probe = {
  name: 'git-history',
  run(ctx: ProbeContext): Evidence[] {
    const subjects = ctx.git(['log', `-n${SUBJECT_SAMPLE}`, '--pretty=format:%s']);
    if (subjects === null) return [];

    return [
      ...recurringWorkTypes(subjects),
      ...fileSignals(ctx),
    ];
  },
};

function recurringWorkTypes(subjects: string): Evidence[] {
  const counts = new Map<string, number>();
  for (const line of subjects.split('\n')) {
    const conventional = /^(\w+)(?:\([^)]*\))?!?:\s/.exec(line.trim());
    const type = conventional ? (conventional[1] as string).toLowerCase() : inferType(line);
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const evidence: Evidence[] = [];
  for (const [type, count] of counts) {
    if (count < RECURRENCE_THRESHOLD) continue;
    evidence.push({
      probe: 'git-history',
      kind: 'recurring-work-type',
      value: `${count} commits of type "${type}"`,
      source: `git log -n${SUBJECT_SAMPLE}`,
      confidence: count >= HIGH_CONFIDENCE_RECURRENCE ? 'high' : 'medium',
      data: { type, count },
    });
  }
  return evidence;
}

/** Repos without conventional commits still leak their workload in verbs. */
function inferType(subject: string): string | null {
  const s = subject.toLowerCase();
  if (/^(bump|update|upgrade)\b.*\b(dep|dependenc|version|package|lock)/.test(s)) return 'deps';
  if (/\b(bump|upgrade)\b/.test(s) && /\bto\s+v?\d/.test(s)) return 'deps';
  if (/^(fix|fixed|fixes|hotfix|patch)\b/.test(s)) return 'fix';
  if (/^(add|added|adds|implement|introduce)\b/.test(s)) return 'feat';
  if (/^(refactor|rename|extract|simplify|clean)\b/.test(s)) return 'refactor';
  if (/^(test|tests)\b/.test(s)) return 'test';
  if (/^(doc|docs|document)\b/.test(s)) return 'docs';
  return null;
}

function fileSignals(ctx: ProbeContext): Evidence[] {
  const raw = ctx.git(['log', `-n${FILE_SAMPLE}`, '--name-only', '--pretty=format:']);
  if (!raw) return [];

  const churn = new Map<string, number>();
  let migrationCommits = 0;
  const seenMigrationsThisCommit = new Set<string>();

  for (const line of raw.split('\n')) {
    const path = line.trim();
    if (!path) continue;
    churn.set(path, (churn.get(path) ?? 0) + 1);
    if (MIGRATION_PATH.test(path) && !seenMigrationsThisCommit.has(path)) {
      seenMigrationsThisCommit.add(path);
      migrationCommits++;
    }
  }

  const evidence: Evidence[] = [];
  const hottest = [...churn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [path, count] of hottest) {
    if (count < 4) continue;
    evidence.push({
      probe: 'git-history',
      kind: 'churn-hotspot',
      value: `${path} changed in ${count} of the last ${FILE_SAMPLE} commits`,
      source: `git log -n${FILE_SAMPLE} --name-only`,
      confidence: 'medium',
      data: { path, count },
    });
  }

  if (migrationCommits >= 3) {
    evidence.push({
      probe: 'git-history',
      kind: 'migration-cadence',
      value: `${migrationCommits} migration files touched recently`,
      source: `git log -n${FILE_SAMPLE} --name-only`,
      confidence: migrationCommits >= 8 ? 'high' : 'medium',
      data: { count: migrationCommits },
    });
  }
  return evidence;
}
