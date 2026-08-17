import type { Evidence } from '../types.js';
import { createContext, type Probe, type ProbeContext } from './context.js';
import { ciWorkflowsProbe } from './ci-workflows.js';
import { buildCommandsProbe } from './build-commands.js';
import { gitHistoryProbe } from './git-history.js';
import { enforcementProbe } from './enforcement.js';
import { repoRulesProbe } from './repo-rules.js';
import { topologyProbe } from './topology.js';

export { createContext };
export type { Probe, ProbeContext };

export const PROBES: Probe[] = [
  ciWorkflowsProbe,
  buildCommandsProbe,
  gitHistoryProbe,
  enforcementProbe,
  repoRulesProbe,
  topologyProbe,
];

/**
 * Runs every probe. A probe that throws is skipped rather than failing the
 * scan — partial evidence still produces a defensible roster, and a repo
 * shaped unusually enough to break one probe is exactly the repo that most
 * needs the others to report.
 */
export function collectEvidence(root: string, probes: Probe[] = PROBES): Evidence[] {
  const ctx = createContext(root);
  const evidence: Evidence[] = [];
  for (const probe of probes) {
    try {
      evidence.push(...probe.run(ctx));
    } catch (error) {
      process.emitWarning(
        `probe "${probe.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return evidence;
}
