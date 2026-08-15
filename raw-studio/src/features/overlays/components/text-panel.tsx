import * as React from 'react';
import { ArrowDown, ArrowUp, Smile, Square, Trash2, Type } from 'lucide-react';
import type { TextAlign, TextOverlay } from '@/types';
import { Button } from '@/components/ui/button';
import { selectCurrentEdit, useActiveOverlay, useEditorStore } from '@/features/editor';
import { AdjustmentSlider } from '@/features/adjustments/components/adjustment-slider';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { EmojiOverlay, FrameOverlay, FrameStyle, TextOverlay } from '@/types';
import { defaultEmojiOverlay, defaultFrameOverlay, defaultTextOverlay } from '../model/overlay-ops';
import { useOverlayUiStore } from '../model/overlay-ui-store';

const EMOJI_PALETTE = [
  '✨', '❤️', '😍', '😂', '🥹', '🔥', '🎉', '🌸', '⭐', '💯',
  '👍', '🙏', '🥳', '☀️', '🌊', '🍕', '🐾', '💖', '😎', '📸',
] as const;

const FONTS: readonly { label: string; value: string }[] = [
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, Menlo, monospace' },
  { label: 'Rounded', value: '"Baloo 2", "Comic Sans MS", system-ui, sans-serif' },
];

const ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];

