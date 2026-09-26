import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExperienceScene } from '@/engines/lesson/types';
import { HUD } from '@/features/park/hud/theme';
import { SCENARIOS } from './scenarios';
import { hintsOf, press, startPlay, summaryOf, tick, type PlaySummary, type PlayState } from './sim';
import { TownView, type ThingMark } from './TownView';

/** 時計の刻み（ミリ秒）。遊びの進みはこの間隔で進める */
const TICK_MS = 100;

/** 押した物を光らせておく秒数 */
const FLASH_SECONDS = 0.9;

interface Props {
  scene: ExperienceScene;
  /** 遊び終えた。結果を持って、次の段（登場）へ */
  onDone: (summary: PlaySummary) => void;
}

/**
 * 学びの流れの 1 段目「体験」。コマンドは使わない。町を押して遊ぶ。
 *
 * 頼みごとが次々に来て、だんだん手が追いつかなくなる。
 * 終わったら、何を何件こなし、何件こぼしたかを見せ、困りごとを言い当てる。
 */
export function ExperienceStage({ scene, onDone }: Props) {
  const scenario = SCENARIOS[scene.twist];
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<PlayState>(() => startPlay(scenario));
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!started || state.over !== null) return undefined;
    last.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - (last.current ?? now)) / 1000);
      last.current = now;
      setState((s) => tick(s, dt, scenario));
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [started, state.over, scenario]);

  const marks = useMemo(() => {
    const out: Record<string, ThingMark['tone']> = {};
    for (const id of hintsOf(state, scenario)) out[id] = 'hint';
    for (const id of state.dark) out[id] = 'dark';
    // 押した物を一瞬だけ緑（合っていた）か赤（外れ）で光らせる
    if (state.flash !== null && state.t - state.flash.at < FLASH_SECONDS) out[state.flash.id] = state.flash.tone === 'ok' ? 'ok' : 'miss';
    return out;
  }, [state, scenario]);

  const current = state.queue[0];
  const waiting = state.queue.slice(1);
  const progress = Math.min(1, state.t / scenario.seconds);
  const canLeave = state.t >= scenario.minSeconds;

  return (
    <div data-testid="experience" data-over={state.over ?? undefined} className="flex h-full min-h-0 gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md" style={{ background: 'rgba(8,11,15,0.55)' }}>
        <TownView
          kind={scene.kind}
          fill={state.fill}
          marks={marks}
          onPress={
            started && state.over === null
              ? (id) => {
                  setState((s) => press(s, id, scenario));
                }
              : undefined
          }
        />
        {started ? null : (
          <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(8,11,15,0.55)' }}>
            <div className="max-w-md rounded-lg p-5 text-center" style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, boxShadow: HUD.shadow }}>
              <p className="text-[12px]" style={{ color: HUD.accentText }}>
                1. 体験 ・ コマンドは使わない
              </p>
              <p className="mt-1 text-[18px] font-bold">{scene.title}</p>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: HUD.soft }}>
                {scene.goal}
              </p>
              <button
                type="button"
                data-testid="experience-start"
                onClick={() => {
                  setStarted(true);
                }}
                className="mt-4 h-9 rounded px-5 text-[14px] font-bold"
                style={{ background: HUD.accentDeep, color: '#fff' }}
              >
                町を回してみる
              </button>
            </div>
          </div>
        )}
        {state.over === null ? null : (
          <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(8,11,15,0.6)' }}>
            <div
              data-testid="experience-result"
              className="max-w-lg rounded-lg p-5"
              style={{ background: HUD.panel, border: `1px solid ${HUD.lineStrong}`, boxShadow: HUD.shadow }}
            >
              <p className="text-[12px]" style={{ color: HUD.warn }}>
                {state.over === 'swamped' ? '手が追いつかなくなった' : '時間切れ'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="手で片付けた" value={state.done} tone={HUD.okText} />
                <Stat label="取りこぼした" value={state.missed + state.queue.length} tone={HUD.bad} />
                <Stat label="無駄足" value={state.wasted} tone={HUD.warn} />
              </div>
              <p className="mt-3 text-[14px] leading-relaxed">{scene.trouble}</p>
              <button
                type="button"
                data-testid="experience-next"
                onClick={() => {
                  onDone(summaryOf(state));
                }}
                className="mt-4 h-9 w-full rounded text-[14px] font-bold"
                style={{ background: HUD.accentDeep, color: '#fff' }}
              >
                これを代わりにやる仕組みを見る
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="flex w-[260px] shrink-0 flex-col gap-2.5">
        <div>
          <p className="text-[12px]" style={{ color: HUD.accentText }}>
            1. 体験
          </p>
          <p className="text-[15px] font-bold leading-snug">{scene.title}</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded" style={{ background: HUD.fill }} aria-label="残り時間">
          <div className="h-full" style={{ width: `${String(progress * 100)}%`, background: `linear-gradient(90deg, ${HUD.accentDeep}, ${HUD.accent})` }} />
        </div>
        <div
          data-testid="experience-chore"
          className="rounded-md p-3"
          style={{ background: current === undefined ? HUD.fill : HUD.accentFill, border: `1px solid ${current === undefined ? HUD.line : HUD.accentEdge}` }}
        >
          <p className="text-[11px]" style={{ color: HUD.muted }}>
            いまの頼みごと
          </p>
          <p className="mt-0.5 text-[14px] font-semibold leading-snug">
            {current === undefined ? (started ? '次の頼みごとを待っている' : '始めると頼みごとが来る') : current.text}
          </p>
          {current?.mode === 'carry' && current.targets.length > 1 ? (
            <p className="mt-1 text-[11.5px]" style={{ color: HUD.accentText }}>
              {`${String(current.at)} / ${String(current.targets.length)} か所`}
            </p>
          ) : null}
        </div>
        {state.note === null ? null : (
          <p
            data-testid="experience-note"
            className="text-[12.5px] leading-snug"
            style={{ color: state.note.tone === 'ok' ? HUD.okText : state.note.tone === 'miss' ? HUD.bad : HUD.warn }}
          >
            {state.note.text}
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Stat label="片付けた" value={state.done} tone={HUD.okText} small />
          <Stat label="待っている" value={state.queue.length} tone={state.queue.length >= scenario.backlog - 1 ? HUD.bad : HUD.text} small />
          <Stat label="こぼした" value={state.missed} tone={HUD.bad} small />
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="待っている頼みごと">
          {waiting.map((chore) => (
            <li key={chore.id} className="rounded px-2 py-1 text-[12px] leading-snug" style={{ background: HUD.fillSoft, color: HUD.soft }}>
              {chore.text}
            </li>
          ))}
        </ul>
        {canLeave && state.over === null ? (
          <button
            type="button"
            data-testid="experience-enough"
            onClick={() => {
              setState((s) => ({ ...s, over: 'swamped' }));
            }}
            className="h-8 rounded text-[13px]"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            もう手が回らない
          </button>
        ) : null}
      </aside>
    </div>
  );
}

function Stat({ label, value, tone, small = false }: { label: string; value: number; tone: string; small?: boolean }) {
  return (
    <div className="rounded px-1.5 py-1" style={{ background: HUD.fill }}>
      <div className={small ? 'text-[10.5px]' : 'text-[11.5px]'} style={{ color: HUD.muted }}>
        {label}
      </div>
      <div className={small ? 'text-[16px] font-bold' : 'text-[22px] font-bold'} style={{ color: tone, fontFamily: 'Overpass, sans-serif' }}>
        {value}
      </div>
    </div>
  );
}
