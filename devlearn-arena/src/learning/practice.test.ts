import { describe, expect, it } from 'vitest';
import { ERROR_GUIDES } from '@/content/glossary';
import { loadLesson } from '@/content/lessons';
import type { Lesson, Practice } from '@/content/schema';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { shellOptions } from '@/engines/environments';
import { applyStatement, createSim } from '@/engines/sim/sim';
import {
  afterCommand, answerOf, attemptOf, checkState, commandCandidates, currentStep, findGuide, GENERIC_GUIDE, hintsUsed, isFinished,
  openHint, replayAnswers, resultKind, startRun, type PracticeRun,
} from './practice';

/** 端末で 1 行打ち、実戦を進める（画面と同じ道筋） */
function player(practice: Practice) {
  const registry = createDefaultRegistry();
  const clock = createClock();
  let shell: ShellState = createShellState(shellOptions(practice.environment, practice.setup));
  let run: PracticeRun = startRun();
  return {
    type(line: string) {
      const out = execute(shell, line, registry, clock);
      shell = out.state;
      const stderr = out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join('');
      const r = afterCommand(practice, run, { line, stderr, shell }, ERROR_GUIDES);
      run = r.run;
      return r;
    },
    hint() {
      run = openHint(practice, run);
      return run;
    },
    get run() {
      return run;
    },
    get shell() {
      return shell;
    },
  };
}

async function lesson(id: string): Promise<Lesson> {
  const l = await loadLesson(id);
  if (!l) throw new Error(id);
  return l;
}

