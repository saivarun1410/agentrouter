import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Evidence } from '../types.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.gradle',
  '.idea',
  'coverage',
  // agentrouter's own output. Reading it back would make each scan observe the
  // previous scan's conclusions as evidence.
  '.agentrouter',
  '.claude',
]);

/** Bounded so a scan of a huge monorepo stays interactive. */
const MAX_WALK_ENTRIES = 20_000;

export interface ProbeContext {
  root: string;
  repoName: string;
  read(rel: string): string | null;
  exists(rel: string): boolean;
  /** Immediate children of a directory, names only. Empty if missing. */
  children(rel: string): string[];
  /** All tracked-ish files, repo-relative, ignoring build/vendor dirs. */
  walk(): string[];
  /** Run git; returns null if git is unavailable or the command fails. */
  git(args: string[]): string | null;
}

export interface Probe {
  name: string;
  run(ctx: ProbeContext): Evidence[];
}

export function createContext(root: string): ProbeContext {
  let walked: string[] | null = null;

  const read = (rel: string): string | null => {
    const abs = join(root, rel);
    try {
      if (!statSync(abs).isFile()) return null;
      return readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  };

  return {
    root,
    repoName: root.split(sep).filter(Boolean).pop() ?? 'repo',
    read,
    exists: (rel) => existsSync(join(root, rel)),
    children: (rel) => {
      try {
        return readdirSync(join(root, rel));
      } catch {
        return [];
      }
    },
    walk: () => {
      if (walked) return walked;
      walked = walkDir(root, root, 0);
      return walked;
    },
    git: (args) => {
      try {
        return execFileSync('git', args, {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        return null;
      }
    },
  };
}

function walkDir(root: string, dir: string, depth: number): string[] {
  if (depth > 12) return [];
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (found.length > MAX_WALK_ENTRIES) break;
    if (IGNORED_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      found.push(...walkDir(root, abs, depth + 1));
    } else {
      found.push(relative(root, abs));
    }
  }
  return found;
}
