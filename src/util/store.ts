import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Roster } from '../types.js';
import type { PlannedWrite } from '../emitters/types.js';

export const ROSTER_DIR = '.agentfit';
export const ROSTER_PATH = `${ROSTER_DIR}/roster.json`;

export function rosterPath(root: string): string {
  return join(root, ROSTER_PATH);
}

export function readRoster(root: string): Roster | null {
  const path = rosterPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Roster;
  if (parsed.schema !== 1) {
    throw new Error(`unsupported roster schema ${String(parsed.schema)} in ${ROSTER_PATH}`);
  }
  return parsed;
}

export function writeRoster(root: string, roster: Roster): void {
  const path = rosterPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');
}

export function readRepoFile(root: string): (rel: string) => string | null {
  return (rel: string) => {
    const path = join(root, rel);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  };
}

/** Applies planned writes. Unchanged files are skipped so mtimes stay stable. */
export function applyWrites(root: string, writes: PlannedWrite[]): PlannedWrite[] {
  const applied: PlannedWrite[] = [];
  for (const write of writes) {
    if (write.action === 'unchanged') continue;
    const path = join(root, write.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, write.contents, 'utf8');
    applied.push(write);
  }
  return applied;
}
