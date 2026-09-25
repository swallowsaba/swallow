import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { CityStage } from '@/features/citymap/CityStage';
import { useStore } from '@/store';
import { mount } from '@/visual/mountForTest';
import { advanceOf, motionPlan } from './motion';

/**
 * 車と人が動かない（REWORK 3-1、3 回目の指摘）。
 *
 * 原因: Windows の「アニメーション効果」を切っていると、ブラウザは prefers-reduced-motion: reduce を返す。
 * 街はそれを見て、車・人・時間帯をまるごと止めていた。街の動きは仕組みの模型そのものなので、
 * OS の設定で止めてはいけない。止めるのは、アプリの設定で「動きを減らす」を選んだときと、一時停止のときだけ。
 * OS の設定には、カメラが滑る動きを瞬間移動にすることで応える。
 */

/** OS が「動きを減らす」を返す状態にする */
function preferReduced(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  act(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, motion: 'system' } }));
  });
});

describe('街の動きの決め方', () => {
  it('OS が動きを減らす設定でも、車と人は動く。カメラの移動だけ瞬間にする', () => {
    expect(motionPlan('system', true)).toEqual({ traffic: true, glide: false });
  });

  it('何も設定していなければ、車も人もカメラも動く', () => {
    expect(motionPlan('system', false)).toEqual({ traffic: true, glide: true });
    expect(motionPlan('system', null)).toEqual({ traffic: true, glide: true });
  });

  it('アプリの設定で「動きを減らす」を選んだときだけ、車と人を止める', () => {
    expect(motionPlan('reduced', false)).toEqual({ traffic: false, glide: false });
  });
});

describe('1 フレームで進む時間', () => {
  it('描画が遅い（3 fps）端末でも、車は実際の時間どおりに進む', () => {
    // 以前は 1 フレーム 0.1 秒で切っていたので、3 fps では 1/3 の速さでしか進まなかった
    expect(advanceOf(1 / 3)).toBeCloseTo(1 / 3, 5);
  });

  it('タブを離れて戻ったときのような大きな飛びは、切り詰める', () => {
    expect(advanceOf(30)).toBeLessThanOrEqual(0.5);
  });
});

describe('街の舞台', () => {
  const city = buildCity({
    home: '/home/learner',
    vfs: null,
    git: null,
    cluster: emptyCluster([node('node-1', 2000, 4096)]),
    net: null,
    repo: null,
    unlocked: ['k8s'],
  });

  it('OS が動きを減らす設定でも、街の車と人は動いている', () => {
    preferReduced(true);
    const host = mount(<CityStage city={city} label="街" />);
    expect(host.querySelector('[data-testid="city-stage"]')?.getAttribute('data-traffic')).toBe('moving');
  });

  it('一時停止のときは止まっている', () => {
    preferReduced(false);
    const host = mount(<CityStage city={city} label="街" speed="pause" />);
    expect(host.querySelector('[data-testid="city-stage"]')?.getAttribute('data-traffic')).toBe('stopped');
  });

  it('アプリの設定で動きを減らしたときは止まっている', () => {
    preferReduced(false);
    act(() => {
      useStore.setState((s) => ({ settings: { ...s.settings, motion: 'reduced' } }));
    });
    const host = mount(<CityStage city={city} label="街" />);
    expect(host.querySelector('[data-testid="city-stage"]')?.getAttribute('data-traffic')).toBe('stopped');
  });
});
