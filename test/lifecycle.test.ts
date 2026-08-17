import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRoster, scan, toSpec } from '../src/engine/scan.js';
import { planAll } from '../src/emitters/index.js';
import { render, USER_MARKER } from '../src/emitters/claude-code.js';
import { applyWrites, readRepoFile, readRoster, writeRoster } from '../src/util/store.js';
import { runTune } from '../src/commands/tune.js';
import { runRender } from '../src/commands/render.js';
import { makeRepo, RICH_REPO } from './fixture.js';

function install(root: string): void {
  const result = scan({ root });
  const roster = buildRoster(result, result.admitted);
  writeRoster(root, roster);
  applyWrites(root, planAll(roster, readRepoFile(root)));
}

test('rendering is idempotent', () => {
  const root = makeRepo(RICH_REPO);
  install(root);

  const roster = readRoster(root);
  assert.ok(roster);
  const second = planAll(roster, readRepoFile(root));
  assert.ok(
    second.every((w) => w.action === 'unchanged'),
    'a second render with no changes must rewrite nothing',
  );
});

test('a tune survives re-render, and lands in the rendered agent', () => {
  const root = makeRepo(RICH_REPO);
  install(root);
  const id = (readRoster(root) as NonNullable<ReturnType<typeof readRoster>>).agents[0]!.id;

  const correction = 'never re-run the full suite to check one class';
  runTune({ root, id, constraints: [correction] });

  const rendered = readFileSync(join(root, `.claude/agents/${id}.md`), 'utf8');
  assert.ok(rendered.includes(correction), 'the correction must appear in the agent file');
  assert.ok(rendered.includes('Standing corrections'), 'and be labelled as a standing correction');

  runRender({ root });
  const again = readFileSync(join(root, `.claude/agents/${id}.md`), 'utf8');
  assert.ok(again.includes(correction), 'and must survive a regeneration');

  const spec = readRoster(root)!.agents.find((a) => a.id === id)!;
  assert.equal(spec.version, 2, 'tuning bumps the spec version');
  assert.deepEqual(spec.constraints, [correction]);
});

test('hand-written notes below the user marker survive regeneration', () => {
  const root = makeRepo(RICH_REPO);
  install(root);
  const id = readRoster(root)!.agents[0]!.id;
  const path = join(root, `.claude/agents/${id}.md`);

  const note = 'Ask Priya before touching the billing fixtures.';
  writeFileSync(path, `${readFileSync(path, 'utf8')}\n${note}\n`, 'utf8');

  runTune({ root, id, constraints: ['prefer the narrowest target'] });

  const rendered = readFileSync(path, 'utf8');
  assert.ok(rendered.includes(note), 'user content below the marker must be preserved');
  assert.ok(rendered.includes(USER_MARKER));
  assert.equal(rendered.indexOf(note) > rendered.indexOf(USER_MARKER), true);
});

test('a duplicate correction is not appended twice', () => {
  const root = makeRepo(RICH_REPO);
  install(root);
  const id = readRoster(root)!.agents[0]!.id;

  runTune({ root, id, constraints: ['be terse'] });
  runTune({ root, id, constraints: ['be terse'] });

  assert.deepEqual(readRoster(root)!.agents.find((a) => a.id === id)!.constraints, ['be terse']);
});

test('rendered frontmatter is well formed', () => {
  const root = makeRepo(RICH_REPO);
  install(root);

  for (const spec of readRoster(root)!.agents) {
    const text = readFileSync(join(root, `.claude/agents/${spec.name}.md`), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text);
    assert.ok(frontmatter, `${spec.name} has no frontmatter block`);
    const block = frontmatter[1]!;
    assert.match(block, /^name: /m);
    assert.match(block, /^description: /m);
    assert.match(block, /^tools: /m);
    assert.equal(block.split('\n').some((l) => l.trim() === ''), false, 'no blank frontmatter lines');
  }
});

test('the generated body references the rules file instead of restating it', () => {
  const root = makeRepo(RICH_REPO);
  install(root);
  const spec = readRoster(root)!.agents.find((a) => a.id === 'convention-reviewer');
  assert.ok(spec, 'the fixture should justify a convention reviewer');
  assert.match(spec.body, /CLAUDE\.md/);
  assert.match(spec.body, /Do not restate those rules/);
  assert.ok(
    !spec.body.includes('Constructor injection only'),
    'rules must be referenced, never copied out of CLAUDE.md',
  );
});

test('render --check reports drift without writing', () => {
  const root = makeRepo(RICH_REPO);
  install(root);
  assert.equal(runRender({ root, check: true }), 0, 'a fresh install is not drifted');

  const roster = readRoster(root)!;
  roster.agents[0]!.constraints.push('added out of band');
  writeRoster(root, roster);

  assert.equal(runRender({ root, check: true }), 1, 'an out-of-band edit must be reported as drift');
});

test('render preserves nothing it did not write when the file is new', () => {
  const spec = {
    id: 'x', name: 'x', description: 'd', tools: ['Read'], model: 'haiku',
    mechanisms: [], evidence: [], rejectedAlternative: '', body: 'B',
    constraints: [], version: 1, generatedAt: 'now', generator: 'test',
  };
  const output = render(spec as never, null);
  assert.ok(output.includes('name: x'));
  assert.ok(output.includes('B'));
  assert.ok(!output.includes('Standing corrections'), 'no empty corrections section');
});

test('agentrouter does not read its own output back as repository evidence', () => {
  const root = makeRepo(RICH_REPO);

  const before = scan({ root }).admitted.map((a) => a.archetype.id);
  install(root); // writes AGENTS.md, which repo-rules would otherwise pick up
  const after = scan({ root });

  assert.deepEqual(after.admitted.map((a) => a.archetype.id), before, 'the roster must be stable');

  // The real symptom: a refresh straight after an install reporting phantom churn.
  for (const spec of readRoster(root)!.agents) {
    const admission = after.admitted.find((a) => a.archetype.id === spec.id)!;
    const fresh = toSpec(admission, after);
    assert.equal(fresh.body, spec.body, `${spec.id} body changed with no repository change`);
  }
});

test('a hand-written AGENTS.md is still read, minus the managed block', () => {
  const root = makeRepo({
    ...RICH_REPO,
    'AGENTS.md': '# Agents\n\nAlways run the linter before committing.\n',
  });
  install(root);

  const evidence = scan({ root }).evidence;
  assert.ok(
    evidence.some((e) => e.kind === 'stated-rules' && e.data?.['file'] === 'AGENTS.md'),
    'genuine user rules in AGENTS.md must survive the managed-block strip',
  );
});

test('--version reports the version rather than falling through to help', async () => {
  const { execFileSync } = await import('node:child_process');
  const cli = join(process.cwd(), 'dist', 'cli.js');
  for (const flag of ['--version', '-v']) {
    const out = execFileSync('node', [cli, flag], { encoding: 'utf8' });
    assert.match(out, /^agentrouter@\d+\.\d+\.\d+/, `${flag} must print the version`);
    assert.ok(!out.includes('Usage'), `${flag} must not print the help text`);
  }
  // A bare invocation still shows help.
  assert.match(execFileSync('node', [cli], { encoding: 'utf8' }), /Usage/);
});
