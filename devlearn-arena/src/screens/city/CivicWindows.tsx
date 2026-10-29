import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { POLITICS_RULES } from '@/content/politics';
import { layerName } from '@/sim/layers';
import { TAX_RANGE } from '@/sim/budget';
import { Icon } from '@/ui/icons/Icon';
import { SmallWindow } from '@/ui/SmallWindow';
import type { CityStore } from './cityStore';
import { svgView } from '@/city/generate/svg';
import { facilitySvg } from '@/city/render/sprites';
import { budgetModel, capitalModel, inboxRows, newsIssues, rewardRows, taxPreview, type LedgerLine } from './civicView';
import { WeeklyGraph } from './WeeklyGraph';
import './CivicWindows.css';

/**
 * 受信箱（docs/ui-design.md 10.8）・予算（10.9）・市内新聞（10.10）・褒賞の一覧（10.11）。どれも小さな窓（10.0）。
 * カードを並べず、線で区切った行と、数と短い棒で示す
 */

const num = (v: number): string => Math.round(v).toLocaleString('ja-JP');
const num1 = (v: number): string => v.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const signed = (v: number, digits = 0): string => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('ja-JP', { maximumFractionDigits: digits })}`;

interface WindowProps {
  store: CityStore;
  stack: number;
  shifted: boolean;
}

/* ---------- 受信箱 ---------- */

export function InboxWindow({ store, stack, shifted }: WindowProps) {
  const s = useStore(store, useShallow((x) => ({ inbox: x.world.petitions.inbox, week: x.world.sim.week, closeWindow: x.closeWindow, openWindow: x.openWindow, focusAt: x.focusAt, handle: x.handlePetition })));
  const world = store.getState().world;
  const terrain = store.getState().terrain;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => inboxRows(world, terrain, POLITICS_RULES), [s.inbox, s.week, terrain]);
  // 保留した請願は、詳しい中身を畳んで見出しだけにする（模擬では何も起きない。期限が来ると放置になる）
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  return (
    <SmallWindow testId="inbox-window" icon="inbox" title="受信箱" stack={stack} shifted={shifted} onClose={() => s.closeWindow('inbox')} onFront={() => s.openWindow('inbox')}>
      <p className="civic-summary">届いた請願 <b className="num">{rows.length}</b> 通（5 通まで。届いて 8 週が期限）</p>
      {rows.length === 0 ? (
        <p className="civic-empty">請願は届いていない。家賃の負担・騒音・公園の行き届きなど、暮らしの値が悪くなった地区から届く</p>
      ) : (
        <ul className="petition-rows" data-testid="petition-rows">
          {rows.map((r) => (
            <li key={r.id} className={`petition-row${held.has(r.id) ? ' is-held' : ''}`} data-testid={`petition-${r.id}`}>
              <button type="button" className="petition-head" onClick={() => r.at && s.focusAt(r.at, { x: 8, y: 8 })} title="届いた地区へ寄る">
                <span className="petition-title">{r.title}</span>
                <span className={`petition-left${r.weeksLeft <= 2 ? ' is-near' : ''}`}><span className="num">{r.weeksLeft}</span> 週</span>
              </button>
              <p className="petition-from"><Icon name="pin" size={12} />{r.from}{held.has(r.id) ? <button type="button" className="petition-reopen" onClick={() => setHeld(new Set([...held].filter((x) => x !== r.id)))}>保留中・広げる</button> : null}</p>
              {held.has(r.id) ? null : <>
              <p className="petition-text">{r.text}</p>
              <p className="petition-basis" data-testid="petition-basis">{r.basis}</p>
              <dl className="petition-effects">
                <dt>受理</dt>
                <dd>{r.accept.effect}。{r.accept.cost}。{r.accept.trust}</dd>
                <dt>拒否</dt>
                <dd>{r.reject}</dd>
                <dt>保留</dt>
                <dd>{r.hold}</dd>
              </dl>
              <div className="petition-hands">
                <button
                  type="button"
                  className="civic-button is-primary"
                  data-testid="petition-accept"
                  disabled={r.accept.problem !== undefined}
                  title={r.accept.problem ?? '受理する'}
                  onClick={() => s.handle(r.id, 'accept', performance.now())}
                >受理</button>
                <button type="button" className="civic-button" data-testid="petition-reject" onClick={() => s.handle(r.id, 'reject', performance.now())}>拒否</button>
                <button type="button" className="civic-button is-quiet" data-testid="petition-hold" title="保留する（何も起きない。期限が来ると放置になる）" onClick={() => setHeld(new Set([...held, r.id]))}>保留</button>
                {r.accept.problem ? <span className="petition-problem">{r.accept.problem}</span> : null}
              </div>
              </>}
            </li>
          ))}
        </ul>
      )}
    </SmallWindow>
  );
}

/* ---------- 予算 ---------- */

function Ledger({ lines, tone }: { lines: LedgerLine[]; tone: 'in' | 'out' }) {
  return (
    <ul className="ledger-lines">
      {lines.map((l) => (
        <li key={l.id} className={`ledger-line is-${tone}${l.value === 0 ? ' is-zero' : ''}`} data-testid={`ledger-${l.id}`}>
          <span className="ledger-label">{l.label}</span>
          <span className="ledger-bar" aria-hidden="true"><span style={{ width: `${String(Math.round(l.ratio * 100))}%` }} /></span>
          <span className="ledger-value num">{num1(l.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function BudgetWindow({ store, stack, shifted }: WindowProps) {
  const s = useStore(store, useShallow((x) => ({
    budget: x.world.budget, capital: x.world.politics.capital, log: x.world.politics.capitalLog, weekly: x.world.history.weekly,
    closeWindow: x.closeWindow, openWindow: x.openWindow, setTaxRate: x.setTaxRate,
  })));
  const world = store.getState().world;
  const m = budgetModel(world);
  const cap = capitalModel(world);
  const target = m.pendingTaxRate ?? m.taxRate;
  const [rate, setRate] = useState(target);
  const preview = taxPreview(world, rate);
  const recent = s.weekly.slice(-52);
  const ages = ['若者', '子育て', '中年', '高齢'];
  return (
    <SmallWindow testId="budget-window" icon="treasury" title="予算" stack={stack} shifted={shifted} onClose={() => s.closeWindow('budget')} onFront={() => s.openWindow('budget')}>
      <section className="budget-section">
        <h3 className="civic-h">今週の収支{m.week !== null ? '' : '（週の終わりに出る）'}</h3>
        <div className="ledger">
          <div className="ledger-col">
            <p className="ledger-head">収入 <b className="num">{num1(m.incomeTotal)}</b></p>
            <Ledger lines={m.income} tone="in" />
          </div>
          <div className="ledger-col">
            <p className="ledger-head">支出 <b className="num">{num1(m.spendTotal)}</b></p>
            <Ledger lines={m.spend} tone="out" />
          </div>
        </div>
      </section>
      <section className="budget-section">
        <h3 className="civic-h">税率</h3>
        <div className="tax-row">
          <input
            type="range"
            className="tax-slider"
            data-testid="tax-slider"
            min={TAX_RANGE.min}
            max={TAX_RANGE.max}
            step={1}
            value={rate}
            aria-label="税率"
            onChange={(e) => setRate(Number(e.target.value))}
          />
          <span className="tax-value"><b className="num">{rate}</b>%</span>
          <button type="button" className="civic-button is-primary" data-testid="tax-apply" disabled={rate === target} onClick={() => s.setTaxRate(rate, performance.now())}>決める</button>
        </div>
        <p className="tax-now">
          今 <b className="num">{m.taxRate}</b>%{m.pendingTaxRate !== undefined ? <>・来週から <b className="num">{m.pendingTaxRate}</b>%</> : null}
          {rate !== m.taxRate ? <>・見込みの税収 <b className={`num ${preview.incomeDelta >= 0 ? 'is-up' : 'is-down'}`} data-testid="tax-income">{signed(preview.incomeDelta, 1)}</b>／週</> : null}
        </p>
        {rate !== m.taxRate ? (
          <table className="tax-layers" data-testid="tax-layers" aria-label="層ごとの満足の「税」の点の増減">
            <thead><tr><th />{['低い収入', '中くらい', '高い収入'].map((b) => <th key={b}>{b}</th>)}</tr></thead>
            <tbody>
              {ages.map((a, ai) => (
                <tr key={a}>
                  <th>{a}</th>
                  {[0, 1, 2].map((b) => {
                    const l = ai * 3 + b;
                    const v = preview.points[l] ?? 0;
                    return <td key={b} title={`${layerName(l)}の満足の「税」の点`}><span className={v > 0 ? 'is-up' : v < 0 ? 'is-down' : ''}>{signed(v, 1)}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="civic-empty">つまみを動かすと、税収の見込みと、層ごとの満足の「税」の点の増減が出る。上げると事業者の費用も増え、撤退しやすくなる</p>}
      </section>
      <section className="budget-section">
        <h3 className="civic-h">財政</h3>
        <p className={`budget-treasury${m.deficit ? ' is-deficit' : ''}`} data-testid="budget-treasury">
          <b className="num">{num(m.treasury)}</b>
          {m.deficit ? <span className="budget-deficit">赤字 {m.deficitWeeks} 週目（8 週続くと新聞に載る）</span> : <span className="budget-sub">今週 {signed(m.incomeTotal - m.spendTotal, 1)}</span>}
        </p>
        <WeeklyGraph samples={recent} series="treasury" />
        <p className="budget-note" data-testid="budget-funds-note"><Icon name="funds" size={14} />開発資金は学習で増える。ここでは使わない（財政とは別の財布）</p>
      </section>
      <section className="budget-section" data-testid="budget-capital">
        <h3 className="civic-h">政治資本</h3>
        <p className="capital-meter">
          <span className="capital-bar" aria-hidden="true"><span style={{ width: `${String(Math.round((cap.value / cap.cap) * 100))}%` }} /></span>
          <b className="num">{cap.value}</b><span className="civic-unit">/ {cap.cap}</span>
        </p>
        <div className="capital-log">
          <div>
            <p className="ledger-head">この任期の得</p>
            {cap.gains.length === 0 ? <p className="civic-empty">まだ無い（公約・ミッション・支持率の上昇）</p> : (
              <ul className="capital-lines">{cap.gains.map((g) => <li key={g.why}><span>{g.why}</span><b className="num is-up">{signed(g.amount)}</b></li>)}</ul>
            )}
          </div>
          <div>
            <p className="ledger-head">この任期の使い</p>
            {cap.uses.length === 0 ? <p className="civic-empty">まだ無い（押し切り・説得・申し立ての抑え）</p> : (
              <ul className="capital-lines">{cap.uses.map((g) => <li key={g.why}><span>{g.why}</span><b className="num is-down">{signed(g.amount)}</b></li>)}</ul>
            )}
          </div>
        </div>
      </section>
    </SmallWindow>
  );
}

/* ---------- 市内新聞 ---------- */

export function NewsWindow({ store, stack, shifted }: WindowProps) {
  const s = useStore(store, useShallow((x) => ({ news: x.world.history.news, closeWindow: x.closeWindow, openWindow: x.openWindow, focusAt: x.focusAt })));
  const [query, setQuery] = useState('');
  const issues = useMemo(() => newsIssues(s.news, query), [s.news, query]);
  const title = POLITICS_RULES.news?.title ?? '市民新報';
  return (
    <SmallWindow testId="news-window" icon="news" title={title} stack={stack} shifted={shifted} onClose={() => s.closeWindow('news')} onFront={() => s.openWindow('news')}>
      <label className="news-search">
        <Icon name="search" size={14} />
        <input type="search" placeholder="見出しで探す" value={query} data-testid="news-search" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {issues.length === 0 ? (
        <p className="civic-empty">{s.news.length === 0 ? 'まだ記事は無い。申請・議会・請願・選挙の出来事が、週ごとに載る' : '見出しに合う記事は無い'}</p>
      ) : (
        <div className="news-issues" data-testid="news-issues">
          {issues.map((issue) => (
            <section key={issue.week} className="news-issue">
              <h3 className="news-date">{issue.date}</h3>
              {issue.articles.map((a) => (
                <article key={a.id} className={`news-article is-${a.kind}`} data-testid={`news-${a.id}`}>
                  <button type="button" className="news-headline" disabled={!a.at} title={a.at ? 'その場所へ寄る' : undefined} onClick={() => a.at && s.focusAt(a.at, { x: 3, y: 3 })}>
                    {a.headline}
                  </button>
                  {a.body ? <p className="news-body">{a.body}</p> : null}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </SmallWindow>
  );
}

/* ---------- 褒賞の一覧 ---------- */

const STATUS_LABEL = { locked: 'まだ', open: '建てられる', pending: '申請中', built: '建った' } as const;

/** 建物の正面の姿（一覧の小さな見本） */
function awardImage(type: Parameters<typeof facilitySvg>[0]): string | null {
  const svg = facilitySvg(type, 1);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgView(svg, 'front').svg)}` : null;
}

