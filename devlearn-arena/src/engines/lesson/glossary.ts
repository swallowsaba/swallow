/**
 * 用語集。専門用語を、専門用語を使わずに言い換えたもの。
 *
 * 任務の「学ぶ」段階（intro.concepts）はここから引く。
 * 同じ語はどの任務でも同じ説明になり、画面のどこでもマウスを乗せれば同じ説明が出る。
 * 説明の中で別の専門用語を使うときは、その語もここに載せる。
 */
export interface Concept {
  /** 画面に出る語 */
  term: string;
  /** 知らない人でも読める言い換え */
  plain: string;
  /** 同じものを指す別の書き方（大文字小文字は区別しない） */
  aliases?: readonly string[];
  /**
   * 普通の言葉としても使う語。文章に出てきても「説明が要る語」とはみなさない。
   * マウスを乗せれば説明は出る。
   */
  common?: boolean;
}

const ENTRIES: readonly Concept[] = [
  /* ---------------- 端末とシェル ---------------- */
  { common: true, term: 'ターミナル', plain: '文字を打ち込んでコンピュータに指示を出す画面。この画面の左下の黒い部分がそれ。', aliases: ['端末'] },
  { term: 'シェル', plain: 'ターミナルに打った文字を読んで、実際に仕事をしてくれる係。打った行を1つずつ受け取って実行する。' },
  { common: true, term: 'コマンド', plain: 'コンピュータへの短い指示。「ls」「cd」のように、行の先頭に書く言葉。' },
  { term: '引数', plain: 'コマンドに渡す「何に対して」の部分。cat notes.txt なら notes.txt が引数。' },
  { term: 'オプション', plain: 'コマンドの動き方を変える付け足し。-l や --help のように - で始まる。' },
  { common: true, term: 'ディレクトリ', plain: 'ファイルを入れておく入れ物。Windows や Mac の「フォルダ」と同じもの。' },
  { term: 'いまいる場所', plain: 'シェルが「ここで作業している」と思っているディレクトリ。pwd で確かめられ、cd で変えられる。', aliases: ['カレントディレクトリ', '作業ディレクトリ'] },
  { term: 'ホームディレクトリ', plain: 'あなた専用の置き場所。ここでは /home/learner。~ と書いても同じ意味になる。', aliases: ['ホーム'] },
  { common: true, term: 'パス', plain: 'ファイルやディレクトリの住所。/ で区切って、上の入れ物から順に書く。' },
  { term: '絶対パス', plain: '一番上（/）から書いた住所。どこにいても同じ場所を指す。' },
  { term: '相対パス', plain: 'いまいる場所から見た住所。reports/a.txt は「いまいる場所の中の reports の中の a.txt」。' },
  { term: 'ルート', plain: 'ファイルの住所の一番上。/ だけで表す。「管理者」の意味の root とは別物。' },
  { term: '標準出力', plain: 'コマンドが結果を書き出す先。何もしなければ画面に出る。' },
  { term: '標準エラー', plain: 'コマンドがエラーの知らせを書き出す先。結果とは別の口なので、分けて扱える。' },
  { term: '標準入力', plain: 'コマンドが読み込む元。何もしなければキーボード。パイプでつなぐと前のコマンドの結果になる。' },
  { term: 'リダイレクト', plain: 'コマンドの結果を画面ではなくファイルへ流すこと。> で上書き、>> で書き足し。' },
  { term: 'パイプ', plain: '| で2つのコマンドをつなぐこと。左の結果が、そのまま右の材料になる。' },
  { term: 'ヒアドキュメント', plain: '<<EOF から EOF の行までを、まとめて1つのコマンドに流し込む書き方。複数行のファイルを一度に書ける。' },
  { term: '変数', plain: '値に名前を付けて覚えておく箱。NAME=web で入れ、$NAME で取り出す。' },
  { term: '環境変数', plain: 'シェルから起動するプログラムにも引き継がれる変数。PATH や HOME など。' },
  { term: 'クォート', plain: '文字を引用符で囲むこと。"…" の中は $ だけ効き、\'…\' の中は何も効かずそのままの文字になる。', aliases: ['引用符'] },
  { term: 'ワイルドカード', plain: '*.log のように、名前の一部をぼかして複数のファイルをまとめて指す書き方。* は「何でも」。', aliases: ['glob', 'グロブ'] },
  { term: 'ブレース展開', plain: 'a/{x,y} を a/x と a/y の2つに広げる書き方。似た名前をまとめて書ける。' },
  { term: 'コマンド置換', plain: '$(コマンド) と書くと、そのコマンドの結果の文字がそこに入る。' },
  { term: '正規表現', plain: '文字の並び方の決まりを書く記号の言葉。^ は行の頭、$ は行の終わり、. は「何か1文字」。' },
  { common: true, term: 'ログ', plain: 'プログラムが「いつ何が起きたか」を書き続ける記録のファイル。障害のときに最初に読む。' },
  { term: 'man ページ', plain: 'コマンドの説明書。man ls のように打つと読める。', aliases: ['man'] },
  { term: '権限', plain: '「誰が、読む・書く・実行する、のどれをしてよいか」の決まり。r（読む）w（書く）x（実行）で表す。', aliases: ['パーミッション'] },
  { term: '所有者', plain: 'そのファイルの持ち主。持ち主とグループとその他の人で、別々に権限を決められる。' },
  { term: 'root', plain: 'そのコンピュータで何でもできる管理者のアカウント。間違えると壊せてしまうので、普段は使わない。', aliases: ['管理者'] },
  { term: 'sudo', plain: '1つのコマンドだけを管理者（root）の力で実行する仕組み。' },
  { term: 'umask', plain: '新しく作るファイルから、最初に外しておく権限の決まり。' },
  { term: 'プロセス', plain: '動いている最中のプログラム1つ1つ。同じプログラムを2回起動すればプロセスは2つ。' },
  { term: 'PID', plain: 'プロセスに付く番号。止めるときなどに「どれを」を指すのに使う。' },
  { term: 'シグナル', plain: 'プロセスに送る短い合図。「終わって」「今すぐ止まれ」などがあり、番号で決まっている。' },
  { term: 'SIGTERM', plain: '「片付けてから終わってください」という合図（15番）。受け取った側が後始末できる。' },
  { term: 'SIGKILL', plain: '「今すぐ止まれ」という合図（9番）。後始末できないので、最後の手段。' },
  { term: '終了コード', plain: 'コマンドが終わるときに残す数字。0 なら成功、それ以外は失敗。$? で直前のものを読める。' },
  { term: 'スクリプト', plain: 'コマンドを順に書き並べたファイル。実行すると上から順に打ったのと同じことが起きる。' },
  { term: '実行権限', plain: 'ファイルを「プログラムとして動かしてよい」という許可。chmod +x で付く。' },
  { common: true, term: 'ディスク', plain: 'ファイルを保存しておく場所。容量に限りがあり、いっぱいになると書けなくなる。' },
  { term: 'ファイルを掴む', plain: 'プログラムがファイルを開いたまま使い続けている状態。掴まれたファイルを消しても、容量は放されるまで戻らない。' },

  /* ---------------- Git ---------------- */
  { term: 'Git', plain: 'ファイルの変更の歴史を残す道具。いつ・誰が・何を変えたかを後から見返したり、元に戻したりできる。' },
  { term: 'リポジトリ', plain: 'Git が歴史を保存している場所。git init で作ると .git というディレクトリができる。' },
  { term: 'コミット', plain: 'その時点のファイル一式を記録した1枚の写真。メッセージを付けて残す。' },
  { term: 'インデックス', plain: '次のコミットに入れるものを並べておく台。git add で載せる。', aliases: ['ステージ', 'ステージング'] },
  { term: '作業ツリー', plain: 'あなたが実際に編集しているファイルそのもの。まだ記録されていない変更もここにある。' },
  { term: '3面', plain: '作業ツリー（いま編集中）・インデックス（次に記録する分）・HEAD（最後に記録した分）の3つの場所。' },
  { term: 'HEAD', plain: '「いま自分が見ているコミット」を指す札。ふつうはブランチの先頭を指している。' },
  { term: 'ブランチ', plain: '歴史の枝分かれ。本体（main）を壊さずに、別の枝で作業を進められる。中身は「どのコミットか」を指す札だけ。' },
  { common: true, term: 'main', plain: 'ふつう一番大事な、本体のブランチの名前。' },
  { term: 'マージ', plain: '別の枝で進めた変更を、今の枝に取り込むこと。' },
  { term: '早送り', plain: '取り込む側が何も進んでいないとき、新しいコミットを作らずに札を先へ動かすだけで済むマージ。', aliases: ['fast-forward'] },
  { term: '衝突', plain: '2つの枝が同じ行を別々に書き換えていて、Git がどちらを採るか決められない状態。人が選んで直す。', aliases: ['コンフリクト', 'conflict'] },
  { term: '衝突マーカ', plain: '衝突した場所に Git が書き込む <<<<<<< ======= >>>>>>> の行。両方の案を並べて見せている。' },
  { term: 'stash', plain: '書きかけの変更を一時的に棚へしまって、作業ツリーをきれいに戻す機能。あとで取り出せる。' },
  { term: 'タグ', plain: '特定のコミットに付ける動かない名札。「この版を配った」という印に使う。' },
  { term: '注釈付きタグ', plain: '誰がいつ何のために付けたかも一緒に記録するタグ。リリースにはふつうこちらを使う。' },
  { term: 'リモート', plain: '別の場所（サーバなど）にある同じリポジトリ。origin はよく使うリモートに付けるあだ名。', aliases: ['origin'] },
  { term: 'push', plain: '手元のコミットをリモートへ送ること。' },
  { term: 'fetch', plain: 'リモートの新しいコミットを手元に取ってくること（取ってくるだけで、今の作業には混ぜない）。', aliases: ['pull'] },
  { term: 'ハッシュ', plain: '中身から計算される長い英数字の名前。中身が1文字でも違えば別の名前になる。コミットの名前として使われる。', aliases: ['SHA'] },
  { term: 'オブジェクト', plain: 'Git が保存するもの1つ1つ。ファイルの中身・ディレクトリの一覧・コミット・タグの4種類がある。' },
  { term: 'reflog', plain: 'HEAD がこれまでどこを指していたかの足あと。消したつもりのコミットもここから探せる。' },
  { term: 'reset', plain: 'ブランチの札を別のコミットへ付け替えること。--hard を付けると作業ツリーもその時点に戻る。' },
  { term: 'amend', plain: '直前のコミットを作り直すこと。入れ忘れや書き間違いを直せる。' },
  { term: 'rebase', plain: '自分の枝のコミットを、別の枝の先へ載せ直すこと。-i を付けると順番やまとめ方も決められる。' },
  { term: 'worktree', plain: '同じリポジトリの別の枝を、別のディレクトリに同時に広げる機能。' },
  { term: 'sparse-checkout', plain: '大きなリポジトリの一部のディレクトリだけを作業ツリーに広げる機能。' },
  { term: 'submodule', plain: '別のリポジトリを、自分のリポジトリの中に「この版」という1点だけ記録して取り込む仕組み。' },
  { term: 'bisect', plain: '「良かった版」と「悪い版」の間を半分ずつ調べて、壊れた最初のコミットを探す機能。' },
  { term: 'hook', plain: 'コミットなどの前後に自動で動く小さなスクリプト。事故を入口で止めるのに使う。' },

  /* ---------------- GitHub ---------------- */
  { term: 'GitHub', plain: 'Git のリポジトリを置いて、みんなで話し合いながら直していくための Web サービス。' },
  { term: 'Pull Request', plain: '「この枝の変更を取り込んでください」というお願い。変更の中身を見せて、話し合ってから取り込む。', aliases: ['PR', 'プルリクエスト'] },
  { term: 'Issue', plain: '「困っていること」「やること」を1件ずつ書く掲示板のカード。番号が付く。' },
  { term: 'レビュー', plain: '他の人が変更を読んで、良いか・直すべきかを伝えること。' },
  { term: '承認', plain: 'レビューした人の「これで良い」という印。' },
  { term: 'ブランチ保護', plain: '大事なブランチに「承認が何件」「チェックが通ること」などの条件を付け、満たすまで取り込めなくする設定。' },
  { term: 'CI', plain: '変更を送るたびに、テストやビルドを自動で走らせる仕組み。壊れた変更を早く見つける。' },
  { term: 'チェック', plain: 'CI が変更ごとに走らせた検査の結果。success（通った）か failure（落ちた）かが付く。' },
  { term: 'ワークフロー', plain: 'CI で何をどの順に走らせるかを書いたファイル。.github/workflows の下に YAML で書く。' },
  { term: 'ジョブ', plain: 'ワークフローの中の仕事のまとまり。ジョブ同士は、指定しなければ同時に走る。' },
  { term: 'needs', plain: 'ジョブの「これが終わってから走る」という順番の指定。' },
  { term: 'matrix', plain: '同じジョブを、値だけ変えて何通りも走らせる書き方。例: Node 18 と 20 の両方で試す。' },
  { term: 'artifact', plain: 'あるジョブが作ったファイルを、別のジョブへ渡すための置き場。', aliases: ['成果物'] },
  { term: 'シークレット', plain: 'パスワードや鍵のような、見せてはいけない値の保管庫。入れたら二度と表示されない。', aliases: ['secret'] },
  { term: 'fork', plain: '他人のリポジトリを、自分が書き込める場所へ丸ごと写すこと。' },
  { term: 'リリース', plain: 'タグの付いた版を「配布した版」として GitHub に登録したもの。' },
  { term: 'CODEOWNERS', plain: '「このディレクトリはこの人が見る」を決めるファイル。該当する変更には、その人の承認が要る。' },
  { term: 'squash マージ', plain: 'Pull Request の複数のコミットを1つにまとめてから取り込むやり方。' },
  { term: 'ラベル', plain: 'Issue や Kubernetes の資源などに付ける目印の札。後で探したり選んだりするのに使う。' },

  /* ---------------- Kubernetes ---------------- */
  { term: 'Kubernetes', plain: 'たくさんのコンピュータの上で、アプリを「決めた数だけ動かし続ける」ことを自動でやってくれる仕組み。', aliases: ['k8s'] },
  { term: 'クラスタ', plain: 'Kubernetes がまとめて面倒を見るコンピュータの集まり。' },
  { term: 'ノード', plain: 'クラスタの中のコンピュータ1台1台。アプリはノードの上で動く。' },
  { term: 'コンテナ', plain: 'アプリと、それが動くのに要るものを1つの箱に詰めたもの。どこへ持って行っても同じように動く。' },
  { term: 'イメージ', plain: 'コンテナの元になる型。nginx:1.25 のように「名前:版」で書く。' },
  { term: 'Pod', plain: 'Kubernetes が動かすアプリの最小単位。中にコンテナが入っている。消えたらそれっきりで、自分では生き返らない。' },
  { term: 'Deployment', plain: '「この Pod を何個動かし続けて」という指示書。Pod が消えると、足りない分を自動で作り直す。' },
  { term: 'ReplicaSet', plain: 'Deployment の下で、実際に Pod の数を数えて合わせている係。Deployment が自動で作る。' },
  { term: 'レプリカ', plain: '同じ Pod の複製。replicas: 3 なら同じものを3つ動かす。', aliases: ['replicas'] },
  { term: 'Service', plain: 'Pod たちの前に立つ受付。Pod が入れ替わっても、同じ名前で繋がるようにする。' },
  { term: 'Endpoints', plain: 'Service が「いま繋いでよい Pod」として持っている一覧。ここに載っていない Pod には繋がらない。' },
  { term: 'セレクタ', plain: '「このラベルが付いたものを選ぶ」という条件。Service や Deployment が相手の Pod を見つけるのに使う。' },
  { term: 'マニフェスト', plain: '「こうなっていてほしい」を書いたファイル。ふつう YAML で書く。' },
  { term: 'YAML', plain: '字下げ（行頭の空白）で入れ子を表す、設定を書くための書き方。' },
  { term: 'apply', plain: '「こうなっていてほしい」という希望を Kubernetes に渡すこと。実際に作る作業は Kubernetes が裏でやる。' },
  { term: '宣言的', plain: '「どうやるか」の手順ではなく、「どうなっていてほしいか」の完成図を書くやり方。' },
  { term: '冪等', plain: '何回やっても結果が同じになること。同じ apply を2回しても、2つできたりはしない。' },
  { term: '調整', plain: '「あるべき姿」と「今の姿」を見比べて、差を埋め続けること。Kubernetes の係たちはずっとこれをしている。', aliases: ['reconcile'] },
  { term: 'コントロールプレーン', plain: 'クラスタの司令塔。受付・配置係・見張り係・記録帳の4つでできている。' },
  { term: 'apiserver', plain: 'コントロールプレーンの受付。kubectl の指示はまずここに届く。' },
  { term: 'scheduler', plain: 'コントロールプレーンの配置係。新しい Pod をどのノードに置くか決める。', aliases: ['スケジューラ'] },
  { term: 'controller', plain: 'コントロールプレーンの見張り係。あるべき数と今の数を比べて、足りなければ作り、多ければ消す。', aliases: ['コントローラ'] },
  { term: 'etcd', plain: 'コントロールプレーンの記録帳。クラスタの「あるべき姿」が全部書いてある。' },
  { term: 'kubelet', plain: '各ノードにいる現場係。そのノードに置かれた Pod を実際に起動する。' },
  { term: 'kubectl', plain: 'Kubernetes に指示を出すためのコマンド。「キューブシーティーエル」などと読む。' },
  { term: '名前空間', plain: 'クラスタの中を部屋に分ける仕切り。同じ名前でも部屋が違えば別物になる。ここではほぼ default だけを使う。', aliases: ['namespace'] },
  { term: 'Job', plain: '「終わるまで動かす」仕事の指示書。終わった Pod は作り直さない。' },
  { term: 'CronJob', plain: '決まった間隔で Job を作る目覚まし時計のような仕組み。' },
  { term: 'StatefulSet', plain: '名前と順番が決まった Pod を動かす指示書。db-0, db-1 のように番号が付き、順に作られる。' },
  { term: 'DaemonSet', plain: '全部のノードに1つずつ Pod を置く指示書。' },
  { term: 'ConfigMap', plain: 'アプリに渡す設定値の入れ物。コンテナの外に置いておける。' },
  { term: 'Secret', plain: 'パスワードなど秘密の値の入れ物。見かけは ConfigMap とほぼ同じで、中身は暗号ではなく base64 で書いてあるだけ。' },
  { term: 'base64', plain: '文字をアルファベットと数字の並びに書き換える決まり。誰でも元に戻せるので、隠す力は無い。' },
  { term: 'PersistentVolume', plain: 'Pod が消えても残る保存場所そのもの。「これだけの容量がある」という棚。', aliases: ['PV'] },
  { term: 'PersistentVolumeClaim', plain: '「これだけの保存場所がほしい」という申込書。条件に合う PV と結び付くと使える。', aliases: ['PVC'] },
  { term: 'StorageClass', plain: '保存場所の種類。自動で用意してくれる種類と、人が用意しないといけない種類がある。' },
  { term: 'taint', plain: 'ノードに付ける「ここには来ないで」という札。' },
  { term: 'toleration', plain: 'Pod に付ける「その札があっても気にしない」という許可証。' },
  { term: 'requests', plain: 'Pod が「最低これだけ使います」と申告する量。配置係はこの数字で置き場所を決める。' },
  { term: 'limits', plain: 'Pod が「これ以上は使わない」という上限。超えると止められる。' },
  { term: 'probe', plain: 'Pod が元気かどうかを定期的に確かめる検査。readiness（受付を始めてよいか）と liveness（生きているか）がある。', aliases: ['readiness', 'liveness'] },
  { term: 'Running', plain: 'Pod が動いている状態。' },
  { term: 'Ready', plain: 'Pod が「もう注文を受けられます」という状態。Running でも Ready でなければ Service は繋がない。' },
  { term: 'Pending', plain: 'Pod が「まだ置き場所が決まっていない」状態。' },
  { term: 'CrashLoopBackOff', plain: 'Pod が起動してはすぐ落ちるのを繰り返し、次に試すまでの待ち時間がどんどん延びている状態。' },
  { term: 'RBAC', plain: '「誰が、何に対して、何をしてよいか」を決める Kubernetes の許可の仕組み。' },
  { term: 'ServiceAccount', plain: '人ではなくプログラムが Kubernetes を操作するときに使うアカウント。' },
  { term: 'Role', plain: '「pods を見てよい」のような、してよいことの一覧。' },
  { term: 'RoleBinding', plain: 'Role を誰かに結び付けるもの。これが無いと Role を作っても誰にも効かない。' },
  { term: 'HPA', plain: '負荷に合わせて Pod の数を自動で増やしたり減らしたりする係。上限と下限を決めておく。', aliases: ['HorizontalPodAutoscaler'] },
  { term: 'cordon', plain: 'ノードに「新しい Pod はもう置かないで」と印を付けること。いま動いている Pod はそのまま。' },
  { term: 'drain', plain: 'ノードを空にすること。cordon したうえで、動いている Pod を追い出す。' },
  { term: 'kubeadm', plain: 'Kubernetes のクラスタを組み立てるための道具。' },
  { term: 'CNI', plain: 'Pod 同士を網でつなぐ部品。これが入るまでノードは Ready にならない。' },

  /* ---------------- ネットワーク ---------------- */
  { common: true, term: 'ネットワーク', plain: 'コンピュータ同士をつないで、データをやりとりできるようにしたもの。' },
  { term: 'IP アドレス', plain: 'ネットワークの上での住所。192.168.1.10 のように4つの数字で書く。', aliases: ['IP'] },
  { term: 'サブネット', plain: '住所のまとまり。同じサブネットの中なら、ルータを通らずに直接届く。' },
  { term: 'CIDR', plain: '192.168.1.0/24 のように、住所のまとまりを「先頭 / 共通の桁数」で書く書き方。' },
  { term: 'プレフィックス長', plain: 'CIDR の / の後ろの数字。大きいほどまとまりは小さい。/24 なら 256 個、/26 なら 64 個。', aliases: ['ネットマスク'] },
  { term: 'ネットワークアドレス', plain: 'サブネットの一番最初の住所。まとまり全体の名前として使い、機械には割り当てない。' },
  { term: 'ブロードキャストアドレス', plain: 'サブネットの一番最後の住所。そこへ送ると全員に届く。機械には割り当てない。' },
  { term: 'MAC アドレス', plain: 'ネットワークの差し込み口1つ1つに、作られたときから付いている番号。同じ線の上で相手を区別するのに使う。', aliases: ['MAC'] },
  { term: 'ARP', plain: '「この IP アドレスの人、MAC アドレスを教えて」と同じ線の全員に聞く仕組み。' },
  { term: 'スイッチ', plain: '同じサブネットの機械をつなぐ分岐の箱。誰がどの口にいるかを覚えて、必要な口にだけ流す。' },
  { term: 'ルータ', plain: '別々のサブネットをつなぐ中継係。宛先を見て、次にどこへ渡すかを決める。' },
  { term: 'デフォルトゲートウェイ', plain: '「知らない宛先はとりあえずここへ渡す」と決めてあるルータ。' },
  { term: '経路表', plain: '「この宛先へはどこを通って送るか」の一覧。ip route で見られる。', aliases: ['ルーティングテーブル'] },
  { term: 'ホップ', plain: 'データがルータを1つ越えること。何ホップ先、のように数える。' },
  { term: 'TTL', plain: 'データが越えてよいルータの残り回数。ルータを1つ越えるたびに1減り、0 になると捨てられる。' },
  { term: 'パケット', plain: 'ネットワークを流れるデータの1かたまり。宛先や差出人を書いた荷札が付いている。' },
  { term: 'カプセル化', plain: '送る中身に荷札（ヘッダ）を何重にも巻いていくこと。受け取った側は外から順にほどく。' },
  { common: true, term: '層', plain: '通信を役割ごとに分けた段。線の上の話（L2）、住所の話（L3）、ポートの話（L4）、アプリの話（L7）のように分ける。', aliases: ['レイヤ'] },
  { term: 'ポート', plain: '1台のコンピュータの中の「窓口の番号」。Web は 80 や 443 で待っていることが多い。' },
  { term: 'TCP', plain: '届いたかを確かめ合いながら、順番どおりに確実に送るやり方。Web などほとんどの通信がこれ。' },
  { term: '3ウェイハンドシェイク', plain: 'TCP で話し始める前の、SYN → SYN+ACK → ACK の3回のあいさつ。' },
  { term: 'TIME_WAIT', plain: 'TCP の接続を閉じた側が、しばらく片付けを待っている状態。' },
  { term: 'ping', plain: '相手に「生きてる？」と小さなデータを送り、返事が来るか確かめるコマンド。' },
  { term: 'traceroute', plain: '相手までに通るルータを、1つずつ順に表示するコマンド。' },
  { term: 'curl', plain: 'Web のサーバに頼んで、返ってきた中身を画面に出すコマンド。' },
  { term: 'Connection refused', plain: '相手のコンピュータまでは届いたが、そのポートで誰も待っていなかったという返事。' },
  { term: 'DNS', plain: 'www.example.com のような名前を、IP アドレスに引く電話帳の仕組み。' },
  { term: '名前解決', plain: '名前から IP アドレスを調べること。' },
  { term: 'キャッシュ', plain: '一度調べた答えを、しばらく手元に覚えておくこと。次からは速い。' },
  { term: 'CNAME', plain: 'DNS の「この名前は、あの名前の別名です」という書き込み。' },
  { term: 'DHCP', plain: 'ネットワークにつないだ機械に、IP アドレスを自動で貸し出す仕組み。' },
  { term: 'NAT', plain: '家や会社の中の住所を、外へ出るときに外向きの住所へ書き換える仕組み。' },
  { term: 'PAT', plain: '外向きの住所1つを、ポート番号を変えて何台もの機械で分け合う NAT。', aliases: ['NAPT'] },
  { term: 'VLAN', plain: '1台のスイッチの中を、見えない壁で別々のネットワークに分ける仕組み。' },
  { term: 'IPv6', plain: '新しい形の IP アドレス。2001:db8::1 のように、16進数を : で区切って長く書く。' },
  { term: 'SLAAC', plain: 'IPv6 で、機械が自分の MAC アドレスから自分の住所を自動で作る仕組み。' },
  { term: 'TLS', plain: 'Web の通信を暗号にして、途中で盗み見られないようにする仕組み。https の s。' },
  { term: '証明書', plain: '「このサーバは本物の shop.example.com です」という身分証。有効期限と発行者が書いてある。' },
  { term: '認証局', plain: '証明書を発行する、みんなが信用している発行元。', aliases: ['発行者'] },
  { term: 'ファイアウォール', plain: '通してよい通信と止める通信を決める門番。' },
  { term: 'ロードバランサ', plain: '届いた注文を、後ろにいる何台かのサーバへ振り分ける係。' },
  { term: 'ヘルスチェック', plain: '振り分け先のサーバが元気かを定期的に確かめること。落ちているサーバには振り分けない。' },
  { term: 'VPC', plain: 'クラウドの中に作る、自分専用のネットワーク。' },
];

