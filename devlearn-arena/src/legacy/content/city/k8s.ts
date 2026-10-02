import type { CityPlan } from './types';

export const k8sCity: CityPlan = {
  track: 'k8s',
  name: 'Kubernetes の街',
  guide: { name: 'ゴロー', role: '港湾局長' },
  welcome:
    '市長、Kubernetes の港の街へようこそ。ここでは、たくさんのアプリ（コンテナ）を、たくさんの計算機の上で止めずに動かし続けます。一台ずつ手で世話をするのではなく、「こうあってほしい」という完成図を渡して港の係たちに保ってもらう——その仕組みを施設として建て、港を大きくしていきましょう。',
  facilities: [
    {
      id: 'k8s/01',
      name: '港湾本部',
      concept: 'クラスタの構成（コントロールプレーンとノード）',
      building: 'castle',
      needs: [],
      trouble: {
        who: '区画整理係のサクラ',
        text: '50 台のサーバに、どのアプリを何個ずつ置いたかを表計算で管理している。1 台壊れるたびに、深夜に手で別のサーバへ移し替えている。',
      },
      what: 'Kubernetes のクラスタは、指示を受けて決める「コントロールプレーン」と、実際にコンテナを動かす「ノード」の集まり。コントロールプレーンには、受付（kube-apiserver）、台帳（etcd）、見張り係（controller-manager）、配置係（kube-scheduler）がいて、各ノードでは現場監督（kubelet）が働く。',
      analogy:
        '港湾本部には受付窓口があり、すべての依頼は受付を通って台帳に書かれる。見張り係は台帳と現実の差を見つけて手配し、配置係は荷物（Pod）をどの埠頭（ノード）に置くか決める。埠頭の現場監督は、自分の埠頭に割り当てられた荷物を実際に動かす。',
      why: 'サーバ台数やアプリの数が増えると、人の手作業での配置・復旧は限界になる。仕組みの分担を知っていれば、「動かない」ときにどの係の段階で止まっているかを切り分けられる。',
      how: [
        'kubectl の指示は必ず kube-apiserver が受け、認証・検証してから etcd に保存する。',
        'controller-manager の各コントローラが、etcd の「あるべき姿」と現実の差を見つけて、足りない Pod などを作る。',
        'kube-scheduler が、まだ置き場所の決まっていない Pod に最適なノードを決める。',
        '各ノードの kubelet が、自分に割り当てられた Pod のコンテナを起動し、状態を報告する。',
      ],
      pitfalls: [
        'etcd のバックアップを取っておらず、コントロールプレーンの障害でクラスタの設定をすべて失う。',
        'ノードに直接ログインしてコンテナを手で操作し、Kubernetes の台帳と現実を食い違わせる。',
      ],
      pro: '「どの係が、どの台帳を見て、何をするか」でクラスタを説明できると、Pending・CrashLoopBackOff などの状態を係の段階に対応づけて読める。',
      quiz: [
        {
          situation: 'Pod を作ったのに、いつまでもノードが決まらず Pending のまま。どの係の段階で止まっている可能性が高い？',
          choices: ['kubelet（現場監督）', 'kube-scheduler（配置係）が置けるノードを見つけられていない', 'etcd が壊れて保存されていない'],
          answer: 1,
          explain: 'ノードが決まっていない Pending は、配置の段階。資源不足や置き場所の条件が合わないなど、配置係が置き場所を決められない理由を describe のイベントで確かめる。',
        },
        {
          situation: 'kubectl で作ったリソースの情報は、最終的にどこに保存される？',
          choices: ['各ノードのディスク', 'kube-apiserver を通して etcd（台帳）', 'kubectl を実行したパソコン'],
          answer: 1,
          explain: 'すべての依頼は apiserver を通って etcd に保存される。etcd がクラスタの「正」の記録。',
        },
      ],
    },
    {
      id: 'k8s/02',
      name: 'コンテナの住まい',
      concept: 'Pod（最小単位と共有される空間）',
      building: 'house',
      needs: ['k8s/01'],
      trouble: {
        who: '入居企業のハヤト',
        text: 'アプリのコンテナと、ログを転送する小さなコンテナを一緒に動かしたい。別々に置くと、同じファイルも見られないし、localhost で話もできない。',
      },
      what: 'Pod は Kubernetes が動かす最小単位で、1 つ以上のコンテナの「住まい」。同じ Pod のコンテナは、ネットワーク（同じ IP・localhost）と、指定したボリュームを共有し、一緒に同じノードに置かれ、一緒に消える。',
      analogy:
        '一つの家に住む家族。玄関（IP アドレス）も電話回線（localhost）も共有し、共有の物置（ボリューム）を使える。家族は引っ越すときも一緒で、家が取り壊されれば一緒に出ていく。',
      why: 'Pod の単位を正しく決めることは設計の基本。関係の薄いアプリを同じ Pod に入れると、片方の都合でもう片方も増減・再起動される。逆に、密接に協力するもの（本体とサイドカー）は同じ Pod にすると簡潔になる。',
      how: [
        'Pod の定義にコンテナを並べると、それらは同じネットワーク名前空間で動く（互いに localhost で通信）。',
        'volumes に定義したボリュームを、各コンテナの volumeMounts で同じ場所に取り付けて共有する。',
        'initContainers は本体のコンテナより先に順番に動き、準備が終わってから本体が起動する。',
        'Pod は使い捨て。消えると IP も変わり、同じ Pod が戻ってくるわけではない。',
      ],
      pitfalls: [
        'Web アプリとデータベースを同じ Pod に入れ、Web を増やすたびにデータベースも増えてしまう。',
        'Pod を直接作って運用し、消えたときに誰も作り直さない（Deployment などに任せる）。',
      ],
      pro: '「同じ Pod にするのは、必ず一緒に置かれ、一緒に増減するべきものだけ」。迷ったら別の Pod にする。',
      quiz: [
        {
          situation: '同じ Pod のアプリとサイドカーが通信したい。',
          choices: ['localhost とポート番号で通信できる', 'Service を必ず作る必要がある', '同じ Pod のコンテナ同士は通信できない'],
          answer: 0,
          explain: '同じ Pod のコンテナはネットワークを共有するので、localhost で通信できる。',
        },
        {
          situation: 'Web サーバ（負荷に応じて増やしたい）と PostgreSQL を同じ Pod に入れる設計はどう？',
          choices: ['通信が速くなるので良い設計', 'Web を増やすとデータベースまで増えてしまうので、別々にするべき', 'Pod には 1 つしかコンテナを入れられないので不可能'],
          answer: 1,
          explain: 'Pod 単位で増減・再起動される。増やし方や寿命が違うものは別の Pod にする。',
        },
      ],
    },
    {
      id: 'k8s/03',
      name: '設計図の提出所',
      concept: '宣言的管理（マニフェストと調整ループ）',
      building: 'office',
      needs: ['k8s/02'],
      trouble: {
        who: 'ビル管理人のアキラ',
        text: '「Pod を 3 つ起動する」手順を実行したあと、1 つが落ちても誰も気づかない。手順書で「作る」ことはできても、「3 つのまま保つ」ことはできない。',
      },
      what: 'Kubernetes では「何をするか（手順）」ではなく「どうあってほしいか（完成図）」を YAML のマニフェストで渡す。コントローラが現実と完成図の差を見つけ続け、差を埋めるように動く（調整ループ）。',
      analogy:
        '設計図の提出所に「この埠頭には常に 3 隻の船を停めておく」と書いて出す。係は数え続け、1 隻出ていけば 1 隻呼び、多ければ 1 隻帰す。人が毎回「船を呼べ」と指示しなくても、完成図が守られる。',
      why: '宣言的に管理すると、障害時の復旧が自動になり、設定は Git で履歴管理・レビューできる（GitOps）。手作業の命令が積み重なって「本当の状態」が誰にも分からない、という事態を防げる。',
      how: [
        'マニフェストに apiVersion・kind・metadata・spec（あるべき姿）を書く。',
        'kubectl apply -f で提出すると、既存のものとの差分だけが適用される。',
        'コントローラは status（現実）と spec（あるべき姿）を比べ、差があれば作る・消す・更新する。',
        '手で kubectl edit や scale した変更は、次に apply したマニフェストで上書きされる。',
      ],
      pitfalls: [
        '本番を kubectl edit で直接直し、Git のマニフェストと食い違わせる（次のデプロイで元に戻る）。',
        'Pod を手で消せば直ると思って消し続ける（完成図が変わらない限り、同じものが作り直される）。',
      ],
      pro: '「正はマニフェスト（Git）」を徹底する。クラスタの状態を変えたいときは、完成図を変えてレビューを通す。',
      quiz: [
        {
          situation: 'Deployment の replicas: 3 の Pod を 1 つ kubectl delete pod で消した。',
          choices: ['Pod は 2 つのままになる', 'コントローラが差に気づき、新しい Pod を作って 3 つに戻す', 'Deployment ごと消える'],
          answer: 1,
          explain: '完成図は「3 つ」のまま。差を見つけたコントローラが、自動で 1 つ作り直す。',
        },
        {
          situation: '障害対応で本番の replicas を kubectl scale で 10 にした。Git のマニフェストは 3 のまま。次のデプロイで何が起きる？',
          choices: ['10 のまま保たれる', 'apply したマニフェストの 3 に戻る', 'デプロイが失敗する'],
          answer: 1,
          explain: '手での変更は一時的。完成図（マニフェスト）を更新しない限り、次の apply で元に戻る。',
        },
      ],
    },
    {
      id: 'k8s/04',
      name: '作業班の事務所',
      concept: 'Workloads（Deployment / StatefulSet / DaemonSet / Job / CronJob）',
      building: 'workshop',
      needs: ['k8s/03'],
      trouble: {
        who: '設計士のナナ',
        text: 'Web アプリも、データベースも、毎晩のバッチも、全部同じやり方で Pod を並べていたら、データベースの Pod が再作成されるたびにデータの行き先がばらばらになった。',
      },
      what: 'Pod の管理のしかたは、仕事の性質ごとにコントローラが用意されている。入れ替え可能な Web は Deployment、名前と保存先が固定のデータベースは StatefulSet、全ノードに 1 つずつ置く監視は DaemonSet、終わる仕事は Job、定期実行は CronJob。',
      analogy:
        '事務所には作業班の種類がある。誰が来てもよい交代制の班（Deployment）、名札と専用の机が決まった班（StatefulSet）、各埠頭に必ず 1 人ずつ置く見張り（DaemonSet）、終わったら解散する臨時班（Job）、毎晩決まった時刻に集まる夜勤班（CronJob）。',
      why: '仕事の性質に合わないコントローラを選ぶと、データの消失、重複実行、ノードへの配置漏れなどの事故になる。選択の根拠を説明できることが設計力。',
      how: [
        'Deployment は ReplicaSet を通して、同じ Pod を指定数そろえ、入れ替え（ローリングアップデート）も行う。',
        'StatefulSet は Pod に順番付きの固定名（db-0, db-1）と、それぞれ専用の永続ボリュームを与える。',
        'DaemonSet は条件に合うすべてのノードに 1 つずつ Pod を置き、ノードが増えれば自動で追加する。',
        'Job は完了するまで Pod を動かし、失敗時の再試行回数を決められる。CronJob は時刻に従って Job を作る。',
      ],
      pitfalls: [
        'データベースを Deployment で動かし、Pod ごとに保存先が変わる・同時に複数が書き込む。',
        'CronJob の実行が前回の終了前に重なり、同じ処理が二重に走る（concurrencyPolicy を決める）。',
      ],
      pro: '「入れ替え可能か」「名前と保存先が必要か」「全ノードに要るか」「終わる仕事か」の 4 つの問いで、コントローラを選ぶ。',
      quiz: [
        {
          situation: '全ノードでログ収集エージェントを 1 つずつ動かしたい。ノードは今後も増える。',
          choices: ['Deployment で replicas をノード数に合わせる', 'DaemonSet を使う', 'Job を毎日実行する'],
          answer: 1,
          explain: 'DaemonSet は全ノードに 1 つずつ配置し、ノードが増えれば自動で追加する。Deployment では配置先が偏ったり数の管理が必要になる。',
        },
        {
          situation: '3 台構成のデータベースで、それぞれが自分専用のディスクと固定の名前を必要とする。',
          choices: ['StatefulSet', 'Deployment', 'CronJob'],
          answer: 0,
          explain: 'StatefulSet は Pod ごとに固定名と専用の永続ボリュームを与える。作り直されても同じ名前とディスクに戻る。',
        },
      ],
    },
    {
      id: 'k8s/05',
      name: '設定の掲示板と金庫',
      concept: 'ConfigMap と Secret（設定と機密の外出し）',
      building: 'library',
      needs: ['k8s/04'],
      trouble: {
        who: '入居企業のハヤト',
        text: '接続先のサーバ名を変えるだけなのに、アプリのイメージを作り直して配り直している。しかもパスワードがイメージの中に書かれている。',
      },
      what: 'ConfigMap は設定値を、Secret は機密情報をクラスタに保存し、Pod に環境変数やファイルとして渡す仕組み。イメージを作り直さずに、環境ごとに設定を差し替えられる。',
      analogy:
        '街の掲示板（ConfigMap）に「今日の集合場所」を貼り、鍵付きの金庫（Secret）に合鍵をしまう。作業員（Pod）は出勤時に掲示板と金庫から必要なものを受け取るので、制服（イメージ）を作り直す必要はない。',
      why: '同じイメージを開発・検証・本番で使い回し、違いは設定だけにするのが現代の運用の基本。機密をイメージやリポジトリに入れると、漏えいと更新の難しさの両方の問題を抱える。',
      how: [
        'ConfigMap / Secret をマニフェストで作り、Pod の env（valueFrom）や envFrom で環境変数として渡す。',
        'ボリュームとして取り付けると、キーごとのファイルとして読める。',
        '環境変数で渡した値は、変更しても Pod を作り直すまで反映されない（ファイルとして取り付けた場合はしばらくして更新される）。',
        'Secret は既定では base64 で符号化されているだけで暗号化ではない。etcd の暗号化や RBAC、外部の秘密管理と組み合わせる。',
      ],
      pitfalls: [
        'Secret のマニフェストをそのまま Git にコミットする（base64 は誰でも元に戻せる）。',
        'ConfigMap を更新したのに、環境変数で読んでいる Pod を再起動せず「反映されない」と悩む。',
      ],
      pro: '「イメージはどこでも同じ、違いは設定だけ」。機密はリポジトリに置かず、アクセスできる人と Pod を最小限にする。',
      quiz: [
        {
          situation: 'ConfigMap の値を更新した。環境変数として読んでいるアプリに反映されない。',
          choices: ['ConfigMap の更新は失敗している', '環境変数は Pod 起動時に決まるので、Pod を作り直す（rollout restart）必要がある', 'イメージを作り直すしかない'],
          answer: 1,
          explain: '環境変数は起動時に読み込まれる。Deployment の rollout restart などで Pod を作り直すと反映される。',
        },
        {
          situation: 'Secret のマニフェストを Git で管理したい。',
          choices: ['base64 なので安全にそのままコミットできる', 'base64 は暗号ではないので、そのままコミットせず、暗号化の仕組みや外部の秘密管理を使う', 'Secret は Git で管理できない'],
          answer: 1,
          explain: 'base64 は誰でも元に戻せる。Sealed Secrets や外部シークレット管理など、暗号化された形で扱う。',
        },
      ],
    },
    {
      id: 'k8s/06',
      name: '共同倉庫',
      concept: 'ストレージ（PersistentVolume と PVC）',
      building: 'warehouse',
      needs: ['k8s/04'],
      trouble: {
        who: '記録庫番のミサキ',
        text: 'データベースの Pod が再起動したら、昨日までのデータが全部消えていた。コンテナの中に保存していたらしい。',
      },
      what: 'コンテナの中のファイルは、Pod が消えると一緒に消える。消えてはいけないデータは、PersistentVolume（実際の保存場所）に置き、アプリは PersistentVolumeClaim（使いたい容量と種類の申請）を通して取り付ける。',
      analogy:
        '共同倉庫の管理人に「10GB の棚を 1 つ、読み書き用で」と申請書（PVC）を出すと、条件に合う棚（PV）が割り当てられる。作業員（Pod）が交代しても、同じ申請書を持っていれば同じ棚を使える。',
      why: 'Pod は使い捨てだが、データは使い捨てにできない。保存先の寿命を Pod から切り離す設計ができないと、再起動や再配置のたびにデータを失う。',
      how: [
        'PVC に容量・アクセスモード（ReadWriteOnce など）・StorageClass を書いて申請する。',
        'StorageClass があれば、申請に応じてクラウドのディスクなどが自動で作られる（動的プロビジョニング）。',
        'Pod の volumes で PVC を指定し、コンテナの volumeMounts で取り付ける。',
        'reclaimPolicy（Delete / Retain）で、PVC を消したときに実データも消すかを決める。',
      ],
      pitfalls: [
        'reclaimPolicy が Delete のまま PVC を消して、本番のデータのディスクごと消す。',
        'ReadWriteOnce のボリュームを、別々のノードの複数の Pod から同時に使おうとする。',
      ],
      pro: '「このデータは Pod が消えても残るべきか」を設計の最初に問う。残るべきなら PVC、バックアップの手順と復元の練習までをセットにする。',
      quiz: [
        {
          situation: 'Pod を作り直すとアップロードされた画像が消える。',
          choices: ['コンテナの中に保存しているので、PVC で永続ボリュームを取り付けて保存する', 'Pod を再起動しないように運用で気をつける', 'replicas を増やす'],
          answer: 0,
          explain: 'コンテナのファイルシステムは Pod と一緒に消える。消えてはいけないデータは永続ボリュームに置く。',
        },
        {
          situation: '本番データの PVC を整理で削除する前に確かめるべき設定は？',
          choices: ['Pod のラベル', 'PV の reclaimPolicy（Delete なら実データも消える）とバックアップ', 'Service のポート'],
          answer: 1,
          explain: 'Delete ポリシーでは PVC 削除と同時に実際のディスクも消える。消す前にポリシーとバックアップを必ず確かめる。',
        },
      ],
    },
    {
      id: 'k8s/07',
      name: '案内所と大通り',
      concept: 'ネットワーク（Service・Endpoints・DNS・Ingress）',
      building: 'station',
      needs: ['k8s/04'],
      trouble: {
        who: '受付のユキ',
        text: '別のアプリの Pod の IP アドレスを直接書いて通信していたら、Pod が作り直されて IP が変わり、つながらなくなった。',
      },
      what: 'Service は、ラベルで選んだ Pod の集まりに、変わらない名前と IP を与える案内所。条件に合って準備のできた（Ready な）Pod だけが Endpoints に載り、そこへ振り分けられる。クラスタ内の DNS で名前から引け、外からは Ingress などで入ってくる。',
      analogy:
        '街の案内所に「パン屋に行きたい」と言えば、今日営業中のパン屋（Ready な Pod）のどれかへ案内してくれる。パン屋が引っ越しても、案内所の場所と名前は変わらない。街の外からの客は大通りの門（Ingress）を通って案内所へ。',
      why: 'Pod の IP は作り直すたびに変わる。Service を使わないと、つながらない・準備中の Pod に送ってしまう、という障害が起きる。「つながらない」ときに、名前 → Service → Endpoints → Pod の順に追えることが必須の技能。',
      how: [
        'Service の selector に書いたラベルを持ち、Ready な Pod の IP が Endpoints に登録される。',
        'クラスタ内では サービス名.名前空間.svc.cluster.local の名前で引ける（同じ名前空間ならサービス名だけ）。',
        'type: ClusterIP はクラスタ内だけ、NodePort / LoadBalancer は外から入れる。',
        'Ingress は HTTP のホスト名やパスで、複数の Service へ振り分ける入口。',
      ],
      pitfalls: [
        'Service の selector と Pod のラベルが 1 文字違い、Endpoints が空で「つながらない」。',
        'readinessProbe が失敗し続けて Endpoints から外れているのに、Pod が Running なので正常だと思い込む。',
      ],
      pro: '「Service につながらない」ときは、必ず kubectl get endpoints を見る。空ならラベルか Ready の問題、埋まっていればその先（ポートやアプリ）の問題。',
      quiz: [
        {
          situation: 'Service 経由でアクセスできない。kubectl get endpoints web の結果が空。',
          choices: ['アプリのコードのバグ', 'selector と Pod のラベルが合っていないか、Pod が Ready になっていない', 'DNS サーバの故障'],
          answer: 1,
          explain: 'Endpoints が空＝送り先の Pod が 1 つも登録されていない。ラベルの一致と Ready の状態を確かめる。',
        },
        {
          situation: '別のアプリにどうやって接続先を指定するのがよい？',
          choices: ['相手の Pod の IP アドレスを直接書く', '相手の Service の名前（DNS 名）を使う', 'ノードの IP を書く'],
          answer: 1,
          explain: 'Pod の IP は作り直すと変わる。Service の名前は変わらず、Ready な Pod へ振り分けてくれる。',
        },
      ],
    },
    {
      id: 'k8s/08',
      name: '配置係の事務所',
      concept: 'スケジューリング（requests / limits・nodeSelector・taint と toleration）',
      building: 'office',
      needs: ['k8s/04'],
      trouble: {
        who: '区画整理係のサクラ',
        text: 'GPU の付いた高価なノードに、関係ない Web アプリの Pod が勝手に置かれて、機械学習の Pod が置けずに Pending になっている。',
      },
      what: 'スケジューラは、Pod の「必要な資源（requests）」と「置き場所の条件（nodeSelector・affinity）」、ノードの「立入制限（taint）」と Pod の「許可証（toleration）」を突き合わせて、置けるノードの中から置き場所を決める。',
      analogy:
        '配置係は、荷物の重さ（requests）と「冷蔵が必要」などの条件を見て、空きのある埠頭を選ぶ。特別な埠頭には「関係者以外立入禁止（taint）」の札があり、許可証（toleration）を持った荷物だけが置ける。',
      why: '資源の要求を書かないと、ノードに詰め込みすぎて全体が不安定になる。特別なノードを守れないと、高価な資源の無駄遣いや、重要な処理が置けない事故になる。',
      how: [
        'requests は配置の判断に使う「確保してほしい量」、limits は「これ以上使ったら制限する量」（メモリ超過は強制終了）。',
        'nodeSelector や nodeAffinity で「このラベルを持つノードに置く」を指定する。',
        'ノードに taint を付けると、対応する toleration を持つ Pod 以外は置かれない。',
        'どこにも置けないとき、Pod は Pending になり、describe のイベントに理由（Insufficient cpu など）が出る。',
      ],
      pitfalls: [
        'requests を書かず、実際の使用量に対してノードが過密になり、メモリ不足で次々に強制終了される。',
        'limits を低くしすぎて、アプリが OOMKilled を繰り返す。',
      ],
      pro: 'requests は実測に基づいて決め、監視で見直す。Pending は必ず describe のイベントから「なぜ置けないか」を読む。',
      quiz: [
        {
          situation: 'Pod が Pending。describe のイベントに "0/3 nodes are available: 3 Insufficient memory"。',
          choices: ['イメージの取得に失敗している', 'requests のメモリを満たすノードが無いので、requests を見直すかノードを増やす', 'Service の設定が誤っている'],
          answer: 1,
          explain: 'どのノードにも要求したメモリの空きが無い、という配置の失敗。要求量の妥当性か、クラスタの容量を見直す。',
        },
        {
          situation: 'GPU ノードに、GPU を使う Pod 以外を置かせたくない。',
          choices: ['GPU ノードに taint を付け、GPU を使う Pod にだけ toleration を付ける', '全 Pod の名前に gpu と付ける', 'GPU ノードを手動で止めておく'],
          answer: 0,
          explain: 'taint は「許可証の無い Pod は置かない」。特別なノードを専用にする定石。',
        },
      ],
    },
    {
      id: 'k8s/09',
      name: '診療所',
      concept: '可観測性とトラブルシュート（describe・events・logs・probe）',
      building: 'lab',
      needs: ['k8s/07', 'k8s/08'],
      trouble: {
        who: '当番のリュウ',
        text: 'Pod の状態が CrashLoopBackOff になっている。何度再起動しても直らない。どこを見ればいいのか分からない。',
      },
      what: 'Kubernetes は、リソースごとの状態（get / describe）、起きた出来事の記録（events）、コンテナの出力（logs）を残している。状態の名前は「どの段階で困っているか」を表しているので、段階に応じて見る場所を変える。',
      analogy:
        '街の診療所。「元気がない（CrashLoopBackOff）」と来た患者に、カルテ（describe）と来院記録（events）を見て、本人の話（logs）を聞く。「診察室に入れない（Pending）」「薬が届かない（ImagePullBackOff）」なら、見るべき場所がまったく違う。',
      why: '状態を読めずに再起動や削除を繰り返すと、復旧は偶然頼みになる。describe と events と logs を段階に沿って読めるかで、障害対応の速度が桁違いに変わる。',
      how: [
        'kubectl get pods で状態を見る（Pending / ContainerCreating / Running / CrashLoopBackOff / ImagePullBackOff）。',
        'kubectl describe pod で、イベント（配置・イメージ取得・起動・probe の失敗）を時系列で読む。',
        'kubectl logs で出力を、再起動を繰り返しているなら logs --previous で前回の出力を読む。',
        'livenessProbe の失敗は再起動、readinessProbe の失敗は Service から外れる。どちらが失敗しているかで影響が違う。',
      ],
      pitfalls: [
        'CrashLoopBackOff の Pod を消し続ける（同じ設定の Pod が同じ理由で落ち続ける）。',
        'logs に何も出ないので原因不明とする（--previous を見ていない、起動前に落ちている）。',
      ],
      pro: '状態 → describe のイベント → logs（--previous）の順を型にする。状態の名前から「配置・取得・起動・稼働」のどの段階かをまず決める。',
      quiz: [
        {
          situation: 'Pod が CrashLoopBackOff。今のコンテナのログには何も出ていない。',
          choices: ['Pod を削除して様子を見る', 'kubectl logs --previous で前回落ちたときの出力を読む', 'ノードを再起動する'],
          answer: 1,
          explain: '再起動を繰り返していると、今のコンテナは始まったばかり。落ちた前回の出力に原因が出ていることが多い。',
        },
        {
          situation: 'Pod は Running だが、Service からアクセスできない。describe に "Readiness probe failed" が出ている。',
          choices: ['readiness が失敗しているため Endpoints から外れている。probe の設定かアプリの準備状態を確かめる', 'Pod は Running なので問題はネットワーク機器にある', 'liveness を無効にすれば直る'],
          answer: 0,
          explain: 'readinessProbe が失敗すると、Pod は動いていても Service の送り先から外れる。',
        },
      ],
    },
    {
      id: 'k8s/10',
      name: '警備本部',
      concept: 'セキュリティ（RBAC・ServiceAccount・NetworkPolicy・securityContext）',
      building: 'gate',
      needs: ['k8s/09'],
      trouble: {
        who: '監査局のショウ',
        text: '監査で「全員が cluster-admin 権限を持っている」「どの Pod からも全 Pod に通信できる」と指摘された。一つ侵入されたら街全体が終わる。',
      },
      what: 'Kubernetes のセキュリティは「誰が（人や Pod の身分）」「何に」「何をしてよいか」を最小限に絞ること。RBAC で API の操作権限を、NetworkPolicy で Pod 間の通信を、securityContext でコンテナ内の権限を制限する。',
      analogy:
        '警備本部は、職員ごとに入れる建物と使える鍵を決め（RBAC）、区画の間に検査ゲートを置いて許可した通行だけを通し（NetworkPolicy）、作業員には必要以上の道具を持たせない（root で動かさない）。',
      why: '侵入は「いつか起きる」前提で考える。権限を最小にしておけば、一つの Pod やアカウントが乗っ取られても被害をその範囲に閉じ込められる。監査やコンプライアンスでも必ず問われる。',
      how: [
        'Role / ClusterRole で「どのリソースにどの操作（get / list / create …）を許すか」を定義し、RoleBinding で人や ServiceAccount に結びつける。',
        'Pod には専用の ServiceAccount を付け、必要な権限だけを与える（既定のトークンの自動マウントも見直す）。',
        'NetworkPolicy で「この Pod へはこのラベルの Pod からだけ許可」のように通信を絞る（対応する CNI が必要）。',
        'securityContext で runAsNonRoot、readOnlyRootFilesystem、権限昇格の禁止を設定する。',
      ],
      pitfalls: [
        '「動かないから」とアプリの ServiceAccount に cluster-admin を付ける。',
        'NetworkPolicy を作ったのに、CNI が対応しておらず実際には何も制限されていない。',
      ],
      pro: '権限は「足りないと分かってから足す」。最初に広く与えて後で絞ろうとしても、何が必要かが分からなくなる。',
      quiz: [
        {
          situation: 'アプリが Pod の一覧を読む必要がある。権限の与え方として良いのは？',
          choices: ['アプリの ServiceAccount に cluster-admin を付ける', 'その名前空間の pods に get / list だけを許す Role を作り、アプリの ServiceAccount に結びつける', 'default の ServiceAccount に全権限を付ける'],
          answer: 1,
          explain: '必要な操作・範囲だけを許す最小権限。乗っ取られても被害を限定できる。',
        },
        {
          situation: 'データベースの Pod には、API サーバの Pod からだけ接続を許したい。',
          choices: ['NetworkPolicy で、API サーバのラベルを持つ Pod からの通信だけを許可する', 'データベースのパスワードを長くする', 'Service を消す'],
          answer: 0,
          explain: 'NetworkPolicy で通信元を絞れば、他の Pod が侵入されてもデータベースに直接届かない。',
        },
      ],
    },
    {
      id: 'k8s/11',
      name: '増設と交代の管制センター',
      concept: 'スケールと無停止（ローリングアップデート・HPA・PDB）',
      building: 'tower',
      needs: ['k8s/09'],
      trouble: {
        who: '商店会長のマイ',
        text: '新しい版を出すたびに数分サービスが止まる。セールの日にはアクセスが急増して、Pod が足りずに落ちた。',
      },
      what: 'ローリングアップデートは、新しい Pod を少しずつ起こし、準備ができたら古い Pod を減らしていく入れ替え方。HPA は負荷に応じて Pod の数を自動で増減する。PodDisruptionBudget は、保守作業などで同時に止めてよい数の上限を決める。',
      analogy:
        '管制センターは、交代要員が持ち場に着いて準備完了（Ready）してから、前の担当を帰す。客が増えれば臨時の応援を呼び（HPA）、点検のときも「同時に休んでよいのは 1 人まで」（PDB）と決めて、窓口を空にしない。',
      why: '止めずに出す、止めずに増やす、止めずに保守する——これが本番運用の基本要件。readiness の設計や上限の設定を誤ると、入れ替えや自動増減そのものが障害の原因になる。',
      how: [
        'Deployment の strategy で maxSurge（一時的に増やしてよい数）と maxUnavailable（同時に欠けてよい数）を決める。',
        '新しい Pod が readinessProbe に合格してから、古い Pod が減らされる。失敗すれば入れ替えはそこで止まる。',
        'kubectl rollout status で進み具合、rollout undo で前の版に戻す。',
        'HPA は CPU などの使用率の目標に合わせて replicas を増減する（requests の設定が前提）。',
      ],
      pitfalls: [
        'readinessProbe が無く、起動途中の Pod に通信が流れて入れ替えのたびにエラーが出る。',
        'HPA を設定したのに requests が無く、使用率が計算できず増えない。',
      ],
      pro: '「新しい Pod が本当に準備できたと言える条件」を readinessProbe として正しく書く。無停止は probe の質で決まる。',
      quiz: [
        {
          situation: 'ローリングアップデートのたびに、数秒間エラーが出る。',
          choices: ['起動途中の Pod に通信が流れている可能性が高い。readinessProbe で準備完了を正しく判定する', 'replicas を 1 にする', 'アップデートを深夜だけにする'],
          answer: 0,
          explain: '準備完了を判定できないと、まだ受け付けられない Pod が Service に載ってしまう。',
        },
        {
          situation: '新しい版を出したら不具合が見つかった。すぐに前の版に戻したい。',
          choices: ['kubectl rollout undo deployment/web', 'Pod を全部削除する', 'ノードを再起動する'],
          answer: 0,
          explain: 'Deployment は前の版の ReplicaSet を持っているので、rollout undo で素早く戻せる。',
        },
      ],
    },
    {
      id: 'k8s/12',
      name: '運用管理センター',
      concept: '運用（アップグレード・ノード保守・バックアップ・監視）',
      building: 'hall',
      needs: ['k8s/11', 'k8s/10'],
      trouble: {
        who: '保守班長のケイ',
        text: 'Kubernetes のバージョンが古すぎてサポートが切れた。怖くて誰もアップグレードに手を付けられない。ノードの OS 更新も 1 年止まっている。',
      },
      what: 'クラスタは作って終わりではなく、動かし続けるもの。バージョンの定期的な更新、ノードを安全に空けて保守する手順（cordon / drain）、etcd のバックアップと復元、監視とアラートが運用の柱になる。',
      analogy:
        '運用管理センターは、街を営業しながら道路工事をする。工事する区画に「新規受付停止（cordon）」の札を出し、住人を他の区画に移ってもらい（drain）、工事が終わったら札を外す（uncordon）。街の台帳（etcd）の写しは毎日金庫にしまう。',
      why: '更新を止めた街は、脆弱性と非対応の山になり、いつか大工事を強いられる。小さく定期的に保守する手順を持っているチームだけが、安定して速く動ける。',
      how: [
        'kubectl cordon で新しい Pod を置かせないようにし、kubectl drain で既存の Pod を他のノードへ移す（PDB が守られる）。',
        '保守が終わったら kubectl uncordon で戻す。これを 1 台ずつ繰り返す。',
        'コントロールプレーン → ノードの順に、マイナーバージョンを 1 つずつ上げる。',
        'etcd のスナップショットを定期的に取り、復元の手順を実際に練習しておく。',
      ],
      pitfalls: [
        'drain せずにノードを再起動し、動いていた Pod が一斉に落ちる。',
        'バックアップは取っているが、復元を一度も試しておらず、いざという時に戻せない。',
      ],
      pro: '「バックアップは復元できて初めてバックアップ」。保守の手順は手順書でなくスクリプトや自動化にして、定期的に回す。',
      quiz: [
        {
          situation: 'ノード node-2 の OS を更新したい。サービスは止めたくない。',
          choices: ['いきなり node-2 を再起動する', 'kubectl drain node-2 で Pod を他のノードに移してから保守し、終わったら uncordon', 'node-2 の Pod を全部手で削除する'],
          answer: 1,
          explain: 'drain は cordon してから Pod を安全に退避させる。保守後に uncordon で配置を再開する。',
        },
        {
          situation: 'etcd のバックアップ運用で最も大切なことは？',
          choices: ['取得の頻度をできるだけ上げること', '定期的に実際に復元してみて、戻せることを確かめること', 'バックアップを同じノードに置くこと'],
          answer: 1,
          explain: '復元を試していないバックアップは、戻せる保証が無い。別の場所への保管と復元の練習までが運用。',
        },
      ],
    },
    {
      id: 'k8s/13',
      name: '事故資料館',
      concept: 'やってはいけない設定集（事故から定石の理由を学ぶ）',
      building: 'library',
      needs: ['k8s/12'],
      trouble: {
        who: '資料館長のオサム',
        text: 'よその街では「latest タグで本番が突然変わった」「limits 無しで 1 つの Pod がノードを食い潰した」という事故が何度も起きた。この街で同じことを繰り返したくない。',
      },
      what: 'Kubernetes の定石には、どれも過去の事故という理由がある。latest タグの禁止、requests / limits の設定、probe の設計、root での実行禁止、単一レプリカの回避……。事故を再現して、なぜ定石なのかを腹落ちさせる。',
      analogy:
        '事故資料館には、よその街で起きた事故の現場が再現されている。「ここで何が起きたか」「どの設定があれば防げたか」を見て回ると、規則が「上から言われたこと」ではなく「自分の街を守る知恵」に変わる。',
      why: '定石を理由とセットで理解していないと、「面倒だから」と省かれ、同じ事故が繰り返される。レビューで設定の危うさを指摘できる人は、チームで最も価値のあるエンジニアの一人。',
      how: [
        'image: app:latest は、いつ何が入るか分からない。バージョンタグやダイジェストで固定する。',
        'requests / limits が無い Pod は、ノードの資源を食い潰して他の Pod を巻き添えにする。',
        'replicas: 1 と PDB 無しでは、ノード保守のたびにサービスが止まる。',
        'livenessProbe を依存先（DB など）の状態に結びつけると、依存先の障害で全 Pod が再起動を繰り返す。',
      ],
      pitfalls: [
        '「今動いているから大丈夫」と、事故の条件がそろうまで危険な設定を放置する。',
        '定石を理由を知らずに当てはめ、例外が必要な場面で誤った判断をする。',
      ],
      pro: 'マニフェストのレビューでは「このまま障害が起きたら何が起きるか」を想像する。policy の自動チェック（admission や CI）で定石を強制するとさらに強い。',
      quiz: [
        {
          situation: '本番のマニフェストが image: web:latest。何が問題？',
          choices: ['問題ない、常に最新が使える', '再作成のたびに意図しない版が入りうる。どの版が動いているか再現も戻しもできない', 'latest タグは Kubernetes で使えない'],
          answer: 1,
          explain: 'latest は時点によって中身が変わる。版を固定しないと、再起動だけで挙動が変わる事故になる。',
        },
        {
          situation: 'livenessProbe で「データベースに接続できるか」を確かめている。データベースが 1 分止まったら？',
          choices: ['アプリの Pod は正常に待機する', 'アプリの全 Pod が liveness 失敗で再起動を繰り返し、DB 復旧後も立ち上がりが遅れる', 'データベースが自動で直る'],
          answer: 1,
          explain: 'liveness は「このコンテナ自身が壊れているか」を判定するもの。依存先の状態を混ぜると、連鎖的な再起動を招く。',
        },
      ],
    },
  ],
};
