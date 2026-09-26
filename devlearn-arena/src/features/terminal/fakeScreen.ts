/**
 * xterm の画面を真似る小さな模型。テストからだけ使う。
 *
 * 端末へ書いた文字列（制御文字を含む）を解釈し、学習者に見える行を返す。
 * 行の折り返し（右端で次の行へ送る）と、xterm と同じ「右端で止まって次の 1 字で送る」を真似る。
 * 解釈する制御文字は、端末が使うものだけ（\r \n、ESC[ n A/B/C/D、ESC[K、ESC[J、ESC[2J、ESC[H、色）。
 */
export class FakeScreen {
  private rows: string[][] = [[]];
  private x = 0;
  private y = 0;
  /** 右端の桁に書いた直後。次の 1 字で次の行へ送る */
  private pendingWrap = false;

  constructor(readonly cols: number) {}

  private row(y: number): string[] {
    while (this.rows.length <= y) this.rows.push([]);
    return this.rows[y] ?? [];
  }

  write(data: string): void {
    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i] ?? '';
      if (ch === '\u001b') {
        // ESC の次の「[数字 英字」を読む
        const m = /^\[(\d*)([A-Za-z])/.exec(data.slice(i + 1));
        if (m === null) continue;
        i += m[0].length;
        this.control(m[2] ?? '', m[1] === '' || m[1] === undefined ? null : Number(m[1]));
        continue;
      }
      if (ch === '\r') {
        this.x = 0;
        this.pendingWrap = false;
        continue;
      }
      if (ch === '\n') {
        // convertEol と同じく、改行は行頭へも戻す
        this.y += 1;
        this.x = 0;
        this.pendingWrap = false;
        continue;
      }
      if (this.pendingWrap) {
        this.y += 1;
        this.x = 0;
        this.pendingWrap = false;
      }
      const row = this.row(this.y);
      while (row.length < this.x) row.push(' ');
      row[this.x] = ch;
      if (this.x === this.cols - 1) this.pendingWrap = true;
      else this.x += 1;
    }
  }

  private control(code: string, n: number | null): void {
    const count = n ?? 1;
    this.pendingWrap = false;
    switch (code) {
      case 'A':
        this.y = Math.max(0, this.y - count);
        return;
      case 'B':
        this.y += count;
        return;
      case 'C':
        this.x = Math.min(this.cols - 1, this.x + count);
        return;
      case 'D':
        this.x = Math.max(0, this.x - count);
        return;
      case 'K':
        this.row(this.y).splice(this.x);
        return;
      case 'J':
        if (n === 2) {
          this.rows = [[]];
          return;
        }
        this.row(this.y).splice(this.x);
        this.rows.splice(this.y + 1);
        return;
      case 'H':
        this.x = 0;
        this.y = 0;
        return;
      default:
        // 色（m）などは画面の字に関わらない
        return;
    }
  }

  /** 見えている行。末尾の空白と、最後の空行は落とす */
  lines(): string[] {
    const out = this.rows.map((r) => r.join('').replace(/\s+$/, ''));
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out;
  }

  /** カーソルの位置（行, 桁） */
  cursor(): { row: number; col: number } {
    return { row: this.y, col: this.x };
  }
}
