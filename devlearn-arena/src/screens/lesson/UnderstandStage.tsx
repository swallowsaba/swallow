import { useMemo, useState } from 'react';
import type { Lesson, UnderstandItem } from '@/content/schema';
import { choiceOrder, EXPLAIN_TITLES, judgeUnderstand, RELATION_NAMES, shuffled, type RelationKind, type UnderstandAnswer, type UnderstandJudge } from '@/learning/lessonFlow';
import { Rich } from '../Rich';
import { Figure } from './Figure';
import { ChoiceList, Feedback, OrderPicker, Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 理解（docs/learning-design.md 4 章）。読んだことが頭に入ったかを確かめる。**採点しない（XP も無い）。**
 * 間違えたら、その場で関係する解説の箇所を示し、もう一度答えられる。正しく答えると次へ進める。
 */

const KIND_NAMES: Record<UnderstandItem['kind'], string> = {
  'figure-pick': '図で確かめる',
  order: '順に並べる',
  situation: 'この場面では',
  yesno: 'はい・いいえ',
  match: '用語と説明を結ぶ',
  relation: '2 つの関係',
};

export function UnderstandStage({ lesson, onTerm, right, action, onDone, onBack }: {
  lesson: Lesson;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onDone: () => void;
  /** 解説へ戻る */
  onBack: () => void;
}) {
  const [i, setI] = useState(0);
  const [solved, setSolved] = useState<ReadonlySet<number>>(new Set());
  const item = lesson.understand[i];
  if (!item) return null;
  const last = i === lesson.understand.length - 1;
  return (
    <section className="stage stage-understand" aria-label="理解" data-testid="stage-understand">
      <p className="stage-count">
        <span className="stage-kind">{KIND_NAMES[item.kind]}</span>
        <span className="num">{i + 1} / {lesson.understand.length}</span>
        <span className="stage-count-note">採点はしない。間違えたら解説の箇所を見直そう</span>
      </p>
      <ItemView
        key={`${lesson.id}-${String(i)}`}
        lesson={lesson}
        item={item}
        index={i}
        onTerm={onTerm}
        right={right}
        onSolved={() => setSolved((s) => new Set([...s, i]))}
      />
      <Slot to={action}>
        <StepButtons
          onBack={i > 0 ? () => setI(i - 1) : onBack}
          backLabel={i > 0 ? '前へ' : '解説へ戻る'}
          onNext={last ? onDone : () => setI(i + 1)}
          nextEnabled={solved.has(i)}
          nextLabel={last ? 'クイズへ' : '次へ'}
        />
      </Slot>
    </section>
  );
}

function ItemView({ lesson, item, index, onTerm, right, onSolved }: {
  lesson: Lesson;
  item: UnderstandItem;
  index: number;
  onTerm: OnTerm;
  right: HTMLElement | null;
  onSolved: () => void;
}) {
  const [judge, setJudge] = useState<UnderstandJudge | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [pairs, setPairs] = useState<[string, string][]>([]);
  const [left, setLeft] = useState<string | null>(null);
  const seed = `${lesson.id}.u${String(index)}`;
  const pool = useMemo(() => (item.kind === 'order' ? shuffled(item.items, seed) : []), [item, seed]);
  const rights = useMemo(() => (item.kind === 'match' ? shuffled(item.pairs.map((p) => p[1]), seed) : []), [item, seed]);
  const done = judge?.correct === true;

  const check = (answer: UnderstandAnswer): void => {
    const j = judgeUnderstand(item, answer);
    setJudge(j);
    if (j.correct) onSolved();
  };
  const figure = item.kind === 'figure-pick' ? item.figure : lesson.explain.figures[0] ?? '';
  // 答えが図の複数の部分なら、押すたびに選び・外し、「確かめる」で採点する（1 つなら押した時に採点する）
  const multiPick = item.kind === 'figure-pick' && item.answer.length > 1;
  const onPick = (part: string): void => {
    if (!multiPick) {
      setPicked([part]);
      check({ kind: 'figure-pick', parts: [part] });
      return;
    }
    setPicked(picked.includes(part) ? picked.filter((p) => p !== part) : [...picked, part]);
    setJudge(null);
  };

  return (
    <div className="understand" data-testid="understand-item" data-kind={item.kind}>
      <p className="stage-prompt"><Rich text={item.prompt} onTerm={onTerm} /></p>

      {item.kind === 'figure-pick' ? (
        <p className="stage-hint">{multiPick ? '右の図で当てはまる所を全て押し、「確かめる」を押す（もう一度押すと外れる。Tab で選んで Enter でも押せる）' : '右の図の中を押す（Tab で選んで Enter でも押せる）'}</p>
      ) : null}
      {multiPick && !done ? <button type="button" className="stage-check" disabled={picked.length === 0} onClick={() => check({ kind: 'figure-pick', parts: picked })}>確かめる</button> : null}

      {item.kind === 'yesno' ? (
        <div className="yesno" role="group" aria-label="はいか、いいえ">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" className={`yesno-button${picked[0] === String(v) ? ' is-picked' : ''}`} disabled={done} aria-pressed={picked[0] === String(v)} onClick={() => { setPicked([String(v)]); check({ kind: 'yesno', value: v }); }}>
              {v ? 'はい' : 'いいえ'}
            </button>
          ))}
        </div>
      ) : null}

      {item.kind === 'situation' ? (
        <ChoiceList
          label="選択肢"
          choices={choiceOrder(item.choices, seed).map((c) => ({ id: c.id, text: c.text, mark: judge && picked.includes(c.id) ? (c.correct ? 'ok' : 'bad') : undefined, note: judge && picked.includes(c.id) && !c.correct ? c.whyNot : undefined }))}
          picked={picked}
          answered={done}
          onToggle={(id) => { setPicked([id]); check({ kind: 'situation', choiceId: id }); }}
          onTerm={onTerm}
        />
      ) : null}

      {item.kind === 'relation' ? (
        <ChoiceList
          label="2 つの関係"
          choices={(['contains', 'before', 'cause'] as RelationKind[]).map((k) => ({ id: k, text: RELATION_NAMES[k](item.a, item.b), mark: judge && picked.includes(k) ? (k === item.answer ? 'ok' : 'bad') : undefined }))}
          picked={picked}
          answered={done}
          onToggle={(id) => { setPicked([id]); check({ kind: 'relation', value: id as RelationKind }); }}
          onTerm={onTerm}
        />
      ) : null}

      {item.kind === 'order' ? (
        <>
          <OrderPicker label="正しい順に並べる" pool={pool} order={order} onChange={(o) => { setOrder(o); setJudge(null); }} wrong={judge?.wrong ?? []} done={done} />
          {!done ? <button type="button" className="stage-check" disabled={order.length !== pool.length} onClick={() => check({ kind: 'order', items: order })}>確かめる</button> : null}
        </>
      ) : null}

      {item.kind === 'match' ? (
        <>
          <div className="match" role="group" aria-label="用語と説明を結ぶ">
            <ul className="match-col" aria-label="用語">
              {item.pairs.map(([l]) => {
                const k = pairs.findIndex((p) => p[0] === l);
                return (
                  <li key={l}>
                    <button type="button" className={`match-item${left === l ? ' is-picked' : ''}${k >= 0 ? ' is-paired' : ''}${judge?.wrong.includes(l) ? ' is-bad' : ''}`} disabled={done} aria-pressed={left === l} onClick={() => setLeft(left === l ? null : l)}>
                      {k >= 0 ? <span className="match-no num">{k + 1}</span> : null}
                      <Rich text={l} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <ul className="match-col" aria-label="説明">
              {rights.map((r) => {
                const k = pairs.findIndex((p) => p[1] === r);
                return (
                  <li key={r}>
                    <button
                      type="button"
                      className={`match-item${k >= 0 ? ' is-paired' : ''}`}
                      disabled={done || left === null}
                      onClick={() => {
                        if (!left) return;
                        setPairs([...pairs.filter((p) => p[0] !== left && p[1] !== r), [left, r]]);
                        setLeft(null);
                        setJudge(null);
                      }}
                    >
                      {k >= 0 ? <span className="match-no num">{k + 1}</span> : null}
                      <Rich text={r} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="stage-hint">左の用語を押してから、合う説明を押す</p>
          {!done ? <button type="button" className="stage-check" disabled={pairs.length !== item.pairs.length} onClick={() => check({ kind: 'match', pairs })}>確かめる</button> : null}
        </>
      ) : null}

      {judge ? <UnderstandFeedback lesson={lesson} item={item} judge={judge} onTerm={onTerm} /> : null}

      <Slot to={right}>
        <Figure
          id={figure}
          onPick={item.kind === 'figure-pick' && !done ? onPick : undefined}
          picked={item.kind === 'figure-pick' ? picked : []}
          marks={item.kind === 'figure-pick' && judge ? Object.fromEntries(picked.map((p) => [p, judge.correct || !judge.wrong.includes(p) ? 'ok' : 'bad'])) : {}}
        />
      </Slot>
    </div>
  );
}

function UnderstandFeedback({ lesson, item, judge, onTerm }: { lesson: Lesson; item: UnderstandItem; judge: UnderstandJudge; onTerm: OnTerm }) {
  const why = item.kind === 'yesno' || item.kind === 'relation' ? item.why : null;
  if (judge.correct) {
    return (
      <Feedback ok title="その通り">
        {why ? <p className="feedback-text"><Rich text={why} onTerm={onTerm} /></p> : null}
      </Feedback>
    );
  }
  const see = judge.see;
  const back = see ? lesson.explain[see] : null;
  return (
    <Feedback ok={false} title="もう一度考えてみよう">
      {item.kind === 'situation' ? null : why ? null : <p className="feedback-text">{item.kind === 'order' || item.kind === 'match' ? '印の付いた所が違う。' : item.kind === 'figure-pick' && item.answer.length > 1 ? (judge.wrong.length > 0 ? '印の付いた所が違う。' : 'まだ押していない所がある。') : '押した所は違う。'}</p>}
      {back && see ? (
        <div className="feedback-see" data-testid="feedback-see">
          <p className="feedback-see-title">解説の「{EXPLAIN_TITLES[see]}」</p>
          <p className="feedback-text"><Rich text={back} onTerm={onTerm} /></p>
        </div>
      ) : null}
    </Feedback>
  );
}
