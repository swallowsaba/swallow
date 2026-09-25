#!/usr/bin/env node
// 街の車と人が本当に動いているかを、画素で確かめる。
//
//   node tools/motion-check.mjs [URLのパス] [あける秒数]
//
// 同じ画面を間をあけて 2 枚撮り、はっきり色が変わった画素を数える。
// 少なければ「動いていない」として失敗で終わる（終了コード 1）。
//
// HUD（端末の点滅するカーソルなど）が差に混ざらないよう、街の絵以外は隠してから撮る。
// 時間帯は URL の time= で止めておく（影の動きを車の動きと取り違えないため）。
// 撮った 2 枚と、変わった所を赤く塗った差分を shots/ に残す。目でも確かめるため。
//
// OS の「アニメーションを減らす」が入った状態（Windows の「アニメーション効果」を切った状態）でも確かめる。
// この状態で街が丸ごと止まっていたのが、3 回指摘された「車と人が動かない」の原因だった。
import { writeFileSync } from 'node:fs';
import { BASE, withPage } from './browser.mjs';
import { dismissOnboarding } from './scenes.mjs';

const [pathArg = '/world/k8s', gapArg = '2'] = process.argv.slice(2);
const GAP_MS = Math.round(Number(gapArg) * 1000);
/** 1 つの色の成分がこれ以上変われば「変わった画素」と数える */
const CHANNEL = 40;
/** 変わった画素がこれより少なければ、動いていないと見なす */
const MIN_CHANGED = Number(process.env.MOTION_MIN ?? 300);

/** 時間帯を止める。正午に近い明るさ */
const withTime = (path) => path + (path.includes('?') ? '&' : '?') + 'time=0.42';

/** 2 枚の PNG を頁の中の 2D canvas に描いて見比べる（PNG を読む道具を足さずに済ませる） */
function compare({ a64, b64, channel }) {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  return Promise.all([load(`data:image/png;base64,${a64}`), load(`data:image/png;base64,${b64}`)]).then(([ia, ib]) => {
    const w = ia.width;
    const h = ia.height;
    const read = (img) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h);
    };
    const da = read(ia);
    const db = read(ib);
    const out = new ImageData(w, h);
    let changed = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(
        Math.abs(da.data[i] - db.data[i]),
        Math.abs(da.data[i + 1] - db.data[i + 1]),
        Math.abs(da.data[i + 2] - db.data[i + 2]),
      );
      const grey = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 9;
      if (d >= channel) {
        changed += 1;
        out.data.set([255, 40, 40, 255], i);
      } else {
        out.data.set([grey, grey, grey, 255], i);
      }
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    return { changed, png: c.toDataURL('image/png').split(',')[1] };
  });
}

async function check(mode) {
  const { result, errors } = await withPage({ reducedMotion: mode }, async (page, { sleep }) => {
    await page.goto(BASE + withTime(pathArg), { waitUntil: 'networkidle' });
    await page.getByTestId('city-3d').first().waitFor({ state: 'visible', timeout: 30000 });
    await dismissOnboarding(page);
    // 街が組み上がって、最初の数フレームが描かれるまで待つ
    await sleep(6000);
    await page.addStyleTag({
      content:
        '[data-testid="arena"] > :not([data-testid="city-stage"]) { visibility: hidden !important; }' +
        '[data-testid="onboarding"] { display: none !important; }',
    });
    await sleep(300);
    // 描けている速さも測っておく。遅いと動きが小さくなるので、失敗の理由を読むのに使う
    const frames = page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          let n = 0;
          const end = performance.now() + ms;
          const tick = () => {
            n += 1;
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve(n);
          };
          requestAnimationFrame(tick);
        }),
      GAP_MS,
    );
    const a = await page.screenshot();
    await sleep(GAP_MS);
    const b = await page.screenshot();
    const fps = (await frames) / (GAP_MS / 1000);
    writeFileSync(`shots/motion-${mode}-a.png`, a);
    writeFileSync(`shots/motion-${mode}-b.png`, b);
    const diff = await page.evaluate(compare, { a64: a.toString('base64'), b64: b.toString('base64'), channel: CHANNEL });
    writeFileSync(`shots/motion-${mode}-diff.png`, Buffer.from(diff.png, 'base64'));
    return { changed: diff.changed, fps };
  });
  return { ...result, errors };
}

let failed = false;
for (const mode of ['no-preference', 'reduce']) {
  const { changed, fps, errors } = await check(mode);
  const moving = changed >= MIN_CHANGED;
  console.log(
    `[${mode}] 変わった画素: ${String(changed)}（下限 ${String(MIN_CHANGED)}） 描画 ${fps.toFixed(1)} fps → ${moving ? '動いている' : '動いていない'}`,
  );
  console.log(`  shots/motion-${mode}-a.png shots/motion-${mode}-b.png shots/motion-${mode}-diff.png`);
  if (errors.length > 0) console.log('  ページのエラー:\n' + errors.join('\n'));
  if (!moving || errors.length > 0) failed = true;
}
if (failed) {
  console.log('失敗: 車と人が止まっている画面がある');
  process.exitCode = 1;
}
