// 撮影する場面。1 場面 = 1 枚の PNG。
// `act` は、開いてから撮るまでに踏む手順。playwright の page を受け取る。
//
// 場面を足すときは、必ず data-testid で掴む。見た目の class 名で掴むと、
// 見た目を直したときに撮影が黙って別の物を撮る。

/** Kubernetes の街の最初の任務 */
const K8S_FIRST = '/world/k8s';

/** 端末に 1 行打って走らせる */
async function type(page, line) {
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

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

  /** コマンドの旅路の途中。光の粒が道を走り、カメラがそれを追い、下に帯が出ている */
  '03-trace': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl run web --image=nginx');
      await need(page, 'journey-strip');
      // ゆっくり走らせて、粒が道の途中にいる所を撮る
      await page.locator('[data-rate="0.5"]').click();
      await sleep(1600);
    },
  },

  /** 施設を押した状態。右に「それが何か・いまの状態・関係するコマンド」が開く */
  '04-inspect': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      // 住人を 1 人入れてから、そのビルを押す
      await type(page, 'kubectl run web --image=nginx');
      await sleep(1200);
      await type(page, 'kubectl wait 5');
      await sleep(1200);
      await page.getByTestId('journey-close').click();
      // 街の真ん中あたりの建物を押す。押せた所で情報パネルが開く
      await page.getByTestId('city-3d').click({ position: { x: 560, y: 430 } });
      await need(page, 'building-panel');
      // 押した建物のコマンドは端末へ 1 文字ずつ打たれる。打ち終わるまで待つ
      await sleep(3000);
    },
  },
};
