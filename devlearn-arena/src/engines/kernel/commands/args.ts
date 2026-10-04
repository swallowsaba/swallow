export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  operands: string[];
}

export interface ArgSpec {
  /** 値を取るオプション（例: ['n'] なら -n 5 / -n5 / --n=5 / --n 5） */
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
      if (eq !== -1) {
        values.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      // 本物の道具は --token x と --token=x のどちらも受け取る
      if (withValue.has(name)) {
        const next = rest[i + 1];
        if (next === undefined) throw new Error(`option requires an argument -- '${name}'`);
        values.set(name, next);
        i += 1;
        continue;
      }
      flags.add(name);
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

/**
 * 読みやすい大きさ（ls -h・du -h・df -h と同じ形）。1024 ごとに K・M・G・T。
 * 10 未満は小数 1 桁、10 以上は整数で、どちらも切り上げる（本物と同じ）。1024 未満はバイトのまま
 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ['K', 'M', 'G', 'T'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  // 割り算の誤差で切り上げすぎないよう、ごく小さい分を引く
  const shown = value < 10 ? (Math.ceil(value * 10 - 1e-9) / 10).toFixed(1) : String(Math.ceil(value - 1e-9));
  // 切り上げで 10.0 や 1024 になったら、次の桁の形にする
  if (shown === '10.0') return `10${units[i] ?? ''}`;
  if (shown === '1024' && i < units.length - 1) return `1.0${units[i + 1] ?? ''}`;
  return `${shown}${units[i] ?? ''}`;
}
