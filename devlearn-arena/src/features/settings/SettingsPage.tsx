import { useRef, useState } from 'react';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { exportSaveJson, importSaveJson, resetAll } from '@/store/persistence';

type Notice = { tone: 'ok' | 'bad'; text: string } | null;

export default function SettingsPage() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);

  function download() {
    const blob = new Blob([exportSaveJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devlearn-arena-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File) {
    const text = await file.text();
    const result = importSaveJson(text);
    setNotice(
      result.ok
        ? { tone: 'ok', text: t('settings.imported') }
        : { tone: 'bad', text: `${t('settings.importFailed')} (${result.reason})` },
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="title text-5xl">{t('settings.title')}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs text-ink-soft">{t('settings.motion')}</h2>
        <div className="flex gap-2">
          {(['system', 'reduced'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={settings.motion === value}
              onClick={() => {
                updateSettings({ motion: value });
              }}
              className={`border px-3 py-1.5 text-sm ${
                settings.motion === value ? 'border-wood-dark text-[var(--gold-dark)]' : 'border-wood-dark text-ink-soft'
              }`}
            >
              {t(value === 'system' ? 'settings.motion.system' : 'settings.motion.reduced')}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-base text-ink-soft">{t('settings.panes')}</h2>
        <p className="text-sm text-ink-soft">
          {t('settings.panesLead')}
          {t('settings.panesNow', { a: settings.paneMain, b: settings.paneMap })}
        </p>
        <button
          type="button"
          onClick={() => {
            updateSettings({ paneMain: 55, paneMap: 62 });
          }}
          className="knob w-fit px-5 py-2.5 text-base"
        >
          {t('settings.panesReset')}
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-base text-ink-soft">{t('settings.intro')}</h2>
        <button
          type="button"
          aria-pressed={settings.introAlways}
          onClick={() => {
            updateSettings({ introAlways: !settings.introAlways });
          }}
          className={`w-fit border-2 px-5 py-2.5 text-base ${
            settings.introAlways ? 'border-wood-dark text-[var(--gold-dark)]' : 'border-wood-dark text-ink-soft'
          }`}
        >
          {settings.introAlways ? t('settings.introAlways') : t('settings.introOnce')}
        </button>
        <p className="text-sm text-ink-soft">{t('settings.introLead')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-base text-ink-soft">{t('settings.sound')}</h2>
        <button
          type="button"
          aria-pressed={settings.soundEnabled}
          onClick={() => {
            updateSettings({ soundEnabled: !settings.soundEnabled });
          }}
          className={`w-fit border-2 px-5 py-2.5 text-base ${
            settings.soundEnabled ? 'border-wood-dark text-[var(--gold-dark)]' : 'border-wood-dark text-ink-soft'
          }`}
        >
          {settings.soundEnabled ? t('settings.soundOn') : t('settings.soundOff')}
        </button>
        <p className="text-sm text-ink-soft">
          {t('settings.soundLead')}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <label htmlFor="tick" className="font-mono text-xs text-ink-soft">
          {t('settings.tick')}
        </label>
        <input
          id="tick"
          type="range"
          min={125}
          max={2000}
          step={125}
          value={settings.tickMs}
          onChange={(e) => {
            updateSettings({ tickMs: Number(e.target.value) });
          }}
          className="w-64 accent-[var(--gold-dark)]"
        />
        <p className="font-mono text-xs text-ink-soft">{settings.tickMs} ms / tick</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs text-ink-soft">{t('settings.data')}</h2>
        <p className="text-xs text-ink-soft">{t('settings.storageNote')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} className="border border-wood-dark px-3 py-1.5 text-sm hover:border-wood-dark">
            {t('settings.export')}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border border-wood-dark px-3 py-1.5 text-sm hover:border-wood-dark"
          >
            {t('settings.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('settings.resetConfirm'))) resetAll();
            }}
            className="border border-wood-dark px-3 py-1.5 text-sm text-[var(--bad)] hover:border-[var(--bad)]"
          >
            {t('settings.reset')}
          </button>
        </div>
        {notice ? (
          <p
            aria-live="polite"
            className={`text-sm ${notice.tone === 'ok' ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}`}
          >
            {notice.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
