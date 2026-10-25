import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { SkillValues } from '@/sim/hearing';
import { Icon } from '@/ui/icons/Icon';
import { SmallWindow } from '@/ui/SmallWindow';
import { Rich } from '../Rich';
import type { CityStore } from './cityStore';
import { appealModel } from './councilView';
import './PermitWindows.css';

const format = (n: number): string => n.toLocaleString('ja-JP');

/**
 * 異議申し立ての小さな窓（docs/ui-design.md 10.5）: 申し立てた集団・理由・止まる日数・
 * 取り下げさせる 2 つの方法（追加の譲歩・政治資本 4）と、それぞれの損
 */
export function AppealWindow({ store, stack, shifted, skills }: { store: CityStore; stack: number; shifted: boolean; skills: SkillValues }) {
  const s = useStore(store, useShallow((x) => ({
    id: x.appealId, apps: x.world.applications, capital: x.world.politics.capital, day: Math.floor(x.world.city.day),
    closeWindow: x.closeWindow, openWindow: x.openWindow, concede: x.appealConcede, suppress: x.appealSuppress,
  })));
  const m = s.id ? appealModel(store.getState().world, s.id, skills) : null;
  if (!m) return null;
  const done = m.resolved !== null;
  return (
    <SmallWindow testId="appeal-window" icon="alert" title="異議申し立て" stack={stack} shifted={shifted} onClose={() => s.closeWindow('appeal')} onFront={() => s.openWindow('appeal')}>
      <p className="permit-now appeal-now" data-testid="appeal-now">
        <span className="permit-now-stage">{m.name}に、{m.group}が申し立てた</span>
        <span>
          {done
            ? m.resolved === 'conceded' ? '追加の譲歩で取り下げられた。次の日に着工する' : m.resolved === 'capital' ? '政治資本で抑えた。次の日に着工する' : '28 日が過ぎ、退けられた'
            : `あと ${String(m.daysLeft)} 日、着工が止まる`}
        </span>
      </p>
      <section className="permit-section" aria-label="申し立ての理由">
        <h3 className="view-heading">申し立ての理由</h3>
        <ul className="appeal-reasons" data-testid="appeal-reasons">
          {m.reasons.map((r) => (
            <li key={r.title}><b>{r.title}</b><span className="num">{r.share}</span>%<span className="appeal-how">公聴会で{r.how}</span></li>
          ))}
        </ul>
        <p className="appeal-note">反対率 <b className="num">{m.opposition}</b>%（申し立ての境 {m.border}%）</p>
      </section>
      {done ? null : (
        <>
          <section className="permit-section" aria-label="追加の譲歩" data-testid="appeal-concede">
            <h3 className="view-heading">追加の譲歩で取り下げさせる</h3>
            <p className="appeal-note">公聴会で譲歩しなかった論点に譲歩する。反対率が {m.border}% を下回れば取り下げられる。費用はすぐ取り分ける</p>
            {m.concessions.length === 0 ? <p className="appeal-note">譲歩できる論点が残っていない</p> : null}
            {m.concessions.map((c) => (
              <div key={c.reasonId} className="appeal-issue">
                <h4 className="appeal-issue-title">{c.title}</h4>
                {c.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="permit-preempt-button"
                    data-concession={o.id}
                    disabled={!o.ok}
                    onClick={() => s.concede(m.id, c.reasonId, o.id, skills, performance.now())}
                  >
                    {o.tech ? <span className="hearing-tech">{o.tech}</span> : null}
                    <span>{o.label}</span>
                    <span className="permit-preempt-note">
                      {o.effects.join('・')}・{o.cost > 0 ? `費用 ${format(o.cost)} 資金` : o.cost < 0 ? `費用が ${format(-o.cost)} 資金下がる` : '費用はかからない'}
                      {o.why ? `・${o.why}` : ''}
                    </span>
                    {o.loss ? <span className="permit-preempt-note"><Rich text={o.loss} /></span> : null}
                  </button>
                ))}
              </div>
            ))}
          </section>
          <section className="permit-section" aria-label="政治資本で抑える">
            <h3 className="view-heading">政治資本で抑える</h3>
            <button type="button" className="permit-preempt-button" data-testid="appeal-suppress" disabled={!m.suppress.ok} onClick={() => s.suppress(m.id, performance.now())}>
              <span>政治資本 <b className="num">{m.suppress.cost}</b> を使って抑える（今 {s.capital}）</span>
              <span className="permit-preempt-note">{m.group}の市政への信頼が 2 下がる{m.suppress.ok ? '' : '・政治資本が足りない'}</span>
            </button>
          </section>
          <p className="appeal-note">
            <Icon name="calendar" size={12} />
            何もしなければ、28 日で退けられて着工する（{m.group}の市政への信頼が 1 下がる）
          </p>
        </>
      )}
    </SmallWindow>
  );
}
