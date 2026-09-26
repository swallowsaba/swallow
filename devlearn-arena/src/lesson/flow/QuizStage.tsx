import { useMemo, useState } from 'react';
import type { CityQuiz, ExperienceKind } from '@/engines/lesson/types';
import { HUD } from '@/features/park/hud/theme';
import { TownView, type ThingMark } from '../experience/TownView';
import { thingOf } from '../experience/towns';
import { judgePick, misplaced, shuffled } from './quiz';

interface Props {
  kind: ExperienceKind;
  quiz: readonly CityQuiz[];
  /** 1 問正解するたびに呼ぶ。街が育つ */
  onCorrect: () => void;
  /** 全問に正解した。操作の段へ */
  onFinish: () => void;
}

type Verdict = null | { ok: boolean };

/**
 * 学びの流れの 3 段目「確かめ」。町の中で答える（建物を押す・札を並べる）。
 *
 * 正解すると街が育つ。外れたら、どこが正解だったかを町の上に印と矢印で示し、理由を添える。
 * もう一度答えられる。
 */
export function QuizStage({ kind, quiz, onCorrect, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [tries, setTries] = useState(0);
  const question = quiz[index];
  if (question === undefined) return null;
  const last = index >= quiz.length - 1;
  return (
    <QuizOne
      // 問いが変わるか、やり直すたびに選んだものを消す
      key={`${String(index)}:${String(tries)}`}
      kind={kind}
      question={question}
      number={index + 1}
      total={quiz.length}
      last={last}
      onCorrect={onCorrect}
      onRetry={() => {
        setTries((n) => n + 1);
      }}
      onNext={() => {
        if (last) onFinish();
        else setIndex((i) => i + 1);
      }}
    />
  );
}

function QuizOne({
  kind, question, number, total, last, onCorrect, onRetry, onNext,
}: {
  kind: ExperienceKind;
  question: CityQuiz;
  number: number;
  total: number;
  last: boolean;
  onCorrect: () => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [placed, setPlaced] = useState<string[]>([]);
  const [option, setOption] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const deck = useMemo(() => (question.kind === 'order' ? shuffled(question.cards) : []), [question]);

  const settle = (ok: boolean): void => {
    setVerdict({ ok });
    if (ok) onCorrect();
  };

  // 町の印。答える前は選んだ物、答えた後は正解（緑）と外れ（赤）
  const marks = useMemo(() => {
    const out: Record<string, ThingMark['tone']> = {};
    if (question.kind !== 'pick') return out;
    if (verdict === null) {
      for (const id of chosen) out[id] = 'chosen';
      return out;
    }
    for (const id of chosen) if (!question.answer.includes(id)) out[id] = 'miss';
    for (const id of question.answer) out[id] = 'ok';
    return out;
  }, [question, chosen, verdict]);
  const captions = useMemo(() => {
    const out: Record<string, string> = {};
    if (question.kind !== 'pick' || verdict === null || verdict.ok) return out;
    for (const id of question.answer) out[id] = '正解はここ';
    for (const id of chosen) if (!question.answer.includes(id)) out[id] = '選んだ所';
    return out;
  }, [question, chosen, verdict]);

  const single = question.kind === 'pick' && question.answer.length === 1;

  return (
    <div data-testid="quiz" data-quiz-kind={question.kind} data-verdict={verdict === null ? undefined : verdict.ok ? 'ok' : 'wrong'} className="flex h-full min-h-0 gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md" style={{ background: 'rgba(8,11,15,0.55)' }}>
        {question.kind === 'pick' ? (
          <TownView
            kind={kind}
            facility
            plates
            notes
            marks={marks}
            captions={captions}
            onPress={
              verdict === null
                ? (id) => {
                    if (single) {
                      setChosen([id]);
                      settle(judgePick(question.answer, [id]));
                      return;
                    }
                    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
                  }
                : undefined
            }
          />
        ) : question.kind === 'order' ? (
          <OrderBoard cards={question.cards} deck={deck} placed={placed} verdict={verdict} onPlace={(card) => {
            if (verdict !== null || placed.includes(card)) return;
            const next = [...placed, card];
            setPlaced(next);
            if (next.length === question.cards.length) settle(misplaced(question.cards, next).length === 0);
          }} />
        ) : (
          <div className="grid h-full place-items-center p-6">
            <div className="flex w-full max-w-lg flex-col gap-2">
              {question.options.map((text, i) => {
                const right = verdict !== null && i === question.answer;
                const wrongPick = verdict !== null && i === option && i !== question.answer;
                return (
                  <button
                    key={text}
                    type="button"
                    data-testid="quiz-option"
                    disabled={verdict !== null}
                    onClick={() => {
                      setOption(i);
                      settle(i === question.answer);
                    }}
                    className="rounded-md px-3 py-2.5 text-left text-[14px]"
                    style={{
                      background: right ? 'rgba(55,179,122,0.18)' : wrongPick ? 'rgba(255,138,122,0.16)' : HUD.fill,
                      border: `1px solid ${right ? HUD.ok : wrongPick ? HUD.bad : HUD.lineStrong}`,
                    }}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside className="flex w-[260px] shrink-0 flex-col gap-2.5">
        <p className="text-[12px]" style={{ color: HUD.accentText }}>
          {`3. 確かめ ・ ${String(number)} / ${String(total)}`}
        </p>
        <p data-testid="quiz-question" className="text-[15px] font-bold leading-snug">
          {question.question}
        </p>
        <p className="text-[12px]" style={{ color: HUD.muted }}>
          {question.kind === 'pick'
            ? single
              ? '町の中の 1 つを押して答える'
              : '当てはまる物を全部押してから「これで答える」'
            : question.kind === 'order'
              ? '札を正しい順に押して並べる'
              : '1 つ選ぶ'}
        </p>
        {question.kind === 'pick' && !single && verdict === null ? (
          <>
            <p className="text-[12px]" style={{ color: HUD.soft }}>
              {chosen.length === 0 ? 'まだ何も選んでいない' : `選んだもの: ${chosen.map((id) => thingOf(kind, id)?.label ?? id).join('、')}`}
            </p>
            <button
              type="button"
              data-testid="quiz-answer"
              disabled={chosen.length === 0}
              onClick={() => {
                settle(judgePick(question.answer, chosen));
              }}
              className="h-9 rounded text-[14px] font-bold disabled:opacity-40"
              style={{ background: HUD.accentDeep, color: '#fff' }}
            >
              これで答える
            </button>
          </>
        ) : null}
        {question.kind === 'order' && verdict === null && placed.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setPlaced([]);
            }}
            className="h-8 rounded text-[13px]"
            style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
          >
            並べ直す
          </button>
        ) : null}
        {verdict === null ? null : (
          <div
            data-testid="quiz-verdict"
            className="rounded-md p-3"
            style={{
              background: verdict.ok ? 'rgba(55,179,122,0.14)' : 'rgba(255,138,122,0.12)',
              border: `1px solid ${verdict.ok ? HUD.ok : HUD.bad}`,
            }}
          >
            <p className="text-[14px] font-bold" style={{ color: verdict.ok ? HUD.okText : HUD.bad }}>
              {verdict.ok
                ? '正解。街が 1 軒育った'
                : question.kind === 'pick'
                  ? '違う。正しい所を町に示した'
                  : question.kind === 'order'
                    ? '違う。正しい順を図にした'
                    : '違う。正しい答えに印を付けた'}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: HUD.soft }}>
              {question.why}
            </p>
          </div>
        )}
        <div className="flex-1" />
        {verdict === null ? null : verdict.ok ? (
          <button
            type="button"
            data-testid="quiz-next"
            onClick={onNext}
            className="h-9 rounded text-[14px] font-bold"
            style={{ background: HUD.accentDeep, color: '#fff' }}
          >
            {last ? 'コマンドで確かめる' : '次の問い'}
          </button>
        ) : (
          <button
            type="button"
            data-testid="quiz-retry"
            onClick={onRetry}
            className="h-9 rounded text-[14px] font-bold"
            style={{ border: `1px solid ${HUD.accentEdge}`, color: HUD.accentText }}
          >
            もう一度答える
          </button>
        )}
      </aside>
    </div>
  );
}

/**
 * 札を並べる台。上に混ぜた札、下に並べた札。
 * 外れたら、正しい並びを矢印でつないだ図を下に出し、位置の違う札に赤い印を付ける。
 */
function OrderBoard({
  cards, deck, placed, verdict, onPlace,
}: {
  cards: readonly string[];
  deck: readonly string[];
  placed: readonly string[];
  verdict: Verdict;
  onPlace: (card: string) => void;
}) {
  const wrong = new Set(verdict === null ? [] : misplaced(cards, placed));
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div>
        <p className="mb-2 text-[12px]" style={{ color: HUD.muted }}>
          札
        </p>
        <div className="flex flex-wrap gap-2">
          {deck.map((card) => {
            const used = placed.includes(card);
            return (
              <button
                key={card}
                type="button"
                data-testid="quiz-card"
                disabled={used || verdict !== null}
                onClick={() => {
                  onPlace(card);
                }}
                className="rounded-md px-3 py-2 text-[13px] disabled:opacity-30"
                style={{ background: HUD.fill, border: `1px solid ${HUD.lineStrong}` }}
              >
                {card}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[12px]" style={{ color: HUD.muted }}>
          並べた順
        </p>
        <ol className="flex flex-wrap items-center gap-1.5">
          {cards.map((_, i) => {
            const card = placed[i];
            return (
              <li key={i} className="flex items-center gap-1.5">
                <span
                  data-testid="quiz-slot"
                  className="min-w-[110px] rounded-md px-3 py-2 text-[13px]"
                  style={{
                    background: card === undefined ? 'transparent' : HUD.accentFill,
                    border: `1px ${card === undefined ? 'dashed' : 'solid'} ${wrong.has(i) ? HUD.bad : card === undefined ? HUD.lineStrong : HUD.accentEdge}`,
                    color: card === undefined ? HUD.dim : HUD.text,
                  }}
                >
                  {card ?? String(i + 1)}
                </span>
                {i < cards.length - 1 ? <Arrow /> : null}
              </li>
            );
          })}
        </ol>
      </div>
      {verdict !== null && !verdict.ok ? (
        <div data-testid="quiz-diagram">
          <p className="mb-2 text-[12px]" style={{ color: HUD.okText }}>
            正しい順
          </p>
          <ol className="flex flex-wrap items-center gap-1.5">
            {cards.map((card, i) => (
              <li key={card} className="flex items-center gap-1.5">
                <span className="rounded-md px-3 py-2 text-[13px]" style={{ background: 'rgba(55,179,122,0.14)', border: `1px solid ${HUD.ok}` }}>
                  {card}
                </span>
                {i < cards.length - 1 ? <Arrow tone={HUD.ok} /> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Arrow({ tone = HUD.dim }: { tone?: string }) {
  return (
    <svg viewBox="0 0 20 12" width={20} height={12} aria-hidden="true">
      <path d="M1 6h15M12 2l5 4-5 4" fill="none" stroke={tone} strokeWidth={1.6} />
    </svg>
  );
}
