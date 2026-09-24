import type { TKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD } from './theme';
import type { Voice, VoiceEvent } from './voiceFeed';

interface Props {
  voices: readonly Voice[];
}

const TEXT: Readonly<Record<VoiceEvent, TKey>> = {
  movedIn: 'hud.voice.movedIn',
  running: 'hud.voice.running',
  moving: 'hud.voice.moving',
  ailing: 'hud.voice.ailing',
};

/** 名前の色。困っている人は赤、動いている人は青、落ち着いている人は緑 */
const TONE: Readonly<Record<VoiceEvent, string>> = {
  movedIn: HUD.okText,
  running: HUD.okText,
  moving: HUD.accentText,
  ailing: HUD.bad,
};

/**
 * 住人の声。Pod の出来事を住人のつぶやきとして流す。
 *
 * 声は街の状態から導いたもので、貯めた台帳ではない。
 * 文体は落ち着いたものにする。感嘆符は使わない。
 */
export function Voices({ voices }: Props) {
  const t = useT();
  return (
    <section
      data-testid="voices"
      aria-label={t('hud.voices')}
      className="overflow-hidden rounded-lg"
      style={{ background: HUD.panelSoft, border: `1px solid ${HUD.lineStrong}`, backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${HUD.line}` }}>
        <span style={{ color: HUD.muted }}>
          <Icon name="chat" size={14} strokeWidth={1.6} />
        </span>
        <span className="text-[12px]" style={{ color: HUD.soft }}>
          {t('hud.voices')}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-3 py-2 text-[12px] leading-relaxed">
        {voices.length === 0 ? (
          <p style={{ color: HUD.muted }}>{t('hud.noVoices')}</p>
        ) : (
          voices.map((voice) => (
            <p key={voice.id} data-voice={voice.id}>
              <span className="font-bold" style={{ color: TONE[voice.event] }}>
                {voice.who}
              </span>
              <span className="ml-2" style={{ color: HUD.muted }}>
                {t(TEXT[voice.event], { place: voice.place })}
                {voice.reason === undefined ? '' : t('hud.voice.reason', { reason: voice.reason })}
              </span>
            </p>
          ))
        )}
      </div>
    </section>
  );
}
