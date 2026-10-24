import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '@/ui/icons/Icon';
import { SmallWindow } from '@/ui/SmallWindow';
import { issuesOf, type SkillValues } from '@/sim/hearing';
import { handsModel } from './hearingView';
import type { CityStore } from './cityStore';
import { dateText, permitDetail, permitRows, siteFocus, type ObjectionRow, type PermitRow, type StageMark } from './permitView';
import './PermitWindows.css';

/**
 * 許認可の一覧（docs/ui-design.md 10.1）と申請 1 件の詳細（10.2）。どちらも小さな窓。
 * 一覧は 1 行ずつ: 名前・場所・8 段の進みの印（今の段が金）・反対率・待っている事。行を押すと詳細、場所の印を押すと敷地へ寄る。
 */

const format = (n: number): string => n.toLocaleString('ja-JP');

/** 8 段の小さな進みの印 */
function Marks({ marks, wide = false }: { marks: StageMark[]; wide?: boolean }) {
  if (wide) {
    return (
      <ol className="permit-stages" data-testid="permit-stages">
        {marks.map((m) => (
          <li key={m.stage} className={`permit-stage is-${m.state}`} data-stage={m.stage}>
            <span className="permit-stage-dot" aria-hidden="true" />
            <span className="permit-stage-name">{m.label}</span>
            <span className="permit-stage-day">{m.state === 'skipped' ? '省いた' : m.day !== undefined ? dateText(m.day) : ''}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <span className="permit-marks" aria-label={`段階: ${marks.find((m) => m.state === 'now')?.label ?? ''}`}>
      {marks.map((m) => <span key={m.stage} className={`permit-mark is-${m.state}`} title={m.label} />)}
    </span>
  );
}

/** 反対率（数と短い棒） */
function Opposition({ value }: { value: number }) {
  const tone = value >= 50 ? 'bad' : value >= 20 ? 'warn' : 'ok';
  return (
    <span className={`permit-opp is-${tone}`} title="反対率">
      <span className="permit-opp-bar" aria-hidden="true"><span style={{ width: `${String(Math.min(100, value))}%` }} /></span>
      <span className="num">{value}</span>
      <span className="permit-unit">%</span>
    </span>
  );
}

export function PermitListWindow({ store, stack, shifted }: { store: CityStore; stack: number; shifted: boolean }) {
  const s = useStore(store, useShallow((x) => ({
    apps: x.world.applications, day: Math.floor(x.world.city.day), closeWindow: x.closeWindow, openWindow: x.openWindow, openPermit: x.openPermit, focusAt: x.focusAt,
  })));
  const [showFinished, setShowFinished] = useState(false);
  const world = store.getState().world;
  const rows = permitRows(world);
  const goSite = (id: string): void => {
    const a = world.applications.find((x) => x.id === id);
    const f = a ? siteFocus(a, world) : null;
    if (f) s.focusAt(f.at, f.size);
  };
  const row = (r: PermitRow) => (
    <li key={r.id} className={`permit-row${r.mayor ? ' is-mayor' : ''}`} data-testid={`permit-row-${r.id}`} data-stage={r.stage}>
      <button type="button" className="permit-row-main" onClick={() => s.openPermit(r.id)} title="申請の詳細を開く">
        <span className="permit-row-top">
          <span className="permit-row-name">{r.name}</span>
          <span className="permit-row-place">{r.place}</span>
        </span>
        <span className="permit-row-mid">
          <Marks marks={r.marks} />
          <span className="permit-row-stage">{r.stageLabel}</span>
          <Opposition value={r.opposition} />
        </span>
        <span className="permit-row-wait">{r.waiting}</span>
      </button>
      <button type="button" className="permit-row-pin" onClick={() => goSite(r.id)} title="敷地へ寄る" aria-label={`${r.name}の敷地へ寄る`}>
        <Icon name="pin" size={16} />
      </button>
    </li>
  );
  return (
    <SmallWindow testId="permits-window" icon="permit" title="許認可" stack={stack} shifted={shifted} onClose={() => s.closeWindow('permits')} onFront={() => s.openWindow('permits')}>
      <p className="permit-summary">
        審議中 <b className="num">{rows.open.filter((r) => r.stage !== 'construction').length}</b> 件（6 件まで）・工事中 <b className="num">{rows.open.filter((r) => r.stage === 'construction').length}</b> 件
      </p>
      {rows.open.length === 0 ? (
        <p className="permit-empty">申請は無い。IT 施設を置くと申請になり、審議を経て着工する</p>
      ) : (
        <ul className="permit-rows" data-testid="permit-rows">{rows.open.map(row)}</ul>
      )}
      {rows.finished.length > 0 ? (
        <section className="permit-finished">
          <button type="button" className="permit-finished-head" aria-expanded={showFinished} onClick={() => setShowFinished(!showFinished)}>
            <Icon name={showFinished ? 'down' : 'speed1'} size={14} />
            終わった申請（<span className="num">{rows.finished.length}</span> 件・1 任期分）
          </button>
          {showFinished ? <ul className="permit-rows is-finished">{rows.finished.map(row)}</ul> : null}
        </section>
      ) : null}
    </SmallWindow>
  );
}

/**
 * 反対率の内訳（理由ごとの割合の棒・反対する集団・多い層）。理由を押すと、強さの元になった模擬の値と、
 * その値のヒートマップ（ある物だけ）を出し、敷地へ寄る（docs/ui-design.md 10.2 の 2・3）
 */
function Objections({ rows, onPick }: { rows: ObjectionRow[]; onPick: (row: ObjectionRow) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="permit-reasons" data-testid="permit-reasons">
      {rows.map((r) => (
        <li key={r.reasonId} className={`permit-reason${open === r.reasonId ? ' is-open' : ''}`} data-reason={r.reasonId}>
          <button
            type="button"
            className="permit-reason-main"
            aria-expanded={open === r.reasonId}
            onClick={() => {
              const next = open === r.reasonId ? null : r.reasonId;
              setOpen(next);
              if (next) onPick(r);
            }}
          >
            <span className="permit-reason-top">
              <span className="permit-reason-title">{r.title}</span>
              <span className="permit-reason-bar" aria-hidden="true"><span style={{ width: `${String(Math.min(100, r.share))}%` }} /></span>
              <span className="num">{r.share}</span>
              <span className="permit-unit">%</span>
            </span>
            <span className="permit-reason-who">
              {r.group}
              {r.layer ? <span className="permit-reason-layer">多いのは{r.layer}</span> : null}
            </span>
          </button>
          {open === r.reasonId ? (
            <p className="permit-reason-basis" data-testid="permit-reason-basis">
              {r.basis}
              {r.heat ? <span className="permit-reason-heat">都市の上に、その値の地図を重ねた</span> : null}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * 先回りの譲歩（反対の受付の間だけ。docs/game-design.md 17.1・docs/ui-design.md 10.2 の 4）。
 * 論点になる理由（受付の終わりに 5% 以上）ごとに、出せる譲歩を並べる。出した論点は、公聴会でその手を使ったことになる
 */
function Preempt({ store, id, skills }: { store: CityStore; id: string; skills: SkillValues }) {
  const world = store.getState().world;
  const app = world.applications.find((a) => a.id === id);
  if (app?.stage !== 'objection') return null;
  const rows = issuesOf(app).flatMap((o) => {
    const h = handsModel(world, app, o.reasonId, skills);
    return h ? [{ o, h }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <section className="permit-section" aria-label="先回りの譲歩" data-testid="permit-preempt">
      <h3 className="view-heading">先回りの譲歩</h3>
      <p className="permit-note">公聴会の前に、申請の中身を変えて反対に答えられる。変えた中身は完成した建物にずっと残る</p>
      <ul className="permit-preempt">
        {rows.map(({ o, h }) => (
          <li key={o.reasonId} className="permit-preempt-row">
            <span className="permit-preempt-title">{h.title}</span>
            {h.used ? (
              <span className="permit-preempt-done">譲歩した</span>
            ) : (
              h.concessions.map((c) => (
                <button key={c.id} type="button" className="permit-preempt-button" data-concession={c.id} disabled={!c.ok} onClick={() => store.getState().playHand(id, o.reasonId, { kind: 'concede', concessionId: c.id }, skills)}>
                  <span>{c.label}</span>
                  <span className="permit-preempt-note">{c.effects.join('・')}{c.cost > 0 ? `・費用 ${c.cost.toLocaleString('ja-JP')}` : ''}{c.why ? `・${c.why}` : ''}</span>
                </button>
              ))
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PermitDetailWindow({ store, stack, shifted, skills = {} }: { store: CityStore; stack: number; shifted: boolean; skills?: SkillValues }) {
  const s = useStore(store, useShallow((x) => ({
    id: x.permitId, apps: x.world.applications, day: Math.floor(x.world.city.day), closeWindow: x.closeWindow, openWindow: x.openWindow, focusAt: x.focusAt, withdraw: x.withdraw,
    setOverlay: x.setOverlay, openHearing: x.openHearing,
  })));
  const [confirm, setConfirm] = useState(false);
  // 確かめの段は、窓の下の端にあっても見えるように巻く
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirm) confirmRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [confirm]);
  const world = store.getState().world;
  const d = s.id ? permitDetail(world, s.id) : null;
  if (!d) return null;
  const goSite = (): void => {
    const a = world.applications.find((x) => x.id === d.id);
    const f = a ? siteFocus(a, world) : null;
    if (f) s.focusAt(f.at, f.size);
  };
  return (
    <SmallWindow testId="permit-window" icon="permit" title={d.name} stack={stack} shifted={shifted} onClose={() => s.closeWindow('permit')} onFront={() => s.openWindow('permit')}>
      <div className="permit-head">
        <button type="button" className="permit-place" onClick={goSite} title="敷地へ寄る">
          <Icon name="pin" size={14} />
          {d.place}
        </button>
        <span className="permit-filed">申請 {d.filedDate}</span>
      </div>
      <p className="permit-now" data-testid="permit-now">
        <span className="permit-now-stage">{d.stageLabel}</span>
        {d.waiting ? <span>{d.waiting}</span> : null}
      </p>
      {d.stage === 'hearing' ? (
        <button type="button" className="permit-hearing" data-testid="permit-open-hearing" onClick={() => s.openHearing(d.id)}>
          <Icon name="civic" size={16} />
          公聴会を開く
        </button>
      ) : null}
      <Marks marks={d.marks} wide />
      <dl className="permit-facts">
        {d.canWithdraw || d.stage === 'construction' ? (
          <>
            <dt>完成まで</dt>
            <dd><span className="num">{d.toComplete}</span> 日の見込み{d.canWithdraw && !d.exception && (d.stage === 'zoning' || d.stage === 'filed' || d.stage === 'objection') ? '（反対が少なければ公聴会を省く）' : ''}</dd>
          </>
        ) : null}
        <dt>費用</dt>
        <dd><span className="num">{format(d.reserved)}</span> 資金を{d.wallet}から取り分けた{d.canWithdraw ? '（否決・取り下げで全て戻る）' : ''}</dd>
        {d.exception ? (
          <>
            <dt>用途の例外</dt>
            <dd>住宅に接する敷地。公聴会を省けない</dd>
          </>
        ) : null}
      </dl>
      <section className="permit-section" aria-label="反対率">
        <h3 className="view-heading">反対率</h3>
        <div className="permit-opp-big">
          <span className="num" data-testid="permit-opposition">{d.opposition}</span>
          <span className="permit-unit">%</span>
          <span className="permit-opp-note">{d.stage === 'zoning' || d.stage === 'filed' ? '反対の受付で、近くの住民と事業者の声が立つ' : d.objections.length === 0 ? '反対の声は立っていない' : d.stage === 'objection' ? '受付の間、日ごとに上がる' : ''}</span>
        </div>
        {d.objections.length > 0 ? (
          <Objections
            rows={d.objections}
            onPick={(r) => {
              if (r.heat) s.setOverlay(r.heat);
              goSite();
            }}
          />
        ) : null}
      </section>
      <Preempt store={store} id={d.id} skills={skills} />
      {d.gains.length > 0 ? (
        <section className="permit-section" aria-label="通った時の得">
          <h3 className="view-heading">通った時の得</h3>
          <dl className="permit-facts">
            {d.gains.map((g) => (
              <div key={g.label} className="permit-fact">
                <dt>{g.label}</dt>
                <dd>{g.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {d.canWithdraw ? (
        confirm ? (
          <div className="permit-confirm" role="group" aria-label="取り下げの確認" ref={confirmRef}>
            <span>取り下げると、取り分けた <b className="num">{format(d.refund)}</b> 資金が全て戻る</span>
            <button type="button" className="confirm-yes" data-testid="permit-withdraw-yes" onClick={() => { s.withdraw(d.id, performance.now()); setConfirm(false); }}>取り下げる</button>
            <button type="button" className="confirm-no" onClick={() => setConfirm(false)}>やめる</button>
          </div>
        ) : (
          <button type="button" className="permit-withdraw" data-testid="permit-withdraw" onClick={() => setConfirm(true)}>
            <Icon name="close" size={14} />
            取り下げる
          </button>
        )
      ) : null}
    </SmallWindow>
  );
}
