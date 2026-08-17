const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];

const wrap = (code: string) => (text: string) => (useColor ? `[${code}m${text}[0m` : text);

export const bold = wrap('1');
export const dim = wrap('2');
export const green = wrap('32');
export const yellow = wrap('33');
export const red = wrap('31');
export const cyan = wrap('36');

export function heading(text: string): string {
  return `\n${bold(text)}\n${dim('─'.repeat(Math.min(text.length, 60)))}`;
}

/** Wraps prose to a readable width so rejections stay legible in a terminal. */
export function indentWrap(text: string, indent: string, width = 76): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width - indent.length) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => `${indent}${l}`).join('\n');
}
