import type { Evidence } from '../types.js';
import type { Probe, ProbeContext } from './context.js';

const WORKFLOW_DIR = '.github/workflows';

const LONG_RUNNING = /\b(integration|e2e|end-to-end|testcontainers|docker\s+compose|selenium|playwright|cypress|\.\/gradlew|mvn\s+verify)\b/i;
const TEST_STEP = /\b(test|pytest|jest|vitest|go\s+test|cargo\s+test)\b/i;
const LINT_STEP = /\b(lint|eslint|ruff|checkstyle|spotless|gofmt|clippy|prettier|format)\b/i;
const SECURITY_STEP = /\b(codeql|trivy|snyk|gitleaks|npm\s+audit|dependency-check|semgrep)\b/i;

/**
 * Reads GitHub Actions workflows. CI jobs are the highest-confidence signal in
 * the whole tool: each one is a task somebody already decided was worth naming,
 * gating, and repeating on every push.
 *
 * Note: this is a targeted extractor, not a YAML parser — it recognises the
 * conventional two-space `jobs:` layout that Actions files overwhelmingly use.
 * Exotic formatting (flow mappings, anchors) is skipped rather than guessed at.
 */
export const ciWorkflowsProbe: Probe = {
  name: 'ci-workflows',
  run(ctx: ProbeContext): Evidence[] {
    const files = ctx
      .children(WORKFLOW_DIR)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    const evidence: Evidence[] = [];

    for (const file of files) {
      const rel = `${WORKFLOW_DIR}/${file}`;
      const content = ctx.read(rel);
      if (!content) continue;
      for (const job of extractJobs(content)) {
        const source = `${rel}:${job.line}`;
        evidence.push({
          probe: 'ci-workflows',
          kind: 'ci-job',
          value: job.id,
          source,
          confidence: 'high',
        });

        if (LONG_RUNNING.test(job.block) || /^\s{4,}services:/m.test(job.block)) {
          evidence.push({
            probe: 'ci-workflows',
            kind: 'long-running-job',
            value: `${job.id} (containers or integration suite)`,
            source,
            confidence: 'high',
            data: { job: job.id },
          });
        } else if (TEST_STEP.test(job.block)) {
          evidence.push({
            probe: 'ci-workflows',
            kind: 'long-running-job',
            value: `${job.id} (test suite)`,
            source,
            confidence: 'medium',
            data: { job: job.id },
          });
        }

        if (/^\s{4,}(strategy|matrix):/m.test(job.block)) {
          evidence.push({
            probe: 'ci-workflows',
            kind: 'matrix-job',
            value: `${job.id} runs a build matrix`,
            source,
            confidence: 'high',
            data: { job: job.id },
          });
        }
        if (LINT_STEP.test(job.block)) {
          evidence.push({
            probe: 'ci-workflows',
            kind: 'gated-convention',
            value: `${job.id} enforces lint or format rules`,
            source,
            confidence: 'high',
            data: { job: job.id },
          });
        }
        if (SECURITY_STEP.test(job.block)) {
          evidence.push({
            probe: 'ci-workflows',
            kind: 'security-scan',
            value: `${job.id} runs a security scan`,
            source,
            confidence: 'high',
            data: { job: job.id },
          });
        }
      }
    }
    return evidence;
  },
};

interface ExtractedJob {
  id: string;
  line: number;
  block: string;
}

function extractJobs(content: string): ExtractedJob[] {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) return [];

  const jobs: ExtractedJob[] = [];
  let current: ExtractedJob | null = null;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\S/.test(line) && line.trim() !== '') {
      break; // back to a top-level key; jobs section is over
    }
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (current) jobs.push(current);
      current = { id: header[1] as string, line: i + 1, block: '' };
      continue;
    }
    if (current) current.block += line + '\n';
  }
  if (current) jobs.push(current);
  return jobs;
}