export function RewardsWindow({ store, stack, shifted }: WindowProps) {
  const s = useStore(store, useShallow((x) => ({
    rewards: x.world.rewards, apps: x.world.applications, facilities: x.world.city.facilities, population: x.world.city.population, week: x.world.sim.week,
    closeWindow: x.closeWindow, openWindow: x.openWindow, openMenu: x.openMenu, setTool: x.setTool,
  })));
  const world = store.getState().world;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rewardRows(world), [s.rewards, s.apps, s.facilities, s.population, s.week]);
  const images = useMemo(() => new Map(rows.map((r) => [r.type, awardImage(r.type)])), [rows]);
  return (
    <SmallWindow testId="rewards-window" icon="stage" title="褒賞" stack={stack} shifted={shifted} onClose={() => s.closeWindow('rewards')} onFront={() => s.openWindow('rewards')}>
      <p className="civic-summary">人口と支持率の節目で、建てられる建物が増える。学ぶことには関係しない（どのレッスンも、いつでも始められる）</p>
      <ul className="reward-rows" data-testid="reward-rows">
        {rows.map((r) => (
          <li key={r.type} className={`reward-row is-${r.status}`} data-testid={`reward-${r.type}`}>
            <span className="reward-art" aria-hidden="true">{images.get(r.type) ? <img src={images.get(r.type) ?? ''} alt="" draggable={false} /> : null}</span>
            <div className="reward-body">
              <p className="reward-head">
                <span className="reward-name">{r.name}</span>
                <span className={`reward-status is-${r.status}`} data-testid="reward-status">{STATUS_LABEL[r.status]}</span>
              </p>
              <ul className="reward-parts">
                {r.parts.map((p) => (
                  <li key={p.label} className={p.met ? 'is-met' : ''}><Icon name={p.met ? 'check' : 'pin'} size={12} /><span className="num-mix">{p.label}</span></li>
                ))}
              </ul>
              <p className="reward-effect">{r.effect}</p>
              <p className="reward-note">
                {r.note}
                {r.status === 'open' ? (
                  <button
                    type="button"
                    className="civic-button is-primary reward-build"
                    data-testid="reward-build"
                    onClick={() => {
                      // 建設メニューの「公共」の褒賞の棚で、その建物を選んだ状態にする（docs/ui-design.md 10.11）
                      s.openMenu('civic');
                      s.setTool({ kind: 'facility', type: r.type });
                    }}
                  >建てる</button>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SmallWindow>
  );
}
