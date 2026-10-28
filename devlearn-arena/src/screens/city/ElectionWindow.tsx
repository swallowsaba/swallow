import { useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { Point } from '@/city/types';
import { Icon } from '@/ui/icons/Icon';
import type { CityStore } from './cityStore';
import { electionModel, INCOME_COLUMNS, pledgeOptions, termModel, type ElectionModel, type TermModel } from './electionView';
import './ElectionWindow.css';

/** 公約の数（docs/game-design.md 21.4） */
const PLEDGE_COUNT = 2;

/**
 * 選挙の画面（docs/ui-design.md 10.6）と任期の終わりの一覧（10.7）。大きな窓（幅 720・高さ最大 70%・中央）。開いている間、都市の時間は止まる。
 * 見込み: 上の帯の任期の残りから。結果: 選挙の日に開く（当選なら任期の一覧と次の公約へ、落選なら敗因と 2 つの道）。
 * 任期の一覧: 功績と、次の任期の公約を 2 つ選ぶ（移行した都市・新しい都市の 1 期目は公約だけ）
 */
export function ElectionWindow({ store, onNewCity }: { store: CityStore; onNewCity?: () => void }) {
  const s = useStore(store, useShallow((x) => ({ view: x.election, politics: x.world.politics, leave: x.leaveElection, open: x.openElection })));
  if (!s.view) return null;
  const world = store.getState().world;
  const now = (): number => performance.now();
  if (s.view === 'term') {
    const past = termModel(world);
    // 前の任期の一覧は、その任期の続き（当選・再び立つ）か、落選して道を選ぶ前だけ出す
    const term = past && (s.politics.defeated || s.politics.term.no === past.no + 1) ? past : null;
    const choosing = !s.politics.defeated && s.politics.term.pledges.length === 0;
    return (
      <Frame
        title={term && !choosing ? `${String(term.no)} 期目の任期の終わり` : `${String(s.politics.term.no)} 期目の公約を選ぶ`}
        mode="term"
        onClose={s.leave}
        verdict={term ? <span className={`election-verdict ${term.won ? 'is-pass' : 'is-fail'}`}>{term.won ? '当選' : '落選'}</span> : null}
      >
        <div className="election-body">
          {term ? <TermSummary term={term} onFocus={(at, size) => store.getState().focusAt(at, size ?? undefined)} /> : null}
          {choosing ? <PledgePicker store={store} /> : null}
        </div>
        {s.politics.defeated ? (
          <footer className="election-foot">
            <button type="button" className="election-button is-sub" onClick={() => s.open('result')}>選挙の結果へ戻る</button>
          </footer>
        ) : null}
      </Frame>
    );
  }
  const m = electionModel(world, s.view);
  if (!m) return null;
  const result = m.mode === 'result';
  const verdict = result ? (m.won ? '当選' : '落選') : m.won ? '当選の見込み' : '落選の見込み';
  return (
    <Frame
      title={m.title}
      mode={m.mode}
      onClose={s.leave}
      verdict={(
        <>
          <span className="election-stat" title="得票率（50% 以上で当選）">
            得票率 <b className="num" data-testid="election-share">{m.voteShare.toLocaleString('ja-JP')}</b><span className="election-unit">%</span>
          </span>
          <span className={`election-verdict ${m.won ? 'is-pass' : 'is-fail'}`} data-testid="election-verdict">{verdict}</span>
        </>
      )}
    >
      <div className="election-body">
        <ShareBar share={m.voteShare} />
        <div className="election-grid">
          <LayerTable m={m} />
          <section className="election-side" aria-label="得票に効いた層">
            <h3 className="election-heading">得票に効いた層</h3>
            <ol className="election-top" data-testid="election-top">
              {m.top.map((t) => (
                <li key={t.layer}>
                  <span>{t.name}</span>
                  <b className={`num ${t.points < 0 ? 'is-down' : 'is-up'}`}>{t.points > 0 ? '+' : ''}{t.points.toLocaleString('ja-JP')}</b>
                </li>
              ))}
            </ol>
            <p className="election-note">50% からの差を、層ごとに分けた点。投票に行く層ほど大きく効く</p>
            {result ? null : <PledgeStatus m={m} onPick={() => s.open('term')} />}
          </section>
        </div>
        {result && !m.won ? <Causes m={m} onFocus={(at) => store.getState().focusAt(at)} /> : null}
      </div>
      <footer className="election-foot">
        {!result ? (
          <span className="election-days">選挙まで <b className="num">{m.weeksLeft}</b> 週（任期は 4 年。最後の日が選挙）</span>
        ) : m.defeated ? (
          <>
            <p className="election-keep" data-testid="election-keep">どちらを選んでも、学習の記録（XP・スキル・レッスンの進み・ミッション）は消えない</p>
            <button type="button" className="election-button is-sub" data-testid="election-term" onClick={() => s.open('term')}>任期の一覧</button>
            <button type="button" className="election-button is-sub" data-testid="election-new-city" disabled={!onNewCity} onClick={() => onNewCity?.()}>
              新しい都市で始める
            </button>
            <button type="button" className="election-button" data-testid="election-rerun" onClick={() => store.getState().rerun(now())}>
              同じ都市で再び立つ
            </button>
          </>
        ) : (
          <button type="button" className="election-button" data-testid="election-term" onClick={() => s.open('term')}>
            {m.won && s.politics.term.pledges.length === 0 ? '任期の一覧と、次の公約へ' : '任期の一覧'}
          </button>
        )}
      </footer>
    </Frame>
  );
}

function Frame({ title, mode, verdict, onClose, children }: { title: string; mode: string; verdict: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="election-backdrop">
      <section className="election" role="dialog" aria-modal="true" aria-labelledby="election-title" data-testid="election-window" data-mode={mode} data-label-block>
        <header className="election-head">
          <span className="election-icon"><Icon name="vote" size={20} /></span>
          <h2 id="election-title" className="election-title">{title}</h2>
          {verdict}
          <button type="button" className="election-close" onClick={onClose} title="閉じる（Esc）" aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/** 得票率の帯（大きな数字は見出し。帯は 0〜100 と 50% の線） */
function ShareBar({ share }: { share: number }) {
  const pct = Math.max(0, Math.min(100, share));
  return (
    <div className="election-bar" role="img" aria-label={`得票率 ${String(share)}%（50% 以上で当選）`}>
      <span className={`election-bar-fill ${share >= 50 ? 'is-pass' : 'is-fail'}`} style={{ width: `${String(pct)}%` }} />
      <span className="election-bar-line" />
      <span className="election-bar-mark">50%</span>
    </div>
  );
}

/** 12 層の 4×3 の表（行が年齢の帯、列が収入の帯）。色の濃さが支持、文字が投票率 */
function LayerTable({ m }: { m: ElectionModel }) {
  return (
    <table className="election-table" data-testid="election-table">
      <thead>
        <tr>
          <th scope="col"><span className="election-corner">年齢 ＼ 収入</span></th>
          {INCOME_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {m.rows.map((row) => (
          <tr key={row.age}>
            <th scope="row">{row.age}</th>
            {row.cells.map((c) => (
              <td
                key={c.layer}
                data-layer={c.layer}
                title={`${c.name}: 支持 ${String(c.support)}%・投票率 ${String(c.turnout)}%`}
                style={{ '--support': `${String(Math.round(c.support * 0.6))}%` } as React.CSSProperties}
                className={c.support < 50 ? 'is-low' : undefined}
              >
                <span className="election-cell-support num">{c.support}<small>%</small></span>
                <span className="election-cell-turnout">投票 <b className="num">{c.turnout}</b>%</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 選んだ公約の今の値（見込みの時。選んでいなければ選ぶ窓へ） */
function PledgeStatus({ m, onPick }: { m: ElectionModel; onPick: () => void }) {
  return (
    <>
      <h3 className="election-heading">公約</h3>
      {m.pledges.length === 0 ? (
        <button type="button" className="election-button is-sub" data-testid="election-pick" onClick={onPick}>公約を選ぶ（2 つ）</button>
      ) : (
        <ul className="election-pledges" data-testid="election-pledges">
          {m.pledges.map((p) => (
            <li key={p.id} className={p.done ? 'is-done' : undefined}>
              {p.done ? <Icon name="check" size={14} /> : null}
              <b>{p.title}</b>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 落選の敗因（21.2）: 得票を下げた層・その満足の要因の内訳・原因になった決定（押すとその場所へ） */
function Causes({ m, onFocus }: { m: ElectionModel; onFocus: (at: Point) => void }) {
  return (
    <section className="election-causes" aria-label="敗因" data-testid="election-causes">
      <h3 className="election-heading">敗因（得票を 50% から下げた層）</h3>
      <ol>
        {m.causes.map((c) => (
          <li key={c.layer}>
            <b className="election-cause-layer">{c.name}</b>
            <span className="election-cause-factors">{c.factors.length > 0 ? `満足を下げた要因: ${c.factors.join('・')}` : '満足を下げた要因は記録に無い'}</span>
            {c.decisions.length > 0 ? (
              <span className="election-cause-decisions">
                原因になった決定:
                {c.decisions.map((d) => (
                  <button key={d.key} type="button" className="election-link" disabled={!d.at} onClick={() => { if (d.at) onFocus(d.at); }} title={d.at ? '押すと、その場所へ' : undefined}>
                    {d.at ? <Icon name="pin" size={12} /> : null}{d.text}
                  </button>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 任期の終わりの一覧（10.7） */
function TermSummary({ term, onFocus }: { term: TermModel; onFocus: (at: Point, size: Point | null) => void }) {
  return (
    <section className="election-term" aria-label="任期の功績" data-testid="election-summary">
      <p className="election-span">{term.span}（{term.no} 期目）</p>
      <div className="election-term-grid">
        <dl className="election-numbers">
          {term.numbers.map((n) => (
            <div key={n.name}>
              <dt>{n.name}</dt>
              <dd><span className="num">{n.from}</span><Icon name="speed1" size={12} /><b className="num">{n.to}</b></dd>
            </div>
          ))}
          <div>
            <dt>議会</dt>
            <dd>可決 <b className="num">{term.approved}</b>・否決 <b className="num">{term.rejected}</b></dd>
          </div>
        </dl>
        <Sparkline values={term.approvalLine} />
      </div>
      <dl className="election-done">
        <div>
          <dt>完成した建物</dt>
          <dd>
            {term.built.length === 0 ? 'なし' : term.built.map((b) => (
              <button key={b.id} type="button" className="election-link" disabled={!b.at} onClick={() => { if (b.at) onFocus(b.at, b.size); }}>
                {b.at ? <Icon name="pin" size={12} /> : null}{b.name}
              </button>
            ))}
          </dd>
        </div>
        <div>
          <dt>果たした公約</dt>
          <dd>{term.pledgesDone.length === 0 ? 'なし' : term.pledgesDone.join('・')}</dd>
        </div>
        <div>
          <dt>学びと課題</dt>
          <dd>
            ミッション <b className="num">{term.missionsDone}</b> 達成・レッスン <b className="num">{term.lessonsDone}</b> 本修了
            {term.skillsUp.length > 0 ? `・段階が上がった分野: ${term.skillsUp.join('・')}` : ''}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** 支持率の小さな線のグラフ（その任期の週の値。0〜100） */
function Sparkline({ values }: { values: readonly number[] }) {
  const w = 200;
  const h = 64;
  if (values.length < 2) return <p className="election-note">支持率の線は、記録が 2 週たまると出る</p>;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - (Math.max(0, Math.min(100, v)) / 100) * h).toFixed(1)}`).join(' ');
  return (
    <figure className="election-spark">
      <svg width={w} height={h} viewBox={`0 0 ${String(w)} ${String(h)}`} role="img" aria-label="任期の間の支持率の線">
        <line className="election-spark-mid" x1={0} y1={h / 2} x2={w} y2={h / 2} />
        <path className="election-spark-line" d={d} />
      </svg>
      <figcaption>支持率（中の線が 50%）</figcaption>
    </figure>
  );
}

/** 次の任期の公約を 2 つ選ぶ（候補を一覧で。果たす条件と今の値を添える） */
function PledgePicker({ store }: { store: CityStore }) {
  const options = pledgeOptions(store.getState().world);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string): void => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= PLEDGE_COUNT ? [...p.slice(1), id] : [...p, id]));
  return (
    <section className="election-pick" aria-label="公約を選ぶ" data-testid="pledge-picker">
      <h3 className="election-heading">この任期の公約を 2 つ選ぶ</h3>
      <p className="election-note">果たすと政治資本 +5 と、その公約を重く見る層の信頼 +3。選挙の日に果たせていないと、その層の信頼 −3</p>
      <ul className="election-options">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={`election-option${picked.includes(o.id) ? ' is-on' : ''}`}
              aria-pressed={picked.includes(o.id)}
              disabled={o.met}
              data-pledge={o.id}
              onClick={() => toggle(o.id)}
            >
              <b>{o.title}</b>
              <span className="election-option-goal">{o.text}</span>
              <span className="election-option-layers">{o.met ? '今すでに満たしているので、公約にできない' : `重く見る層: ${o.layers}`}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="election-pick-foot">
        <button
          type="button"
          className="election-button"
          data-testid="pledge-confirm"
          disabled={picked.length !== PLEDGE_COUNT}
          onClick={() => store.getState().choosePledges(picked, performance.now())}
        >
          {picked.length === PLEDGE_COUNT ? 'この 2 つを公約にする' : `あと ${String(PLEDGE_COUNT - picked.length)} つ選ぶ`}
        </button>
      </div>
    </section>
  );
}
