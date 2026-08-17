/** Programmatic API. The CLI is a thin wrapper over these. */
export * from './types.js';
export { CATALOG, findArchetype } from './catalog/index.js';
export { claim, commandFrom, valuesOf } from './catalog/claims.js';
export { buildBody } from './catalog/body.js';
export { gate, type GateResult } from './engine/gate.js';
export { scan, toSpec, buildRoster, DEFAULT_BUDGET, GENERATOR } from './engine/scan.js';
export type { ScanOptions, ScanResult } from './engine/scan.js';
export { PROBES, collectEvidence, createContext } from './probes/index.js';
export type { Probe, ProbeContext } from './probes/index.js';
export { EMITTERS, emittersFor, planAll } from './emitters/index.js';
export type { Emitter, PlannedWrite } from './emitters/index.js';
export { readRoster, writeRoster, ROSTER_PATH } from './util/store.js';
