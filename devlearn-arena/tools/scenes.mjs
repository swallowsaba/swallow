// 撮影する場面。1 場面 = 1 枚の PNG。
// `act` は、開いてから撮るまでに踏む手順。playwright の page を受け取る。
//
// 場面を足すときは、必ず data-testid で掴む。見た目の class 名で掴むと、
// 見た目を直したときに撮影が黙って別の物を撮る。

/** Kubernetes の街の最初の任務 */
const K8S_FIRST = '/world/k8s';

/** その印が出るまで待つ。出なければ理由を投げる（黙って違う画面を撮らない） */
async function need(page, testId, timeout = 15000) {
  await page.getByTestId(testId).first().waitFor({ state: 'visible', timeout });
}

/** 初回の案内を閉じる。出ていなければ何もしない */
export async function dismissOnboarding(page) {
  const dialog = page.getByTestId('onboarding');
  if ((await dialog.count()) === 0) return;
  // 「このまま はじめる」。Esc でも閉じるが、端末に焦点があると鍵盤が届かない
  await dialog.getByRole('button').first().click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
}

export const SCENES = {
  '01-start': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await sleep(2000);
    },
  },

  /** 案内ツアーの途中。カメラが施設に寄り、札が「これは何か」を出している */
  '02-tour': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'tour-invite');
      await page.getByTestId('tour-start').click();
      await need(page, 'tour-card');
      // 2 か所目まで進める。カメラが移った先を撮る
      await sleep(2500);
      await page.getByTestId('tour-next').click();
      await sleep(3000);
    },
  },
};
