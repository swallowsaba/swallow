import { useT } from '@/i18n/useT';

export function Loading() {
  const t = useT();
  return (
    <div role="status" className="p-8 font-mono text-sm text-muted">
      {t('common.loading')}
      <span aria-hidden className="ml-1 inline-block h-4 w-2 translate-y-[2px] bg-muted" />
    </div>
  );
}
