/** tools/secret-scan.mjs の形（src/__tests__/secret-scan.test.ts から呼ぶ） */
export interface Finding {
  where: string;
  line: number;
  rule: string;
  what: string;
  sample: string;
}

export interface Allow {
  path: string;
  rule: string;
  reason: string;
}

export const RULES: { id: string; what: string; re: RegExp }[];
export const BANNED_FILES: { id: string; what: string; re: RegExp }[];
export const ALLOW: Allow[];
export function scanText(text: string, where: string, allow?: Pick<Allow, 'path' | 'rule'>[]): Finding[];
export function scanName(path: string): Finding[];
