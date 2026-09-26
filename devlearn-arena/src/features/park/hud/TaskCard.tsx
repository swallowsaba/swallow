import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { missionTerms } from '@/content/glossary';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { commandLabel } from './stepLabel';
import { TermText } from './TermText';
import { clampCard, loadLayout, saveLayout, type CardBox } from './layoutPrefs';
import { HUD, SIZE, besideDock } from './theme';
import { FlowSteps } from '@/lesson/flow/FlowStage';

/** 札の中に一度に並べる語の数。これを超えたぶんは折り畳む */
const SHOWN_TERMS = 3;

/** 動かしていない札の高さの上限。下の建設メニューと旅の帯に掛からないように */
const DEFAULT_MAX_HEIGHT = `calc(100% - ${String(SIZE.panelTop + 200)}px)`;

/** いまの画面の大きさ。札を画面の中に収めるのに使う */
function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** 札をつかんで動かしている間の、つかみ始めの位置と札の箱 */
interface Gesture {
  kind: 'move' | 'size';
  x: number;
  y: number;
  start: CardBox;
}

interface Props {
  mission: LessonDefinition;
  progress: LessonProgressState;
  /** いま条件を満たしているか。満たした瞬間に印が変わる */
  passingNow: boolean;
  /** 通らなかったときの助言。1 行だけ出す */
  diagnosis: string | null;
  /** 端末で hint と打つか、この札のヒントを押して開いた数 */
  revealedHints: number;
  reward: { xp: number; rights: number };
  onHint: () => void;
  onWhy: () => void;
  /** 体験の段からやり直す */
  onReplay?: () => void;
}

/**
 * 課題の札。端末の右、上の帯の下に重なる。
 *
 * 見出し・2 行以内の説明・チェック項目・報酬・ヒント、それだけ。
 * 長い解説はここに書かず、「なぜ」から開く引き出しへ回す。
 */
