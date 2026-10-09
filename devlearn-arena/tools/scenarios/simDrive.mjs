// 画面で操作する実戦（模）を、本物のマウスのドラッグと押す操作で動かす（REWORK-PRACTICE.txt 原則 3）。
// 手順の actions（最後のヒントで通る操作。docs/content-spec.md 2.4.1）を 1 つずつ、画面の物をドラッグして行う。
// 台本（domain.mjs・rework.mjs）から使う。

const wait = (page, ms = 250) => page.waitForTimeout(ms);

/** 要素の真ん中 */
async function centerOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} が見えない`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * from の物を押さえ、to の受け口まで動かして放す。midShot を渡すと、放す前（指先が受け口の上にある時）に撮る
 */
export async function dragTo(page, from, to, midShot) {
  const a = await centerOf(page, from);
  const b = await centerOf(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // 少し動かしてから運ぶ（押しただけでは始まらない）
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await wait(page, 120);
  if (midShot) await midShot();
  await page.mouse.up();
  await wait(page, 350);
}

/** 置き場（無ければ枠）にある札の印 */
async function cardIn(page, item, slot) {
  if (slot) return `[data-slot="${slot}"] [data-card="${item}"]`;
  const inPool = await page.$(`.sim-pool [data-card="${item}"]`);
  return inPool ? `.sim-pool [data-card="${item}"]` : `[data-card="${item}"]`;
}

/** 並べるの今の並び（段ごとの札の ID） */
const stagesNow = (page) => page.evaluate(() => [...document.querySelectorAll('.sim-stage')].map((st) => [...st.querySelectorAll('[data-card]')].map((c) => c.dataset.card)));

/** 操作を 1 つ、画面の物で行う。setup は実戦の setup（問いの文を引く） */
export async function perform(page, action, setup, midShot) {
  switch (action.op) {
    case 'connect':
      return dragTo(page, `[data-node="${action.a}"]`, `[data-node="${action.b}"]`, midShot);
    case 'cut': {
      const wire = (await page.$(`[data-wire="${action.a}-${action.b}"]`)) ? `${action.a}-${action.b}` : `${action.b}-${action.a}`;
      await page.locator(`[data-wire="${wire}"] .sim-wire-hit`).click({ force: true });
      return wait(page);
    }
    case 'start':
      await page.click(`[data-start="${action.node}"]`);
      return wait(page);
    case 'send':
      await page.click(`[data-send="${action.from}>${action.to}"]`);
      // 荷物が進み終わるのを待つ
      return wait(page, 1600);
    case 'put':
      return dragTo(page, await cardIn(page, action.item), `[data-slot="${action.slot}"]`, midShot);
    case 'take':
      return dragTo(page, await cardIn(page, action.item, action.slot), '.sim-pool', midShot);
    case 'arrange': {
      // 並んでいる札を置き場へ戻してから、上の段から順に並べる（同じ段の 2 枚目からは、その段の上へ落とす）
      for (const id of (await stagesNow(page)).flat()) await dragTo(page, `.sim-stages [data-card="${id}"]`, '.sim-pool');
      for (const [i, g] of action.stages.entries()) {
        for (const [k, id] of g.entries()) await dragTo(page, `.sim-pool [data-card="${id}"]`, k === 0 ? '[data-drop="end"]' : `[data-stage="${String(i)}"]`, k === g.length - 1 && i === action.stages.length - 1 ? midShot : undefined);
      }
      return wait(page, 400 * (action.stages.length + 1));
    }
    case 'answer': {
      const prompt = setup.questions.find((q) => q.id === action.question)?.prompt;
      await page.locator(`[role="group"][aria-label="${prompt}"] .sim-option`, { hasText: action.value }).first().click();
      return wait(page);
    }
    case 'set':
      await page.locator(`[data-field="${action.field}"]`, { hasText: action.value }).first().click();
      return wait(page);
    default:
      throw new Error(`この台本では行えない操作: ${action.op}`);
  }
}

/**
 * わざと誤る操作（エラーの小窓を撮る）。つなぐは引けない線（forbid）、置くは入らない枠、並べるは順の違う並び、答えるは違う答え
 */
export function wrongAction(setup, step) {
  const first = step.actions?.[0];
  if (setup.forbid?.length) return { op: 'connect', a: setup.forbid[0].a, b: setup.forbid[0].b };
  if (setup.sends?.length) return { op: 'send', from: setup.sends[0].from, to: setup.sends[0].to };
  if (first?.op === 'put') {
    const refuse = setup.items.find((i) => i.refuse && Object.keys(i.refuse).length > 0);
    if (refuse) return { op: 'put', item: refuse.id, slot: Object.keys(refuse.refuse)[0] };
    const other = setup.slots.find((s) => s.id !== first.slot);
    return { op: 'put', item: first.item, slot: other?.id ?? first.slot };
  }
  if (first?.op === 'arrange') return { op: 'arrange', stages: [...first.stages].reverse() };
  if (first?.op === 'answer') {
    const q = setup.questions.find((x) => x.id === first.question);
    return { op: 'answer', question: first.question, value: q.options.find((o) => o !== first.value) };
  }
  return null;
}
