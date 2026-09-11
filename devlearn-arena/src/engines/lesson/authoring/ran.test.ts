import { describe, expect, it } from 'vitest';
import { commandsOf, countRan, POD, ran } from './ran';

describe('打ったコマンドを単語で比べる', () => {
  it('大文字小文字・余分な空白・引用符の違いでは落ちない', () => {
    expect(ran(['  KUBECTL   describe   "pod"  web '], 'kubectl', 'describe', POD)).toBe(true);
    expect(ran(["gh 'pr' LIST"], 'gh', 'pr', 'list')).toBe(true);
  });

  it('別名や pod/名前 の形も同じに扱う', () => {
    expect(ran(['kubectl describe po/web-1'], 'kubectl', 'describe', POD)).toBe(true);
    expect(ran(['kubectl get secret s -o=yaml'], 'kubectl', 'get', 'secret', '-o', 'yaml')).toBe(true);
  });

  it('パイプや && の後ろのコマンドも数える', () => {
    expect(ran(['cd /tmp && ping 10.0.0.1'], 'ping')).toBe(true);
    expect(countRan(['dig a | grep x', 'dig b'], 'dig')).toBe(2);
  });

  it('先頭のコマンド名は一致しないといけない', () => {
    expect(ran(['echo kubectl logs'], 'kubectl', 'logs')).toBe(false);
    expect(ran(['ls'], 'ping')).toBe(false);
  });

  it('URL はほどかない', () => {
    expect(commandsOf('curl http://a/b')).toEqual([['curl', 'http://a/b']]);
  });
});

describe('パスはほどかない', () => {
  it('docs/guide.md はそのまま1語', () => {
    expect(commandsOf('gh codeowners who docs/guide.md')).toEqual([['gh', 'codeowners', 'who', 'docs/guide.md']]);
  });
});
