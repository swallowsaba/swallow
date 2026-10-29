import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { IssueId } from '@/sim/types';
import { Icon, type IconName } from '@/ui/icons/Icon';
import { useSettings } from '../settingsContext';
import type { CityStore } from './cityStore';
import { CouncilFigure } from './CouncilFigure';
import { councilModel } from './councilView';
import './CouncilWindow.css';

/** 1 人ずつ賛否を出す間隔（docs/ui-design.md 10.4: 0.4 秒ごと） */
export const REVEAL_MS = 400;

const ISSUE_ICON: Record<IssueId, IconName> = {
  afford: 'issue-afford', environment: 'issue-environment', jobs: 'issue-jobs', finance: 'issue-finance', safety: 'issue-safety', traffic: 'issue-traffic', tech: 'issue-tech',
};

/**
 * 議会の採決の画面（docs/ui-design.md 10.4）。大きな窓（幅 720・高さ最大 70%・中央）。開いている間、都市の時間は止まる。
 * 7 人を横に並べ（人の影・名前・主な論点の記号）、各人の下に判断の 1 行。上に賛成の数と「可決（4 以上）」「否決」。
 * 採決の前は見込み（各人の向きと効いている項）と「議員を説得する」。採決の後は 1 人ずつ 0.4 秒ごとに賛否が出る（動きを減らす設定では一度に）
 */
export function CouncilWindow({ store }: { store: CityStore }) {
  const s = useStore(store, useShallow((x) => ({ id: x.councilId, apps: x.world.applications, capital: x.world.politics.capital, leave: x.leaveCouncil, persuade: x.persuade })));
  const { reduceMotion } = useSettings();
  const world = store.getState().world;
  const m = s.id ? councilModel(world, s.id, store.getState().terrain) : null;
  const [pick, setPick] = useState<string | null>(null);
  const total = m?.seats.length ?? 0;
  const result = m?.mode === 'result';
  const [shown, setShown] = useState(result && !reduceMotion ? 0 : total);
  useEffect(() => {
    if (!result || reduceMotion) {
      setShown(total);
      return undefined;
    }
    setShown(0);
    const timer = setInterval(() => setShown((n) => (n >= total ? n : n + 1)), REVEAL_MS);
    return () => clearInterval(timer);
  }, [s.id, result, reduceMotion, total]);
  if (!m) return null;
  const done = shown >= total;
  const yesShown = m.seats.slice(0, shown).filter((x) => x.yes).length;
  const chosen = m.seats.find((x) => x.id === (pick ?? m.persuade?.used ?? null)) ?? null;
  return (
    <div className="council-backdrop">
      <section className="council" role="dialog" aria-modal="true" aria-labelledby="council-title" data-testid="council-window" data-mode={m.mode} data-label-block>
        <header className="council-head">
          <span className="council-icon"><Icon name="vote" size={20} /></span>
          <h2 id="council-title" className="council-title">{m.title}</h2>
          <span className="council-stat" title="賛成の数">
            賛成 <b className="num" data-testid="council-yes">{result ? yesShown : m.yes}</b><span className="council-unit">/ {total}</span>
          </span>
          <span className={`council-verdict${done ? (m.passed ? ' is-pass' : ' is-fail') : ''}`} data-testid="council-verdict">
            {done ? m.verdict : '採決中'}
          </span>
          <button type="button" className="council-close" onClick={s.leave} title="閉じる" aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </header>
        <ol className="council-seats" aria-label="議員 7 人" data-testid="council-seats">
          {m.seats.map((seat, i) => {
            const open = i < shown;
            const vote = open ? (seat.yes ? 'yes' : 'no') : 'wait';
            const label = result ? (seat.yes ? '賛成' : '反対') : seat.yes ? '賛成の見込み' : '反対の見込み';
            return (
              <li key={seat.id} className={`council-seat is-${vote}${chosen?.id === seat.id ? ' is-picked' : ''}`} data-member={seat.id} data-vote={vote}>
                <button type="button" className="council-seat-button" onClick={() => setPick(seat.id)} aria-pressed={chosen?.id === seat.id} title={seat.profile}>
                  <CouncilFigure icon={seat.icon} />
                  <span className="council-name">{seat.name}</span>
                  <span className="council-issue"><Icon name={ISSUE_ICON[seat.main]} size={14} />{seat.mainName}</span>
                  <span className="council-vote" data-testid={`council-vote-${seat.id}`}>{open ? label : '…'}</span>
                </button>
                <p className="council-line" data-testid={`council-line-${seat.id}`}>{open ? seat.line : ''}</p>
                {seat.persuaded ? <span className="council-persuaded">説得した</span> : null}
              </li>
            );
          })}
        </ol>
        <footer className="council-foot">
          {chosen ? (
            <p className="council-profile" data-testid="council-profile"><b>{chosen.name}</b>{chosen.profile}</p>
          ) : (
            <p className="council-profile is-hint">議員を押すと、人柄が出る</p>
          )}
          {m.persuade ? (
            <div className="council-persuade">
              <span className="council-days">議会の日まで <b className="num">{m.daysLeft}</b> 日（議会は 14 日ごと）</span>
              {m.persuade.used ? (
                <span className="council-persuade-note" data-testid="council-persuaded">この申請では説得した（1 件に 1 人まで）</span>
              ) : (
                <button
                  type="button"
                  className="council-persuade-button"
                  data-testid="council-persuade"
                  disabled={!chosen || !m.persuade.ok}
                  onClick={() => { if (chosen && m.id) s.persuade(m.id, chosen.id); }}
                >
                  {chosen ? `${chosen.name}を説得する` : '議員を選んで説得する'}（政治資本 <b className="num">{m.persuade.cost}</b>・今 {s.capital}）
                </button>
              )}
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
