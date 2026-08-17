import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../src/engine/scan.js';
import { gate } from '../src/engine/gate.js';
import { CATALOG } from '../src/catalog/index.js';
import { makeRepo, RICH_REPO, BARE_REPO } from './fixture.js';

test('a repo with no signals justifies no agents at all', () => {
  const root = makeRepo(BARE_REPO);
  const result = scan({ root });

  assert.equal(result.admitted.length, 0, 'a bare repo should produce an empty roster');
  assert.ok(result.rejected.length > 0, 'and every candidate should be explicitly rejected');

  for (const rejection of result.rejected) {
    assert.ok(rejection.unsatisfied.length > 0, `${rejection.archetypeId} must name what it lacked`);
    assert.match(rejection.verdict, /This is a (skill|rule), not an agent\./);
    assert.ok(rejection.detail.length > 20, `${rejection.archetypeId} must explain the rejection`);
  }
});

test('a repo with CI, a slow suite and mechanised checks justifies agents', () => {
  const root = makeRepo(RICH_REPO);
  const result = scan({ root });
  const ids = result.admitted.map((a) => a.archetype.id);

  assert.ok(ids.includes('convention-reviewer'), 'mechanised checks justify a reviewer');
  assert.ok(ids.includes('test-triage'), 'a containerised CI suite justifies test triage');
  assert.ok(ids.includes('package-fanout'), 'three workspace packages justify fan-out');
});

test('every admitted agent is backed by at least one mechanism and real evidence', () => {
  const root = makeRepo(RICH_REPO);
  const result = scan({ root });

  for (const admission of result.admitted) {
    assert.ok(admission.support.length > 0, `${admission.archetype.id} has no supported mechanism`);
    for (const support of admission.support) {
      assert.ok(
        support.evidence.length > 0,
        `${admission.archetype.id}/${support.mechanism} claims support with no evidence`,
      );
      for (const e of support.evidence) {
        assert.ok(e.source.length > 0, 'evidence must cite a source');
      }
    }
  }
});

test('the budget defers rather than discards', () => {
  const root = makeRepo(RICH_REPO);
  const full = scan({ root, budget: 99 });
  const capped = scan({ root, budget: 2 });

  assert.equal(capped.admitted.length, 2);
  assert.equal(
    capped.admitted.length + capped.deferred.length,
    full.admitted.length,
    'nothing justified may be silently dropped by the budget',
  );
});

test('no archetype can be admitted without a supported claim', () => {
  const admitted = gate(CATALOG, []).admitted;
  assert.equal(admitted.length, 0, 'zero evidence must admit zero agents');
});

test('ranking is deterministic across runs', () => {
  const root = makeRepo(RICH_REPO);
  const first = scan({ root }).admitted.map((a) => a.archetype.id);
  const second = scan({ root }).admitted.map((a) => a.archetype.id);
  assert.deepEqual(first, second);
});

test('a CI build matrix alone does not justify a fan-out agent', () => {
  // A node-version matrix is the same work on several runtimes, not N
  // independent targets. A single-package repo must never get package-fanout.
  const root = makeRepo({
    'package.json': '{"name":"solo","scripts":{"test":"vitest run"}}\n',
    '.github/workflows/ci.yml': [
      'name: CI', 'on: [push]', 'jobs:', '  test:', '    runs-on: ubuntu-latest',
      '    strategy:', '      matrix:', '        node: [20, 22]',
      '    steps:', '      - run: npm test', '',
    ].join('\n'),
  });
  const result = scan({ root });

  assert.ok(
    result.evidence.some((e) => e.kind === 'matrix-job'),
    'the matrix should still be observed as evidence',
  );
  assert.ok(
    !result.admitted.some((a) => a.archetype.id === 'package-fanout'),
    'but it must not on its own admit a fan-out agent',
  );
});

test('one CI job counted under two kinds does not satisfy a two-job threshold', () => {
  const root = makeRepo({
    'package.json': '{"name":"solo","scripts":{"test":"vitest run"}}\n',
    '.github/workflows/ci.yml': [
      'name: CI', 'on: [push]', 'jobs:', '  only:', '    runs-on: ubuntu-latest',
      '    steps:', '      - run: npm test', '',
    ].join('\n'),
  });
  const result = scan({ root });

  const jobRecords = result.evidence.filter(
    (e) => e.kind === 'ci-job' || e.kind === 'long-running-job',
  );
  assert.ok(jobRecords.length >= 2, 'the single job does produce two evidence records');
  assert.ok(
    !result.admitted.some((a) => a.archetype.id === 'ci-failure-analyst'),
    'yet one job must not satisfy the two-distinct-job threshold',
  );
});

test('workspace packages do justify fan-out, with the matrix reinforcing it', () => {
  const root = makeRepo(RICH_REPO);
  const fanout = scan({ root }).admitted.find((a) => a.archetype.id === 'package-fanout');
  assert.ok(fanout, 'three packages plus a workspaces field justify fan-out');

  const parallelism = fanout.support.find((s) => s.mechanism === 'parallelism')!;
  assert.ok(
    parallelism.evidence.some((e) => e.kind === 'workspace-packages'),
    'the required signal must be present',
  );
  assert.ok(
    parallelism.evidence.some((e) => e.kind === 'matrix-job'),
    'and the reinforcing signal is included once the requirement is met',
  );
});
