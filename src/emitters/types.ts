import type { Roster } from '../types.js';

export interface PlannedWrite {
  /** Repo-relative path. */
  path: string;
  contents: string;
  action: 'create' | 'update' | 'unchanged';
}

export interface Emitter {
  name: string;
  /** Produces the files this emitter would write. Never touches the disk. */
  plan(roster: Roster, read: (rel: string) => string | null): PlannedWrite[];
}
