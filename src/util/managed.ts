/**
 * agentfit writes into files that agentfit also reads. Without stripping its
 * own output first, a scan observes the previous scan's conclusions as though
 * they were repository evidence — every refresh then reports churn that no
 * human caused, and the roster never converges.
 *
 * Any probe that reads a file an emitter may have written must strip managed
 * blocks before drawing conclusions from it.
 */
const MANAGED_BLOCK = /<!--\s*agentfit:(begin|managed)\s*-->[\s\S]*?<!--\s*agentfit:end\s*-->/g;

export function stripManagedBlocks(text: string): string {
  return text.replace(MANAGED_BLOCK, '');
}

/** True when a file is nothing but agentfit output plus incidental headings. */
export function isEntirelyGenerated(text: string): boolean {
  const remainder = stripManagedBlocks(text)
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^#{1,6}\s/.test(line.trim()))
    .join('\n')
    .trim();
  return remainder.length === 0;
}
