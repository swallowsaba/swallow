/**
 * 図の操作から来たコマンドを、端末に1文字ずつ打ち込んでから実行する。
 * 人が打ったのと同じ見え方にして、「いまの操作はこのコマンドだった」と目で追えるようにする。
 * 続けて押されたコマンドは順に待たせ、前のコマンドを打ち終えてから次を打つ。
 */

export interface TypistOptions {
  /** 1文字を入力欄に足す */
  typeChar: (ch: string) => void;
  /** 打ち終えた行を実行する */
  run: () => void;
  /** 1文字ごとの間隔（ミリ秒） */
  charMs: number;
  /** 打ち終えてから実行するまでの間（ミリ秒） */
  pauseMs?: number;
}

export interface Typist {
  /** 行を打つ。before は打ち始める直前に呼ぶ（注記を出すなど） */
  enqueue: (line: string, before?: () => void) => void;
  /** 打ちかけ・待ちのものを全部捨てる（端末を閉じるとき） */
  cancel: () => void;
  /** 打っている最中か */
  busy: () => boolean;
}

export function createTypist({ typeChar, run, charMs, pauseMs = charMs * 4 }: TypistOptions): Typist {
  const queue: { line: string; before?: () => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let typing = false;

  const next = (): void => {
    const item = queue.shift();
    if (item === undefined) {
      typing = false;
      return;
    }
    typing = true;
    item.before?.();
    const chars = [...item.line];
    let i = 0;
    const step = (): void => {
      const ch = chars[i];
      if (ch === undefined) {
        timer = setTimeout(() => {
          timer = null;
          run();
          next();
        }, pauseMs);
        return;
      }
      typeChar(ch);
      i += 1;
      timer = setTimeout(step, charMs);
    };
    step();
  };

  return {
    enqueue: (line, before) => {
      queue.push({ line, before });
      if (!typing) next();
    },
    cancel: () => {
      queue.length = 0;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      typing = false;
    },
    busy: () => typing,
  };
}
