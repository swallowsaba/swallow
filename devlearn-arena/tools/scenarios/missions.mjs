// ミッションを受けて達成し、報酬が都市に現れるまでを撮る台本（docs/development-plan.md Phase 9）。
//
//   SHOOT_SCRIPT=tools/scenarios/missions.mjs npm run shoot -- p9-end
//
// 小さな村（住宅の区画・サーバ施設・Web 施設）を画面の操作で作る → 上の帯の「ミッション」から一覧 →
// 「Web サーバを構築せよ」を受け、仮想端末で打つ（わざと誤ってエラーの小窓も撮る）→ 結果と報酬 → 都市へ戻る →
// 建設メニューの公園から記念碑を置く → サーバ施設の情報パネルのミッション → 施設の Lv1 と Lv5 を並べる。
import { at, days, drag, facility, pick } from './town.mjs';

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') ?? null, sel);
const wait = (page, ms = 300) => page.waitForTimeout(ms);

async function type(page, line) {
  await page.keyboard.type(line, { delay: 5 });
  await page.keyboard.press('Enter');
  await wait(page, 150);
}

export default async function missions(page, shot) {
  const w = String(page.viewportSize()?.width ?? 0);
  const tag = w === '1920' ? '' : `-${w}`;
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));

  // 小さな村（初めの資金 1,500 の範囲で）
  await pick(page, 'zone', 'build-zone-residential');
  await drag(page, [47, 46], [57, 46]);
  await facility(page, 'server', [41, 45]);
  await facility(page, 'web', [44, 45]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 4);
  await page.evaluate(() => window.__city.focusOn(47, 47));

  // 上の帯の「ミッション」から一覧
  await page.click('.topbar-entry:has-text("ミッション")');
  await page.waitForSelector('[data-testid="missions-screen"]');
  await wait(page, 400);
  await page.click('[data-testid="mission-row-web-server"]');
  await wait(page);
  console.log('一覧', await text(page, '[data-testid="mission-detail"]'));
  await shot(`p9-missions${tag}`);

  // 受ける → 実戦（わざと誤ってから、ヒントを 1 段開いて進める）
  await page.click('[data-testid="mission-start"]');
  await page.waitForSelector('.term-host .xterm');
  await wait(page, 500);
  await page.click('.term-host');
  await type(page, 'systemctl start ngnix');
  await type(page, 'systemctl start nginx');
  await type(page, 'systemctl status nginx');
  await page.click('[data-testid="practice-hint"]');
  await wait(page);
  console.log('手順', await text(page, '.practice-steps'));
  await shot(`p9-mission-run${tag}`);
  await page.click('.term-host');
  await type(page, "sed -i 's/8080/80/' /etc/nginx/conf.d/city.conf");
  await type(page, 'curl http://localhost/');
  await type(page, 'systemctl restart nginx');
  await type(page, 'curl http://localhost/');
  await type(page, 'systemctl enable nginx');
  await wait(page);
  await page.click('[data-testid="lesson-next"]');
  await page.waitForSelector('[data-testid="mission-result"]');
  await wait(page, 400);
  console.log('結果', await text(page, '[data-testid="mission-result-kind"]'), await text(page, '[data-testid="mission-prize"]'));
  await shot(`p9-mission-result${tag}`);

  // 都市へ戻る
  await page.click('[data-testid="mission-to-city"]');
  await wait(page, 900);
  console.log('戻った', await text(page, '.city-notice'));
  console.log('おすすめ', await text(page, '[data-testid="recommend"]'));
  await shot(`p9-back${tag}`);

  // 建設メニューの公園から記念碑を置く
  await page.keyboard.press('Escape');
  await pick(page, 'park');
  await wait(page);
  console.log('公園の引き出し', await text(page, '[data-testid="build-drawer"]'));
  await shot(`p9-build-monument${tag}`);
  await page.click('[data-testid="build-monument-beacon"]');
  const spot = await at(page, 48, 48);
  await page.mouse.move(spot.sx, spot.sy, { steps: 3 });
  await wait(page);
  await shot(`p9-monument-ghost${tag}`);
  await page.mouse.down();
  await page.mouse.up();
  await wait(page, 500);
  console.log('置いた', await text(page, '.city-notice'), await page.evaluate(() => JSON.stringify(window.__cityStore.getState().city.facilities.map((f) => `${f.type}${f.landmark ? `:${f.landmark}` : ''}`))));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 3);
  await page.evaluate(() => {
    window.__city.zoomBy(1);
    window.__city.focusOn(47, 47);
  });
  await wait(page, 500);
  await shot(`p9-monument${tag}`);

  // サーバ施設の情報パネル（ミッションの欄。Lv1 なので 1 本）
  await page.keyboard.press('Tab');
  await wait(page, 500);
  console.log('情報パネル', await text(page, '[data-testid="info-panel"] [aria-label="ミッション"]'));
  await shot(`p9-panel${tag}`);
  await page.keyboard.press('Escape');

  // 施設の Lv1 と Lv5 を並べる（サーバ施設と Web 施設の 2 つずつ。右の 2 つを Lv5 に）
  await page.evaluate(() => {
    const store = window.__cityStore.getState();
    store.setCity({ ...store.city, funds: store.city.funds + 5000 });
    // 1280×720 では、置く場所が建設メニューの陰に入らないよう寄せておく
    window.__city.focusOn(44, 46);
  });
  await facility(page, 'server', [41, 48], 2);
  await facility(page, 'web', [44, 48], 2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await days(page, 4);
  await page.evaluate(() => {
    const store = window.__cityStore.getState();
    const c = store.city;
    const placed = c.facilities.filter((f) => f.type === 'server' || f.type === 'web');
    const late = new Set(placed.slice(-2).map((f) => f.id));
    store.setCity({ ...c, facilities: c.facilities.map((f) => (late.has(f.id) ? { ...f, level: 5 } : f)) });
    window.__city.zoomBy(1);
    window.__city.focusOn(44, 47);
  });
  await wait(page, 600);
  console.log('Lv', await page.evaluate(() => JSON.stringify(window.__cityStore.getState().city.facilities.map((f) => `${f.type}:Lv${f.level}@${f.origin.x},${f.origin.y}`))));
  await shot(`p9-levels${tag}`);
}
