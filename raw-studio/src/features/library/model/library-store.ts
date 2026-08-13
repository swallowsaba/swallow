import { create } from 'zustand';
import type { RawMetadata } from './raw-decoder';

/** One entry in the library / filmstrip. */
export interface LibraryItem {
  readonly id: string;
  readonly fileName: string;
  readonly status: 'decoding' | 'ready' | 'error';
  readonly kind: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  /** Camera metadata from LibRaw, when the source is a RAW file. */
  readonly raw: RawMetadata | null;
  /** Object URL of the thumbnail blob (set when ready). */
  readonly thumbUrl: string | null;
  readonly error: string | null;
}

export interface LibraryState {
  items: readonly LibraryItem[];
  activeId: string | null;

  addPending: (id: string, fileName: string) => void;
  setReady: (
    id: string,
    data: {
      kind: string;
      width: number;
      height: number;
      thumbUrl: string;
      byteSize: number;
      raw: RawMetadata | null;
    },
  ) => void;
  setError: (id: string, error: string) => void;
  select: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  items: [],
  activeId: null,

  addPending: (id, fileName) => {
    set((s) => ({
      items: [
        ...s.items,
        {
          id,
          fileName,
          status: 'decoding',
          kind: '',
          width: 0,
          height: 0,
          byteSize: 0,
          raw: null,
          thumbUrl: null,
          error: null,
        },
      ],
    }));
  },

  setReady: (id, data) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id
          ? {
              ...it,
              status: 'ready',
              kind: data.kind,
              width: data.width,
              height: data.height,
              thumbUrl: data.thumbUrl,
              byteSize: data.byteSize,
              raw: data.raw,
              error: null,
            }
          : it,
      ),
      activeId: s.activeId ?? id,
    }));
  },

  setError: (id, error) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: 'error', error } : it,
      ),
    }));
  },

  select: (id) => {
    set({ activeId: id });
  },

  remove: (id) => {
    set((s) => {
      const target = s.items.find((it) => it.id === id);
      if (target?.thumbUrl) URL.revokeObjectURL(target.thumbUrl);
      const items = s.items.filter((it) => it.id !== id);
      const activeId =
        s.activeId === id ? (items.length > 0 ? (items[0]?.id ?? null) : null) : s.activeId;
      return { items, activeId };
    });
  },

  clear: () => {
    set((s) => {
      for (const it of s.items) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
      return { items: [], activeId: null };
    });
  },
}));
