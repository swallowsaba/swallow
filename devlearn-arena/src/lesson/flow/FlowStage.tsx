import { useState } from 'react';
import type { LessonDefinition } from '@/engines/lesson/types';
import { HUD, SIZE, besideDock } from '@/features/park/hud/theme';
import { ExperienceStage } from '../experience/ExperienceStage';
import type { PlaySummary } from '../experience/sim';
import { QuizStage } from './QuizStage';
import { RevealStage } from './RevealStage';
import { FLOW_STEPS, STEP_LABEL, type FlowStep } from './steps';


/** いまどの段にいるかの帯。5 段を並べ、済んだ段・いまの段・先の段を色で分ける */
export function FlowSteps({ at, compact = false }: { at: FlowStep; compact?: boolean }) {
  const now = FLOW_STEPS.indexOf(at);
  return (
    <ol data-testid="flow-steps" data-at={at} className="flex items-center gap-1" aria-label="学びの流れ">
      {FLOW_STEPS.map((step, i) => {
        const done = i < now;
        const here = i === now;
        return (
          <li key={step} className="flex items-center gap-1" aria-current={here ? 'step' : undefined}>
            <span
              title={STEP_LABEL[step]}
              className={`whitespace-nowrap rounded px-1.5 ${compact ? 'py-0 text-[10.5px]' : 'py-0.5 text-[11.5px]'}`}
              style={{
                background: here ? HUD.accentDeep : done ? 'rgba(55,179,122,0.16)' : HUD.fill,
                color: here ? '#fff' : done ? HUD.okText : HUD.dim,
                fontWeight: here ? 700 : 500,
              }}
            >
              {/* 札の中など狭い所では、いまの段だけ名前を出し、ほかは番号だけにする */}
              {compact && !here ? String(i + 1) : `${String(i + 1)} ${STEP_LABEL[step]}`}
            </span>
            {i < FLOW_STEPS.length - 1 ? (
              <span aria-hidden="true" style={{ color: HUD.dim, fontSize: 10 }}>
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  lesson: LessonDefinition;
  stage: 'experience' | 'reveal' | 'quiz';
  onStage: (stage: FlowStep) => void;
  /** 確かめの問いに 1 問正解した */
  onQuizCorrect: () => void;
}

/**
 * 学びの流れの 1〜3 段（体験・登場・確かめ）を出す板。街の上に重ねる。
 * 端末はこの間も左に見えているが、使わない（体験はマウスだけで遊ぶ）。
 */
export function FlowStage({ lesson, stage, onStage, onQuizCorrect }: Props) {
  const [summary, setSummary] = useState<PlaySummary | null>(null);
  return (
    <section
      data-testid="flow-stage"
      data-stage={stage}
      className="absolute z-30 flex flex-col rounded-lg"
      style={{
        left: besideDock(16),
        top: SIZE.panelTop,
        // 登場の段だけは右に本物の街を残し、カメラが施設へ寄るところを見せる
        right: stage === 'reveal' ? 380 : 16,
        bottom: 16,
        transition: 'right 0.6s ease',
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadowStrong,
        backdropFilter: 'blur(8px)',
      }}
    >
      <header
        className="flex items-center gap-3 rounded-t-lg px-4 py-2.5"
        style={{ background: 'linear-gradient(90deg, rgba(47,143,216,.22), rgba(47,143,216,0))', borderBottom: `1px solid ${HUD.line}` }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: HUD.soft }}>
          {lesson.experience.title}
        </span>
        <FlowSteps at={stage} />
      </header>
      <div className="min-h-0 flex-1 p-3">
        {stage === 'experience' ? (
          <ExperienceStage
            scene={lesson.experience}
            onDone={(result) => {
              setSummary(result);
              onStage('reveal');
            }}
          />
        ) : stage === 'reveal' ? (
          <RevealStage
            kind={lesson.experience.kind}
            reveal={lesson.reveal}
            summary={summary}
            onNext={() => {
              onStage('quiz');
            }}
          />
        ) : (
          <QuizStage
            kind={lesson.experience.kind}
            quiz={lesson.quiz}
            onCorrect={onQuizCorrect}
            onFinish={() => {
              onStage('operate');
            }}
          />
        )}
      </div>
    </section>
  );
}
