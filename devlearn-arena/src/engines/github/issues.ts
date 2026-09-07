import type { Issue, OwnerRule, Project, Repo, Upstream } from './types';

/* ---- Issue ---- */

export function openIssue(
  repo: Repo,
  input: { title: string; body?: string; author?: string; labels?: string[]; assignees?: string[]; milestone?: string },
): { repo: Repo; issue: Issue } {
  const issue: Issue = {
    number: repo.nextIssueNumber,
    title: input.title,
    body: input.body ?? '',
    author: input.author ?? 'learner',
    state: 'open',
    labels: input.labels ?? [],
    assignees: input.assignees ?? [],
    milestone: input.milestone ?? null,
    closedBy: null,
  };
  return {
    repo: { ...repo, issues: [...repo.issues, issue], nextIssueNumber: repo.nextIssueNumber + 1 },
    issue,
  };
}

export function findIssue(repo: Repo, number: number): Issue | undefined {
  return repo.issues.find((i) => i.number === number);
}

function replaceIssue(repo: Repo, issue: Issue): Repo {
  return { ...repo, issues: repo.issues.map((i) => (i.number === issue.number ? issue : i)) };
}

export function closeIssue(repo: Repo, number: number, by: number | null = null): Repo | { error: string } {
  const issue = findIssue(repo, number);
  if (!issue) return { error: `issue #${String(number)} が見つかりません` };
  return replaceIssue(repo, { ...issue, state: 'closed', closedBy: by });
}

export function labelIssue(repo: Repo, number: number, labels: readonly string[]): Repo | { error: string } {
  const issue = findIssue(repo, number);
  if (!issue) return { error: `issue #${String(number)} が見つかりません` };
  return replaceIssue(repo, { ...issue, labels: [...new Set([...issue.labels, ...labels])] });
}

/**
 * PR の本文から `Closes #12` のような書き方を拾い、閉じるべき Issue を返す。
 * 番号の一覧を作り置きせず、そのつど本文から読む。
 */
export function linkedIssues(body: string): number[] {
  const found = new Set<number>();
  for (const match of body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
    const number = Number(match[1]);
    if (Number.isFinite(number)) found.add(number);
  }
  return [...found].sort((a, b) => a - b);
}

/** PR をマージしたときに、紐付いた Issue を閉じる */
export function closeLinkedIssues(repo: Repo, pullNumber: number, body: string): Repo {
  let next = repo;
  for (const number of linkedIssues(body)) {
    const result = closeIssue(next, number, pullNumber);
    if (!('error' in result)) next = result;
  }
  return next;
}

/* ---- Projects ---- */

export function createProject(repo: Repo, name: string, columns: readonly string[]): Repo {
  const project: Project = {
    name,
    columns: columns.map((c) => ({ name: c, items: [] })),
  };
  return { ...repo, projects: [...repo.projects.filter((p) => p.name !== name), project] };
}

export function moveCard(
  repo: Repo,
  projectName: string,
  item: number,
  column: string,
): Repo | { error: string } {
  const project = repo.projects.find((p) => p.name === projectName);
  if (!project) return { error: `project "${projectName}" が見つかりません` };
  if (!project.columns.some((c) => c.name === column)) {
    return { error: `列 "${column}" がありません（${project.columns.map((c) => c.name).join(', ')}）` };
  }
  const columns = project.columns.map((c) => ({
    ...c,
    items: c.name === column
      ? [...c.items.filter((i) => i !== item), item].sort((a, b) => a - b)
      : c.items.filter((i) => i !== item),
  }));
  return {
    ...repo,
    projects: repo.projects.map((p) => (p.name === projectName ? { ...p, columns } : p)),
  };
}

/* ---- CODEOWNERS ---- */

/**
 * CODEOWNERS を読む。
 * 空行と `#` から始まる行は無視。`パターン 所有者...` の並び。
 */
export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (pattern === undefined || owners.length === 0) continue;
    rules.push({ pattern, owners });
  }
  return rules;
}

function matchesPattern(pattern: string, path: string): boolean {
  const cleaned = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  if (cleaned === '*') return true;
  if (cleaned.endsWith('/')) return path.startsWith(cleaned);
  if (cleaned.startsWith('*.')) return path.endsWith(cleaned.slice(1));
  if (cleaned.includes('*')) {
    const escaped = cleaned.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(path);
  }
  return path === cleaned || path.startsWith(`${cleaned}/`);
}

/**
 * 変更したパスから、レビューが要る所有者を出す。
 * 後の行が前の行に勝つ（本物と同じ）ので、後ろから探す。
 */
export function ownersFor(rules: readonly OwnerRule[], paths: readonly string[]): string[] {
  const owners = new Set<string>();
  for (const path of paths) {
    for (let i = rules.length - 1; i >= 0; i -= 1) {
      const rule = rules[i];
      if (rule === undefined) continue;
      if (matchesPattern(rule.pattern, path)) {
        for (const owner of rule.owners) owners.add(owner);
        break;
      }
    }
  }
  return [...owners].sort();
}

/** 所有者のレビューが揃っているか */
export function ownerApprovalMissing(
  repo: Repo,
  pullNumber: number,
  changedPaths: readonly string[],
): string[] {
  const pull = repo.pulls.find((p) => p.number === pullNumber);
  if (!pull) return [];
  const required = ownersFor(repo.codeowners, changedPaths);
  const approved = new Set(
    pull.reviews.filter((r) => r.state === 'approved').map((r) => `@${r.reviewer}`),
  );
  return required.filter((owner) => !approved.has(owner));
}

/* ---- Fork ---- */

export function forkRepo(repo: Repo, owner: string): { origin: Repo; fork: Repo } {
  const upstream: Upstream = { owner: repo.owner, name: repo.name };
  const fork: Repo = {
    ...repo,
    owner,
    pulls: [],
    nextPullNumber: 1,
    issues: [],
    nextIssueNumber: 1,
    projects: [],
    upstream,
    forks: [],
  };
  return {
    origin: { ...repo, forks: [...repo.forks, { owner, name: repo.name }] },
    fork,
  };
}
