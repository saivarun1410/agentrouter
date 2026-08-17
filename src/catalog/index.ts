import type { Archetype } from '../types.js';
import { testTriage, ciFailureAnalyst } from './verification.js';
import { migrationAuthor, dependencyAuditor } from './change.js';
import { conventionReviewer, docsContractKeeper } from './review.js';
import { codebaseExplorer, packageFanout } from './exploration.js';
import { apiDocsWriter } from './api-docs.js';

/**
 * Every archetype the tool knows how to argue for. Membership here is not
 * endorsement — an archetype is admitted to a repository's roster only if the
 * evidence supports at least one of its mechanism claims.
 */
export const CATALOG: Archetype[] = [
  testTriage,
  ciFailureAnalyst,
  conventionReviewer,
  migrationAuthor,
  codebaseExplorer,
  dependencyAuditor,
  packageFanout,
  docsContractKeeper,
  apiDocsWriter,
];

export function findArchetype(id: string): Archetype | undefined {
  return CATALOG.find((a) => a.id === id);
}
