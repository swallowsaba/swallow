import type { ReactNode } from 'react';
import { useT } from '@/i18n/useT';
import type { Box } from '../sceneKit';
import { Viewport } from '../Viewport';
import { Sprite } from './pixel';
import { HERO, heroPalette } from './sprites';
import { Bubble, Terrain } from './scenery';

interface Props {
  /** 世界の名前（上の帯に出す） */
  title: string;
  /** 世界の広さ */
  width: number;
  height: number;
  /** 飾りを置かない場所（建物・道） */
  occupied: readonly Box[];
  /** 押せる部品があるか。あれば「押すとコマンドになる」と案内する */
  interactive: boolean;
  /** 上の帯の右側に置くもの（状態の要約や操作ボタン） */
  hud?: ReactNode;
  /** 世界の下に置く欄（拡大縮小に巻き込まない） */
  footer?: ReactNode;
  testId: string;
  children: ReactNode;
}

/**
 * ゲーム画面の枠。上に世界の名前と操作の帯、真ん中に草地の世界、下に読み物の欄。
 * 世界は Viewport に入れるので、ホイールで拡大縮小・ドラッグで移動できる。
 */
export function GameStage({ title, width, height, occupied, interactive, hud, footer, testId, children }: Props) {
  const t = useT();
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <div className="flex shrink-0 items-center gap-2 border-b-4 border-wood-dark bg-[var(--wood-light)] px-3 py-1.5">
        <span className="sign shrink-0 px-2 py-0.5 text-sm font-extrabold">🎮 {title}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-cream" title={interactive ? t('game.clickHint') : undefined}>
          {interactive ? t('game.clickHint') : ''}
        </span>
        <div className="flex shrink-0 items-center gap-2">{hud}</div>
      </div>
      <div className="min-h-0 flex-1" style={{ backgroundColor: '#77b356' }}>
        <Viewport label={title}>
          {/* 右上の拡大縮小ボタンに世界が隠れないよう、上を少し空ける */}
          <div style={{ paddingTop: 40, display: 'inline-block', verticalAlign: 'top' }}>
          <svg
            className="block"
            width={width}
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
            role="img"
            aria-label={title}
            style={{ imageRendering: 'pixelated' }}
          >
            <Terrain width={width} height={height} avoid={occupied} />
            {children}
          </svg>
          </div>
        </Viewport>
      </div>
      {footer ? (
        <div className="max-h-[40%] shrink-0 overflow-auto border-t-4 border-wood-dark bg-cream px-3 pb-3">{footer}</div>
      ) : null}
    </div>
  );
}

/** まだ何も無い世界。主人公が次にすることを話す */
export function EmptyWorld({ title, lead, testId }: { title: string; lead: string; testId: string }) {
  const width = 560;
  const height = 260;
  const hero = { x: 60, y: 130 };
  return (
    <GameStage title={title} width={width} height={height} occupied={[{ x: 20, y: 60, w: 520, h: 140 }]} interactive={false} testId={testId}>
      <Sprite map={HERO} palette={heroPalette('#c0604a')} x={hero.x} y={hero.y} scale={3} />
      <Bubble x={hero.x + 18} y={hero.y - 4} text={lead} maxWidth={480} />
    </GameStage>
  );
}
