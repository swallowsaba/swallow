import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { checkImport, exportFile, type ExportFile, type ImportCheck } from '@/save/manage';
import type { SaveData, Settings } from '@/save/schema';
import { Icon } from '@/ui/icons/Icon';
import { HudWindow } from '@/ui/Window';
import { useSaveStatus } from '../saveStatus';
import type { Session } from '../session';
import './SettingsScreen.css';

/**
 * 設定（docs/ui-design.md 2 章: 上の帯の「設定」から。docs/product-spec.md 4 章）。
 * 左: 音・動きを減らす・文字の大きさ・表示品質・ふりがな・コマンドの候補・ミニマップ。選ぶとすぐ効き、自動で保存する。
 * 右: 保存。自動保存の様子・書き出す・読み込む・最初からやり直す（docs/data-model.md 7 章）。
 * 読み込みとやり直しは、今の記録を置き換えるので、中身を示して確かめてから行う。
 */

/** 保存の操作（src/main.tsx が保存先と自動保存につなぐ） */
export interface SaveControls {
  /** 今の記録の保存データ */
  snapshot: () => SaveData;
  /** 保存データを置き換えて開き直す。message は開き直した後に都市画面で知らせる。書けなければ投げる */
  replace: (data: SaveData, message: string) => Promise<void>;
  /** 最初からやり直す時の保存データ */
  fresh: () => SaveData;
  /** ファイルとして端末に保存する */
  download: (file: ExportFile) => void;
}

/** ISO 日時を「2026-10-09 10:00」に */
const when = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
const format = (n: number): string => n.toLocaleString('ja-JP');
const reasonOf = (e: unknown): string => (e instanceof Error ? (e.name !== 'Error' ? e.name : e.message) : String(e));

/** 設定の項目。選べる値と、その名前 */
type Choice<K extends keyof Settings> = { key: K; label: string; note: string; options: { value: Settings[K]; label: string }[] };
type AnyChoice = { [K in keyof Settings]: Choice<K> }[keyof Settings];

const CHOICES: readonly AnyChoice[] = [
  { key: 'sound', label: '音', note: '正解・手順の達成・修了・エラーの効果音', options: [{ value: false, label: '鳴らさない' }, { value: true, label: '鳴らす' }] },
  { key: 'reduceMotion', label: '動きを減らす', note: '画面の切り替え・光の輪・車と人の動きを止める', options: [{ value: false, label: '減らさない' }, { value: true, label: '減らす' }] },
  { key: 'fontScale', label: '文字の大きさ', note: '全ての画面の文字', options: [{ value: 1, label: '標準' }, { value: 1.15, label: '大' }, { value: 1.3, label: '特大' }] },
  { key: 'quality', label: '表示品質', note: '低くすると都市の描き方を軽くする（動きが重い時に）', options: [{ value: 'low', label: '低' }, { value: 'standard', label: '標準' }, { value: 'high', label: '高' }] },
  { key: 'furigana', label: 'ふりがな', note: '漢字の専門用語に読みを添える', options: [{ value: false, label: '付けない' }, { value: true, label: '付ける' }] },
  { key: 'commandHints', label: 'コマンドの候補', note: '実戦の端末の下に、今打てるコマンドの候補を出す', options: [{ value: true, label: '出す' }, { value: false, label: '出さない' }] },
  { key: 'minimap', label: 'ミニマップ', note: '都市画面の左下に、都市の全体と今見ている所を出す', options: [{ value: true, label: '出す' }, { value: false, label: '出さない' }] },
];

