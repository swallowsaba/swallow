// 撮影する場面。1 場面 = 1 枚の PNG。
// `act` は、開いてから撮るまでに踏む手順。playwright の page を受け取る。
//
// 場面を足すときは、必ず data-testid で掴む。見た目の class 名で掴むと、
// 見た目を直したときに撮影が黙って別の物を撮る。

/** Kubernetes の街の最初の任務 */
const K8S_FIRST = '/world/k8s?stage=operate';

/** 学びの流れの最初から。体験の段で開く */
const K8S_FLOW = '/world/k8s';

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

/** ネットワークの街。道（ケーブル）を塞ぐ場面で使う */
const NET_HOP = '/world/net?mission=net/05/ttl-hop&stage=operate';

/** 「なぜ」の引き出し。左の端末の右に開く。字が読めるよう、ここだけを切り取って撮る */
const DRAWER = { x: 450, y: 64, width: 540, height: 760 };

/** 課題の札の「なぜ」を押して、遊べる図解を開く */
async function openWhy(page) {
  await page.getByTestId('task-why').click();
  await need(page, 'playground');
}

/** 撮る前か後か。`SHOOT_BEFORE=1` なら操作する前を撮る */
const before = () => process.env.SHOOT_BEFORE !== undefined;

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

  /** 障害を起こした状態。ビルの灯りが消え、赤い光が原因の場所を示す */
  '05-break': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl run web --image=nginx');
      await sleep(800);
      await type(page, 'kubectl wait 6');
      await sleep(1200);
      await page.getByTestId('journey-close').click();
      await page.getByTestId('fault-open').click();
      await page.locator('[data-fault="node-down"]').click();
      await sleep(1000);
      await type(page, 'kubectl wait 6');
      await sleep(1500);
      await page.getByTestId('journey-close').click();
      await page.getByTestId('fault-tell').click();
      await sleep(1500);
    },
  },

  /**
   * 倒れた住人。取れない荷物（イメージ）を持った住人が入居できず、
   * ビルの前に伏せ、担架が運び出していく所を近くから撮る
   */
  '08-fallen': {
    path: K8S_FIRST,
    wait: 5000,
    // 住人は 1 メートルほどしかない。ビルの足元だけを切り取って、大きく見る
    clip: { x: 620, y: 330, width: 600, height: 380 },
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl run broken --image=does-not-exist');
      await sleep(800);
      await type(page, 'kubectl wait 40');
      await sleep(1500);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      // 壊れた荷物は障害として見つかり、カメラがそのビルへ寄る。寄り終わるのを待つ
      await sleep(4000);
    },
  },

  /** 用語にマウスを乗せた所。言い換え・街での例え・小さな図解が浮かぶ */
  '10-term': {
    path: K8S_FIRST,
    wait: 5000,
    // 札の中だけを切り取る。浮かぶ説明の字が読める大きさで見る
    clip: { x: 452, y: 60, width: 620, height: 640 },
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await page.getByTestId('task-terms').locator('[data-term]').first().hover();
      await sleep(1200);
    },
  },

  /**
   * 問い合わせの答え。`kubectl get nodes` は窓口と台帳までしか行かないが、
   * 読み上げた答えにあたるビルがその場で光る
   */
  '09-answer': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl get nodes');
      await sleep(3000);
    },
  },

  /** 道路を塞いだ状態。ケーブルを抜いた道が断たれ、その先へ車が進めない */
  '07-blocked': {
    path: NET_HOP,
    wait: 5000,
    // 断たれた道は 7 メートルしかない。原因の周りだけを切り取って、大きく見る
    clip: { x: 760, y: 200, width: 620, height: 400 },
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await page.getByTestId('fault-open').click();
      await page.locator('[data-fault="link-down"]').click();
      await sleep(3000);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      await sleep(3000);
    },
  },

  /**
   * バス停の行き先を間違えた所。バス停（Service）から住人のビルへ伸びていた路線が消え、
   * バス停に赤い光が立つ。`SHOOT_BEFORE=1` で、間違える前（路線がある姿）を撮る
   */
  '11-selector': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl create deployment web --image=nginx');
      await sleep(600);
      await type(page, 'kubectl expose deployment web --port=80');
      await sleep(600);
      await type(page, 'kubectl wait 10');
      await sleep(800);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      // バス路線だけを浮かせて見る。バス停からどのビルへ路線が伸びているかが分かる
      await page.locator('[data-view="bus"]').click();
      if (process.env.SHOOT_BEFORE !== undefined) {
        await sleep(3000);
        return;
      }
      await page.getByTestId('fault-open').click();
      await page.locator('[data-fault="wrong-selector"]').click();
      await sleep(800);
      await type(page, 'kubectl wait 4');
      await sleep(800);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      await sleep(4000);
    },
  },

  /** 直した後。灯りが戻り、赤い光が消えている */
  '06-fixed': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl run web --image=nginx');
      await sleep(800);
      await type(page, 'kubectl wait 6');
      await sleep(1200);
      await page.getByTestId('journey-close').click();
      await page.getByTestId('fault-open').click();
      await page.locator('[data-fault="node-down"]').click();
      await sleep(1000);
      await type(page, 'kubectl wait 6');
      await sleep(1200);
      await page.getByTestId('journey-close').click();
      // 学習者が自分で直す
      await type(page, 'kubectl node-up node-1');
      await sleep(800);
      await type(page, 'kubectl wait 6');
      await sleep(1500);
      await page.getByTestId('journey-close').click();
      await sleep(1500);
    },
  },
  /** 遊べる図解: ビルと住人。住人を別のビルへ運び、満員のビルには断られる */
  '12-play-pod': {
    path: K8S_FIRST,
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      // 本物のドラッグで運ぶ
      await page.locator('[data-pod="web-1"]').dragTo(page.locator('[data-node="node-2"]'));
      await sleep(3500);
      await page.locator('[data-pod="web-2"]').dragTo(page.locator('[data-node="node-2"]'));
      await sleep(250);
    },
  },

  /** 遊べる図解: 注文と実際。住人を消すと、歯車が回って作り直される途中 */
  '13-play-desired': {
    path: K8S_FIRST,
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl get nodes');
      await sleep(600);
      await type(page, 'kubectl run web --image=nginx');
      await sleep(600);
      await type(page, 'kubectl wait 10');
      await sleep(1200);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.locator('[data-pod]').first().click();
      await sleep(900);
    },
  },

  /** 遊べる図解: 作業ツリー → インデックス → コミット。札を運んで写真を撮った後 */
  '14-play-git': {
    path: '/world/git?mission=git%2F01%2Fobjects&stage=operate',
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.locator('[data-card="app.txt"]').dragTo(page.locator('[data-area="index"]'));
      await sleep(900);
      if (process.env.SHOOT_STAGE === '1') return;
      await page.locator('[data-card="notes.txt"]').dragTo(page.locator('[data-area="index"]'));
      await sleep(600);
      await page.getByTestId('take-photo').click();
      await sleep(1200);
    },
  },

  /** 遊べる図解: 荷物が機器を渡る。切れた線でいったん止まり、つなぎ直すと届く */
  '15-play-net': {
    path: NET_HOP,
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.getByTestId('send-pc2').click();
      await sleep(2500);
      if (process.env.SHOOT_STAGE === '1') return;
      await page.locator('[data-link="r1:eth1"]').click();
      await sleep(500);
      await page.getByTestId('send-pc2').click();
      await sleep(1500);
    },
  },

  /** 遊べる図解: 住人の段。壊れた荷物で、再試行の間隔が伸びていく */
  '16-play-life': {
    path: K8S_FIRST,
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl get nodes');
      await sleep(1200);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.getByTestId('run-broken').click();
      for (let i = 0; i < 14; i += 1) {
        await page.getByTestId('tick').click();
        await sleep(150);
      }
      await sleep(800);
    },
  },
  /** 遊べる図解: バス停と名札。c の名札を付け替えると、バス停から線が伸びる */
  '17-play-svc': {
    path: '/world/k8s?mission=k8s%2F07%2Fno-endpoint-web&stage=operate',
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.locator('[data-pod="c"]').click();
      await sleep(2500);
    },
  },

  /** 遊べる図解: ファイルと箱。箱が無いまま入れようとして断られ、箱を作って片付けた後 */
  '18-play-files': {
    path: '/world/kernel?mission=kernel%2F00%2Fshell-warmup&stage=operate',
    wait: 5000,
    clip: DRAWER,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await openWhy(page);
      await sleep(1000);
      if (before()) return;
      await page.locator('[data-file="app.log"]').dragTo(page.locator('[data-dir="logs"]'));
      await sleep(600);
      if (process.env.SHOOT_STAGE === '1') return;
      await page.getByTestId('mkdir').click();
      await sleep(400);
      await page.locator('[data-file="app.log"]').dragTo(page.locator('[data-dir="logs"]'));
      await sleep(400);
      await page.locator('[data-file="db.log"]').dragTo(page.locator('[data-dir="logs"]'));
      await sleep(1200);
    },
  },
  /**
   * 車（REWORK 7-1 / 7-2）。道を近くから大きく撮る。
   * `SHOOT_LATER=1` なら 2 秒遅れて撮る。2 枚を比べて、車が道に沿って進んだことを確かめる
   */
  '19-cars': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await sleep(1500);
      // 寄る。車は 4 メートルしかないので、遠くからでは形が分からない
      await page.mouse.move(1000, 450);
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, -400);
        await sleep(300);
      }
      await sleep(1500);
      // 同じ画面で 2 秒おいて 2 枚撮る。車が道に沿って進んだかを比べる
      await page.screenshot({ path: 'shots/19-cars-early.png' });
      await sleep(2000);
    },
  },

  /**
   * 時間を進める前と後（REWORK 7-4）。住人が道からビルへ歩いている所と、
   * `kubectl wait 5` の後にその階の窓が灯った所。`SHOOT_BEFORE=1` で前を撮る
   */
  '20-wait': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-card');
      await type(page, 'kubectl get nodes');
      await sleep(800);
      await type(page, 'kubectl run web --image=nginx');
      await sleep(800);
      // 1 tick 進めると行き先のビルが決まり、住人が道からビルへ歩き出す
      await type(page, 'kubectl wait 1');
      await sleep(1500);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      // 案内ツアーの「住人」の所まで進める。住人のいるビルにカメラが寄る
      await page.getByTestId('tour-start').first().click();
      await need(page, 'tour-card');
      for (let i = 0; i < 8; i += 1) {
        const title = await page.getByTestId('tour-stop-title').textContent();
        if (title?.includes('住人') === true) break;
        await page.getByTestId('tour-next').first().click();
        await sleep(600);
      }
      await sleep(3500);
      // 街の時間を止める。昼の光のまま撮れる（止めている間は時間帯も動かない）
      await page.locator('[data-testid="speed"] [data-speed="pause"]').click();
      await sleep(800);
      if (before()) return;
      await type(page, 'kubectl wait 5');
      await sleep(1500);
      await page.getByTestId('journey-close').click().catch(() => undefined);
      await sleep(2000);
    },
  },
  /** 学びの流れ 1: 体験。住人を手でビルへ案内し、だんだん追いつかなくなる */
  'flow-1-experience': {
    path: K8S_FLOW,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'experience');
      await page.getByTestId('experience-start').click();
      // 何人か案内してから、手が止まって溜まっていく様子を撮る
      for (const id of ['t3', 't3', 't1', 't4']) {
        await sleep(2600);
        await page.locator(`[data-thing="${id}"]`).first().click();
      }
      await sleep(Number(process.env.SHOOT_PLAY ?? 9000));
    },
  },

  /** 体験の終わり。手でやった結果と、困りごとの 1 行 */
  'flow-1-result': {
    path: K8S_FLOW,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await page.getByTestId('experience-start').click();
      // 何もしないでいると待ちが溜まり、30 秒を過ぎたところで終わる
      await need(page, 'experience-result', 70000);
      await sleep(800);
    },
  },

  /** 学びの流れ 2: 登場。施設が建ち、用語が町の物に矢印で結ばれる */
  'flow-2-reveal': {
    path: K8S_FLOW + '?stage=reveal',
    wait: 4000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'reveal');
      await sleep(Number(process.env.SHOOT_REVEAL ?? 5000));
    },
  },

  /** 学びの流れ 3: 確かめ。外れを押して、正解の所と理由が町に出たところ */
  'flow-3-quiz': {
    path: K8S_FLOW + '?stage=quiz',
    wait: 4000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'quiz');
      await page.locator('[data-thing="t3"]').first().click();
      await page.locator('[data-thing="t1"]').first().click();
      await page.getByTestId('quiz-answer').click();
      await need(page, 'quiz-verdict');
      await sleep(800);
    },
  },

  /** 確かめの並べるクイズ。わざと外して、正しい順の図が出たところ */
  'flow-3-order': {
    path: K8S_FLOW + '?stage=quiz',
    wait: 4000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'quiz');
      // 1 問目は正しく答えて、2 問目（並べる）へ
      for (const id of ['t1', 't2', 't4']) await page.locator(`[data-thing="${id}"]`).first().click();
      await page.getByTestId('quiz-answer').click();
      await page.getByTestId('quiz-next').click();
      await need(page, 'quiz-card');
      const cards = page.getByTestId('quiz-card');
      const n = await cards.count();
      for (let i = 0; i < n; i += 1) await cards.nth(i).click();
      await need(page, 'quiz-verdict');
      await sleep(600);
    },
  },

  /** 学びの流れ 4: 操作。目的が先に出ていて、打った後に街で起きたことが返る */
  'flow-4-operate': {
    path: K8S_FIRST,
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-purpose');
      await type(page, 'kubectl get nodes');
      await need(page, 'afterward');
      await sleep(2500);
    },
  },
  /** 街が育った所（REWORK 2-1・2-2）。カメラが寄り、光の輪と「＋1 階」の札。右上に成長の記録 */
  'growth-burst': {
    path: K8S_FIRST,
    wait: 6000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-purpose');
      await type(page, 'kubectl get nodes');
      await need(page, 'growth-entry');
      await need(page, 'city-3d-growth');
      // 粒の旅が終わってカメラが育った所へ寄るのを待つ
      await sleep(Number(process.env.SHOOT_WAIT ?? 2600));
    },
  },
  /** 学びの流れ 5: 振り返り。最初の任務を模範解答どおりに打って終え、始める前と終えた後の街を並べる */
  'flow-5-recap': {
    path: K8S_FIRST,
    wait: 6000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'task-purpose');
      // 始める前の街が撮れるのを待つ（3D の街が組み上がってから撮る）
      await sleep(3000);
      const lines = [
        'kubectl get nodes',
        'kubectl run web --image=nginx',
        'kubectl wait 10',
        'kubectl delete pod web',
        'kubectl wait 10',
        'kubectl create deployment web --image=nginx --replicas=2',
        'kubectl wait 10',
      ];
      for (const line of lines) {
        await type(page, line);
        await sleep(900);
      }
      // 消す住人の名前は街ごとに違う。一覧から web- で始まる最初の名前を拾う
      const name = await page.evaluate(() => {
        const text = document.querySelector('[data-testid="terminal"]')?.textContent ?? '';
        return /web-[a-z0-9]+-\d+/.exec(text)?.[0] ?? 'web-b0xusf-00001';
      });
      await type(page, `kubectl delete pod ${name}`);
      await sleep(900);
      await type(page, 'kubectl wait 10');
      await need(page, 'recap', 20000);
      await sleep(2500);
    },
  },
  /** どの分野でも使える体験の場面。URL で分野を渡す（node tools/shoot.mjs flow-1-any /world/git） */
  'flow-1-any': {
    path: '/world/kernel',
    wait: 5000,
    async act(page, { sleep }) {
      await need(page, 'arena');
      await dismissOnboarding(page);
      await need(page, 'experience');
      await page.getByTestId('experience-start').click();
      const things = page.locator('[data-thing]');
      for (let i = 0; i < 5; i += 1) {
        await sleep(2400);
        await things.nth((i * 3) % (await things.count())).click();
      }
      await sleep(4000);
    },
  },
};
