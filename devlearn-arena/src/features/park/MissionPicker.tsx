import { useEffect, useMemo, useRef, useState } from 'react';
import { getChapter, getTrack } from '@/content/catalog';
import { allMissions, mainMissions, type MissionEntry } from '@/engines/lesson/registry';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';

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
  // 既定は本編だけ。値だけ違う繰り返し（反復演習）は、頼まれたときだけ出す
  const [withRepeats, setWithRepeats] = useState(false);
  const entries = useMemo(() => (withRepeats ? allMissions() : mainMissions()), [withRepeats]);
  const current = allMissions().find((m) => m.id === currentId);

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
        className="ui-btn ui-btn-quiet h-8 max-w-[26rem] truncate px-3 text-[13px]"
      >
        {current?.title ?? t('park.mission')}
      </button>
    );
  }

  return (
    <div
      className="ui fixed inset-0 z-50 grid place-items-start justify-center bg-[rgba(23,22,26,0.5)] p-4 pt-16 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('park.allMissions')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div className="ui-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--u-line)] p-4">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder={t('park.search')}
            aria-label={t('park.search')}
            className="w-full rounded-lg border border-[var(--u-line-strong)] bg-[var(--u-card)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
            className="ui-btn ui-btn-quiet h-9 shrink-0 px-4 text-[13px]"
          >
            {t('editor.cancel')}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--u-line)] px-4 py-2 text-[12px] text-[var(--u-text-2)]">
          <p>{t('park.searchHits', { a: Math.min(hits.length, LIMIT), b: hits.length })}</p>
          <label className="flex items-center gap-1 font-bold">
            <input
              type="checkbox"
              checked={withRepeats}
              onChange={(e) => {
                setWithRepeats(e.target.checked);
              }}
            />
            {t('park.withRepeats')}
          </label>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto bg-[var(--u-bg)] px-3 py-3">
          {hits.slice(0, LIMIT).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(m.id);
                  setOpen(false);
                }}
                className={`ui-option mb-1.5 items-center ${m.id === currentId ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : ''}`}
              >
                <span className="ui-key" aria-hidden>
                  {cleared(m.id) ? <Icon name="check" size={12} strokeWidth={2.6} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{m.title}</span>
                  <span className="block truncate text-[11px] text-[var(--u-text-3)]">{label(m)}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--u-text-3)]">
                  {m.kind === 'boss' ? t('park.kind.boss') : t('park.kind.training')} ·{' '}
                  {t('park.steps', { n: m.stepCount })}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 ? (
            <li className="px-3 py-4 text-[13px] text-[var(--u-text-3)]">{t('park.searchEmpty')}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