export function TaskCard({ mission, progress, passingNow, diagnosis, revealedHints, reward, onHint, onWhy, onReplay }: Props) {
  const t = useT();
  const total = mission.steps.length;
  const at = Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), total);
  const step = progress.cleared ? undefined : mission.steps[progress.stepIndex];
  const hints = (step?.hints ?? []).slice(0, revealedHints);
  // この任務で出てくる言葉。題・説明と、いまの手順までに出てきた語だけを拾う。
  // 先の手順の語を先回りして並べると、まだ触っていない物の名前を覚えさせることになる
  const reached = progress.cleared ? total - 1 : progress.stepIndex;
  const words = useMemo(() => missionTerms(mission, reached), [mission, reached]);
  const [allWords, setAllWords] = useState(false);
  const shown = allWords ? words : words.slice(0, SHOWN_TERMS);

  /*
    札の置き場所と大きさ（REWORK 4-1・4-2）。見出しをつかんで動かし、右下の角をつまんで大きさを変える。
    動かしたことが無ければ端末の右の決まった所に出る。放したら保存し、次に開いても同じ所に出す
  */
  const [box, setBox] = useState<CardBox | null>(() => {
    const saved = loadLayout().card;
    return saved === null ? null : clampCard(saved, viewport());
  });
  const [folded, setFolded] = useState(() => loadLayout().cardFolded);
  const card = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);

  /** いまの箱。動かしたことが無ければ、画面に出ている所を測る */
  const measure = (): CardBox => {
    if (box !== null) return box;
    const el = card.current;
    return {
      left: el?.offsetLeft ?? 0,
      top: el?.offsetTop ?? SIZE.panelTop,
      width: el?.offsetWidth ?? SIZE.task,
      height: el?.offsetHeight ?? 0,
    };
  };

  const grab = (kind: Gesture['kind']) => (event: ReactPointerEvent<HTMLElement>) => {
    // 見出しの中のボタン（畳む）は押せるままにする
    if (kind === 'move' && (event.target as Element).closest('button') !== null) return;
    gesture.current = { kind, x: event.clientX, y: event.clientY, start: measure() };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const drag = (event: ReactPointerEvent<HTMLElement>): void => {
    const g = gesture.current;
    if (g === null) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    const next =
      g.kind === 'move'
        ? { ...g.start, left: g.start.left + dx, top: g.start.top + dy }
        : { ...g.start, width: g.start.width + dx, height: g.start.height + dy };
    setBox(clampCard(next, viewport()));
  };
  const drop = (event: ReactPointerEvent<HTMLElement>): void => {
    if (gesture.current === null) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setBox((now) => {
      if (now !== null) saveLayout({ card: now });
      return now;
    });
  };

  return (
    <section
      ref={card}
      data-testid="task-card"
      data-folded={folded ? 'true' : undefined}
      className="absolute z-20 flex flex-col rounded-lg"
      style={{
        left: box === null ? besideDock(16) : box.left,
        top: box === null ? SIZE.panelTop : box.top,
        width: box === null ? SIZE.task : box.width,
        ...(folded ? {} : box === null ? { maxHeight: DEFAULT_MAX_HEIGHT } : { height: box.height }),
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        data-testid="task-handle"
        title="つかんで動かす"
        onPointerDown={grab('move')}
        onPointerMove={drag}
        onPointerUp={drop}
        className={`flex shrink-0 cursor-move touch-none select-none items-start gap-2 px-3 py-2.5 ${folded ? 'rounded-lg' : 'rounded-t-lg'}`}
        style={{
          background: 'linear-gradient(90deg, rgba(47,143,216,.25), rgba(47,143,216,0))',
          ...(folded ? {} : { borderBottom: `1px solid ${HUD.line}` }),
        }}
      >
        <span className="mt-0.5 shrink-0">
          <Icon name="flag" size={16} />
        </span>
        <span className="mt-0.5 shrink-0 text-[12px]" style={{ color: HUD.accentText }}>
          {t('hud.task')}
        </span>
        {/* 題は切らずに折り返す（REWORK 4-3） */}
        <span data-testid="task-title" className="min-w-0 flex-1 break-words text-[14px] font-bold leading-snug">
          {mission.title}
        </span>
        <span className="mt-0.5 shrink-0 text-[12px]" style={{ color: HUD.muted }} data-testid="task-progress">
          {t('hud.stepCount', { a: at, b: total })}
        </span>
        <button
          type="button"
          data-testid="task-fold"
          aria-expanded={!folded}
          aria-label={folded ? '札を開く' : '札を畳む（見出しだけにする）'}
          title={folded ? '札を開く' : '見出しだけにする'}
          onClick={() => {
            saveLayout({ cardFolded: !folded });
            setFolded(!folded);
          }}
          className="-my-0.5 grid h-6 w-6 shrink-0 place-items-center rounded"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          <span style={{ display: 'inline-flex', transform: folded ? 'rotate(90deg)' : 'rotate(-90deg)' }}>
            <Icon name="next" size={13} />
          </span>
        </button>
      </div>

      {folded ? null : (
      <>
      {/* 中身がはみ出したら、札の中で縦に送る。切って「…」にはしない（REWORK 4-3） */}
      <div data-testid="task-body" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {/*
          操作の段（学びの流れ 4）。説明の文章は置かない。体験と登場で見たことを、コマンドで確かめる段。
          いまの手順には「この操作で何を確かめるのか」を先に 1 行で出す
        */}
        <div className="flex items-center gap-2">
          <FlowSteps at={progress.cleared ? 'recap' : 'operate'} compact />
          {onReplay === undefined ? null : (
            <button
              type="button"
              data-testid="task-replay"
              onClick={onReplay}
              className="ml-auto text-[11px]"
              style={{ color: HUD.accentText }}
            >
              体験からやり直す
            </button>
          )}
        </div>
        {step === undefined ? null : (
          <p data-testid="task-purpose" className="rounded px-2 py-1.5 text-[13px] leading-snug" style={{ background: HUD.accentFill, color: HUD.text }}>
            <span className="mr-1 text-[11.5px]" style={{ color: HUD.accentText }}>
              確かめること
            </span>
            {step.purpose}
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {mission.steps.map((s, i) => {
            const done = progress.cleared || i < progress.stepIndex;
            const here = !progress.cleared && i === progress.stepIndex;
            const command = commandLabel(s.solution);
            return (
              <li key={`${String(i)}-${s.prompt}`} data-step={i} data-done={done ? 'true' : undefined} className={`flex gap-2 text-[13px] ${here ? 'items-start' : 'items-center'}`}>
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded"
                  style={
                    done
                      ? { background: HUD.ok }
                      : { border: `1.5px solid ${here ? (passingNow ? HUD.ok : HUD.accent) : HUD.locked}` }
                  }
                >
                  {done ? <Icon name="check" size={11} strokeWidth={3} /> : null}
                </span>
                {/*
                  先の手順は中身を伏せる。まだ出てきていない言葉を先に見せないため。
                  いまの手順は折り返して全部見せ、用語にはその場で説明が浮かぶ
                */}
                <span
                  className="min-w-0 flex-1 break-words"
                  style={done ? { color: HUD.okDone } : here ? undefined : { color: HUD.muted }}
                >
                  {done ? (
                    <span style={{ textDecoration: 'line-through' }}>
                      <TermText text={s.prompt} />
                    </span>
                  ) : here ? (
                    <TermText text={s.prompt} tip />
                  ) : (
                    t('task.later')
                  )}
                  {done ? (
                    <span data-testid="task-afterward" className="block text-[11.5px] leading-snug" style={{ color: HUD.muted }}>
                      {`街で: ${s.afterward}`}
                    </span>
                  ) : null}
                </span>
                {command === '' ? null : (
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: HUD.dim }}>
                    {command}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {shown.length === 0 ? null : (
          <div data-testid="task-terms" className="rounded-md p-2" style={{ background: HUD.fillSoft, border: `1px solid ${HUD.line}` }}>
            <p className="text-[11px]" style={{ color: HUD.muted }}>
              {t('task.terms')}
            </p>
            <dl className="mt-1 flex flex-col gap-1">
              {shown.map((word) => (
                <div key={word.term} data-word={word.term} className="text-[12px] leading-snug">
                  <dt className="inline font-bold" style={{ color: HUD.text }}>
                    <TermText text={word.term} />
                  </dt>
                  <dd className="inline" style={{ color: HUD.soft }}>
                    {`：${word.plain}`}
                  </dd>
                </div>
              ))}
            </dl>
            {words.length <= SHOWN_TERMS ? null : (
              <button
                type="button"
                data-testid="task-terms-more"
                onClick={() => {
                  setAllWords((was) => !was);
                }}
                className="mt-1 text-[11px]"
                style={{ color: HUD.accentText }}
              >
                {allWords ? t('task.termsLess') : t('task.termsMore', { n: words.length - SHOWN_TERMS })}
              </button>
            )}
          </div>
        )}

        {diagnosis === null ? null : (
          <p data-testid="task-diagnosis" className="text-[12px] leading-relaxed" style={{ color: HUD.warn }}>
            {diagnosis}
          </p>
        )}

        {hints.length === 0 ? null : (
          <ul data-testid="task-hints" className="flex flex-col gap-1">
            {hints.map((hint, i) => (
              <li key={`${String(i)}-${hint}`} className="font-mono text-[12px] leading-relaxed" style={{ color: HUD.accentText }}>
                {hint}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="flex shrink-0 items-center gap-2 rounded-b-lg px-3 py-2"
        style={{ borderTop: `1px solid ${HUD.line}`, background: HUD.fillSoft }}
      >
        <span className="text-[12px]" style={{ color: HUD.muted }}>
          {t('hud.reward')}
        </span>
        <span className="text-[12px]" style={{ color: HUD.warn }}>
          {t('hud.rewardXp', { n: reward.xp })}
        </span>
        <span className="text-[12px]" style={{ color: HUD.accent }}>
          {t('hud.rewardRights', { n: reward.rights })}
        </span>
        <button
          type="button"
          data-testid="task-why"
          onClick={onWhy}
          className="ml-auto h-7 rounded px-2 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          {t('hud.why')}
        </button>
        <button
          type="button"
          data-testid="task-hint"
          onClick={onHint}
          className="h-7 rounded px-2.5 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.text }}
        >
          {t('hud.hint')}
        </button>
      </div>
      {/* 右下の角。つまんで札の大きさを変える */}
      <div
        data-testid="task-resize"
        title="つまんで大きさを変える"
        onPointerDown={grab('size')}
        onPointerMove={drag}
        onPointerUp={drop}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
      >
        <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
          <path d="M14 6v8H6M14 10v4h-4" fill="none" stroke={HUD.muted} strokeWidth={1.4} />
        </svg>
      </div>
      </>
      )}
    </section>
  );
}
