export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  operands: string[];
}

export interface ArgSpec {
  /** 値を取るオプション（例: ['n'] なら -n 5 / -n5） */
  withValue?: readonly string[];
}

/** 短縮フラグの連結（-la）と値付きオプション（-n 5, -n5, --name=x）を扱う。 */
export function parseArgs(argv: readonly string[], spec: ArgSpec = {}): ParsedArgs {
  const withValue = new Set(spec.withValue ?? []);
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const operands: string[] = [];
  const rest = argv.slice(1);

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--') {
      operands.push(...rest.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) flags.add(arg.slice(2));
      else values.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      const letters = arg.slice(1);
      for (let j = 0; j < letters.length; j += 1) {
        const letter = letters[j] ?? '';
        if (withValue.has(letter)) {
          const inline = letters.slice(j + 1);
          if (inline !== '') {
            values.set(letter, inline);
          } else {
            const next = rest[i + 1];
            if (next === undefined) throw new Error(`option requires an argument -- '${letter}'`);
            values.set(letter, next);
            i += 1;
          }
          break;
        }
        flags.add(letter);
      }
      continue;
    }
    operands.push(arg);
  }

  return { flags, values, operands };
}

export function toLines(text: string): string[] {
  if (text === '') return [];
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutTrailing.split('\n');
}

export function fromLines(lines: readonly string[]): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}
