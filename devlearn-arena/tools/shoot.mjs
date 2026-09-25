#!/usr/bin/env node
// 撮影用。ブラウザを同時に1つしか立ち上げない（WebGL をソフトウェアで描くと 1〜2 GiB 使うため）。
//
//   node tools/shoot.mjs <場面名> [URLのパス] [待つミリ秒]
//
// 場面名が tools/scenes.mjs に登録してあれば、その手順（クリックや入力）を踏んでから撮る。
// 登録が無ければ、開いて待つだけで撮る。
//
// preview サーバは自分で立てて、自分で片付ける。すでに開いていればそれを使う（tools/browser.mjs）。
import { readFileSync } from 'node:fs';
import { SCENES } from './scenes.mjs';
import { BASE, withPage } from './browser.mjs';

const [name = 'shot', pathArg, waitArg] = process.argv.slice(2);
const scene = SCENES[name];
const path = pathArg ?? scene?.path ?? '/';
const waitMs = Number(waitArg ?? scene?.wait ?? 4000);
const file = `shots/${name}.png`;

// 細かい所を見たい場面は、倍率を上げて一部だけを切り取る（`scale` と `clip`）
const { errors } = await withPage(
  { scale: Number(process.env.SHOOT_SCALE ?? scene?.scale ?? 1) },
  async (page, { sleep }) => {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await sleep(waitMs);
    if (scene?.act) await scene.act(page, { sleep });
    // SHOOT_FULL=1 で切り取らずに全体を、SHOOT_CLIP=x,y,w,h で好きな所を撮る（確かめたい所だけ見るため）
    const asked = process.env.SHOOT_CLIP?.split(',').map(Number);
    const clip = asked?.length === 4
      ? { x: asked[0], y: asked[1], width: asked[2], height: asked[3] }
      : process.env.SHOOT_FULL === undefined ? scene?.clip : undefined;
    await page.screenshot({ path: file, ...(clip === undefined ? {} : { clip }) });
  },
);

const bytes = readFileSync(file).length;
console.log(`${file} (${String(Math.round(bytes / 1024))} KiB)`);
// 画面が壊れていても絵は撮れてしまう。エラーが 1 つでもあれば失敗として扱う
if (errors.length > 0) {
  console.log('ページのエラー:\n' + errors.join('\n'));
  process.exitCode = 1;
}
