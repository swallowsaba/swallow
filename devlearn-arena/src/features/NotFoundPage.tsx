import { Link } from 'react-router-dom';
import { useT } from '@/i18n/useT';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold">{t('notfound.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('notfound.body')}</p>
      <Link
        to="/map"
        className="mt-4 inline-block border border-accent px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent hover:text-void"
      >
        {t('notfound.cta')}
      </Link>
    </div>
  );
}
