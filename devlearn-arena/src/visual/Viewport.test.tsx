import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { host, iface, topology } from '@/engines/net/factory';
import { createRepo, openPull } from '@/engines/github/pr';
import { FsTree } from './FsTree';
import { CommitGraph } from './CommitGraph';
import { ClusterCanvas } from './ClusterCanvas';
import { PacketFlow } from './PacketFlow';
import { PrTimeline } from './PrTimeline';
import { mount } from './mountForTest';
import { Viewport } from './Viewport';

/** jsdom は大きさを測らないので、枠は 400×300、図は 800×600 として見せる */
const FRAME = { w: 400, h: 300 };
const CONTENT = { w: 800, h: 600 };
const saved = new Map<string, PropertyDescriptor | undefined>();

function stub(prop: 'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight', pick: (el: HTMLElement) => number) {
  saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      return pick(this);
    },
  });
}

beforeAll(() => {
  const id = (el: HTMLElement) => el.dataset.testid;
  stub('clientWidth', (el) => (id(el) === 'viewport' ? FRAME.w : 0));
  stub('clientHeight', (el) => (id(el) === 'viewport' ? FRAME.h : 0));
  stub('scrollWidth', (el) => (id(el) === 'viewport-content' ? CONTENT.w : 0));
  stub('scrollHeight', (el) => (id(el) === 'viewport-content' ? CONTENT.h : 0));
});

afterAll(() => {
  for (const [prop, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  }
});

function frameOf(view: HTMLElement): HTMLElement {
  const frame = view.querySelector<HTMLElement>('[data-testid="viewport"]');
  if (!frame) throw new Error('枠がありません');
  return frame;
}

const scale = (view: HTMLElement) => Number(frameOf(view).dataset.scale);

function fire(target: EventTarget, event: Event): void {
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('図の枠', () => {
  it('初めて描いたとき、全体が枠に入るよう縮める', () => {
    const view = mount(<Viewport label="図"><p>中身</p></Viewport>);
    expect(scale(view)).toBe(0.5);
  });

  it('ホイールで拡大縮小し、ダブルクリックで全体表示に戻る', () => {
    const view = mount(<Viewport label="図"><p>中身</p></Viewport>);
    const frame = frameOf(view);
    fire(frame, new WheelEvent('wheel', { deltaY: -300, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    expect(scale(view)).toBeGreaterThan(0.5);
    fire(frame, new MouseEvent('dblclick', { bubbles: true }));
    expect(scale(view)).toBe(0.5);
  });

  it('＋ − ボタンでも拡大縮小でき、「全体」で戻る', () => {
    const view = mount(<Viewport label="図"><p>中身</p></Viewport>);
    const button = (name: string) => [...view.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name);
    fire(button('拡大') as Element, new MouseEvent('click', { bubbles: true }));
    expect(scale(view)).toBeCloseTo(0.625);
    fire(button('全体') as Element, new MouseEvent('click', { bubbles: true }));
    expect(scale(view)).toBe(0.5);
  });

  it('ドラッグで動かした直後の click は部品に届かない。動かさなければ届く', () => {
    const onClick = vi.fn();
    const view = mount(
      <Viewport label="図">
        <button type="button" onClick={onClick}>部品</button>
      </Viewport>,
    );
    const part = view.querySelector('button');
    if (!part) throw new Error('部品がありません');
    // 動かさずに押して離す → click は届く
    fire(part, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
    fire(window, new MouseEvent('pointerup', { clientX: 10, clientY: 10 }));
    fire(part, new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    // 押したまま動かす → 図が動き、そのあとの click は握り潰す
    fire(part, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
    fire(window, new MouseEvent('pointermove', { clientX: 60, clientY: 40 }));
    fire(window, new MouseEvent('pointerup', { clientX: 60, clientY: 40 }));
    fire(part, new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('部品の上でのダブルクリックは全体表示に使わない', () => {
    const view = mount(
      <Viewport label="図">
        <button type="button">部品</button>
      </Viewport>,
    );
    const frame = frameOf(view);
    fire(frame, new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true }));
    const zoomed = scale(view);
    const part = view.querySelector('[data-testid="viewport-content"] button');
    if (!part) throw new Error('部品がありません');
    fire(part, new MouseEvent('dblclick', { bubbles: true }));
    expect(scale(view)).toBe(zoomed);
  });
});

describe('すべての図が同じ枠を使う', () => {
  it('ファイル・Git・クラスタ・ネットワーク・PR のどれも、拡大縮小できる枠の中に描く', () => {
    let session = createSession({ files: { '/home/learner': null, '/home/learner/a.txt': 'A\n' } });
    for (const line of ['git init', 'git add .', 'git commit -m first']) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
    }
    const state = session.state;
    const views = [
      <FsTree key="fs" vfs={state.vfs} cwd="/home/learner" />,
      <CommitGraph key="git" git={state.git} vfs={state.vfs} />,
      <ClusterCanvas key="k8s" cluster={emptyCluster([node('node-1', 4000, 8192)])} />,
      <PacketFlow key="net" net={topology([host('pc1', [iface('eth0', '10.0.0.1', 24)])], [])} self="pc1" />,
      <PrTimeline key="gh" repo={openPull(createRepo('acme', 'app'), { title: 't', head: 'f' }).repo} />,
    ];
    for (const element of views) {
      const view = mount(element);
      expect(view.querySelector('[data-testid="viewport"]'), String(element.key)).not.toBeNull();
    }
  });
});
