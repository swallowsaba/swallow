import { useEffect, useMemo, useRef, useState } from 'react';
import { getChapter, getTrack } from '@/content/catalog';
import { allMissions, type MissionEntry } from '@/engines/lesson/registry';
import { useT } from '@/i18n/useT';

interface Props {
  currentId: string;
  cleared: (id: string) => boolean;
  onPick: (id: string) => void;
}

/** 一度に出す件数。絞り込めば十分たどり着けるので、全部は並べない */
const LIMIT = 60;

function label(entry: MissionEntry): string {
  const chapter = getChapter(entry.chapterId);
  const track = getTrack(entry.chapterId.split('/')[0] ?? '');
  return `${track?.title ?? ''} ${String(chapter?.no ?? 0).padStart(2, '0')} ${chapter?.title ?? ''}`;
}

/** 空白区切りの語を全て含むか */
function matches(entry: MissionEntry, query: string): boolean {
  if (query.trim() === '') return true;
  const haystack = `${entry.title} ${entry.id} ${label(entry)}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => haystack.includes(w));
}

/**
 * 任務を選ぶ窓。
 *
 * 数が多いので、並べるのではなく絞り込んで選ぶ形にする。
 * 章の名前でも、任務の名前でも、id の一部でも引ける。
 */
export function MissionPicker({ currentId, cleared, onPick }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = allMissions();
  const current = entries.find((m) => m.id === currentId);

  const hits = useMemo(() => entries.filter((m) => matches(m, query)), [entries, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-label={t('park.pickMission', { title: current?.title ?? '' })}
        className="knob max-w-[26rem] truncate px-3 py-2 text-sm font-bold"
      >
        {current?.title ?? t('park.mission')}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-[rgb(0_0_0/45%)] p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label={t('park.allMissions')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div className="bevel flex max-h-[80vh] w-full max-w-2xl flex-col bg-cream">
        <div className="flex items-center gap-3 border-b-4 border-wood-dark p-4">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder={t('park.search')}
            aria-label={t('park.search')}
            className="w-full border-4 border-wood-dark bg-white px-3 py-2 text-base"
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
            className="knob shrink-0 px-4 py-2 text-sm font-bold"
          >
            {t('editor.cancel')}
          </button>
        </div>

        <p className="px-4 py-2 text-sm text-ink-soft">
          {t('park.searchHits', { a: Math.min(hits.length, LIMIT), b: hits.length })}
        </p>

        <ul className="scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {hits.slice(0, LIMIT).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 border-2 px-3 py-2 text-left text-base ${
                  m.id === currentId
                    ? 'border-wood-dark bg-gold'
                    : 'border-[var(--cream-dark)] bg-white/60 hover:border-wood-dark'
                }`}
              >
                <span aria-hidden>{cleared(m.id) ? '✓' : '・'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.title}</span>
                  <span className="block truncate text-xs text-ink-soft">{label(m)}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-soft">
                  {m.kind === 'boss' ? t('park.kind.boss') : t('park.kind.training')} ·{' '}
                  {t('park.steps', { n: m.stepCount })}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 ? (
            <li className="px-3 py-4 text-sm text-ink-soft">{t('park.searchEmpty')}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
