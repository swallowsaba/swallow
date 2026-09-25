// 撮影と検査で共用する、ブラウザの立ち上げ。
//
// ブラウザは同時に 1 つしか立ち上げない（WebGL をソフトウェアで描くと 1〜2 GiB 使うため）。
// ロックファイルで順番待ちをし、preview サーバが無ければ自分で立てて、自分で片付ける。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const LOCK = '.shoot.lock';
const PORT = Number(process.env.SHOOT_PORT ?? 4173);
export const BASE = process.env.SHOOT_BASE ?? `http://localhost:${String(PORT)}`;

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

/**
 * ブラウザを 1 つ立ち上げ、まっさらな頁を渡して `use` を走らせる。
 * 頁で起きたエラーは集めて返す。画面が壊れていても絵は撮れてしまうため。
 */
export async function withPage({ scale = 1, reducedMotion = 'no-preference' } = {}, use) {
  await acquire();
  let server = null;
  try {
    mkdirSync('shots', { recursive: true });
    server = await serve();
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl'] });
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: scale,
        // OS の「アニメーションを減らす」を再現できるようにする。Windows でこれが入っていると街が止まった（REWORK 3-1）
        reducedMotion,
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
      const result = await use(page, { sleep, base: BASE });
      return { result, errors };
    } finally {
      await browser.close();
    }
  } finally {
    if (server) server.kill();
    if (existsSync(LOCK)) unlinkSync(LOCK);
  }
}
