import type { Archetype } from '../types.js';
import { claim, valuesOf } from './claims.js';
import { buildBody } from './body.js';

/**
 * The control case.
 *
 * "An agent that writes our API docs" is one of the most commonly requested
 * agents and one of the least often justified: in most repositories it has no
 * volume to isolate, no unusual tools, and no stable rubric — it is a writing
 * task the main thread can do with more context than a subagent would have.
 *
 * It stays in the catalog precisely so the scan can say that out loud. A tool
 * that only ever reports what it approved teaches the user nothing about where
 * the line is.
 */
export const apiDocsWriter: Archetype = {
  id: 'api-docs-writer',
  title: 'API docs writer',
  purpose: 'Keeps generated API reference documentation in step with a published interface definition.',
  invokeWhen:
    'Use when a published API surface (OpenAPI, protobuf) changes and its reference documentation must be regenerated and reconciled.',
  claims: [
    claim(
      'durable-rubric',
      ['api-surface'],
      'a published interface definition is the specification, so "documented correctly" is checkable against it rather than a matter of taste',
    ),
    claim(
      'context-isolation',
      ['api-surface'],
      'a large interface definition is bulky to hold in the main thread while writing prose against it',
      { min: 2 },
    ),
  ],
  tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob'],
  model: 'sonnet',
  alternative: {
    kind: 'skill',
    reason:
      'with no machine-readable interface definition there is no rubric to check the prose against, and documentation written without the surrounding context of the main thread is usually worse, not better',
  },
  body(ctx) {
    const surfaces = valuesOf(ctx.all, ['api-surface'], 3);
    return buildBody(ctx, {
      role:
        'You maintain reference documentation against this repository\'s published interface definitions. The definition is the source of truth; your prose explains it and must never contradict it.',
      method: [
        surfaces.length > 0
          ? `Read the interface definitions first: ${surfaces.join(', ')}.`
          : 'Read the interface definition first.',
        'Diff the current definition against what the documentation describes, and list every discrepancy before writing anything.',
        'Update the documentation to match. Where behaviour is genuinely ambiguous in the definition, say so rather than inventing a contract.',
        'Preserve existing examples where they are still valid; rewrite them only where the interface changed.',
      ],
      verification:
        'Every documented field, endpoint, or message must exist in the definition, and every required one must be documented. Check both directions.',
      boundaries: [
        'Never document behaviour that is not in the definition or the code. Invented contracts are worse than missing ones.',
        'Do not edit the interface definition to match the documentation. The definition wins.',
      ],
    });
  },
};
