import type { PullRequest, Repo } from '@/engines/github/types';
import type { Badge, BuildStyle, Scene, SceneItem, Translate } from './types';

/**
 * GitHub の街（建築確認）。
 * リポジトリ = 市役所、Pull Request = 建築申請の建物、レビュー = 検査員の印、チェック = 検査の結果、
 * マージ = 本通りに完成、閉じた申請 = 取り壊し、Issue = 住民の陳情の掲示板、ワークフロー = 検査場。
 */

export function pullLook(pull: PullRequest): { style: BuildStyle; badges: Badge[]; phase: 'draft' | 'checking' | 'failed' | 'review' | 'ready' | 'merged' | 'closed' } {
  if (pull.state === 'merged') return { style: 'solid', badges: [{ icon: '✓', tone: 'ok' }], phase: 'merged' };
  if (pull.state === 'closed') return { style: 'ruin', badges: [], phase: 'closed' };
  const failed = pull.checks.some((c) => c.status === 'failure');
  const running = pull.checks.some((c) => c.status === 'queued' || c.status === 'running');
  const approved = pull.reviews.some((r) => r.state === 'approved');
  const changes = pull.reviews.some((r) => r.state === 'changes_requested');
  const badges: Badge[] = [];
  if (pull.checks.length > 0) badges.push(failed ? { icon: '✗', tone: 'bad' } : running ? { icon: '⏳', tone: 'warn' } : { icon: '✓', tone: 'ok' });
  if (changes) badges.push({ icon: '✋', tone: 'bad' });
  else if (approved) badges.push({ icon: '👍', tone: 'ok' });
  if (failed) return { style: 'scaffold', badges, phase: 'failed' };
  if (running) return { style: 'scaffold', badges, phase: 'checking' };
  if (pull.checks.length === 0 && pull.reviews.length === 0) return { style: 'blueprint', badges, phase: 'draft' };
  if (approved && !changes) return { style: 'frame', badges, phase: 'ready' };
  return { style: 'frame', badges, phase: 'review' };
}

