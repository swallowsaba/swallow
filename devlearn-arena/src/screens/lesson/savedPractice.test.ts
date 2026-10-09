import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { loadAllLessons } from '@/content/lessons';
import type { Practice } from '@/content/schema';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { snapshotShell } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { applyAction, createSim } from '@/engines/sim/sim';
import { answerOf, editOf, saveEdit, startRun } from '@/learning/practice';
import { editorSaved, simSaved, sqlSaved, terminalSaved } from './savedPractice';

/**
 * 途中の実戦の記録を開く時の確かめ（src/screens/lesson/savedPractice.ts）。
 * 正しく保存した物は必ず読め（初めの状態と、最後のヒントを各手順で打った後の状態）、壊れた物は読まない。
 */

const json = <T>(v: T): unknown => JSON.parse(JSON.stringify(v)) as unknown;
const registry = createDefaultRegistry();

/** 全てのレッスンとミッションの実戦 */
async function practices(): Promise<[string, Practice][]> {
  const lessons = await loadAllLessons();
  return [...lessons.map((l) => [l.id, l.practice] as [string, Practice]), ...MISSIONS.map((m) => [m.id, m.practice] as [string, Practice])];
}

describe('途中の実戦の記録', () => {
  it('どの実戦でも、保存した途中の状態（初め・各手順の最後のヒントの後）は読める', async () => {
    const all = await practices();
    expect(all.length).toBeGreaterThan(100);
    for (const [id, p] of all) {
      const run = startRun();
      if (p.mode === 'simulation') {
        let sim = createSim(p.environment, p.setup);
        const fresh = sim;
        for (const step of [null, ...p.steps]) {
          for (const a of step?.actions ?? []) sim = applyAction(sim, a).state;
          expect(simSaved(p, fresh, json({ sim, run })).kind, id).toBe('ok');
        }
      } else if (p.mode === 'sql') {
        expect(sqlSaved(p, json({ statements: ['SELECT 1'], log: [{ statement: 'SELECT 1', results: [{ columns: ['1'], rows: [[1]] }], changes: 0, error: null }], run })).kind, id).toBe('ok');
      } else {
        const edit = editOf(p);
        const clock = createClock();
        let shell = initialShell(p.environment, p.setup);
        for (const step of [null, ...p.steps]) {
          for (const line of step ? answerOf(step) : []) {
            shell = edit ? saveEdit(shell, edit, line, registry, clock).state : execute(shell, line, registry, clock).state;
          }
          const saved = json({ shell: snapshotShell(shell), run });
          if (edit) expect(editorSaved(p, { ...(saved as object), draft: 'x', results: [{ line: 'a', stdout: '', stderr: '' }] }).kind, id).toBe('ok');
          else expect(terminalSaved(p, saved).kind, id).toBe('ok');
        }
      }
    }
  });

  it('記録が無ければ none、壊れていれば broken', async () => {
    const all = await practices();
    const terminal = all.find(([, p]) => p.mode === 'terminal')?.[1];
    const connect = all.find(([, p]) => p.mode === 'simulation' && createSim(p.environment, p.setup).type === 'connect')?.[1];
    if (!terminal || !connect) throw new Error('見本の実戦が無い');
    const shell = snapshotShell(initialShell(terminal.environment, terminal.setup));
    expect(terminalSaved(terminal, undefined).kind).toBe('none');
    expect(terminalSaved(terminal, { shell, run: startRun() }).kind).toBe('ok');
    // 手順の数を超える・ヒントの段が 3 を超える・シェルの写しが違う形
    expect(terminalSaved(terminal, { shell, run: { ...startRun(), stepIndex: terminal.steps.length + 1 } }).kind).toBe('broken');
    expect(terminalSaved(terminal, { shell, run: { ...startRun(), hints: { s1: 4 } } }).kind).toBe('broken');
    expect(terminalSaved(terminal, { shell: { ...shell, cwd: 3 }, run: startRun() }).kind).toBe('broken');

    const fresh = createSim(connect.environment, connect.setup);
    expect(simSaved(connect, fresh, { sim: fresh, run: startRun() }).kind).toBe('ok');
    // 前の版の記録（操作の文の記録 log がある）も読める
    expect(simSaved(connect, fresh, { sim: fresh, log: [{ line: 'connect a b', error: null }], run: startRun() }).kind).toBe('ok');
    // 設定に無い点をつなぐ・違う型の状態
    expect(simSaved(connect, fresh, { sim: { ...fresh, links: [['nowhere', 'x']] }, run: startRun() }).kind).toBe('broken');
    expect(simSaved(connect, fresh, { sim: { type: 'order', stages: [] }, run: startRun() }).kind).toBe('broken');
  });

  it('模擬環境の設定は、保存した物でなく中身のデータから作った物を使う', async () => {
    const all = await practices();
    const connect = all.find(([, p]) => p.mode === 'simulation' && createSim(p.environment, p.setup).type === 'connect')?.[1];
    if (!connect) throw new Error('見本の実戦が無い');
    const fresh = createSim(connect.environment, connect.setup);
    const restored = simSaved(connect, fresh, { sim: { ...fresh, setup: { nodes: [] } }, run: startRun() });
    expect(restored.kind === 'ok' && restored.value.sim.setup).toEqual(fresh.setup);
  });
});