describe('実戦（docs/learning-design.md 6・7 章）', () => {
  it('found.b.04: 誤った住所でエラー → 内容と原因候補とヒント → 打ち直して成功（自力で回復）', async () => {
    const { practice } = await lesson('found.b.04');
    const p = player(practice);
    const wrong = p.type('cd /srv/ap');
    expect(wrong.error?.id).toBe('enoent');
    expect(wrong.error?.causes.length).toBeGreaterThanOrEqual(2);
    expect(wrong.done).toEqual([]);
    expect(p.run.stepIndex).toBe(0);
    const right = p.type('cd /srv/app');
    expect(right.error).toBeNull();
    expect(right.done.map((s) => s.id)).toEqual(['move']);
    expect(isFinished(practice, p.run)).toBe(true);
    const attempt = attemptOf(practice, p.run);
    expect(attempt).toMatchObject({ success: true, hintsUsed: 0, errors: ['enoent'], recoveredFromError: true, commands: ['cd /srv/ap', 'cd /srv/app'] });
    expect(resultKind(attempt)).toBe('success');
  });

  it('判定は出力ではなく状態で行う（pwd を打っても進まず、相対パスで着いても通る）', async () => {
    const { practice } = await lesson('found.b.04');
    const p = player(practice);
    expect(p.type('pwd').done).toEqual([]);
    expect(p.type('echo /srv/app').done).toEqual([]);
    p.type('cd ..');
    p.type('cd ..');
    expect(p.type('cd srv/app').done.map((s) => s.id)).toEqual(['move']);
  });

  it('linux.i.01: start だけでは通らず、enable を足すと通る。止まっている時の status（終了の値 3）はエラーにしない', async () => {
    const { practice } = await lesson('linux.i.01');
    const p = player(practice);
    expect(p.type('systemctl status web').error).toBeNull();
    expect(p.type('systemctl start web').done).toEqual([]);
    expect(p.type('systemctl enable web').done.map((s) => s.id)).toEqual(['run-and-enable']);
    expect(attemptOf(practice, p.run)).toMatchObject({ success: true, errors: [], recoveredFromError: false });
  });

  it('linux.i.01: 名前の誤りは「登録されていない」の解説、壊れたサービスは failed の解説（journalctl を勧める）', async () => {
    const { practice } = await lesson('linux.i.01');
    const p = player(practice);
    expect(p.type('systemctl start wbe').error?.id).toBe('unit-not-found');
    expect(p.type('systemctl status wbe').error?.id).toBe('unit-not-found');
    const broken: Practice = { ...practice, setup: { services: { web: { description: 'Web server', broken: 'bind() to 0.0.0.0:80 failed (98: Address already in use)' } } } };
    const q = player(broken);
    const r = q.type('systemctl enable --now web');
    expect(r.error?.id).toBe('service-failed');
    expect(r.error?.hint).toContain('journalctl');
  });

  it('ヒントは手順ごとに 3 段まで。使うと結果は partial、成功の記録はヒントの段を持つ', async () => {
    const { practice } = await lesson('linux.i.01');
    const p = player(practice);
    p.hint();
    p.hint();
    p.hint();
    expect(p.hint().hints).toEqual({ 'run-and-enable': 3 });
    const step = currentStep(practice, p.run);
    expect(step && answerOf(step)).toEqual(['systemctl enable --now web']);
    for (const line of step ? answerOf(step) : []) p.type(line);
    const attempt = attemptOf(practice, p.run);
    expect(attempt).toMatchObject({ success: true, hintsUsed: 3 });
    expect(resultKind(attempt)).toBe('partial');
    expect(hintsUsed(p.run)).toBe(3);
  });

  it('エラーの後でも、ヒントを開いてから通したら自力の回復にしない', async () => {
    const { practice } = await lesson('found.b.04');
    const p = player(practice);
    p.type('cd /srv/ap');
    p.hint();
    p.type('cd /srv/app');
    expect(attemptOf(practice, p.run)).toMatchObject({ success: true, recoveredFromError: false, hintsUsed: 1 });
  });

  it('未達のまま終えると retry（責めずに、どこで外れたか）', async () => {
    const { practice } = await lesson('found.b.04');
    const p = player(practice);
    p.type('cd /srv');
    const attempt = attemptOf(practice, p.run);
    expect(attempt.success).toBe(false);
    expect(resultKind(attempt)).toBe('retry');
  });

  it('危ない手は記録し、成功はさせる', async () => {
    const { practice } = await lesson('found.b.04');
    const risky: Practice = { ...practice, dangerous: [{ id: 'rm-rf', pattern: '\\brm\\s+-rf\\b', why: '消した物は戻らない' }] };
    const p = player(risky);
    expect(p.type('rm -rf /home/minato').danger?.id).toBe('rm-rf');
    p.type('cd /srv/app');
    const attempt = attemptOf(risky, p.run);
    expect(attempt).toMatchObject({ success: true, dangerousUsed: ['rm-rf'] });
    expect(resultKind(attempt)).toBe('partial');
  });

  it('1 つの操作で、続く手順をまとめて満たしてよい', async () => {
    const { practice } = await lesson('found.b.04');
    const two: Practice = {
      ...practice,
      steps: [
        { ...practice.steps[0] as Practice['steps'][number], id: 'a', check: { kind: 'fs', path: '/srv/app/notes.txt' } },
        { ...practice.steps[0] as Practice['steps'][number], id: 'b', check: { kind: 'fs', path: '/srv/app/notes.txt', contains: 'ok' } },
      ],
    };
    const p = player(two);
    expect(p.type('echo ok > /srv/app/notes.txt').done.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('解説の見つからないエラーにも、内容 → 原因候補 → ヒントの一般的な案内を出す', () => {
    expect(findGuide('frobnicate: the flux capacitor overheated', undefined, ERROR_GUIDES).id).toBe(GENERIC_GUIDE.id);
    expect(GENERIC_GUIDE.causes.length).toBeGreaterThanOrEqual(2);
  });

  it('今打てるコマンドの候補は、答え（最後のヒント）からは取らない', async () => {
    const { practice } = await lesson('linux.i.01');
    const step = practice.steps[0];
    expect(step && commandCandidates(step)).toEqual(['systemctl']);
  });
});

describe('状態による判定の形', () => {
  const shell = (setup: unknown, env = 'linux-basic'): ShellState => createShellState(shellOptions(env, setup));

  it('fs: 有る・無い・中身', () => {
    const s = shell({ files: { '/etc/app.conf': 'port=8080\n' } });
    expect(checkState({ kind: 'fs', path: '/etc/app.conf' }, { shell: s })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/etc/app.conf', contains: '8080' }, { shell: s })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/etc/app.conf', contains: '9090' }, { shell: s })).toBe(false);
    expect(checkState({ kind: 'fs', path: '/etc/nope', exists: false }, { shell: s })).toBe(true);
  });

  it('fs: /proc/<PID> は、そのプロセスが動いている間だけ有る（本物と同じ）', () => {
    const s = shell({ processes: [{ command: 'python3 loop.py', cpu: 99 }] });
    expect(checkState({ kind: 'fs', path: '/proc/100' }, { shell: s })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/proc/100', exists: false }, { shell: s })).toBe(false);
    const after = execute(s, 'kill 100', createDefaultRegistry(), createClock()).state;
    expect(checkState({ kind: 'fs', path: '/proc/100', exists: false }, { shell: after })).toBe(true);
  });

  it('fs: 権限（8 進数ならその値、u+x のような形なら、その権限が有る・無い）', () => {
    const s = shell({ files: { '/home/learner/run.sh': 'echo hi\n', '/home/learner/key': 'secret\n' } });
    expect(checkState({ kind: 'fs', path: '/home/learner/run.sh', mode: 'u+x' }, { shell: s })).toBe(false);
    expect(checkState({ kind: 'fs', path: '/home/learner/key', mode: '600' }, { shell: s })).toBe(false);
    const after = execute(execute(s, 'chmod +x run.sh', createDefaultRegistry(), createClock()).state, 'chmod 600 key', createDefaultRegistry(), createClock()).state;
    expect(checkState({ kind: 'fs', path: '/home/learner/run.sh', mode: 'u+x' }, { shell: after })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/home/learner/key', mode: '600' }, { shell: after })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/home/learner/key', mode: 'go-rwx' }, { shell: after })).toBe(true);
    expect(checkState({ kind: 'fs', path: '/home/learner/run.sh', mode: 'go-rwx' }, { shell: after })).toBe(false);
    expect(checkState({ kind: 'fs', path: '/home/learner/nope', mode: '600' }, { shell: after })).toBe(false);
  });

  it('http: 手元で動くサービスの答えの番号', () => {
    const s = shell({ services: { web: { description: 'Web', active: true, port: 80, body: 'hi' } } }, 'linux-server');
    expect(checkState({ kind: 'http', url: 'http://localhost/', status: 200 }, { shell: s })).toBe(true);
    expect(checkState({ kind: 'http', url: 'http://localhost:8080/', status: 200 }, { shell: s })).toBe(false);
  });

  it('tls: サイトの証明書の連鎖が信頼されるか', () => {
    const inter = { id: 'i', subject: 'Minato Issuing CA', issuer: 'Minato Root CA', sans: [], notBefore: '2024-01-01', notAfter: '2030-01-01', ca: true };
    const leaf = { id: 'l', subject: 'shop.example', issuer: 'Minato Issuing CA', sans: ['shop.example'], notBefore: '2026-01-01', notAfter: '2027-01-01', ca: false };
    const site = (chain: unknown[]) => ({ sites: [{ host: 'shop.example', port: 443, chain, routes: { '/': { status: 200, body: 'ok' } } }] });
    expect(checkState({ kind: 'tls', host: 'shop.example', trusted: true }, { shell: shell(site([leaf, inter]), 'web-client') })).toBe(true);
    expect(checkState({ kind: 'tls', host: 'shop.example', trusted: true }, { shell: shell(site([leaf]), 'web-client') })).toBe(false);
  });

  it('answer: 大文字と小文字・前後の空白を区別しない', () => {
    const s = shell({});
    expect(checkState({ kind: 'answer', equals: 'PID 42' }, { shell: s, answer: ' pid 42 ' })).toBe(true);
    expect(checkState({ kind: 'answer', equals: 'PID 42' }, { shell: s })).toBe(false);
  });

  it('見本の 2 本は、最後のヒントをそのまま打てば通る', async () => {
    for (const id of ['found.b.04', 'linux.i.01']) expect(replayAnswers((await lesson(id)).practice)).toEqual([]);
  });

  it('最後のヒントで通らない実戦は、問題として見つかる', async () => {
    const { practice } = await lesson('found.b.04');
    const step = practice.steps[0] as Practice['steps'][number];
    const bad: Practice = { ...practice, steps: [{ ...step, hints: [step.hints[0], step.hints[1], '`cd /srv`'] }] };
    expect(replayAnswers(bad)).toEqual(['実戦 move: 最後のヒントを打っても達成条件を満たさない']);
  });

  it('答える手順でも、答え（最後の物）の前の物は端末で打つコマンドとして確かめる。打てない物（出力の写しなど）はエラーとして見つかる', () => {
    const answerStep = (hint: string): Practice => ({
      mode: 'terminal', purpose: '目的', environment: 'linux-basic', setup: { files: { '/home/learner/a.txt': 'x\n' } },
      steps: [{ id: 'count', purpose: '行の数を答える', check: { kind: 'answer', equals: '1' }, afterward: '1 行', hints: ['方向', '具体', hint] }],
    });
    expect(replayAnswers(answerStep('`wc -l a.txt` と打つ。答えの欄に `1` と入れる。'))).toEqual([]);
    expect(replayAnswers(answerStep('`wc -l a.txt` と打つ。`1 a.txt` と出るので `1` と入れる。')).join()).toContain('答え「1 a.txt」でエラー');
  });
});

