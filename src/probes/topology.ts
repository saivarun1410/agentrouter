import type { Evidence } from '../types.js';
import type { Probe, ProbeContext } from './context.js';

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.swift': 'Swift',
  '.sql': 'SQL',
};

/** Below this a repo is small enough that the main thread can just read it. */
const LARGE_REPO_FILES = 400;
const TEST_DIR = /(^|\/)(tests?|__tests__|spec|integrationTest)(\/|$)/;
const MIGRATION_DIR = /(^|\/)(migrations?|db\/migrate|flyway|alembic)(\/|$)/i;
const API_SURFACE = /(openapi|swagger)\.(ya?ml|json)$|\.proto$/i;

export const topologyProbe: Probe = {
  name: 'topology',
  run(ctx: ProbeContext): Evidence[] {
    const files = ctx.walk();
    const evidence: Evidence[] = [];

    evidence.push(...languages(files));

    evidence.push({
      probe: 'topology',
      kind: 'repo-size',
      value: `${files.length} source files`,
      source: 'filesystem walk',
      confidence: files.length > LARGE_REPO_FILES ? 'high' : 'low',
      data: { files: files.length, large: files.length > LARGE_REPO_FILES },
    });

    const testDirs = uniqueDirs(files.filter((f) => TEST_DIR.test(f)));
    for (const dir of testDirs.slice(0, 4)) {
      evidence.push({
        probe: 'topology',
        kind: 'test-suite',
        value: dir,
        source: dir,
        confidence: 'high',
        data: { dir },
      });
    }

    const migrationDirs = uniqueDirs(files.filter((f) => MIGRATION_DIR.test(f)));
    for (const dir of migrationDirs.slice(0, 2)) {
      const count = files.filter((f) => f.startsWith(dir)).length;
      evidence.push({
        probe: 'topology',
        kind: 'schema-migrations',
        value: `${dir} (${count} files)`,
        source: dir,
        confidence: 'high',
        data: { dir, count },
      });
    }

    const api = files.filter((f) => API_SURFACE.test(f)).slice(0, 3);
    for (const file of api) {
      evidence.push({
        probe: 'topology',
        kind: 'api-surface',
        value: file,
        source: file,
        confidence: 'high',
        data: { file },
      });
    }

    evidence.push(...workspaces(ctx, files));
    return evidence;
  },
};

function languages(files: string[]): Evidence[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dot = file.lastIndexOf('.');
    if (dot === -1) continue;
    const lang = LANGUAGE_BY_EXT[file.slice(dot)];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([lang, count]) => ({
      probe: 'topology',
      kind: 'language',
      value: `${lang} (${count} files)`,
      source: 'filesystem walk',
      confidence: 'high' as const,
      data: { language: lang, count },
    }));
}

/** Independent packages are the cleanest parallelism signal a repo can give. */
function workspaces(ctx: ProbeContext, files: string[]): Evidence[] {
  const manifests = files.filter(
    (f) => /(^|\/)package\.json$/.test(f) && f !== 'package.json',
  );
  const gradleModules = files.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f));
  const declared =
    ctx.exists('pnpm-workspace.yaml') ||
    ctx.exists('lerna.json') ||
    ctx.exists('turbo.json') ||
    /"workspaces"\s*:/.test(ctx.read('package.json') ?? '');

  const count = Math.max(manifests.length, gradleModules.length);
  if (count < 3 && !declared) return [];

  return [
    {
      probe: 'topology',
      kind: 'workspace-packages',
      value: `${count} independent packages/modules${declared ? ' (workspace declared)' : ''}`,
      source: declared ? 'workspace manifest' : 'filesystem walk',
      confidence: count >= 5 ? 'high' : 'medium',
      data: { count, declared },
    },
  ];
}

function uniqueDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    parts.pop();
    if (parts.length) dirs.add(parts.join('/') + '/');
  }
  // Keep only the shallowest representative of each tree.
  const sorted = [...dirs].sort((a, b) => a.length - b.length);
  return sorted.filter((d) => !sorted.some((other) => other !== d && d.startsWith(other)));
}
