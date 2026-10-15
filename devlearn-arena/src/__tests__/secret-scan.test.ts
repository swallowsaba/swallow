import { scanName, scanText } from '../../tools/secret-scan.mjs';

/**
 * 秘密情報の簡易検査（docs/testing-strategy.md 9 章）。鍵・トークンの形と、置いてはいけないファイルを見つける。
 * 下の値は、形だけを真似て組み立てた物（本物ではない。この文書の中に、そのままの形では書かない）
 */
const fake = (head: string, n: number): string => head + 'A1b2C3d4E5'.repeat(10).slice(0, n);

describe('秘密情報の検査', () => {
  it.each([
    ['private-key', ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('')],
    ['github-token', fake('ghp_', 36)],
    ['github-token', fake('github_pat_', 40)],
    ['aws-key', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
    ['ai-key', fake('sk-ant-', 40)],
    ['cloudflare', `CLOUDFLARE_API_TOKEN=${fake('', 40)}`],
    ['assigned-secret', `const apiKey = "${fake('', 24)}";`],
  ])('%s の形を見つけ、場所と行を示す', (rule, value) => {
    const found = scanText(`一行目\n${value}\n`, 'src/x.ts', []);
    expect(found).toEqual([expect.objectContaining({ where: 'src/x.ts', line: 2, rule })]);
    // 報告に値の全部は出さない
    expect(found[0]?.sample.length).toBeLessThan(value.length);
  });

  it('秘密でない文は見つけない（鍵の説明・短い例・公開鍵）', () => {
    const text = [
      '秘密鍵（private key）は自分だけが持つ。公開鍵を相手に渡す',
      'password: "hunter2"',
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBcd deploy@app',
      'const token = useToken();',
    ].join('\n');
    expect(scanText(text, 'content/x.json', [])).toEqual([]);
  });

  it('教材の形だけの例は、場所と規則を書いた時だけ外す', () => {
    const key = ['-----BEGIN ', 'OPENSSH PRIVATE KEY-----'].join('');
    expect(scanText(key, 'content/lessons/sec/sec.b.04.json', [{ path: 'content/lessons/sec/', rule: 'private-key' }])).toEqual([]);
    // 場所が違えば、外さない
    expect(scanText(key, 'src/other.ts', [{ path: 'content/lessons/sec/', rule: 'private-key' }])).toHaveLength(1);
    // 規則が違えば、外さない
    expect(scanText(fake('ghp_', 36), 'content/lessons/sec/a.json', [{ path: 'content/lessons/sec/', rule: 'private-key' }])).toHaveLength(1);
  });

  it('.env と鍵のファイルを置いてはいけない（.env の見本は置いてよい）', () => {
    expect(scanName('.env')).toHaveLength(1);
    expect(scanName('worker/.env.production')).toHaveLength(1);
    expect(scanName('keys/id_ed25519')).toHaveLength(1);
    expect(scanName('certs/server.pem')).toHaveLength(1);
    expect(scanName('worker/.dev.vars')).toHaveLength(1);
    expect(scanName('.env.example')).toEqual([]);
    expect(scanName('keys/id_ed25519.pub')).toEqual([]);
    expect(scanName('src/engines/kernel/commands/ssh.ts')).toEqual([]);
  });
});
