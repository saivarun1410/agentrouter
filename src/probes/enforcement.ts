import type { Evidence } from '../types.js';
import type { Probe, ProbeContext } from './context.js';

const CHECK_SCRIPT = /(check|verify|lint|standards|quality|gate|guard|validate)/i;

/**
 * Finds rules the repo has already mechanised. This matters twice over: a
 * mechanised rule is a durable rubric (so an agent can be graded against it),
 * and the generated agent must *call* the existing check rather than restate
 * its contents — restated rules drift from the script and rot.
 */
export const enforcementProbe: Probe = {
  name: 'enforcement',
  run(ctx: ProbeContext): Evidence[] {
    return [
      ...shellChecks(ctx),
      ...hookConfigs(ctx),
      ...architectureTests(ctx),
    ];
  },
};

function shellChecks(ctx: ProbeContext): Evidence[] {
  return ctx
    .walk()
    .filter((f) => /^scripts?\//.test(f) && /\.(sh|bash)$/.test(f) && CHECK_SCRIPT.test(f))
    .slice(0, 6)
    .map((file) => ({
      probe: 'enforcement',
      kind: 'mechanized-rule',
      value: `./${file}`,
      source: file,
      confidence: 'high' as const,
      data: { command: `./${file}` },
    }));
}

function hookConfigs(ctx: ProbeContext): Evidence[] {
  const evidence: Evidence[] = [];
  const add = (value: string, source: string, command?: string) =>
    evidence.push({
      probe: 'enforcement',
      kind: 'mechanized-rule',
      value,
      source,
      confidence: 'high',
      data: command ? { command } : undefined,
    });

  if (ctx.exists('.pre-commit-config.yaml')) {
    add('pre-commit hooks', '.pre-commit-config.yaml', 'pre-commit run --all-files');
  }
  if (ctx.exists('.husky')) {
    add('husky git hooks', '.husky');
  }
  const pkg = ctx.read('package.json');
  if (pkg && /"lint-staged"/.test(pkg)) {
    add('lint-staged rules', 'package.json');
  }
  for (const cfg of ['.eslintrc', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs']) {
    if (ctx.exists(cfg)) {
      add('eslint ruleset', cfg, 'npx eslint .');
      break;
    }
  }
  return evidence;
}

/**
 * ArchUnit / import-linter style tests encode dependency direction — the
 * strongest form of durable rubric a repo can offer a review agent.
 */
function architectureTests(ctx: ProbeContext): Evidence[] {
  const candidates = ctx
    .walk()
    .filter((f) => /(Architecture|ArchUnit|Boundaries?)\w*Test\.(java|kt)$/.test(f) || /importlinter|\.importlinter$/.test(f));
  if (candidates.length === 0) return [];
  const first = candidates[0] as string;
  return [
    {
      probe: 'enforcement',
      kind: 'mechanized-rule',
      value: `architecture test: ${first}`,
      source: first,
      confidence: 'high',
      data: { architectural: true },
    },
  ];
}