export function TextPanel(): React.JSX.Element {
  const edit = useEditorStore(selectCurrentEdit);
  const t = useT();
  const addOverlay = useEditorStore((s) => s.addOverlay);
  const removeOverlay = useEditorStore((s) => s.removeOverlay);
  const reorderOverlay = useEditorStore((s) => s.reorderOverlay);

  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const editOverlay = useOverlayUiStore((s) => s.editOverlay);
  const setOverlayMode = useOverlayUiStore((s) => s.setOverlayMode);
  const exit = useOverlayUiStore((s) => s.exit);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    setOverlayMode(true);
    return () => {
      setOverlayMode(false);
    };
  }, [setOverlayMode]);

  if (!edit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const overlays = edit.overlays;

  const add = () => {
    const o = defaultTextOverlay(t('text.defaultText'));
    addOverlay(o, t('text.addLabel'));
    editOverlay(o.id);
  };

  const addEmoji = (emoji: string) => {
    const o = defaultEmojiOverlay(emoji);
    addOverlay(o, t('text.addStickerLabel'));
    editOverlay(o.id);
    setPickerOpen(false);
  };

  const addFrame = () => {
    const o = defaultFrameOverlay();
    addOverlay(o, t('text.addFrameLabel'));
    editOverlay(o.id);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('text.intro')}</p>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={add}>
          <Type className="size-3.5" /> {t('text.add')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          onClick={() => {
            setPickerOpen((v) => !v);
          }}
        >
          <Smile className="size-3.5" /> {t('text.sticker')}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={addFrame}>
          <Square className="size-3.5" /> {t('text.frame')}
        </Button>
      </div>

      {pickerOpen ? (
        <div className="grid grid-cols-10 gap-1 rounded border border-border p-2">
          {EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded p-1 text-lg leading-none hover:bg-muted"
              onClick={() => {
                addEmoji(e);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      {overlays.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {t('text.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {overlays.map((o, i) => (
            <li
              key={o.id}
              className={cn(
                'flex items-center gap-1 rounded border px-2 py-1.5 text-xs',
                o.id === activeOverlayId ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => {
                  editOverlay(o.id);
                }}
              >
                {o.kind === 'emoji' ? (
                  <span className="shrink-0 text-sm leading-none">{o.emoji}</span>
                ) : o.kind === 'frame' ? (
                  <Square className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Type className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">
                  {o.kind === 'text'
                    ? o.text || t('text.empty')
                    : o.kind === 'emoji'
                      ? t('text.stickerItem')
                      : t('text.frameItem')}
                </span>
              </button>
              <button
                type="button"
                aria-label={t('text.moveUp')}
                disabled={i === overlays.length - 1}
                onClick={() => {
                  reorderOverlay(o.id, 'up', t('text.reorderLabel'));
                }}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={t('text.moveDown')}
                disabled={i === 0}
                onClick={() => {
                  reorderOverlay(o.id, 'down', t('text.reorderLabel'));
                }}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={t('text.delete')}
                onClick={() => {
                  if (o.id === activeOverlayId) exit();
                  removeOverlay(o.id, t('text.deleteLabel'));
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ActiveTextEditor />
      <ActiveEmojiEditor />
      <ActiveFrameEditor />
    </div>
  );
}

function ActiveTextEditor(): React.JSX.Element | null {
  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const overlay = useActiveOverlay(activeOverlayId);
  const t = useT();
  const updateOverlay = useEditorStore((s) => s.updateOverlay);

  if (!overlay || overlay.kind !== 'text' || !activeOverlayId) return null;
  const o: TextOverlay = overlay;
  const set = (patch: Partial<Omit<TextOverlay, 'id' | 'kind'>>) => {
    updateOverlay(activeOverlayId, patch, t('text.editLabel'));
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <textarea
        value={o.text}
        onChange={(e) => {
          set({ text: e.target.value });
        }}
        rows={2}
        className="w-full resize-none rounded border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder={t('text.defaultText')}
      />

      <div className="flex items-center gap-2">
        <select
          value={o.fontFamily}
          onChange={(e) => {
            set({ fontFamily: e.target.value });
          }}
          className="h-7 min-w-0 flex-1 rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-border">
          {ALIGNS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                set({ align: a });
              }}
              className={cn(
                'px-2 py-1 text-[11px] capitalize',
                o.align === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {t(`text.align.${a}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ColorField
          label={t('text.color')}
          value={o.color}
          onChange={(v) => {
            set({ color: v });
          }}
        />
        <ColorField
          label={t('text.outlineColor')}
          value={o.strokeColor}
          onChange={(v) => {
            set({ strokeColor: v });
          }}
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={o.shadow}
            onChange={(e) => {
              set({ shadow: e.target.checked });
            }}
            className="size-3.5 accent-primary"
          />
          {t('text.shadow')}
        </label>
      </div>

      <div className="flex gap-2">
        <ToggleChip
          label={t('text.bold')}
          on={o.fontWeight >= 700}
          onClick={() => {
            set({ fontWeight: o.fontWeight >= 700 ? 400 : 700 });
          }}
        />
        <ToggleChip
          label={t('text.italic')}
          on={o.italic}
          onClick={() => {
            set({ italic: !o.italic });
          }}
        />
      </div>

      <AdjustmentSlider
        label={t('text.size')}
        value={Math.round(o.fontSize * 100)}
        min={2}
        max={40}
        step={1}
        defaultValue={10}
        onChange={(v) => {
          set({ fontSize: v / 100 });
        }}
        onCommit={(v) => {
          set({ fontSize: v / 100 });
        }}
      />
      <AdjustmentSlider
        label={t('text.outline')}
        value={Math.round(o.strokeWidth * 100)}
        min={0}
        max={40}
        step={1}
        defaultValue={12}
        onChange={(v) => {
          set({ strokeWidth: v / 100 });
        }}
        onCommit={(v) => {
          set({ strokeWidth: v / 100 });
        }}
      />
      <AdjustmentSlider
        label={t('text.rotation')}
        value={o.rotationDeg}
        min={-180}
        max={180}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          set({ rotationDeg: v });
        }}
        onCommit={(v) => {
          set({ rotationDeg: v });
        }}
      />
      <AdjustmentSlider
        label={t('text.opacity')}
        value={Math.round(o.opacity * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={100}
        onChange={(v) => {
          set({ opacity: v / 100 });
        }}
        onCommit={(v) => {
          set({ opacity: v / 100 });
        }}
      />
      <p className="text-[11px] text-muted-foreground">{t('text.dragHint')}</p>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <input
        type="color"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="size-6 cursor-pointer rounded border border-border bg-transparent"
        aria-label={label}
      />
      {label}
    </label>
  );
}

function ToggleChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded border py-1 text-[11px]',
        on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ActiveEmojiEditor(): React.JSX.Element | null {
  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const overlay = useActiveOverlay(activeOverlayId);
  const t = useT();
  const updateOverlay = useEditorStore((s) => s.updateOverlay);

  if (!overlay || overlay.kind !== 'emoji' || !activeOverlayId) return null;
  const o: EmojiOverlay = overlay;
  const set = (patch: Partial<Pick<EmojiOverlay, 'emoji' | 'size' | 'rotationDeg' | 'opacity'>>) => {
    updateOverlay(activeOverlayId, patch, t('text.editLabel'));
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="grid grid-cols-10 gap-1">
        {EMOJI_PALETTE.map((e) => (
          <button
            key={e}
            type="button"
            className={cn(
              'rounded p-1 text-lg leading-none hover:bg-muted',
              o.emoji === e ? 'bg-primary/15 ring-1 ring-primary' : '',
            )}
            onClick={() => {
              set({ emoji: e });
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <AdjustmentSlider
        label={t('text.size')}
        value={Math.round(o.size * 100)}
        min={3}
        max={60}
        step={1}
        defaultValue={15}
        onChange={(v) => {
          set({ size: v / 100 });
        }}
        onCommit={(v) => {
          set({ size: v / 100 });
        }}
      />
      <AdjustmentSlider
        label={t('text.rotation')}
        value={o.rotationDeg}
        min={-180}
        max={180}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          set({ rotationDeg: v });
        }}
        onCommit={(v) => {
          set({ rotationDeg: v });
        }}
      />
      <AdjustmentSlider
        label={t('text.opacity')}
        value={Math.round(o.opacity * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={100}
        onChange={(v) => {
          set({ opacity: v / 100 });
        }}
        onCommit={(v) => {
          set({ opacity: v / 100 });
        }}
      />
      <p className="text-[11px] text-muted-foreground">{t('text.dragHint')}</p>
    </div>
  );
}

function ActiveFrameEditor(): React.JSX.Element | null {
  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const overlay = useActiveOverlay(activeOverlayId);
  const t = useT();
  const updateOverlay = useEditorStore((s) => s.updateOverlay);

  if (!overlay || overlay.kind !== 'frame' || !activeOverlayId) return null;
  const o: FrameOverlay = overlay;
  const set = (
    patch: Partial<Pick<FrameOverlay, 'style' | 'color' | 'thickness' | 'inset' | 'cornerRadius' | 'opacity'>>,
  ) => {
    updateOverlay(activeOverlayId, patch, t('text.editLabel'));
  };
  const styles: readonly FrameStyle[] = ['border', 'matte'];

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex overflow-hidden rounded border border-border">
        {styles.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => {
              set({ style: st });
            }}
            className={cn(
              'flex-1 py-1 text-[11px] capitalize',
              o.style === st ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {t(`text.frameStyle.${st}`)}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="color"
          value={o.color}
          onChange={(e) => {
            set({ color: e.target.value });
          }}
          className="size-6 cursor-pointer rounded border border-border bg-transparent"
          aria-label={t('text.color')}
        />
        {t('text.color')}
      </label>
      <AdjustmentSlider
        label={t('text.thickness')}
        value={Math.round(o.thickness * 100)}
        min={0}
        max={15}
        step={1}
        defaultValue={2}
        onChange={(v) => {
          set({ thickness: v / 100 });
        }}
        onCommit={(v) => {
          set({ thickness: v / 100 });
        }}
      />
      {o.style === 'border' ? (
        <AdjustmentSlider
          label={t('text.inset')}
          value={Math.round(o.inset * 100)}
          min={0}
          max={15}
          step={1}
          defaultValue={3}
          onChange={(v) => {
            set({ inset: v / 100 });
          }}
          onCommit={(v) => {
            set({ inset: v / 100 });
          }}
        />
      ) : null}
      <AdjustmentSlider
        label={t('text.corner')}
        value={Math.round(o.cornerRadius * 100)}
        min={0}
        max={20}
        step={1}
        defaultValue={2}
        onChange={(v) => {
          set({ cornerRadius: v / 100 });
        }}
        onCommit={(v) => {
          set({ cornerRadius: v / 100 });
        }}
      />
      <AdjustmentSlider
        label={t('text.opacity')}
        value={Math.round(o.opacity * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={100}
        onChange={(v) => {
          set({ opacity: v / 100 });
        }}
        onCommit={(v) => {
          set({ opacity: v / 100 });
        }}
      />
    </div>
  );
}