describe('模擬環境（模）の実戦（docs/content-spec.md 2.4.1、docs/decisions.md D-16）', () => {
  const practice: Practice = {
    mode: 'simulation',
    purpose: '部品をつなぐ',
    environment: 'sim-connect',
    setup: {
      nodes: [
        { id: '入力', label: 'キーボード', x: 10, y: 50 },
        { id: '処理', label: 'CPU', x: 50, y: 50 },
        { id: '出力', label: '画面', x: 90, y: 50 },
      ],
    },
    steps: [
      { id: 'in', purpose: '入力を処理へ', check: { kind: 'sim', expr: 'link 入力 処理' }, afterward: 'つながった', hints: ['向き', '入力から', '`connect 入力 処理` と入れる。'] },
      { id: 'out', purpose: '処理を出力へ', check: { kind: 'sim', expr: 'path 入力>処理>出力' }, afterward: '画面に出た', hints: ['向き', '処理から', '`connect 処理 出力` と入れる。'] },
    ],
  };

  it('操作の文を与えるたびに、模擬の状態で手順を判定する。誤った操作はエラーの解説を出し、ゲームオーバーにしない', () => {
    let sim = createSim(practice.environment, practice.setup);
    let run = startRun();
    const send = (line: string) => {
      const out = applyStatement(sim, line);
      sim = out.state;
      const r = afterCommand(practice, run, { line, stderr: out.error ?? '', sim }, ERROR_GUIDES);
      run = r.run;
      return r;
    };
    const wrong = send('connect 入力 マウス');
    expect(wrong.error).not.toBeNull();
    expect(wrong.done).toEqual([]);
    expect(send('connect 入力 処理').done.map((s) => s.id)).toEqual(['in']);
    expect(send('connect 処理 出力').done.map((s) => s.id)).toEqual(['out']);
    expect(isFinished(practice, run)).toBe(true);
    // エラーの後、ヒントを開かずに通した
    expect(attemptOf(practice, run).recoveredFromError).toBe(true);
  });

  it('最後のヒントの文で通るかを確かめ、通らない答えを見つける', () => {
    expect(replayAnswers(practice)).toEqual([]);
    const broken = structuredClone(practice);
    const step = broken.steps[1];
    if (step) step.hints = [step.hints[0], step.hints[1], '`connect 入力 出力` と入れる。'];
    expect(replayAnswers(broken).join()).toContain('最後のヒントを与えても達成条件を満たさない');
    const typo = structuredClone(practice);
    const first = typo.steps[0];
    if (first) first.hints = [first.hints[0], first.hints[1], '`connect 入力 処里` と入れる。'];
    expect(replayAnswers(typo).join()).toContain('「処里」という部品は無い');
  });

  it('模擬の状態が無ければ、模擬の判定は満たさない', () => {
    expect(checkState({ kind: 'sim', expr: 'link 入力 処理' }, {})).toBe(false);
  });
});

