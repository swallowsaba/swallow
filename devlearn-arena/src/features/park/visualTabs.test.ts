import { describe, expect, it } from 'vitest';
import { relevantTabs, tabForTrack } from './visualTabs';

describe('任務の世界に合わせて図を選ぶ', () => {
  it('開いた瞬間に、その世界の図を選ぶ', () => {
    expect(tabForTrack('git')).toBe('git');
    expect(tabForTrack('k8s')).toBe('k8s');
    expect(tabForTrack('net')).toBe('net');
    expect(tabForTrack('github')).toBe('gh');
    expect(tabForTrack('kernel')).toBe('world');
  });

  it('関係ない図は外し、選んだ図は必ず含む', () => {
    const k8s = relevantTabs('k8s');
    expect(k8s.has('k8s')).toBe(true);
    expect(k8s.has('git')).toBe(false);
    expect(k8s.has('net')).toBe(false);
    expect(relevantTabs('github').has('git')).toBe(true);
    for (const track of ['kernel', 'git', 'k8s', 'net', 'github'] as const) {
      expect(relevantTabs(track).has(tabForTrack(track))).toBe(true);
    }
  });
});