export function githubScene(repo: Repo | null, t: Translate): Scene | null {
  if (repo === null) return null;
  const items: SceneItem[] = [];
  items.push({
    type: 'building',
    id: 'hall',
    x: 0,
    y: 0,
    w: 3,
    d: 3,
    floors: 2,
    style: 'solid',
    color: '#efe6d2',
    roof: 'hall',
    label: `${repo.owner}/${repo.name}`,
    badges: repo.protections.length > 0 ? [{ icon: '🛡', tone: 'info' }] : undefined,
    info: {
      title: `${repo.owner}/${repo.name}`,
      kind: t('scape.gh.hallKind'),
      lines: [t('scape.gh.hallBranch', { name: repo.defaultBranch }), t('scape.gh.hallProtect', { n: repo.protections.length })],
      next: t('scape.gh.hallNext'),
    },
  });
  const merged = repo.pulls.filter((p) => p.state === 'merged');
  const others = repo.pulls.filter((p) => p.state !== 'merged');
  const mainLen = Math.max(8, 5 + merged.length * 3);
  items.push({ type: 'road', id: 'main', cells: Array.from({ length: mainLen }, (_, x) => ({ x, y: 4 })), kind: 'main', label: repo.defaultBranch });
  merged.forEach((pull, i) => {
    items.push({
      type: 'building',
      id: `pr:${String(pull.number)}`,
      x: 4 + i * 3,
      y: 1,
      w: 2,
      d: 2,
      floors: 3,
      style: 'solid',
      color: '#9cc3dc',
      roof: 'flat',
      label: `#${String(pull.number)}`,
      badges: [{ icon: '✓', tone: 'ok' }],
      info: { title: `#${String(pull.number)} ${pull.title}`, kind: t('scape.gh.mergedKind'), lines: [`${pull.head} → ${pull.base}`], next: undefined },
    });
  });

  // 申請通り
  const appW = Math.max(8, others.length * 4 + 2);
  items.push({ type: 'road', id: 'permits', cells: Array.from({ length: appW }, (_, x) => ({ x, y: 9 })), kind: 'plan', label: t('scape.gh.permitStreet') });
  others.forEach((pull, i) => {
    const look = pullLook(pull);
    const failed = pull.checks.filter((c) => c.status === 'failure').map((c) => c.name);
    items.push({
      type: 'building',
      id: `pr:${String(pull.number)}`,
      x: 1 + i * 4,
      y: 6,
      w: 2.5,
      d: 2.5,
      floors: 3,
      style: look.style,
      color: '#9cc3dc',
      roof: 'flat',
      label: `#${String(pull.number)}`,
      badges: look.badges,
      info: {
        title: `#${String(pull.number)} ${pull.title}`,
        kind: t(`scape.gh.phase.${look.phase}`),
        lines: [
          `${pull.head} → ${pull.base}`,
          t('scape.gh.checks', { n: pull.checks.length, failed: failed.length }),
          ...failed.map((name) => `✗ ${name}`),
          t('scape.gh.reviews', { n: pull.reviews.length }),
        ],
        next: t(`scape.gh.next.${look.phase}`, { n: pull.number }),
      },
    });
  });
  const reach = others.length > 0 ? others.length * 4 + 1 : 0;
  if (others.length > 0) items.push({ type: 'link', id: 'permits:hall', from: { x: 1.5, y: 6 }, to: { x: 1.5, y: 3 }, style: 'dashed', tone: 'info', flow: true });

  // 検査場（ワークフロー）
  if (repo.workflows.size > 0) {
    items.push({
      type: 'marker',
      id: 'workflows',
      x: Math.max(appW, reach) + 1,
      y: 7,
      icon: '🔬',
      label: t('scape.gh.inspection', { n: repo.workflows.size }),
      tone: 'info',
      info: { title: t('scape.gh.inspection', { n: repo.workflows.size }), kind: t('scape.gh.inspectionKind'), lines: [...repo.workflows.keys()], next: t('scape.gh.inspectionNext') },
    });
  }

  // 陳情の掲示板（Issue）
  repo.issues.slice(0, 10).forEach((issue, i) => {
    items.push({
      type: 'marker',
      id: `issue:${String(issue.number)}`,
      x: 0.5 + i * 2.5,
      y: 11.5,
      icon: issue.state === 'open' ? '📋' : '✅',
      label: `#${String(issue.number)}`,
      tone: issue.state === 'open' ? 'warn' : 'ok',
      info: {
        title: `#${String(issue.number)} ${issue.title}`,
        kind: t('scape.gh.issueKind'),
        lines: [issue.state === 'open' ? t('scape.gh.issueOpen') : t('scape.gh.issueClosed'), ...issue.labels.map((l) => `🏷 ${l}`)],
        next: issue.state === 'open' ? t('scape.gh.issueNext', { n: issue.number }) : undefined,
      },
    });
  });

  return {
    width: Math.max(mainLen, appW, 26) + 4,
    height: 14,
    items,
    legend: [
      { sample: 'marker', icon: '🏛', name: t('scape.gh.legend.hall'), meaning: t('scape.gh.legend.hallMeaning'), command: 'gh repo view' },
      { sample: 'blueprint', name: t('scape.gh.legend.draft'), meaning: t('scape.gh.legend.draftMeaning'), command: 'gh pr create' },
      { sample: 'scaffold', name: t('scape.gh.legend.checking'), meaning: t('scape.gh.legend.checkingMeaning'), command: 'gh pr checks <番号>' },
      { sample: 'frame', name: t('scape.gh.legend.review'), meaning: t('scape.gh.legend.reviewMeaning'), command: 'gh pr review <番号> --approve' },
      { sample: 'solid', name: t('scape.gh.legend.merged'), meaning: t('scape.gh.legend.mergedMeaning'), command: 'gh pr merge <番号>' },
      { sample: 'ruin', name: t('scape.gh.legend.closed'), meaning: t('scape.gh.legend.closedMeaning'), command: 'gh pr close <番号>' },
      { sample: 'marker', icon: '📋', name: t('scape.gh.legend.issue'), meaning: t('scape.gh.legend.issueMeaning'), command: 'gh issue create' },
    ],
    stats: [
      { icon: '📐', label: t('scape.gh.stat.open'), value: others.filter((p) => p.state === 'open').length },
      { icon: '🏗', label: t('scape.gh.stat.ready'), value: others.filter((p) => pullLook(p).phase === 'ready').length },
      { icon: '🏢', label: t('scape.gh.stat.merged'), value: merged.length },
      { icon: '📋', label: t('scape.gh.stat.issues'), value: repo.issues.filter((i) => i.state === 'open').length },
    ],
    focus: { x: 6, y: 6 },
  };
}
