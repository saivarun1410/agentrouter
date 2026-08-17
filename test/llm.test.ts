import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptProposals } from '../src/llm/adapt.js';
import { gate } from '../src/engine/gate.js';
import { evidenceRef, type Evidence } from '../src/types.js';
import type { Proposal } from '../src/llm/schema.js';

const REAL: Evidence = {
  probe: 'ci-workflows',
  kind: 'long-running-job',
  value: 'integration (containers)',
  source: '.github/workflows/ci.yml:8',
  confidence: 'high',
};
const REAL_REF = evidenceRef(REAL);
const FAKE_REF = 'ci-workflows:long-running-job@.github/workflows/imaginary.yml:99';

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'flake-hunter',
    title: 'Flake hunter',
    purpose: 'Finds intermittently failing tests.',
    invokeWhen: 'Use when a suite fails inconsistently.',
    tools: ['Bash', 'Read'],
    model: 'sonnet',
    alternativeKind: 'skill',
    alternativeReason: 'without a slow suite there is nothing to isolate',
    claims: [{ mechanism: 'context-isolation', rationale: 'reruns emit huge logs', evidence: [REAL_REF] }],
    method: ['Re-run the failing target several times.'],
    verification: 'A flake is confirmed only by a run that both passed and failed.',
    boundaries: ['Do not edit tests.'],
    ...overrides,
  };
}

test('a proposal citing real evidence is admitted by the ordinary gate', () => {
  const { archetypes, discarded } = adaptProposals([proposal()], [REAL]);
  assert.equal(discarded.length, 0);
  assert.equal(archetypes.length, 1);

  const { admitted } = gate(archetypes, [REAL]);
  assert.equal(admitted.length, 1, 'a genuinely evidenced proposal should pass the gate');
  assert.equal(admitted[0]!.support[0]!.evidence[0]!.source, REAL.source);
});

test('a proposal whose citations are entirely fabricated is discarded before the gate', () => {
  const fabricated = proposal({
    claims: [{ mechanism: 'context-isolation', rationale: 'invented', evidence: [FAKE_REF] }],
  });
  const { archetypes, discarded } = adaptProposals([fabricated], [REAL]);

  assert.equal(archetypes.length, 0, 'nothing may reach the gate on invented evidence');
  assert.match(discarded[0]!.reason, /fabricated/);
});

test('a fabricated claim cannot support an agent even alongside a real one', () => {
  const mixed = proposal({
    claims: [
      { mechanism: 'context-isolation', rationale: 'real', evidence: [REAL_REF] },
      { mechanism: 'parallelism', rationale: 'invented', evidence: [FAKE_REF] },
    ],
  });
  const { archetypes } = adaptProposals([mixed], [REAL]);
  const { admitted } = gate(archetypes, [REAL]);

  assert.equal(admitted.length, 1);
  const mechanisms = admitted[0]!.support.map((s) => s.mechanism);
  assert.deepEqual(mechanisms, ['context-isolation'], 'only the evidenced mechanism may be credited');
});

test('a proposal cannot claim a mechanism that does not exist', () => {
  const bogus = proposal({
    claims: [{ mechanism: 'sounds-important', rationale: 'x', evidence: [REAL_REF] }],
  });
  const { archetypes } = adaptProposals([bogus], [REAL]);
  const { admitted, rejected } = gate(archetypes, [REAL]);

  assert.equal(admitted.length, 0, 'an unknown mechanism must not admit an agent');
  assert.equal(rejected.length, 1);
});

test('proposals cannot overwrite catalog archetypes or use malformed ids', () => {
  const collision = adaptProposals([proposal({ id: 'test-triage' })], [REAL]);
  assert.equal(collision.archetypes.length, 0);
  assert.match(collision.discarded[0]!.reason, /duplicates/);

  const malformed = adaptProposals([proposal({ id: 'Not A Slug' })], [REAL]);
  assert.equal(malformed.archetypes.length, 0);
  assert.match(malformed.discarded[0]!.reason, /kebab-case/);

  const toolless = adaptProposals([proposal({ tools: [] })], [REAL]);
  assert.equal(toolless.archetypes.length, 0);
  assert.match(toolless.discarded[0]!.reason, /no tools/);
});

test('a generated body carries the provenance of a model-proposed agent', () => {
  const { archetypes } = adaptProposals([proposal()], [REAL]);
  const body = archetypes[0]!.body({
    support: [{ mechanism: 'context-isolation', rationale: 'reruns emit huge logs', evidence: [REAL] }],
    all: [REAL],
    repoName: 'fixture',
  });

  assert.match(body, /proposed by a model rather than drawn from the catalog/);
  assert.match(body, /context-isolation/);
});
