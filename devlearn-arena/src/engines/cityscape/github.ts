import type { PullRequest, Repo } from '@/engines/github/types';
import { planTown, type PlanDistrict } from './plan';
import type { Badge, BuildStyle, Scene, SceneItem, Translate } from './types';

/**
 * GitHub の街（建築確認）。
 *
 * リポジトリ = 市役所、Pull Request = 建築申請の建物、レビュー = 検査員の印、チェック = 検査の結果、
 * マージ = 本通りに完成、閉じた申請 = 取り壊し、Issue = 住民の陳情の掲示板、ワークフロー = 検査場。
 *
 * 市役所・本通り・申請通り・掲示板の 4 つの街区が碁盤の目に並び、通りでつながる。
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
  const merged = repo.pulls.filter((p) => p.state === 'merged');
  const others = repo.pulls.filter((p) => p.state !== 'merged');
  const issues = repo.issues.slice(0, 10);

  const districts: PlanDistrict[] = [
    {
      id: 'ward:hall',
      label: `${repo.owner}/${repo.name}`,
      tone: 'accent',
      members: ['hall', ...(repo.workflows.size > 0 ? ['workflows'] : [])],
      min: 2,
    },
    {
      id: 'ward:main',
      label: repo.defaultBranch,
      tone: 'ok',
      shape: 'row',
      members: merged.map((p) => `pr:${String(p.number)}`),
      min: 2,
    },
    {
      id: 'ward:permit',
      label: t('scape.gh.permitStreet'),
      tone: 'warn',
      members: others.map((p) => `pr:${String(p.number)}`),
      min: 2,
    },
    {
      id: 'ward:board',
      label: t('scape.gh.boardWard'),
      tone: 'info',
      members: issues.map((i) => `issue:${String(i.number)}`),
      min: 2,
    },
  ];
  const plan = planTown(districts);
  const lotOf = (id: string) => plan.lots.get(id);

  const hallLot = lotOf('hall');
  if (hallLot) {
    items.push({
      type: 'building',
      id: 'hall',
      x: hallLot.x + 0.1,
      y: hallLot.y + 0.1,
      w: hallLot.w - 0.2,
      d: hallLot.d - 0.2,
      facing: hallLot.facing,
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
  }

  merged.forEach((pull) => {
    const lot = lotOf(`pr:${String(pull.number)}`);
    if (!lot) return;
    items.push({
      type: 'building',
      id: `pr:${String(pull.number)}`,
      x: lot.x + 0.15,
      y: lot.y + 0.15,
      w: lot.w - 0.3,
      d: lot.d - 0.3,
      facing: lot.facing,
      floors: 3,
      style: 'solid',
      color: '#9cc3dc',
      roof: 'flat',
      label: `#${String(pull.number)}`,
      badges: [{ icon: '✓', tone: 'ok' }],
      info: { title: `#${String(pull.number)} ${pull.title}`, kind: t('scape.gh.mergedKind'), lines: [`${pull.head} → ${pull.base}`], next: undefined },
    });
  });

  others.forEach((pull) => {
    const lot = lotOf(`pr:${String(pull.number)}`);
    if (!lot) return;
    const look = pullLook(pull);
    const failed = pull.checks.filter((c) => c.status === 'failure').map((c) => c.name);
    items.push({
      type: 'building',
      id: `pr:${String(pull.number)}`,
      x: lot.x + 0.15,
      y: lot.y + 0.15,
      w: lot.w - 0.3,
      d: lot.d - 0.3,
      facing: lot.facing,
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

  const permitBlock = plan.blocks.find((b) => b.id === 'ward:permit');
  const mainBlock = plan.blocks.find((b) => b.id === 'ward:main');
  if (others.length > 0 && permitBlock && mainBlock) {
    items.push({
      type: 'link',
      id: 'permits:hall',
      from: { x: permitBlock.x + permitBlock.w / 2, y: permitBlock.y + permitBlock.d / 2 },
      to: { x: mainBlock.x + mainBlock.w / 2, y: mainBlock.y + mainBlock.d / 2 },
      style: 'dashed',
      tone: 'info',
      flow: true,
    });
  }

  // 検査場（ワークフロー）
  const wfLot = lotOf('workflows');
  if (repo.workflows.size > 0 && wfLot) {
    items.push({
      type: 'marker',
      id: 'workflows',
      x: wfLot.x + wfLot.w / 2,
      y: wfLot.y + wfLot.d / 2,
      icon: '🔬',
      label: t('scape.gh.inspection', { n: repo.workflows.size }),
      tone: 'info',
      info: { title: t('scape.gh.inspection', { n: repo.workflows.size }), kind: t('scape.gh.inspectionKind'), lines: [...repo.workflows.keys()], next: t('scape.gh.inspectionNext') },
    });
  }

  // 陳情の掲示板（Issue）
  issues.forEach((issue) => {
    const lot = lotOf(`issue:${String(issue.number)}`);
    if (!lot) return;
    items.push({
      type: 'marker',
      id: `issue:${String(issue.number)}`,
      x: lot.x + lot.w / 2,
      y: lot.y + lot.d / 2,
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
    width: plan.width,
    height: plan.height,
    plan,
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
    focus: mainBlock ? { x: mainBlock.x + mainBlock.w / 2, y: mainBlock.y + mainBlock.d / 2 } : { x: plan.width / 2, y: plan.height / 2 },
  };
}
