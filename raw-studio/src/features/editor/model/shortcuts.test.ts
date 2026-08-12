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
