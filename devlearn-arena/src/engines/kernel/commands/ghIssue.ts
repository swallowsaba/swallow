import {
  closeIssue, createProject, findIssue, forkRepo, labelIssue, linkedIssues, moveCard,
  openIssue, ownersFor, parseCodeowners,
} from '@/engines/github/issues';
import { resolve } from '../path';
import { fromLines } from './args';
import { readFileOrNull, type GhHandler } from './ghShared';

const CODEOWNERS_PATHS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];

/** Issue / Projects / CODEOWNERS / fork まわり */
export const issueSubcommands: Record<string, GhHandler> = {
  issue: ({ repo, operands, values, rest }) => {
    const action = operands[0] ?? 'list';

    if (action === 'create') {
      const title = values.get('t') ?? '新しい課題';
      const labels = (values.get('l') ?? '').split(',').filter((l) => l !== '');
      const assignees = (values.get('a') ?? '').split(',').filter((a) => a !== '');
      const milestone = values.get('milestone');
      const result = openIssue(repo, {
        title,
        body: values.get('b') ?? '',
        labels,
        assignees,
        milestone,
      });
      return {
        stdout: `https://github.com/${repo.owner}/${repo.name}/issues/${String(result.issue.number)}\n`,
        patch: { repo: result.repo },
      };
    }

    if (action === 'list') {
      if (repo.issues.length === 0) return { stdout: 'no issues\n' };
      const wanted = values.get('l');
      const items = wanted === undefined ? repo.issues : repo.issues.filter((i) => i.labels.includes(wanted));
      return {
        stdout: fromLines(
          items.map(
            (i) =>
              `#${String(i.number)}\t${i.title}\t${i.state}` +
              `${i.labels.length === 0 ? '' : `\t[${i.labels.join(',')}]`}` +
              `${i.milestone === null ? '' : `\t${i.milestone}`}`,
          ),
        ),
      };
    }

    const number = Number(operands[1]);
    if (!Number.isFinite(number)) {
      return { stderr: 'usage: gh issue <view|close|label> <番号>\n', code: 1 };
    }
    const issue = findIssue(repo, number);
    if (!issue) return { stderr: `no issue found for #${String(number)}\n`, code: 1 };

    if (action === 'view') {
      return {
        stdout: fromLines([
          `#${String(issue.number)} ${issue.title}`,
          `状態: ${issue.state}   作成者: ${issue.author}`,
          `ラベル: ${issue.labels.join(', ') || 'なし'}`,
          `担当: ${issue.assignees.join(', ') || '未割当'}`,
          `マイルストーン: ${issue.milestone ?? 'なし'}`,
          issue.closedBy === null ? '' : `#${String(issue.closedBy)} で閉じられました`,
          '',
          issue.body,
        ]),
      };
    }

    if (action === 'close') {
      const result = closeIssue(repo, number);
      if ('error' in result) return { stderr: `${result.error}\n`, code: 1 };
      return { stdout: `#${String(number)} を閉じました\n`, patch: { repo: result } };
    }

    if (action === 'label') {
      const labels = rest.filter((a) => !a.startsWith('-') && a !== 'label' && a !== String(number));
      if (labels.length === 0) return { stderr: 'usage: gh issue label <番号> <ラベル>...\n', code: 1 };
      const result = labelIssue(repo, number, labels);
      if ('error' in result) return { stderr: `${result.error}\n`, code: 1 };
      return { stdout: `#${String(number)} にラベルを付けました\n`, patch: { repo: result } };
    }

    return { stderr: `unknown issue action: ${action}\n`, code: 1 };
  },

  project: ({ repo, operands, values }) => {
    const action = operands[0] ?? 'view';

    if (action === 'create') {
      const name = operands[1] ?? 'Board';
      const columns = (values.get('columns') ?? 'Todo,Doing,Done').split(',').filter((c) => c !== '');
      return {
        stdout: `project "${name}" を作りました（${columns.join(' / ')}）\n`,
        patch: { repo: createProject(repo, name, columns) },
      };
    }

    if (action === 'move') {
      const name = operands[1] ?? repo.projects[0]?.name ?? '';
      const item = Number(operands[2]);
      const column = operands[3];
      if (!Number.isFinite(item) || column === undefined) {
        return { stderr: 'usage: gh project move <盤面> <番号> <列>\n', code: 1 };
      }
      const result = moveCard(repo, name, item, column);
      if ('error' in result) return { stderr: `${result.error}\n`, code: 1 };
      return { stdout: `#${String(item)} を ${column} へ移しました\n`, patch: { repo: result } };
    }

    if (repo.projects.length === 0) return { stdout: 'no projects\n' };
    const lines: string[] = [];
    for (const project of repo.projects) {
      lines.push(project.name);
      for (const column of project.columns) {
        lines.push(`  ${column.name}: ${column.items.map((i) => `#${String(i)}`).join(' ') || '（なし）'}`);
      }
    }
    return { stdout: fromLines(lines) };
  },

  codeowners: ({ repo, shell, operands }) => {
    const action = operands[0] ?? 'load';

    if (action === 'load') {
      for (const candidate of CODEOWNERS_PATHS) {
        const content = readFileOrNull(shell.vfs, resolve(shell.cwd, candidate));
        if (content === null) continue;
        const rules = parseCodeowners(content);
        return {
          stdout: `${candidate} から ${String(rules.length)} 件の規則を読み込みました\n`,
          patch: { repo: { ...repo, codeowners: rules } },
        };
      }
      return {
        stderr: `CODEOWNERS が見つかりません（${CODEOWNERS_PATHS.join(' / ')} を探しました）\n`,
        code: 1,
      };
    }

    if (action === 'who') {
      const paths = operands.slice(1);
      if (paths.length === 0) return { stderr: 'usage: gh codeowners who <パス>...\n', code: 1 };
      if (repo.codeowners.length === 0) {
        return { stderr: 'まだ CODEOWNERS を読み込んでいません（gh codeowners load）\n', code: 1 };
      }
      const owners = ownersFor(repo.codeowners, paths);
      return {
        stdout:
          owners.length === 0
            ? '（このパスに所有者はいません）\n'
            : `${owners.join(' ')}\n`,
      };
    }

    if (action === 'list') {
      if (repo.codeowners.length === 0) return { stdout: '（規則がありません）\n' };
      return {
        stdout: fromLines(repo.codeowners.map((r) => `${r.pattern}\t${r.owners.join(' ')}`)),
      };
    }

    return { stderr: 'usage: gh codeowners <load|list|who <パス>>\n', code: 1 };
  },

  fork: ({ repo, operands }) => {
    const owner = operands[0] ?? 'learner';
    if (repo.upstream !== null) {
      return { stderr: 'すでに fork です。fork の fork は作れません\n', code: 1 };
    }
    const { fork } = forkRepo(repo, owner);
    return {
      stdout:
        `${repo.owner}/${repo.name} を ${owner}/${repo.name} に fork しました\n` +
        '以降の操作は fork 側に対して行われます。元へは Pull Request で戻します。\n',
      patch: { repo: fork },
    };
  },

  secret: ({ repo, operands, values }) => {
    const action = operands[0] ?? 'list';
    if (action === 'set') {
      const name = operands[1];
      if (name === undefined) return { stderr: 'usage: gh secret set <名前> -b <値>\n', code: 1 };
      const value = values.get('b') ?? 'dummy';
      return {
        stdout: `${name} を登録しました\n`,
        patch: { repo: { ...repo, secrets: { ...repo.secrets, [name]: value } } },
      };
    }
    if (action === 'list') {
      const names = Object.keys(repo.secrets).sort();
      if (names.length === 0) return { stdout: '（登録されていません）\n' };
      // 値は出さない。名前と、設定済みであることだけ
      return { stdout: fromLines(names.map((n) => `${n}\tUpdated`)) };
    }
    return { stderr: 'usage: gh secret <set|list>\n', code: 1 };
  },

  linked: ({ repo, operands }) => {
    const number = Number(operands[0]);
    const pull = repo.pulls.find((p) => p.number === number);
    if (!pull) return { stderr: 'usage: gh linked <PR 番号>\n', code: 1 };
    const numbers = linkedIssues(pull.body);
    return {
      stdout:
        numbers.length === 0
          ? '（この Pull Request は Issue を閉じません）\n'
          : `${numbers.map((n) => `#${String(n)}`).join(' ')}\n`,
    };
  },

  release: ({ repo, shell, operands, values, rest }) => {
    const action = operands[0] ?? 'list';

    if (action === 'list') {
      if (repo.releases.length === 0) return { stdout: 'no releases\n' };
      return {
        stdout: fromLines(
          repo.releases.map(
            (r) => `${r.tag}\t${r.title}${r.prerelease ? '\tPre-release' : ''}`,
          ),
        ),
      };
    }

    if (action === 'create') {
      const tag = operands[1];
      if (tag === undefined) {
        return { stderr: 'usage: gh release create <tag> -t <題名>\n', code: 1 };
      }
      // タグは手元のリポジトリに実在していないと打てない
      const git = shell.git;
      if (git === null) {
        return { stderr: 'fatal: not a git repository（先に git init が要ります）\n', code: 1 };
      }
      if (!git.refs.has(`refs/tags/${tag}`)) {
        return {
          stderr: `error: タグ ${tag} がありません（git tag -a ${tag} -m "..." で作ってください）\n`,
          code: 1,
        };
      }
      if (repo.releases.some((r) => r.tag === tag)) {
        return { stderr: `error: ${tag} のリリースはすでにあります\n`, code: 1 };
      }
      const release = {
        tag,
        title: values.get('t') ?? tag,
        notes: values.get('n') ?? '',
        prerelease: rest.includes('--prerelease'),
      };
      return {
        stdout: `https://github.com/${repo.owner}/${repo.name}/releases/tag/${tag}\n`,
        patch: { repo: { ...repo, releases: [...repo.releases, release] } },
      };
    }

    return { stderr: 'usage: gh release <create|list>\n', code: 1 };
  },
};