describe('答える形と、出来上がったのに満たさない時の知らせ', () => {
  const practice: Practice = {
    mode: 'terminal',
    purpose: '重いプロセスの番号を答える',
    environment: 'linux-basic',
    setup: { processes: [{ command: 'editor', cpu: 2 }, { command: 'video-encoder', cpu: 91 }] },
    steps: [{ id: 'pid', purpose: '答える', check: { kind: 'answer', equals: '101' }, afterward: '分かった', hints: ['a', 'b', '`101` と答える。'] }],
  };

  it('答えが違えば「合っていない」の解説を出し、正しい答えで手順を満たす', () => {
    const shell = createShellState(shellOptions(practice.environment, practice.setup));
    const wrong = afterCommand(practice, startRun(), { line: '（答え）100', stderr: '', shell, answer: '100' }, ERROR_GUIDES);
    expect(wrong.error?.match).toContain('答えが合っていない');
    expect(wrong.run.errorOpen).toBe(true);
    const right = afterCommand(practice, wrong.run, { line: '（答え）101', stderr: '', shell, answer: '101' }, ERROR_GUIDES);
    expect(right.done.map((s) => s.id)).toEqual(['pid']);
    expect(right.error).toBeNull();
    expect(replayAnswers(practice)).toEqual([]);
  });

  it('setup のプロセスは PID 100 から順に並び、ps で見える', () => {
    const p = player(practice);
    p.type('ps aux');
    expect([...p.shell.procs.processes.values()].find((x) => x.command === 'video-encoder')?.pid).toBe(101);
  });
});
