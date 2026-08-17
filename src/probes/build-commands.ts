import type { Evidence } from '../types.js';
import type { Probe, ProbeContext } from './context.js';

type CommandKind = 'test-command' | 'lint-command' | 'build-command' | 'typecheck-command';

const SCRIPT_PATTERNS: Array<[RegExp, CommandKind]> = [
  [/^(test|tests|test:.*|spec|integration.*|e2e.*)$/i, 'test-command'],
  [/^(lint|lint:.*|format|fmt|style|check)$/i, 'lint-command'],
  [/^(build|compile|bundle|package|dist)$/i, 'build-command'],
  [/^(typecheck|tsc|types|type-check)$/i, 'typecheck-command'],
];

/**
 * Finds the repo's verification loop. An agent is only as useful as its ability
 * to check its own work, so every generated agent gets a real command from here
 * rather than a guess.
 */
export const buildCommandsProbe: Probe = {
  name: 'build-commands',
  run(ctx: ProbeContext): Evidence[] {
    return [
      ...fromPackageJson(ctx),
      ...fromMakefile(ctx),
      ...fromGradle(ctx),
      ...fromOtherManifests(ctx),
    ];
  },
};

function fromPackageJson(ctx: ProbeContext): Evidence[] {
  const raw = ctx.read('package.json');
  if (!raw) return [];
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(raw).scripts ?? {}) as Record<string, string>;
  } catch {
    return [];
  }
  const evidence: Evidence[] = [];
  for (const [name, command] of Object.entries(scripts)) {
    const kind = SCRIPT_PATTERNS.find(([re]) => re.test(name))?.[1];
    if (!kind) continue;
    evidence.push({
      probe: 'build-commands',
      kind,
      value: `npm run ${name}`,
      source: 'package.json',
      confidence: 'high',
      data: { command: `npm run ${name}`, raw: command },
    });
  }
  return evidence;
}

function fromMakefile(ctx: ProbeContext): Evidence[] {
  const raw = ctx.read('Makefile');
  if (!raw) return [];
  const evidence: Evidence[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const target = /^([a-zA-Z0-9_-]+):(?!=)/.exec(lines[i] ?? '');
    if (!target) continue;
    const name = target[1] as string;
    const kind = SCRIPT_PATTERNS.find(([re]) => re.test(name))?.[1];
    if (!kind) continue;
    evidence.push({
      probe: 'build-commands',
      kind,
      value: `make ${name}`,
      source: `Makefile:${i + 1}`,
      confidence: 'high',
      data: { command: `make ${name}` },
    });
  }
  return evidence;
}

function fromGradle(ctx: ProbeContext): Evidence[] {
  const candidates = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
  const present = candidates.filter((f) => ctx.exists(f));
  const nested = ctx
    .walk()
    .filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f))
    .slice(0, 4);
  if (present.length === 0 && nested.length === 0) return [];

  // The wrapper is often one level down in a multi-project layout, and the
  // wrapper is the command the repo actually expects you to run.
  const wrapperPath = ctx.exists('gradlew')
    ? 'gradlew'
    : ctx.walk().find((f) => /(^|\/)gradlew$/.test(f));
  const wrapper = wrapperPath ? `./${wrapperPath}` : 'gradle';
  const evidence: Evidence[] = [
    {
      probe: 'build-commands',
      kind: 'test-command',
      value: `${wrapper} test`,
      source: present[0] ?? nested[0] ?? 'build.gradle',
      confidence: 'high',
      data: { command: `${wrapper} test` },
    },
  ];

  // A declared custom task named like an integration suite is a strong signal
  // that the slow tests are deliberately separated from the fast ones.
  for (const file of [...present, ...nested]) {
    const raw = ctx.read(file);
    if (!raw) continue;
    const task = /tasks\.register(?:<\w+>)?\(\s*["'](\w*[iI]ntegration\w*|\w*[eE]2[eE]\w*)["']/.exec(raw);
    if (task) {
      evidence.push({
        probe: 'build-commands',
        kind: 'test-command',
        value: `${wrapper} ${task[1]}`,
        source: file,
        confidence: 'high',
        data: { command: `${wrapper} ${task[1]}`, slow: true },
      });
    }
  }
  return evidence;
}

function fromOtherManifests(ctx: ProbeContext): Evidence[] {
  const evidence: Evidence[] = [];
  const add = (kind: CommandKind, value: string, source: string) =>
    evidence.push({
      probe: 'build-commands',
      kind,
      value,
      source,
      confidence: 'medium',
      data: { command: value },
    });

  if (ctx.exists('pyproject.toml')) {
    const raw = ctx.read('pyproject.toml') ?? '';
    if (/\[tool\.pytest/.test(raw) || ctx.exists('tests')) add('test-command', 'pytest', 'pyproject.toml');
    if (/\[tool\.ruff/.test(raw)) add('lint-command', 'ruff check .', 'pyproject.toml');
  }
  if (ctx.exists('Cargo.toml')) {
    add('test-command', 'cargo test', 'Cargo.toml');
    add('lint-command', 'cargo clippy', 'Cargo.toml');
  }
  if (ctx.exists('go.mod')) {
    add('test-command', 'go test ./...', 'go.mod');
    add('build-command', 'go build ./...', 'go.mod');
  }
  return evidence;
}