const INDEX = new Map<string, Concept>();
for (const entry of ENTRIES) {
  INDEX.set(entry.term.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) INDEX.set(alias.toLowerCase(), entry);
}

/** 載っている語すべて（重複なし・載せた順） */
export function glossary(): readonly Concept[] {
  return ENTRIES;
}

/** 語（別名でもよい）から説明を引く。無ければ undefined */
export function lookup(term: string): Concept | undefined {
  return INDEX.get(term.toLowerCase());
}

/**
 * 任務の intro.concepts に載せる語を、用語集から引いて並べる。
 * 載っていない語を書いたら、その場で気付けるように例外にする。
 */
export function concepts(...terms: readonly string[]): { term: string; plain: string }[] {
  return terms.map((term) => {
    const found = lookup(term);
    if (found === undefined) throw new Error(`用語集に載っていない語です: ${term}`);
    return { term: found.term, plain: found.plain };
  });
}

const KATAKANA = /[゠-ヿ]/;
const WORD = /[A-Za-z0-9_]/;

/** text の i 文字目から始まる word が、語として切れているか（別の語の一部でないか） */
function standsAlone(text: string, i: number, word: string): boolean {
  const before = text[i - 1] ?? '';
  const after = text[i + word.length] ?? '';
  const first = word[0] ?? '';
  const last = word[word.length - 1] ?? '';
  // 英数字の語は英数字に挟まれていないこと。カタカナの語はカタカナに挟まれていないこと
  // （「レポート」の中の「ポート」、「パスワード」の中の「パス」を拾わないため）
  const edge = (a: string, b: string) =>
    (WORD.test(a) && WORD.test(b)) || (KATAKANA.test(a) && KATAKANA.test(b));
  return !edge(before, first) && !edge(last, after);
}

/** 文章の中に出てくる、説明の要る語（common でないもの） */
export function jargonIn(text: string): Concept[] {
  const found = new Set<Concept>();
  for (const entry of ENTRIES) {
    if (entry.common === true) continue;
    for (const word of [entry.term, ...(entry.aliases ?? [])]) {
      let at = text.indexOf(word);
      while (at !== -1) {
        if (standsAlone(text, at, word)) {
          found.add(entry);
          break;
        }
        at = text.indexOf(word, at + 1);
      }
      if (found.has(entry)) break;
    }
  }
  return [...found];
}
