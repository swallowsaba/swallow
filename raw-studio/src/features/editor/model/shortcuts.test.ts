import { describe, expect, it } from 'vitest';
import { resolveShortcut } from './shortcuts';

const ev = (over: Partial<Parameters<typeof resolveShortcut>[0]>) => ({
  key: 'z',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...over,
});

describe('resolveShortcut', () => {
  it('returns null without a modifier', () => {
    expect(resolveShortcut(ev({ key: 'z' }))).toBeNull();
  });

  it('maps Ctrl+Z and Cmd+Z to undo', () => {
    expect(resolveShortcut(ev({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(resolveShortcut(ev({ key: 'z', metaKey: true }))).toBe('undo');
  });

  it('maps Ctrl+Shift+Z to redo', () => {
    expect(resolveShortcut(ev({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('maps Ctrl+Y to redo', () => {
    expect(resolveShortcut(ev({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('is case-insensitive', () => {
    expect(resolveShortcut(ev({ key: 'Z', metaKey: true }))).toBe('undo');
  });

  it('ignores unrelated keys', () => {
    expect(resolveShortcut(ev({ key: 'a', ctrlKey: true }))).toBeNull();
  });
});

describe('resolveShortcut — extended', () => {
  const e = (over: Partial<Parameters<typeof resolveShortcut>[0]>) => ({
    key: 'z',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...over,
  });

  it('maps zoom shortcuts with a modifier', () => {
    expect(resolveShortcut(e({ key: '=', ctrlKey: true }))).toBe('zoomIn');
    expect(resolveShortcut(e({ key: '+', metaKey: true }))).toBe('zoomIn');
    expect(resolveShortcut(e({ key: '-', ctrlKey: true }))).toBe('zoomOut');
    expect(resolveShortcut(e({ key: '0', ctrlKey: true }))).toBe('zoomFit');
    expect(resolveShortcut(e({ key: '1', metaKey: true }))).toBe('zoomActual');
  });

  it('maps copy/paste settings', () => {
    expect(resolveShortcut(e({ key: 'c', metaKey: true }))).toBe('copySettings');
    expect(resolveShortcut(e({ key: 'v', metaKey: true }))).toBe('pasteSettings');
  });

  it('maps un-modified before/after and split compare', () => {
    expect(resolveShortcut(e({ key: '\\' }))).toBe('toggleBefore');
    expect(resolveShortcut(e({ key: 'x' }))).toBe('toggleCompare');
  });

  it('does not fire the un-modified toggles when a modifier is held', () => {
    expect(resolveShortcut(e({ key: 'x', ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(e({ key: '\\', metaKey: true }))).toBeNull();
  });
});
