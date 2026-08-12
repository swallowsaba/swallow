import { BUILTIN_PRESETS, usePresetStore } from '@/features/presets';
import { useEditorStore } from '@/features/editor';
import { useUiStore } from '@/stores';
import type { RightTab } from '@/stores';
import {
  loadEdit,
  loadSetting,
  loadUserPresets,
  saveEdit,
  saveSetting,
  saveUserPresets,
} from './repository';
import type { PersistedEdit } from './serialize';

/** Maps a runtime image id to its stable persistence key. */
const sourceKeyById = new Map<string, string>();

export function rememberSource(imageId: string, sourceKey: string): void {
  sourceKeyById.set(imageId, sourceKey);
}
export function getSourceKey(imageId: string): string | undefined {
  return sourceKeyById.get(imageId);
}

/** Load a previously persisted edit for a file, if any. */
export function restoreEdit(sourceKey: string): Promise<PersistedEdit | null> {
  return loadEdit(sourceKey);
}

function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, ms);
  };
}

interface UiSettings {
  rightTab: RightTab;
  leftPanelOpen: boolean;
  filmstripOpen: boolean;
}

let started = false;

/** Wire persistence once, at app start. Safe to call multiple times. */
export async function initPersistence(): Promise<void> {
  if (started) return;
  started = true;

  // 1) Restore user presets, keeping the built-ins first.
  const userPresets = await loadUserPresets();
  if (userPresets.length > 0) {
    usePresetStore.setState({ presets: [...BUILTIN_PRESETS, ...userPresets] });
  }

  // 2) Restore UI settings.
  const ui = await loadSetting<UiSettings | null>('ui', null);
  if (ui) {
    useUiStore.setState({
      rightTab: ui.rightTab,
      leftPanelOpen: ui.leftPanelOpen,
      filmstripOpen: ui.filmstripOpen,
    });
  }

  // 3) Autosave user presets on change.
  const savePresets = debounce(() => {
    void saveUserPresets(usePresetStore.getState().presets);
  }, 400);
  usePresetStore.subscribe(savePresets);

  // 4) Autosave UI settings on change.
  const saveUi = debounce(() => {
    const s = useUiStore.getState();
    void saveSetting('ui', {
      rightTab: s.rightTab,
      leftPanelOpen: s.leftPanelOpen,
      filmstripOpen: s.filmstripOpen,
    } satisfies UiSettings);
  }, 400);
  useUiStore.subscribe(saveUi);

  // 5) Autosave the active image's edit + snapshots whenever history changes.
  const saveActiveEdit = debounce(() => {
    const editor = useEditorStore.getState();
    const imageId = editor.image?.id;
    const history = editor.history;
    if (!imageId || !history) return;
    const sourceKey = getSourceKey(imageId);
    if (!sourceKey) return;
    void saveEdit(sourceKey, history.present.state, history.snapshots);
  }, 500);
  useEditorStore.subscribe((state, prev) => {
    if (state.history !== prev.history) saveActiveEdit();
  });
}
