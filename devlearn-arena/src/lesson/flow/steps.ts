/** 学びの流れの 5 段（CLAUDE.md）。この順にしか進まない */
export const FLOW_STEPS = ['experience', 'reveal', 'quiz', 'operate', 'recap'] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const STEP_LABEL: Readonly<Record<FlowStep, string>> = {
  experience: '体験',
  reveal: '登場',
  quiz: '確かめ',
  operate: '操作',
  recap: '振り返り',
};

export function isFlowStep(value: string | null): value is FlowStep {
  return value !== null && (FLOW_STEPS as readonly string[]).includes(value);
}
