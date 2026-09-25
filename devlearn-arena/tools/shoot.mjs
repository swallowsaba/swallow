#!/usr/bin/env node
// 撮影用。ブラウザを同時に1つしか立ち上げない（WebGL をソフトウェアで描くと 1〜2 GiB 使うため）。
//
//   node tools/shoot.mjs <場面名> [URLのパス] [待つミリ秒]
//
// 場面名が tools/scenes.mjs に登録してあれば、その手順（クリックや入力）を踏んでから撮る。
// 登録が無ければ、開いて待つだけで撮る。
//
// preview サーバは自分で立てて、自分で片付ける。すでに開いていればそれを使う。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { SCENES } from './scenes.mjs';

const LOCK = '.shoot.lock';
const PORT = Number(process.env.SHOOT_PORT ?? 4173);
const BASE = process.env.SHOOT_BASE ?? `http://localhost:${String(PORT)}`;

const [name = 'shot', pathArg, waitArg] = process.argv.slice(2);
const scene = SCENES[name];
const path = pathArg ?? scene?.path ?? '/';
const waitMs = Number(waitArg ?? scene?.wait ?? 4000);

/** 撮影の順番待ち。ロックファイルを排他で作れた者だけが進む */
async function acquire() {
  for (let i = 0; i < 600; i += 1) {
    try {
      closeSync(openSync(LOCK, 'wx'));
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('撮影の順番待ちが 5 分を超えた');
}

async function alive() {
  try {
    const res = await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** preview を立てる。すでに誰かが立てていれば何もしない */
async function serve() {
  if (await alive()) return null;
  if (!existsSync('dist/index.html')) throw new Error('dist が無い。先に npm run build を実行する');
  // vite の実体を node で直に起動する。npx 経由だと Windows で spawn EINVAL になる
  const proc = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    if (await alive()) return proc;
  }
  proc.kill();
  throw new Error('preview サーバが立ち上がらなかった');
}

await acquire();
let server = null;
try {
  mkdirSync('shots', { recursive: true });
  server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl'] });
  // 細かい所を見たい場面は、倍率を上げて一部だけを切り取る（`scale` と `clip`）
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: Number(process.env.SHOOT_SCALE ?? scene?.scale ?? 1),
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  // 保存された進み具合に左右されないよう、毎回まっさらな状態から撮る
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* 使えない環境では何もしない */
    }
  });
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await sleep(waitMs);
  if (scene?.act) await scene.act(page, { sleep });
  const file = `shots/${name}.png`;
  // SHOOT_FULL=1 で切り取らずに全体を、SHOOT_CLIP=x,y,w,h で好きな所を撮る（確かめたい所だけ見るため）
  const asked = process.env.SHOOT_CLIP?.split(',').map(Number);
  const clip = asked?.length === 4
    ? { x: asked[0], y: asked[1], width: asked[2], height: asked[3] }
    : process.env.SHOOT_FULL === undefined ? scene?.clip : undefined;
  await page.screenshot({ path: file, ...(clip === undefined ? {} : { clip }) });
  await browser.close();
  const bytes = readFileSync(file).length;
  console.log(`${file} (${String(Math.round(bytes / 1024))} KiB)`);
  // 画面が壊れていても絵は撮れてしまう。エラーが 1 つでもあれば失敗として扱う
  if (errors.length > 0) {
    console.log('ページのエラー:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  if (server) server.kill();
  if (existsSync(LOCK)) unlinkSync(LOCK);
}
