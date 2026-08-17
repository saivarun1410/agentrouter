import type { Roster } from '../types.js';
import { claudeCodeEmitter } from './claude-code.js';
import { agentsMdEmitter } from './agents-md.js';
import type { Emitter, PlannedWrite } from './types.js';

export { claudeCodeEmitter, agentsMdEmitter };
export type { Emitter, PlannedWrite };

export const EMITTERS: Emitter[] = [claudeCodeEmitter, agentsMdEmitter];

export function emittersFor(names: string[] | undefined): Emitter[] {
  if (!names || names.length === 0) return EMITTERS;
  const selected = EMITTERS.filter((e) => names.includes(e.name));
  const unknown = names.filter((n) => !EMITTERS.some((e) => e.name === n));
  if (unknown.length > 0) {
    throw new Error(
      `unknown emitter(s): ${unknown.join(', ')}. Available: ${EMITTERS.map((e) => e.name).join(', ')}`,
    );
  }
  return selected;
}

export function planAll(
  roster: Roster,
  read: (rel: string) => string | null,
  emitters: Emitter[] = EMITTERS,
): PlannedWrite[] {
  return emitters.flatMap((emitter) => emitter.plan(roster, read));
}
