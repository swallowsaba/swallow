import { Link } from 'react-router-dom';
import { useT } from '@/i18n/useT';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="max-w-md">
      <h1 className="title text-5xl">{t('notfound.title')}</h1>
      <p className="mt-3 text-lg text-ink-soft">{t('notfound.body')}</p>
      <Link
        to="/map"
        className="mt-6 inline-block border-2 border-wood-dark px-6 py-3 font-mono text-base text-[var(--gold-dark)] hover:bg-gold hover:text-ink"
      >
        {t('notfound.cta')}
      </Link>
    </div>
  );
}
