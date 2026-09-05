import { useT } from '@/i18n/useT';

export function Loading() {
  const t = useT();
  return (
    <div role="status" className="p-10 font-mono text-lg text-muted">
      {t('common.loading')}
      <span aria-hidden className="ml-2 inline-block h-5 w-2.5 translate-y-[3px] bg-accent" />
    </div>
  );
}
