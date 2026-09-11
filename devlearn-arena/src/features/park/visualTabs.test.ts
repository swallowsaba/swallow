import { describe, expect, it } from 'vitest';
import { relevantTabs, tabForTrack, VISUAL_TABS } from './visualTabs';

describe('任務の世界に合わせて図を選ぶ', () => {
  it('開いた瞬間に、その世界の図を選ぶ', () => {
    expect(tabForTrack('git')).toBe('git');
    expect(tabForTrack('k8s')).toBe('k8s');
    expect(tabForTrack('net')).toBe('net');
    expect(tabForTrack('github')).toBe('gh');
    expect(tabForTrack('kernel')).toBe('fs');
  });

  it('関係ない図は外し、選んだ図は必ず含む', () => {
    const k8s = relevantTabs('k8s');
    expect([...k8s]).toEqual(['k8s']);
    expect(relevantTabs('github').has('git')).toBe(true);
    expect(relevantTabs('git').has('fs')).toBe(false);
    for (const track of ['kernel', 'git', 'k8s', 'net', 'github'] as const) {
      expect(relevantTabs(track).has(tabForTrack(track))).toBe(true);
    }
  });

  it('どの世界でも、押せない図が必ずある（同じ図が全部に出ない）', () => {
    for (const track of ['kernel', 'git', 'k8s', 'net', 'github'] as const) {
      expect(relevantTabs(track).size).toBeLessThan(VISUAL_TABS.length);
    }
  });
});
