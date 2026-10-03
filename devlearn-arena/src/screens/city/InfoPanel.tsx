import { Icon } from '@/ui/icons/Icon';
import type { DomainId } from '@/city/types';
import type { PanelModel } from './infoPanelModel';
import './InfoPanel.css';

/**
 * 情報パネル（docs/ui-design.md 5 章: 右、幅 360、高さは内容に応じて最大 70%。建物を選んだ時だけ）。
 * 上から: 名前・種類・レベル / 状態 / 対応する分野とスキル / ここで学ぶ / ミッション / アップグレード。
 */

const format = (n: number): string => n.toLocaleString('ja-JP');

export function InfoPanel({ model, onClose, onLesson, onLibrary, onUpgrade }: {
  model: PanelModel | null;
  onClose: () => void;
  /** 施設を次のレベルに上げる（資金で買う） */
  onUpgrade?: (facilityId: string) => void;
  /** 「ここで学ぶ」のレッスンを始める（どのレッスンもここから始められる） */
  onLesson?: (id: string) => void;
  /** 学習ライブラリで、この施設の分野を全部見る */
  onLibrary?: (domain: DomainId | null) => void;
}) {
  if (!model) return null;
  // 分野が 2 つ以上で理由が同じ（どちらも記録が無い など）なら、理由は 1 度だけ書く
  const reasons = model.kind === 'facility' ? [...new Set(model.domains.map((d) => d.because))] : [];
  const sharedBecause = model.kind === 'facility' && model.domains.length > 1 && reasons.length === 1 ? reasons[0] ?? '' : '';
  return (
    <aside className="info" aria-label={`${model.name}の情報`} data-testid="info-panel">
      <header className="info-head">
        <div className="info-titles">
          <span className="info-type">{model.typeLabel}</span>
          <h2 className="info-name">{model.name}</h2>
        </div>
        <div className="info-level" title="レベル">
          <span className="info-level-label">Lv</span>
          <span className="num info-level-value">{model.level}</span>
        </div>
        <button type="button" className="info-close" onClick={onClose} title="閉じる（Esc）" aria-label="閉じる">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      {model.levelNote ? <p className="info-note">{model.levelNote}</p> : null}

      <div className={`info-state is-${model.condition.tone}`} data-testid="info-state">
        <span className="info-state-dot" />
        {model.condition.text}
      </div>

      {model.kind === 'building' ? (
        <section className="info-section">
          <p className="info-line">{model.people}</p>
          <p className="info-line is-sub">{model.growth}</p>
        </section>
      ) : null}

      {model.kind === 'facility' && model.effect ? (
        <section className="info-section">
          <p className="info-line">{model.effect}</p>
        </section>
      ) : null}

      {model.kind === 'facility' && model.domains.length > 0 ? (
        <>
          <section className="info-section" aria-label="対応する分野">
            <h3 className="info-heading">対応する分野</h3>
            {model.domains.map((d) => (
              <div key={d.id} className="info-domain">
                <div className="info-domain-row">
                  <span className="info-domain-swatch" style={{ background: d.color }} />
                  <span className="info-domain-name">{d.name}</span>
                  <span className="info-domain-stage">{d.stageName}</span>
                  <span className="num info-domain-value">{d.value}</span>
                </div>
                <div className="info-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.value} aria-label={`${d.name}のスキル`}>
                  <span style={{ width: `${String(d.value)}%`, background: d.color }} />
                </div>
                {d.because && !sharedBecause ? <p className="info-line is-sub">{d.because}</p> : null}
              </div>
            ))}
            {sharedBecause ? <p className="info-line is-sub">{sharedBecause}</p> : null}
          </section>

          <section className="info-section" aria-label="ここで学ぶ">
            <h3 className="info-heading">ここで学ぶ</h3>
            <ol className="info-lessons" data-testid="info-lessons">
              {model.lessons.map((l) => (
                <li key={l.id}>
                  <button type="button" className={`info-lesson is-${l.status}`} onClick={() => onLesson?.(l.id)} title={`「${l.title}」を始める`}>
                    <span className="info-lesson-level">{l.level}</span>
                    <span className="info-lesson-title">{l.title}</span>
                    {l.status === 'completed' ? <span className="info-lesson-done" title="修了"><Icon name="check" size={14} /></span> : null}
                    {l.status === 'in-progress' ? <span className="info-lesson-doing">学習中</span> : null}
                    <span className="info-lesson-go"><Icon name="start" size={12} /></span>
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="info-action" data-testid="info-library" onClick={() => onLibrary?.(model.libraryDomain)}>
              <Icon name="learn" size={16} />
              学習ライブラリで全部見る
            </button>
          </section>

          {model.missions.length > 0 ? (
            <section className="info-section" aria-label="ミッション">
              <h3 className="info-heading">ミッション</h3>
              <ul className="info-missions">
                {model.missions.map((m) => (
                  <li key={m}>
                    <Icon name="mission" size={14} />
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {model.upgrade ? (
            <section className="info-section" aria-label="アップグレード">
              <h3 className="info-heading">アップグレード</h3>
              <div className="info-upgrade">
                <span className="info-upgrade-title">{model.upgrade.title}</span>
                <span className="info-upgrade-adds">{model.upgrade.adds}。周りの区画の育ちが良くなる</span>
                <span className="info-upgrade-cost">
                  <Icon name="funds" size={14} />
                  <span className="num">{format(model.upgrade.cost)}</span>
                  <span className="info-unit">資金</span>
                </span>
              </div>
              {/* 条件そのものは名前の下（Lv の次までの条件）に書いてある。ここは、まだ満たしていない物だけを並べる */}
              {model.upgrade.ok ? (
                <button type="button" className="info-action is-primary" data-testid="info-upgrade" onClick={() => onUpgrade?.(model.id)}>
                  <Icon name="upgrade" size={16} />
                  {model.upgrade.title} に上げる
                </button>
              ) : (
                <ul className="info-blocked" data-testid="info-upgrade-blocked">
                  {model.upgrade.blocked.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
