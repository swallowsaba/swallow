import { useEffect, useMemo, useRef } from 'react';
import { diagramOf } from '@/engines/lesson/diagram';
import type { LessonDefinition } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Glossed } from '@/ui/Term';
import { PrerequisiteNote } from './PrerequisiteNote';

interface Props {
  mission: LessonDefinition;
  /** まだ終えていない前提の任務 */
  prerequisites?: readonly { id: string; title: string }[];
  onStart: () => void;
  onSwitch?: (id: string) => void;
}

/**
 * 任務を開いたとき、課題の前に全画面で出す「学ぶ」画面。
 *
 * いきなり課題から始めると、知識ゼロの人は何をしているのか分からないまま手を動かすことになる。
 * 一行の要約・学ぶ理由・先に知っておく語・使うコマンドを読んでから、自分で「はじめる」を押す。
 */
export function IntroScreen({ mission, prerequisites = [], onStart, onSwitch }: Props) {
  const t = useT();
  const startRef = useRef<HTMLButtonElement>(null);
  const { intro } = mission;
  const diagram = useMemo(() => diagramOf(mission), [mission]);

  useEffect(() => {
    startRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onStart();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onStart]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[rgba(44,29,16,0.65)] p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        className="mx-auto flex max-w-3xl flex-col gap-5 border-4 border-wood-dark bg-cream p-6 shadow-lg sm:p-8"
      >
        <header className="flex flex-col gap-2">
          <span className="sign w-fit px-4 py-1 text-sm font-extrabold">{t('intro.label')}</span>
          <h2 id="intro-title" className="title text-3xl leading-tight">
            {mission.title}
          </h2>
          <p className="text-xl font-bold leading-snug">
            <Glossed text={intro.summary} />
          </p>
        </header>

        {onSwitch ? <PrerequisiteNote prerequisites={prerequisites} onSwitch={onSwitch} /> : null}

        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-extrabold text-ink-soft">{t('intro.why')}</h3>
          <p className="text-base leading-relaxed">
            <Glossed text={intro.why} />
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold text-ink-soft">{t('intro.concepts')}</h3>
          <dl className="grid gap-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            {intro.concepts.map((c) => (
              <div key={c.term} className="contents">
                <dt className="plate px-3 py-1.5 text-sm font-extrabold">{c.term}</dt>
                <dd className="border-l-4 border-[var(--cream-dark)] px-3 py-1.5 text-sm leading-relaxed">
                  {c.plain}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold text-ink-soft">{t('intro.commands')}</h3>
          <ul className="flex flex-col gap-1.5">
            {intro.commands.map((c) => (
              <li key={c.command} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <code className="w-fit whitespace-pre-wrap bg-[var(--wood-dark)] px-2 py-1 font-mono text-sm text-cream">
                  {c.command}
                </code>
                <span className="text-sm">
                  <Glossed text={c.means} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {diagram === null ? null : (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-extrabold text-ink-soft">{t('intro.diagram')}</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
              {diagram.legend.map((line) => (
                <li key={line}>
                  <Glossed text={line} />
                </li>
              ))}
            </ul>
            <h4 className="text-xs font-extrabold text-ink-soft">{t('intro.diagramThis')}</h4>
            <ul className="flex flex-col gap-0.5 border-l-4 border-[var(--cream-dark)] px-3 py-1 font-mono text-xs leading-relaxed">
              {diagram.lines.map((line, i) => (
                <li key={`${String(i)}-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-wrap items-center gap-4 border-t-2 border-[var(--cream-dark)] pt-4">
          <button
            ref={startRef}
            type="button"
            onClick={onStart}
            className="sign px-8 py-3 text-lg font-extrabold"
          >
            {t('intro.start')}
          </button>
          <span className="text-sm text-ink-soft">{t('intro.steps', { n: mission.steps.length })}</span>
        </footer>
      </div>
    </div>
  );
}
