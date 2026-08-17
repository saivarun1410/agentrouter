import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Builds a throwaway repository on disk. Fixtures are real directories with
 * real git history because the probes read both, and a fixture that mocked
 * either would stop testing the thing most likely to break.
 */
export function makeRepo(files: Record<string, string>, commits: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'agentrouter-fixture-'));
  for (const [path, contents] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  }

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: 'ignore', env: gitEnv() });

  git('init', '-q');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'user.name', 'Fixture');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: fixture base');

  for (const [i, subject] of commits.entries()) {
    writeFileSync(join(root, '.history'), `${i}\n`, 'utf8');
    git('add', '-A');
    git('commit', '-q', '-m', subject);
  }
  return root;
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.test',
  };
}

/** A repo with CI, a slow suite, mechanised checks, and a docs obligation. */
export const RICH_REPO: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'fixture',
      workspaces: ['packages/*'],
      scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc -b' },
    },
    null,
    2,
  ),
  '.github/workflows/ci.yml': [
    'name: CI',
    'on: [push]',
    'jobs:',
    '  lint:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: npm run lint',
    '  integration:',
    '    runs-on: ubuntu-latest',
    '    services:',
    '      postgres:',
    '        image: postgres:16',
    '    steps:',
    '      - run: npm run test:integration',
    '  matrix-build:',
    '    runs-on: ubuntu-latest',
    '    strategy:',
    '      matrix:',
    '        node: [20, 22]',
    '    steps:',
    '      - run: npm run build',
    '',
  ].join('\n'),
  'scripts/check-standards.sh': '#!/bin/bash\nexit 0\n',
  'CLAUDE.md': [
    '# Conventions',
    '',
    'Layered architecture. Constructor injection only.',
    'When finishing work, update docs/status.md with what changed.',
    '',
  ].join('\n'),
  'db/migrations/001_init.sql': 'CREATE TABLE a (id INT);\n',
  'db/migrations/002_add.sql': 'ALTER TABLE a ADD COLUMN b INT;\n',
  'db/migrations/003_more.sql': 'ALTER TABLE a ADD COLUMN c INT;\n',
  'packages/one/package.json': '{"name":"one"}\n',
  'packages/two/package.json': '{"name":"two"}\n',
  'packages/three/package.json': '{"name":"three"}\n',
  'src/index.ts': 'export const a = 1;\n',
  'src/service.ts': 'export const b = 2;\n',
  'src/repo.ts': 'export const c = 3;\n',
};

/** A repo with nothing an agent could be justified by. */
export const BARE_REPO: Record<string, string> = {
  'README.md': '# tiny\n',
  'main.py': 'print("hi")\n',
};
