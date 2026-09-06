import { chapter, doc } from '../build';
import type { Track } from '../types';

const gh = (label: string, path: string) => doc(label, `https://docs.github.com/en/${path}`);

export const githubTrack: Track = {
  id: 'github',
  title: 'GitHub',
  goal: 'レビュー・保護ルール・CI/CD を含む、チーム開発の標準装備を一通り自分で組める',
  phase: 'P5',
  chapters: [
    chapter('github', 1, 'リモート運用の基礎', 'ローカルの Git がチームの Git になる境目。',
      [gh('About repositories', 'repositories/creating-and-managing-repositories/about-repositories')], [
        ['clone-remote', 'clone / remote と権限モデル', 'drill', 12],
        ['default-branch', 'デフォルトブランチと保護の起点', 'concept', 10],
        ['visibility', '公開範囲と、うっかり公開の防ぎ方', 'concept', 10],
      ]),
    chapter('github', 2, 'Pull Request', 'PR は差分ではなく、意図を伝える単位。',
      [gh('About pull requests', 'pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests')], [
        ['pr-create', 'PR を作る（base と compare を間違えない）', 'drill', 12],
        ['pr-description', '読み手の時間を減らす説明の書き方', 'concept', 12],
        ['draft-pr', 'Draft PR と分割の判断', 'concept', 10],
        ['boss-huge-pr', 'BOSS: 巨大 PR を分割して通す', 'boss', 25],
      ]),
    chapter('github', 3, 'レビュー', '指摘の書き方が、チームの速度を決める。',
      [gh('Reviewing changes in pull requests', 'pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews')], [
        ['review-types', 'approve / request changes / comment の使い分け', 'drill', 12],
        ['suggested-changes', '提案コミットで往復を減らす', 'drill', 10],
        ['review-writing', '人ではなくコードに向ける言い方', 'concept', 12],
        ['codeowners', 'CODEOWNERS で自動アサインする', 'drill', 12,
          [gh('About code owners', 'repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners')]],
      ]),
    chapter('github', 4, 'ブランチ保護', '事故は仕組みで止める。',
      [gh('About protected branches', 'repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches')], [
        ['protection-rules', '必須レビューと直 push 禁止', 'drill', 12],
        ['required-checks', 'required status checks が緑になるまで待つ', 'drill', 12],
        ['merge-strategies', 'merge / squash / rebase で履歴の形がどう変わるか', 'concept', 18],
        ['boss-blocked-merge', 'BOSS: マージできない理由を全部潰す', 'boss', 22],
      ]),
    chapter('github', 5, 'Issue と計画', '作業を見えるところに置く。',
      [gh('About issues', 'issues/tracking-your-work-with-issues/about-issues')], [
        ['issue-templates', 'テンプレートで必要な情報を最初から集める', 'drill', 12],
        ['labels-milestones', 'ラベルとマイルストーンの設計', 'concept', 10],
        ['projects', 'Projects でボードを回す', 'concept', 12],
        ['linking', 'PR と Issue を紐付けて自動クローズする', 'drill', 10],
      ]),
    chapter('github', 6, 'GitHub Actions の基礎', 'YAML が DAG になって実行される。',
      [gh('Workflow syntax', 'actions/writing-workflows/workflow-syntax-for-github-actions')], [
        ['workflow-anatomy', 'on / jobs / steps の構造', 'concept', 15],
        ['triggers', 'push / pull_request / schedule / workflow_dispatch', 'drill', 15],
        ['needs-dag', 'needs で依存を作り、並列と直列を設計する', 'drill', 15],
        ['expressions-if', '式と if による条件実行', 'drill', 15],
        ['boss-red-ci', 'BOSS: 落ちている CI の原因をログから特定する', 'boss', 25],
      ]),
    chapter('github', 7, 'Actions の実務', '速く、安全に、再利用できる形へ。',
      [gh('Workflow syntax', 'actions/writing-workflows/workflow-syntax-for-github-actions')], [
        ['matrix', 'matrix で組み合わせを回す', 'drill', 15],
        ['cache-artifact', 'キャッシュと artifact の使い分け', 'drill', 15],
        ['secrets-environments', 'Secrets と Environments、承認付きデプロイ', 'concept', 15],
        ['permissions', 'GITHUB_TOKEN の権限を絞る', 'concept', 15,
          [gh('Automatic token authentication', 'actions/security-for-github-actions/security-guides/automatic-token-authentication')]],
        ['reusable-workflows', '再利用可能ワークフローと composite action', 'concept', 15],
        ['oidc', 'OIDC で長期クレデンシャルを置かない', 'concept', 15],
      ]),
    chapter('github', 8, 'リリースと Pages', 'このアプリ自身のデプロイを教材にする。',
      [gh('About GitHub Pages', 'pages/getting-started-with-github-pages/about-github-pages')], [
        ['tags-releases', 'タグとリリース、変更履歴の自動生成', 'drill', 12],
        ['pages-deploy', 'Pages へのデプロイを1から組む（base path と 404.html）', 'challenge', 25],
        ['self-hosting-lesson', 'このアプリの deploy.yml を読み解く', 'concept', 20],
        ['boss-broken-pages', 'BOSS: デプロイは成功したのに真っ白なページ', 'boss', 25],
      ]),
    chapter('github', 9, 'セキュリティと OSS', '外に開くときに必要な作法。',
      [gh('About Dependabot alerts', 'code-security/dependabot/dependabot-alerts/about-dependabot-alerts')], [
        ['dependabot', 'Dependabot の更新 PR を捌く', 'drill', 12],
        ['code-scanning', 'CodeQL とシークレットスキャン', 'concept', 12,
          [gh('About code scanning', 'code-security/code-scanning/introduction-to-code-scanning/about-code-scanning')]],
        ['fork-flow', 'Fork して PR を送る作法', 'drill', 15],
        ['branching-models', 'Git flow / GitHub flow / trunk-based の比較', 'concept', 18],
        ['boss-oss-contribution', 'BOSS: 初コントリビュートを最後まで通す', 'boss', 30],
      ]),
  ],
};
