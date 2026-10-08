import { describe, expect, it, vi } from 'vitest';
import { createSession } from './session';
import { emptyProgress } from '@/game/progress';
import type { XpEvent } from '@/game/types';
import { attachSounds, soundFor } from './sound';

const AT = '2026-10-09T10:00:00+09:00';

describe('効果音', () => {
  it('既定は鳴らさない。音を入れると、正解で短い音、修了で上がる音、ミッションの達成で達成の音', () => {
    const session = createSession();
    const play = vi.fn();
    const off = attachSounds(session, play);
    const p = session.progress.getState();
    p.answer({ lessonId: 'linux.b.01', quizId: 'q1', choiceIds: ['a'], correct: true }, AT);
    expect(play).not.toHaveBeenCalled();

    session.settings.getState().set({ sound: true });
    p.answer({ lessonId: 'linux.b.01', quizId: 'q2', choiceIds: ['a'], correct: true }, AT);
    expect(play).toHaveBeenLastCalledWith('step');
    p.complete('linux.b.01', AT);
    expect(play).toHaveBeenLastCalledWith('levelUp');
    session.progress.getState().finishMission('web-server', { stepsDone: [], hintsUsed: 0, errors: [], recoveredFromError: false, dangerousUsed: [], success: true, commands: [] }, AT);
    expect(play).toHaveBeenLastCalledWith('clear');
    // XP の増えない変化（段を進めただけ）では鳴らさない
    const calls = play.mock.calls.length;
    session.progress.getState().reach('net.b.01', 'understand');
    expect(play).toHaveBeenCalledTimes(calls);
    off();
  });

  it('記録が 1,000 件で切れていても、新しく増えた物で音を決める', () => {
    const event = (source: XpEvent['source'], i: number): XpEvent => ({ at: AT, source, ref: `r${String(i)}`, amount: 1 });
    const full = Array.from({ length: 1000 }, (_, i) => event('quiz', i));
    const prev = { ...emptyProgress(), xpLog: full };
    const next = { ...emptyProgress(), xpLog: [...full.slice(1), event('lesson-complete', 1000)] };
    expect(soundFor(prev, next)).toBe('levelUp');
  });
});
