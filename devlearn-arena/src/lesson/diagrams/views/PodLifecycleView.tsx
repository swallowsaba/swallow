import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { HUD } from '@/features/park/hud/theme';
import { STAGES, type PodLifecycleView as View } from '../podLifecycle';
import { MiniButton } from './parts';
import { type ViewProps } from './helpers';

/** 段の呼び名。英語の状態名の下に、平易な言い換えを添える */
const PLAIN: Readonly<Record<string, string>> = {
  Pending: '部屋待ち',
  ContainerCreating: '荷ほどき',
  Running: '暮らし始めた',
};

/** 止まっている理由の言い換え */
const WAITING: Readonly<Record<string, string>> = {
  ErrImagePull: '取り寄せに失敗した',
  ImagePullBackOff: '間を空けてから取り寄せ直す',
};

/**
 * 住人が暮らし始めるまでの 3 段。「時間を進める」を押すたびに 1 段ずつ点灯する。
 * 壊れた荷物のときは、取り寄せを試した間隔を棒で並べる。棒がだんだん長くなる。
 */
export function PodLifecycleView({ view, act, moves }: ViewProps<View>) {
  const pod = view.pod;
  const reached = pod === null ? -1 : STAGES.indexOf(pod.phase);
  const failing = pod?.waiting === 'ErrImagePull' || pod?.waiting === 'ImagePullBackOff';

  // 取り寄せを試すたびに、次までの待ち時間を覚えておく。間隔が伸びていくのを並べて見せる
  const [waits, setWaits] = useState<number[]>([]);
  const seen = useRef(0);
  useEffect(() => {
    if (pod === null) {
      seen.current = 0;
      setWaits([]);
      return;
    }
    if (pod.attempts > seen.current && pod.retryIn !== null) {
      seen.current = pod.attempts;
      const wait = pod.retryIn;
      setWaits((was) => [...was, wait]);
    }
  }, [pod]);

  const has = (id: string) => moves.some((m) => m.id === id);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const lit = i <= reached && !(failing && i > 0);
          const color = stage === 'Running' ? HUD.ok : HUD.warn;
          return (
            <div key={stage} className="flex flex-1 items-center gap-1">
              <motion.div
                data-stage={stage}
                data-lit={lit ? 'true' : undefined}
                className="flex flex-1 flex-col items-center rounded-md px-1 py-2"
                animate={{
                  background: lit ? `${color}2a` : 'rgba(255,255,255,0.03)',
                  borderColor: lit ? color : 'rgba(255,255,255,0.1)',
                  boxShadow: lit ? `0 0 14px ${color}66` : '0 0 0 transparent',
                }}
                transition={{ duration: 0.45 }}
                style={{ border: '1px solid' }}
              >
                <span className="text-[11px] font-bold" style={{ color: lit ? HUD.text : HUD.dim }}>{stage}</span>
                <span className="text-[10px]" style={{ color: lit ? HUD.soft : HUD.dim }}>{PLAIN[stage]}</span>
              </motion.div>
              {i < STAGES.length - 1 ? (
                <span className="text-[12px]" style={{ color: i < reached ? HUD.accent : HUD.dim }}>→</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex min-h-[46px] flex-col justify-center gap-1 rounded-md px-2.5 py-1.5" style={{ background: HUD.fill }}>
        {pod === null ? (
          <span className="text-[12px]" style={{ color: HUD.muted }}>まだ住人はいない。荷物を選んで入居させる</span>
        ) : failing ? (
          <>
            <span className="text-[12px]" style={{ color: HUD.bad }}>
              荷物（{pod.image}）が取り寄せられない: {pod.waiting}（{WAITING[pod.waiting ?? ''] ?? ''}）· 試した回数 {pod.attempts} · 次まで {pod.retryIn ?? 0}
            </span>
            <div className="flex items-end gap-1" data-testid="retry-bars">
              {waits.map((wait, i) => (
                <motion.span
                  key={`${String(i)}-${String(wait)}`}
                  className="block w-4 rounded-sm"
                  style={{ background: HUD.bad }}
                  initial={{ height: 0 }}
                  animate={{ height: Math.min(28, wait * 2) }}
                  title={`${String(i + 1)} 回目の後の待ち: ${String(wait)}`}
                />
              ))}
              <span className="text-[10px]" style={{ color: HUD.dim }}>待ち時間が伸びていく</span>
            </div>
          </>
        ) : (
          <span className="text-[12px]" style={{ color: HUD.soft }}>
            荷物: {pod.image} · 時刻 {view.tick}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {has('run:good') ? <MiniButton testId="run-good" onClick={() => { act('run:good'); }}>nginx の荷物で入居</MiniButton> : null}
        {has('run:broken') ? <MiniButton testId="run-broken" tone="plain" onClick={() => { act('run:broken'); }}>壊れた荷物で入居</MiniButton> : null}
        {has('tick') ? <MiniButton testId="tick" onClick={() => { act('tick'); }}>時間を進める</MiniButton> : null}
        {has('reset') ? <MiniButton testId="reset-pod" tone="plain" onClick={() => { act('reset'); }}>住人を帰す</MiniButton> : null}
      </div>
    </div>
  );
}
