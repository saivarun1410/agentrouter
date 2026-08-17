import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence } from '../src/probes/index.js';
import { makeRepo, RICH_REPO } from './fixture.js';

function kinds(evidence: ReturnType<typeof collectEvidence>, kind: string) {
  return evidence.filter((e) => e.kind === kind);
}

test('ci probe finds jobs and classifies the slow one', () => {
  const evidence = collectEvidence(makeRepo(RICH_REPO));
  assert.equal(kinds(evidence, 'ci-job').length, 3);
  assert.ok(
    kinds(evidence, 'long-running-job').some((e) => e.value.includes('integration')),
    'a job with service containers is long-running',
  );
  assert.ok(kinds(evidence, 'matrix-job').length >= 1, 'a matrix strategy is a parallelism signal');
  assert.ok(kinds(evidence, 'gated-convention').length >= 1, 'a lint job is a gated convention');
});

test('docs-contract captures the full path, not a suffix of it', () => {
  const evidence = collectEvidence(
    makeRepo({
      'CLAUDE.md': 'When finishing work, update docs/implementation-status.md with what changed.\n',
    }),
  );
  const contract = kinds(evidence, 'docs-contract')[0];
  assert.ok(contract, 'a stated documentation obligation must be detected');
  assert.equal(contract.data?.['target'], 'docs/implementation-status.md');
});

test('git history recognises recurring work even without conventional commits', () => {
  const commits = Array.from({ length: 12 }, (_, i) => `Bump lodash to v4.17.${i}`);
  const evidence = collectEvidence(makeRepo({ 'a.txt': 'a\n' }, commits));
  const recurring = kinds(evidence, 'recurring-work-type');
  assert.ok(
    recurring.some((e) => e.data?.['type'] === 'deps'),
    'repeated dependency bumps are a standing workload',
  );
});

test('a probe failure does not abort the scan', () => {
  const evidence = collectEvidence(makeRepo(RICH_REPO), [
    { name: 'exploding', run: () => { throw new Error('boom'); } },
    { name: 'fine', run: () => [{ probe: 'fine', kind: 'ok', value: 'v', source: 's', confidence: 'low' as const }] },
  ]);
  assert.equal(evidence.length, 1, 'the surviving probe still reports');
});

test('workspace packages are detected as a parallelism signal', () => {
  const evidence = collectEvidence(makeRepo(RICH_REPO));
  const workspaces = kinds(evidence, 'workspace-packages')[0];
  assert.ok(workspaces, 'three package manifests plus a workspaces field should be found');
  assert.equal(workspaces.data?.['declared'], true);
});
