import { chapter, doc } from '../build';
import type { Track } from '../types';

const MAN = (page: string, section = 1) =>
  `https://man7.org/linux/man-pages/man${String(section)}/${page}.${String(section)}.html`;
const BASH = (anchor: string) =>
  `https://www.gnu.org/software/bash/manual/html_node/${anchor}.html`;

/**
 * 端末とシェルの土台。
 * ここが分かっていないと、Git も Kubernetes も「呪文」になってしまう。
 * 触る → 読む → 組み合わせる → 直す、の順で積む。
 */
export const kernelTrack: Track = {
  id: 'kernel',
  title: 'Linux とシェル',
  goal: '端末の上で、状態を確かめながら手を動かせるようになる',
  phase: 'P2',
  chapters: [
    chapter('kernel', 0, 'はじめの一歩', '端末に何を打つと何が起きるのか、まず身体で覚える。',
      [doc('Bash Reference Manual', BASH('index'))], [
        ['shell-warmup', 'シェルに慣れる', 'drill', 8],
        ['where-am-i', 'いまどこに居るのかを言えるようにする', 'drill', 6,
          [doc('pwd(1)', MAN('pwd'))]],
        ['read-a-file', 'ファイルの中身を読む', 'drill', 6,
          [doc('cat(1)', MAN('cat'))]],
        ['help-yourself', '分からないコマンドの調べ方', 'concept', 6],
        ['disk-full', 'BOSS: ディスク逼迫', 'boss', 20],
      ]),

    chapter('kernel', 1, 'ファイルとディレクトリ', '木構造を歩き、作り、動かし、消す。',
      [doc('File System Basics', MAN('ls'))], [
        ['absolute-relative', '絶対パスと相対パス', 'concept', 8],
        ['navigate', 'cd と .. と - を使い分ける', 'drill', 8,
          [doc('cd (bash builtin)', BASH('Bourne-Shell-Builtins'))]],
        ['make-tree', 'mkdir -p でまとめて掘る', 'drill', 8,
          [doc('mkdir(1)', MAN('mkdir'))]],
        ['copy-move', 'cp と mv、上書きの落とし穴', 'drill', 10,
          [doc('cp(1)', MAN('cp'))]],
        ['remove-safely', 'rm -r を怖がらずに、しかし慎重に', 'drill', 10,
          [doc('rm(1)', MAN('rm'))]],
        ['boss-misplaced', 'BOSS: 配置を間違えたファイル群を直す', 'boss', 15],
      ]),

    chapter('kernel', 2, '見る・数える・探す', '中身を確かめる手段を増やす。',
      [doc('grep(1)', MAN('grep'))], [
        ['head-tail', '先頭と末尾だけ見る', 'drill', 8,
          [doc('head(1)', MAN('head'))]],
        ['wc-count', '行数・語数・文字数を数える', 'drill', 8,
          [doc('wc(1)', MAN('wc'))]],
        ['grep-basics', 'grep で行を絞る', 'drill', 10],
        ['grep-regex', '正規表現で絞り込む', 'drill', 12],
        ['find-files', 'find で条件に合うパスを集める', 'drill', 12,
          [doc('find(1)', MAN('find'))]],
        ['boss-find-the-cause', 'BOSS: ログから原因の行を1本引き当てる', 'boss', 18],
      ]),

    chapter('kernel', 3, 'テキストを加工する', '行と列として扱えるようになると、道具が繋がる。',
      [doc('Coreutils', 'https://www.gnu.org/software/coreutils/manual/html_node/index.html')], [
        ['cut-columns', 'cut で列を取り出す', 'drill', 8,
          [doc('cut(1)', MAN('cut'))]],
        ['sort-uniq', 'sort と uniq で数え上げる', 'drill', 12,
          [doc('sort(1)', MAN('sort'))]],
        ['tr-sed', 'tr と sed で置き換える', 'drill', 12,
          [doc('sed(1)', MAN('sed'))]],
        ['tee-split', 'tee で流れを分ける', 'drill', 8,
          [doc('tee(1)', MAN('tee'))]],
        ['boss-report', 'BOSS: アクセスログから上位を出す', 'boss', 18],
      ]),

    chapter('kernel', 4, 'パイプとリダイレクト', '小さな道具を繋いで大きな仕事にする。',
      [doc('Redirections', BASH('Redirections'))], [
        ['stdout-file', '> と >> の違い', 'drill', 8],
        ['stderr', '2> で誤りだけ分ける', 'drill', 10],
        ['pipe-chain', 'パイプで繋ぐ', 'drill', 10,
          [doc('Pipelines', BASH('Pipelines'))]],
        ['heredoc', 'ヒアドキュメントで複数行を渡す', 'drill', 10,
          [doc('Here Documents', BASH('Redirections'))]],
        ['xargs', 'xargs で引数に変える', 'drill', 12,
          [doc('xargs(1)', MAN('xargs'))]],
        ['boss-pipeline', 'BOSS: 一本のパイプラインで集計する', 'boss', 18],
      ]),

    chapter('kernel', 5, '展開とクォート', 'シェルが何を書き換えてからコマンドに渡すのかを知る。',
      [doc('Shell Expansions', BASH('Shell-Expansions'))], [
        ['variables', '変数と export', 'drill', 10,
          [doc('Shell Parameters', BASH('Shell-Parameters'))]],
        ['quoting', 'シングルクォートとダブルクォート', 'concept', 12,
          [doc('Quoting', BASH('Quoting'))]],
        ['glob', '* と ? と [] の展開', 'drill', 10,
          [doc('Filename Expansion', BASH('Filename-Expansion'))]],
        ['brace', 'ブレース展開でまとめて作る', 'drill', 8,
          [doc('Brace Expansion', BASH('Brace-Expansion'))]],
        ['command-substitution', 'コマンド置換で結果を埋め込む', 'drill', 10,
          [doc('Command Substitution', BASH('Command-Substitution'))]],
        ['boss-quoting-bug', 'BOSS: 空白入りのファイル名で壊れる処理を直す', 'boss', 18],
      ]),

    chapter('kernel', 6, '権限と所有者', '「読めない」「書けない」を自分で説明できるようにする。',
      [doc('chmod(1)', MAN('chmod'))], [
        ['read-mode', 'rwx の並びを読む', 'concept', 10],
        ['chmod-octal', '8 進数で権限を変える', 'drill', 10],
        ['chmod-symbolic', '記号で権限を足し引きする', 'drill', 10],
        ['dir-permission', 'ディレクトリの r と x の違い', 'concept', 12],
        ['owner-sudo', '所有者と root、sudo で越える境界', 'drill', 12,
          [doc('chown(1)', MAN('chown'))]],
        ['umask', 'umask が新しいファイルに効く', 'drill', 10,
          [doc('umask(2)', MAN('umask', 2))]],
        ['boss-permission-denied', 'BOSS: Permission denied の原因を特定する', 'boss', 20],
      ]),

    chapter('kernel', 7, 'プロセスと資源', '動いているものを見て、止めて、資源を取り戻す。',
      [doc('ps(1)', MAN('ps'))], [
        ['ps-basics', 'ps でいま動いているものを見る', 'drill', 10],
        ['find-hog', 'CPU とメモリを食っている犯人を探す', 'drill', 12,
          [doc('top(1)', MAN('top'))]],
        ['signals', 'SIGTERM と SIGKILL の違い', 'concept', 12,
          [doc('signal(7)', MAN('signal', 7))]],
        ['kill-safely', 'kill と pkill を使い分ける', 'drill', 12,
          [doc('kill(1)', MAN('kill'))]],
        ['open-files', '消しても容量が戻らない理由', 'concept', 12,
          [doc('lsof(8)', MAN('lsof', 8))]],
        ['boss-runaway', 'BOSS: 暴走したバッチを止める', 'boss', 20],
      ]),

    chapter('kernel', 8, 'シェルスクリプト', '同じ手順を二度やらない。',
      [doc('Shell Scripts', BASH('Shell-Scripts'))], [
        ['first-script', '実行できるスクリプトにする', 'drill', 12],
        ['exit-code', '終了コードで成否を伝える', 'concept', 10,
          [doc('Exit Status', BASH('Exit-Status'))]],
        ['and-or', '&& と || で繋ぐ', 'drill', 10,
          [doc('Lists of Commands', BASH('Lists'))]],
        ['arguments', '引数を受け取る', 'drill', 10],
        ['boss-runbook', 'BOSS: 手順書をスクリプトに落とす', 'boss', 20],
      ]),

    chapter('kernel', 9, 'ディスクと容量', '足りなくなる前に、そして足りなくなった後に。',
      [doc('df(1)', MAN('df'))], [
        ['df-du', 'df と du の見ているものの違い', 'concept', 10,
          [doc('du(1)', MAN('du'))]],
        ['find-big', '大きいものから順に探す', 'drill', 12],
        ['truncate-log', 'ファイルを残したまま中身を空にする', 'drill', 10],
        ['boss-disk-pressure', 'BOSS: 空き容量が戻らない', 'boss', 20],
      ]),

    chapter('kernel', 10, '切り分けの型', '闇雲に触らない。順番を決めて挟み撃ちにする。',
      [doc('Troubleshooting', MAN('journalctl'))], [
        ['reproduce', 'まず再現させる', 'concept', 10],
        ['narrow-down', '半分に割って絞る', 'concept', 12],
        ['read-the-error', 'エラーメッセージを最後まで読む', 'concept', 10],
        ['write-it-down', '対応記録の書き方', 'concept', 10],
        ['boss-blind-debug', 'BOSS: 症状だけを渡されて原因に辿り着く', 'boss', 25],
      ]),
  ],
};
