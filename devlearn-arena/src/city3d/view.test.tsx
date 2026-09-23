import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { click, mount } from '@/visual/mountForTest';
import { CityView } from './CityView';
import { hasWebGL, resetWebGL } from './webgl';

function city() {
  let session: Session = createSession({ files: { '/home/learner': null } });
  for (const line of ['mkdir work', 'echo hi > work/a.txt']) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  return buildCity({
    vfs: session.state.vfs,
    cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 9 },
    unlocked: DISTRICT_IDS,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetWebGL();
});

describe('WebGL があるかを見る', () => {
  it('canvas が文脈を返さない環境では使えないと見る（jsdom はここ）', () => {
    resetWebGL();
    expect(hasWebGL()).toBe(false);
  });

  it('返してくれる環境では使えると見る', () => {
    resetWebGL();
    vi.stubGlobal('WebGL2RenderingContext', class {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as unknown as null);
    expect(hasWebGL()).toBe(true);
  });

  it('例外を投げる環境でも落ちない', () => {
    resetWebGL();
    vi.stubGlobal('WebGL2RenderingContext', class {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no gl');
    });
    expect(hasWebGL()).toBe(false);
  });

  it('一度調べたら覚える', () => {
    resetWebGL();
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    hasWebGL();
    hasWebGL();
    hasWebGL();
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('街の絵', () => {
  it('WebGL が無い環境では 2D に落ちる。真っ白にしない', () => {
    const view = mount(<CityView city={city()} animate={false} />);
    expect(view.querySelector('[data-testid="city-2d"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="city-canvas"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="city-viewport"]')).not.toBeNull();
    expect(view.querySelectorAll('[data-building]').length).toBeGreaterThan(0);
  });

  it('2D に落ちても、街を押せばコマンドが端末へ行く', () => {
    const sent: string[] = [];
    const view = mount(
      <CityView
        city={city()}
        animate={false}
        onCommand={(line) => {
          sent.push(line);
        }}
      />,
    );
    click(view, '[data-building="node:n1"]');
    expect(sent).toEqual(['kubectl describe node n1']);
  });

  it('見出し（読み上げ用の名前）を付けられる', () => {
    const view = mount(<CityView city={city()} animate={false} label="街の様子" />);
    expect(view.querySelector('[aria-label="街の様子"]')).not.toBeNull();
  });
});
