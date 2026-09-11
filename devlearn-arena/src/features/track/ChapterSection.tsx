import { Glossed } from '@/ui/Term';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isCoreLesson } from '@/content/catalog';
import type { Chapter, LessonMeta } from '@/content/types';
import { useT } from '@/i18n/useT';
import { Badge } from '@/ui/components/Badge';

interface Props {
  chapter: Chapter;
  cleared: (id: string) => boolean;
}

const kindKey = {
  concept: 'lesson.kind.concept',
  drill: 'lesson.kind.drill',
  challenge: 'lesson.kind.challenge',
  boss: 'lesson.kind.boss',
} as const;

/** 遊べるものは学習画面へ直接、まだのものは目次の説明ページへ送る */
function lessonHref(l: LessonMeta): string {
  return l.status === 'ready'
    ? `/?mission=${encodeURIComponent(l.id)}`
    : `/lesson/${l.trackId}/${l.chapterId.split('/')[1] ?? ''}/${l.slug}`;
}

/** 一度に開く演習の数。多すぎる一覧は読まれないので、少しずつ出す */
const PAGE = 12;

function LessonRow({ lesson, done }: { lesson: LessonMeta; done: boolean }) {
  const t = useT();
  const boss = lesson.kind === 'boss';
  return (
    <Link
      to={lessonHref(lesson)}
      className={`flex flex-wrap items-center gap-4 border-l-4 bg-cream px-5 py-4 transition-colors hover:bg-cream-dark ${
        boss ? 'border-[var(--warn)]' : 'border-wood-dark'
      }`}
    >
      <span className="flex-1 text-lg">{lesson.title}</span>
      {done ? (
        <Badge tone="ok" size="sm">
          {t('track.cleared')}
        </Badge>
      ) : null}
      <Badge tone={lesson.status === 'ready' ? 'accent' : 'muted'} size="sm">
        {t(lesson.status === 'ready' ? 'map.ready' : 'map.planned')}
      </Badge>
      <Badge tone={boss ? 'warn' : 'muted'} size="sm">
        {t(kindKey[lesson.kind])}
      </Badge>
      <span className="font-mono text-sm text-ink-soft">
        {t('track.minutes', { n: lesson.minutes })}
      </span>
    </Link>
  );
}

/**
 * 章ひとつ分。
 *
 * 本編（目次に元から書いてあるもの）と、値違いの反復演習を分けて出す。
 * 演習は数が多いので、畳んでおいて少しずつ開く。
 */
export function ChapterSection({ chapter, cleared }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const core = chapter.lessons.filter((l) => isCoreLesson(l.id));
  const drills = chapter.lessons.filter((l) => !isCoreLesson(l.id));
  const doneDrills = drills.filter((l) => cleared(l.id)).length;
  const next = drills.find((l) => !cleared(l.id));

  return (
    <section id={chapter.id.replace('/', '-')}>
      <div className="flex items-baseline gap-5">
        <span className="title text-5xl text-[var(--gold-dark)]/40">
          {String(chapter.no).padStart(2, '0')}
        </span>
        <div>
          <h2 className="title text-2xl">{chapter.title}</h2>
          <p className="mt-1 text-base text-ink-soft">
            <Glossed text={chapter.summary} />
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {core.map((l) => (
          <li key={l.id}>
            <LessonRow lesson={l} done={cleared(l.id)} />
          </li>
        ))}
      </ul>

      {drills.length > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-[var(--cream-dark)]">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                setOpen((v) => !v);
              }}
              aria-expanded={open}
              className="knob px-4 py-1.5 text-sm font-bold"
            >
              {open ? t('track.drillsHide') : t('track.drillsShow')}
            </button>
            <span className="text-base font-bold">
              {t('track.drills', { a: doneDrills, b: drills.length })}
            </span>
            {next ? (
              <Link to={lessonHref(next)} className="sign ml-auto px-5 py-2 text-base font-extrabold">
                {t('track.drillNext')}
              </Link>
            ) : (
              <span className="ml-auto text-base font-bold text-[var(--ok)]">
                {t('track.drillsDone')}
              </span>
            )}
          </div>

          {open ? (
            <div className="border-t-4 border-wood-dark p-3">
              <ul className="flex flex-col gap-2">
                {drills.slice(0, shown).map((l) => (
                  <li key={l.id}>
                    <LessonRow lesson={l} done={cleared(l.id)} />
                  </li>
                ))}
              </ul>
              {shown < drills.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setShown((n) => n + PAGE);
                  }}
                  className="knob mt-3 w-full px-4 py-2 text-sm font-bold"
                >
                  {t('track.drillMore', { n: drills.length - shown })}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