function Prefs({ session }: { session: Session }) {
  const settings = useStore(session.settings, (s) => s.settings);
  const set = useStore(session.settings, (s) => s.set);
  return (
    <section className="settings-prefs" aria-labelledby="settings-prefs-title">
      <header className="settings-section-head">
        <span className="settings-save-icon"><Icon name="settings" size={22} /></span>
        <h2 id="settings-prefs-title" className="settings-heading">遊び方</h2>
      </header>
      <ul className="settings-rows">
        {CHOICES.map((c) => (
          <li key={c.key} className="settings-row">
            <span className="settings-row-text">
              <span className="settings-row-label">{c.label}</span>
              <span className="settings-row-note">{c.note}</span>
            </span>
            <span className="window-switch settings-switch" role="group" aria-label={c.label} data-setting={c.key}>
              {c.options.map((o) => (
                <button key={String(o.value)} type="button" aria-pressed={settings[c.key] === o.value} onClick={() => set({ [c.key]: o.value })}>
                  {o.label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Pending =
  | { kind: 'none' }
  | { kind: 'import'; check: ImportCheck }
  | { kind: 'reset' };

export function SettingsScreen({ session, saves, onClose }: { session: Session; saves: SaveControls; onClose: () => void }) {
  const problem = useSaveStatus((s) => s.message);
  const [pending, setPending] = useState<Pending>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (): void => saves.download(exportFile(saves.snapshot()));
  const cancel = (): void => {
    setPending({ kind: 'none' });
    setFailed(null);
  };
  const replace = async (data: SaveData, message: string): Promise<void> => {
    setBusy(true);
    setFailed(null);
    try {
      await saves.replace(data, message);
    } catch (e) {
      setFailed(`保存できなかった（${reasonOf(e)}）。今の記録はそのまま残っている。`);
    } finally {
      setBusy(false);
    }
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // 同じファイルを選び直しても読めるように、選んだ物を空にしておく
    e.target.value = '';
    if (!file) return;
    setFailed(null);
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setPending({ kind: 'import', check: { ok: false, what: `ファイルを開けなかった（${reasonOf(err)}）。`, next: 'もう一度ファイルを選ぶ。' } });
      return;
    }
    setPending({ kind: 'import', check: checkImport(text) });
  };

  return (
    <HudWindow testId="settings-screen" icon="settings" title="設定" sub="遊び方と、遊んだ記録の保存" onClose={onClose} className="settings">
      <div className="settings-body">
        <Prefs session={session} />
        <section className="settings-save" aria-labelledby="settings-save-title">
          <header className="settings-section-head">
            <span className="settings-save-icon"><Icon name="save" size={22} /></span>
            <h2 id="settings-save-title" className="settings-heading">保存</h2>
            <p className="settings-autosave" data-testid="autosave-state">
              {problem ? (
                <span className="settings-problem"><Icon name="alert" size={16} />{problem}</span>
              ) : (
                <>このブラウザの中に自動で保存している（操作の 2 秒後と、レッスンの段が進むたび）。リロードやブラウザを閉じた後も、続きから遊べる。</>
              )}
            </p>
          </header>

          <div className="settings-bays">
            {/* 書き出す */}
            <div className="settings-bay">
              <h3 className="settings-bay-title"><Icon name="export" size={20} />書き出す</h3>
              <p className="settings-bay-text">
                今の都市・学習の記録・ミッション・設定を、1 つのファイル（devlearn-save-日付.json）にして端末に保存する。
                別の PC やブラウザへ移る時、念のため残しておく時に使う。
              </p>
              <div className="settings-actions">
                <button type="button" className="settings-primary" onClick={download} disabled={busy}>
                  <Icon name="export" size={18} />書き出す
                </button>
              </div>
            </div>

            {/* 読み込む */}
            <div className="settings-bay">
              <h3 className="settings-bay-title"><Icon name="import" size={20} />読み込む</h3>
              {pending.kind === 'import' && pending.check.ok ? (
                <div className="settings-confirm" data-testid="import-preview">
                  <dl className="settings-facts">
                    <dt>都市</dt><dd>{pending.check.summary.city}（{pending.check.summary.mayor}）</dd>
                    <dt>保存した時</dt><dd className="num">{when(pending.check.summary.savedAt)}</dd>
                    <dt>XP</dt><dd><span className="num">{format(pending.check.summary.xp)}</span> XP</dd>
                    <dt>修了</dt><dd><span className="num">{format(pending.check.summary.completed)}</span> 本</dd>
                  </dl>
                  {pending.check.summary.migratedFrom !== undefined ? (
                    <p className="settings-bay-text">古い版（版 {pending.check.summary.migratedFrom}）のファイルを、今の形に移して読む。</p>
                  ) : null}
                  <p className="settings-warn">置き換えると、今の記録はこのファイルの記録に変わる。今の記録を残したい時は、先に書き出す。</p>
                  <div className="settings-actions">
                    <button type="button" className="settings-secondary" onClick={cancel} disabled={busy}>やめる</button>
                    <button
                      type="button"
                      className="settings-primary"
                      disabled={busy}
                      onClick={() => {
                        const { check } = pending;
                        if (check.ok) void replace(check.data, `保存データを読み込んだ（${check.summary.city}・${when(check.summary.savedAt)} に保存した記録）。`);
                      }}
                    >
                      <Icon name="import" size={18} />置き換える
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="settings-bay-text">
                    書き出したファイルを選び、その記録で続きから遊ぶ。選んだ後に中身を示すので、確かめてから置き換える。
                  </p>
                  {pending.kind === 'import' && !pending.check.ok ? (
                    <div className="settings-error" data-testid="import-error" role="alert">
                      <p><Icon name="alert" size={16} />{pending.check.what}</p>
                      <p>{pending.check.next}</p>
                    </div>
                  ) : null}
                  <div className="settings-actions">
                    <button type="button" className="settings-primary" onClick={() => fileRef.current?.click()} disabled={busy || pending.kind === 'reset'}>
                      <Icon name="import" size={18} />ファイルを選ぶ
                    </button>
                  </div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".json,application/json" className="settings-file" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} />
            </div>

            {/* 最初からやり直す */}
            <div className="settings-bay">
              <h3 className="settings-bay-title"><Icon name="restart" size={20} />最初からやり直す</h3>
              {pending.kind === 'reset' ? (
                <div className="settings-confirm" data-testid="reset-confirm">
                  <p className="settings-warn">
                    都市・学習の記録・XP・ミッションが全て消え、新しい都市で始める。設定は残る。
                    後で戻したい時は、先に書き出しておく。
                  </p>
                  <div className="settings-actions">
                    <button type="button" className="settings-secondary" onClick={cancel} disabled={busy}>やめる</button>
                    <button type="button" className="settings-secondary" onClick={download} disabled={busy}>
                      <Icon name="export" size={16} />先に書き出す
                    </button>
                    <button
                      type="button"
                      className="settings-primary is-danger"
                      disabled={busy}
                      onClick={() => void replace(saves.fresh(), '最初からやり直した。新しい都市で始める。')}
                    >
                      <Icon name="restart" size={18} />やり直す
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="settings-bay-text">
                    今の都市と学習の記録を消して、小さな町から始め直す。消す前に、もう一度確かめる。
                  </p>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="settings-secondary"
                      disabled={busy || (pending.kind === 'import' && pending.check.ok)}
                      onClick={() => {
                        setFailed(null);
                        setPending({ kind: 'reset' });
                      }}
                    >
                      <Icon name="restart" size={18} />最初からやり直す
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {failed ? (
            <p className="settings-error is-line" data-testid="replace-error" role="alert"><Icon name="alert" size={16} />{failed}</p>
          ) : null}
        </section>
      </div>
    </HudWindow>
  );
}
