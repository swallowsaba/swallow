import { expect, test } from '@playwright/test';
import { closeStart } from './start';
import { runLesson } from '../tools/scenarios/domain.mjs';

/**
 * 学習フローの E2E（docs/testing-strategy.md 7 章）。
 * 最初に作ったレッスン（found.b.04 と linux.i.01）と、分野ごとに 1 本を、画面の操作だけで 7 段を通す。
 * 実戦では最初の手順でわざと 1 度誤り、エラーの案内が出てから、最後のヒントの答えで達成する（誤り → エラーの案内 → ヒント → 成功）。
 * 実戦の形を全て含める: 端末・設定の編集・ブラウザ内 SQL・画面の操作（置く・つなぐ・並べる・読み取って答える）。
 * 前提を学んでいない状態から始める（どのレッスンもロックされない）。
 */
const LESSONS = [
  'found.b.04', 'linux.i.01',
  'net.b.01', 'web.b.01', 'sec.b.01', 'git.b.01', 'trouble.b.01', 'db.b.01', 'cicd.b.01',
  'ctr.b.01', 'docker.b.01', 'k8s.b.01', 'mon.b.01', 'cloud.b.01', 'devops.b.01',
];

test.setTimeout(180_000);

for (const id of LESSONS) {
  test(`${id}: 前提を学ばずに始め、わざと誤ってから 7 段を通す`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('./#/city');
    await page.waitForFunction(() => document.body.dataset.cityReady === '1');
    await closeStart(page);
    await page.locator('[data-testid="intro"] .intro-skip').click();

    const out = await runLesson(page, id);
    // 誤った操作で、何が起きたかと理由が出た
    expect(out.error, 'エラーの案内が出ていない').not.toBeNull();
    // 端末・設定の編集・SQL はエラーの小窓（考えられる理由・次に確かめること）、画面の操作は止まった所の赤い印と理由
    expect(out.error).toMatch(/考えられる理由|次に確かめること|止まった|入らない|先に要る/);
    // 誤った後でも、ゲームオーバーにならずに達成した
    expect(out.result).toBe('success');
    await expect(page.getByTestId('stage-done')).toBeVisible();
    expect(out.xp).toContain('XP');
    expect(errors).toEqual([]);
  });
}
