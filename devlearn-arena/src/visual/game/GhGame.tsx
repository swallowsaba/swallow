import { motion } from 'framer-motion';
import type { CheckRun, Repo } from '@/engines/github/types';
import type { TKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { prCommands, type RunCommand } from '../commands';
import { stageCommand, type StageId, type StageState } from '../prModel';
import { clip, type Box } from '../sceneKit';
import { EmptyWorld, GameStage } from './GameStage';
import { layoutGuild, STAGE_H, STAGE_W } from './ghGuild';
import { Sprite } from './pixel';
import { INK, WORKER, workerPalette } from './sprites';
import { BAD, Clickable, GOLD, House, OK, Road, Sign, Sparkle, STONE, STONE_DARK } from './scenery';

interface Props {
  repo: Repo | null;
  onCommand?: RunCommand;
}

const STAGE_ICON: Record<StageId, string> = { created: '📝', review: '👀', checks: '🔍', merge: '🚀' };
const STAGE_LABEL: Record<StageId, TKey> = {
  created: 'viz.stage.created',
  review: 'viz.stage.review',
  checks: 'viz.stage.checks',
  merge: 'viz.stage.merge',
};
const STAGE_FILL: Record<StageState, string> = { done: '#a9d892', active: '#f6d27a', waiting: '#e7dcc4', bad: '#f0a293' };
const STAGE_MARK: Record<StageState, string> = { done: '✓', active: '！', waiting: '…', bad: '✗' };

/** 検査の持ち場。結果を印で見せる（合格 ✓・不合格 ✗・検査中・見送り・順番待ち） */
function Room({ check, box, blocked, animate }: { check: CheckRun; box: Box; blocked: boolean; animate: boolean }) {
  const tone = check.status === 'success' ? '#cfe8c0' : check.status === 'failure' ? '#f3c4bb' : check.status === 'skipped' ? '#d4d4d4' : STONE;
  const badge = { cx: box.x + 22, cy: box.y + 26 };
  return (
    <g>
      <rect x={box.x + 4} y={box.y + 4} width={box.w} height={box.h} fill="rgba(0,0,0,0.25)" />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={tone} stroke={INK} strokeWidth={3} />
      <rect x={box.x} y={box.y} width={box.w} height={6} fill={STONE_DARK} />
      {check.status === 'running' ? (
        <motion.g
          animate={animate ? { rotate: 360 } : { rotate: 0 }}
          transition={animate ? { repeat: Infinity, duration: 1.6, ease: 'linear' } : { duration: 0 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <circle cx={badge.cx} cy={badge.cy} r={11} fill="none" stroke="#b8862b" strokeWidth={4} strokeDasharray="8 5" />
        </motion.g>
      ) : (
        <g>
          <circle
            cx={badge.cx}
            cy={badge.cy}
            r={12}
            fill={check.status === 'success' ? OK : check.status === 'failure' ? BAD : check.status === 'skipped' ? '#a9a9a9' : '#f6e8cd'}
            stroke={INK}
            strokeWidth={2}
          />
          <text x={badge.cx} y={badge.cy + 1} fontSize={14} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={check.status === 'queued' ? INK : '#fff'}>
            {check.status === 'success' ? '✓' : check.status === 'failure' ? '✗' : check.status === 'skipped' ? '−' : '…'}
          </text>
        </g>
      )}
      <text x={box.x + 44} y={box.y + 22} fontSize={12} fontWeight={800} fontFamily="var(--f-mono)" fill={INK}>
        {clip(check.name, box.w - 50, 12)}
      </text>
      <text x={box.x + 44} y={box.y + 38} fontSize={11} fontFamily="var(--f-mono)" fill={check.status === 'failure' ? BAD : INK}>
        {check.status}
      </text>
      {blocked ? (
        <g data-cross="true">
          <line x1={box.x + box.w - 24} y1={box.y + 8} x2={box.x + box.w - 6} y2={box.y + 26} stroke={BAD} strokeWidth={5} />
          <line x1={box.x + box.w - 6} y1={box.y + 8} x2={box.x + box.w - 24} y2={box.y + 26} stroke={BAD} strokeWidth={5} />
        </g>
      ) : null}
    </g>
  );
}

/**
 * GitHub のチーム本部。
 * Pull Request は変更の提案。作成 → レビュー → チェック → マージ の窓口を順に通ると取り込まれる。
 * チェックの窓口の下には Actions のジョブが検査ラインとして並び、不合格の検査から先には × が付く。
 * 窓口を押すとその段のコマンド（gh pr view / review --approve / checks / merge）、検査を押すと gh pr checks を打つ。
 */
export function GhGame({ repo, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();

  if (repo === null) {
    return <EmptyWorld title={t('game.gh.title')} lead={t('game.gh.noRepo')} testId="game-gh" />;
  }

  const guild = layoutGuild(repo);
  const occupied: Box[] = [
    { x: guild.hall.x - 30, y: 20, w: guild.width, h: guild.hall.h + 90 },
    ...guild.quests.map((q) => ({ x: 0, y: q.board.y - 30, w: guild.width, h: q.height + 50 })),
    ...(guild.quests.length === 0 ? [{ x: 0, y: 220, w: guild.width, h: 80 }] : []),
  ];

  return (
    <GameStage
      title={t('game.gh.title')}
      testId="game-gh"
      width={guild.width}
      height={guild.height}
      occupied={occupied}
      interactive={onCommand !== undefined}
      hud={
        <span className="knob px-2 py-0.5 font-mono text-xs">
          {repo.owner}/{repo.name}
        </span>
      }
    >
      {/* チーム本部の建物と、掲示された保護ルール */}
      <House {...guild.hall} wall="#e8d3a8" roof="#3f6f8f" />
      <Sign cx={guild.hall.x + guild.hall.w / 2} y={guild.hall.y - 34} text={`🏰 ${repo.owner}/${repo.name}`} strong maxWidth={260} />
      <g aria-hidden>
        <rect x={guild.hall.x + guild.hall.w + 40} y={guild.hall.y} width={380} height={guild.hall.h - 10} fill="#f6e8cd" stroke={INK} strokeWidth={3} />
        <rect x={guild.hall.x + guild.hall.w + 40} y={guild.hall.y} width={380} height={24} fill="#b07f4a" stroke={INK} strokeWidth={3} />
        <text x={guild.hall.x + guild.hall.w + 52} y={guild.hall.y + 16} fontSize={12} fontWeight={800} fill="#f6e8cd">
          {t('viz.repoLine', { owner: repo.owner, name: repo.name, branch: repo.defaultBranch })}
        </text>
        <text x={guild.hall.x + guild.hall.w + 52} y={guild.hall.y + 44} fontSize={12} fontWeight={800} fill={INK}>
          {t('viz.protection')}
        </text>
        {(repo.protections.length === 0 ? [null] : repo.protections.slice(0, 3)).map((rule, i) => (
          <text key={rule?.branch ?? 'none'} x={guild.hall.x + guild.hall.w + 52} y={guild.hall.y + 64 + i * 16} fontSize={11} fontFamily="var(--f-mono)" fill={INK}>
            {rule === null
              ? t('viz.noneShort')
              : clip(
                  t('viz.protectionLine', {
                    branch: rule.branch,
                    approvals: rule.requiredApprovals,
                    checks: rule.requiredChecks.join(', ') || t('viz.noneShort'),
                  }),
                  350,
                  11,
                )}
          </text>
        ))}
      </g>

      {guild.quests.length === 0 ? (
        <Sign cx={guild.width / 2} y={250} text={t('game.gh.noPulls')} maxWidth={guild.width - 40} />
      ) : null}

      {guild.quests.map((quest) => {
        const { pull } = quest;
        const first = quest.stages[0]?.box;
        const last = quest.stages[quest.stages.length - 1]?.box;
        const open = pull.state === 'open';
        const roomByName = new Map(quest.rooms.map((r) => [r.check.name, r]));
        return (
          <g key={pull.number} data-pull={pull.number} data-state={pull.state}>
            {/* 変更の提案書 */}
            <Clickable command={prCommands.view(pull.number)} onCommand={onCommand} label={`#${String(pull.number)}`}>
              <rect x={quest.board.x} y={quest.board.y} width={quest.board.w} height={quest.board.h} fill="#fff4d6" stroke={INK} strokeWidth={3} />
              <rect x={quest.board.x + quest.board.w / 2 - 5} y={quest.board.y - 6} width={10} height={10} fill={BAD} stroke={INK} strokeWidth={1.5} />
              <text x={quest.board.x + 10} y={quest.board.y + 24} fontSize={13} fontWeight={900} fill={INK}>
                {clip(`#${String(pull.number)} ${pull.title}`, quest.board.w - 20, 13)}
              </text>
              <text x={quest.board.x + 10} y={quest.board.y + 44} fontSize={11} fontFamily="var(--f-mono)" fill="#5d4630">
                {clip(`${pull.head} → ${pull.base}`, quest.board.w - 20, 11)}
              </text>
              <rect x={quest.board.x + 10} y={quest.board.y + 54} width={70} height={18} fill={pull.state === 'merged' ? '#a9d892' : pull.state === 'closed' ? '#f0a293' : GOLD} stroke={INK} strokeWidth={2} />
              <text x={quest.board.x + 45} y={quest.board.y + 64} fontSize={11} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--f-mono)" fill={INK}>
                {pull.state}
              </text>
            </Clickable>

            {/* 窓口をつなぐ道 */}
            {first && last ? (
              <Road d={`M ${String(first.x + 20)} ${String(first.y + STAGE_H - 8)} L ${String(last.x + last.w - 20)} ${String(last.y + STAGE_H - 8)}`} lit={pull.state === 'merged'} />
            ) : null}

            {/* 4つの窓口 */}
            {quest.stages.map(({ stage, box }) => {
              const command = stageCommand(stage, pull);
              return (
                <Clickable key={stage.id} command={command} onCommand={onCommand} label={t(STAGE_LABEL[stage.id])} data-stage={stage.id} data-state={stage.state}>
                  <rect x={box.x + 4} y={box.y + 4} width={box.w} height={box.h} fill="rgba(0,0,0,0.22)" />
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={STAGE_FILL[stage.state]} stroke={stage.state === 'bad' ? BAD : INK} strokeWidth={stage.state === 'active' || stage.state === 'bad' ? 4 : 3} />
                  <text x={box.x + 10} y={box.y + 24} fontSize={18}>
                    {STAGE_ICON[stage.id]}
                  </text>
                  <text x={box.x + 36} y={box.y + 22} fontSize={13} fontWeight={900} fill={INK}>
                    {t(STAGE_LABEL[stage.id])}
                  </text>
                  <text x={box.x + 10} y={box.y + 46} fontSize={10} fontFamily="var(--f-mono)" fill={INK}>
                    {clip(stage.detail, STAGE_W - 16, 10)}
                  </text>
                  <circle cx={box.x + box.w - 6} cy={box.y + 6} r={11} fill={stage.state === 'done' ? OK : stage.state === 'bad' ? BAD : stage.state === 'active' ? GOLD : '#b9b2a4'} stroke={INK} strokeWidth={2} />
                  <text x={box.x + box.w - 6} y={box.y + 7} fontSize={12} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={stage.state === 'active' ? INK : '#fff'}>
                    {STAGE_MARK[stage.state]}
                  </text>
                  {stage.state === 'active' ? <Sparkle x={box.x + 12} y={box.y - 4} animate={animate} /> : null}
                </Clickable>
              );
            })}

            {/* レビューする人たち */}
            {(() => {
              const review = quest.stages.find((s) => s.stage.id === 'review')?.box;
              if (!review) return null;
              return pull.reviews.slice(0, 4).map((r, i) => (
                <g key={r.reviewer} aria-hidden>
                  <Sprite
                    map={WORKER}
                    palette={workerPalette(r.state === 'approved' ? '#5aa344' : r.state === 'changes_requested' ? '#c0392b' : '#8f6f3f', '#3f6f8f')}
                    x={review.x + i * 30}
                    y={review.y - 38}
                    scale={2}
                  />
                  <text x={review.x + i * 30 + 12} y={review.y - 42} fontSize={12} fontWeight={900} textAnchor="middle" fill={r.state === 'approved' ? OK : r.state === 'changes_requested' ? BAD : INK}>
                    {r.state === 'approved' ? '✓' : r.state === 'changes_requested' ? '✎' : '…'}
                  </text>
                  <title>{`${r.reviewer}: ${r.state}`}</title>
                </g>
              ));
            })()}

            {/* 承認・差し戻しの看板 */}
            {open && onCommand ? (
              <g>
                {[
                  { key: 'approve', text: `✓ ${t('viz.approve')}`, command: prCommands.approve(pull.number) },
                  { key: 'request', text: `✎ ${t('viz.requestChanges')}`, command: prCommands.requestChanges(pull.number) },
                ].map((a, i) => (
                  <Clickable key={a.key} command={a.command} onCommand={onCommand} label={a.text} data-action={a.key}>
                    <rect x={quest.board.x + i * 108} y={quest.actionsY} width={102} height={24} fill={i === 0 ? '#cfe8c0' : '#f3c4bb'} stroke={INK} strokeWidth={2} />
                    <text x={quest.board.x + i * 108 + 51} y={quest.actionsY + 13} fontSize={11} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                      {clip(a.text, 96, 11)}
                    </text>
                  </Clickable>
                ))}
              </g>
            ) : null}

            {/* チェックの検査ライン */}
            {quest.dungeonY !== null ? (
              <g>
                <text x={quest.stages[0]?.box.x ?? 0} y={quest.dungeonY + 12} fontSize={12} fontWeight={900} fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
                  {`⚔ ${t('game.gh.dungeon')}`}
                </text>
                {quest.edges.map((edge) => {
                  const a = roomByName.get(edge.from);
                  const b = roomByName.get(edge.to);
                  if (!a || !b) return null;
                  const broken = a.check.status === 'failure' || a.blocked;
                  const d = `M ${String(a.box.x + a.box.w)} ${String(a.box.y + a.box.h / 2)} L ${String(b.box.x)} ${String(b.box.y + b.box.h / 2)}`;
                  return (
                    <g key={`${edge.from}>${edge.to}`} data-dag-edge={`${edge.from}>${edge.to}`}>
                      <path d={d} stroke={INK} strokeWidth={16} fill="none" />
                      <path d={d} stroke={broken ? '#e7c8b8' : STONE} strokeWidth={10} fill="none" />
                      {broken ? <path d={d} stroke={BAD} strokeWidth={3} strokeDasharray="6 5" fill="none" /> : null}
                    </g>
                  );
                })}
                {quest.rooms.map((room) => (
                  <Clickable key={room.check.name} command={prCommands.checks(pull.number)} onCommand={onCommand} label={room.check.name} data-job={room.check.name} data-status={room.check.status} data-blocked={room.blocked ? 'true' : 'false'}>
                    <Room check={room.check} box={room.box} blocked={room.blocked} animate={animate} />
                  </Clickable>
                ))}
                {quest.rooms.some((r) => r.blocked) ? (
                  <text x={quest.stages[0]?.box.x ?? 0} y={quest.board.y + quest.height + 12} fontSize={11} fontWeight={800} fill={BAD} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
                    {t('game.gh.blocked')}
                  </text>
                ) : null}
              </g>
            ) : (
              <text x={quest.stages[0]?.box.x ?? 0} y={quest.actionsY + 16} fontSize={11} fontWeight={700} fill="#3f6a2b">
                {`⚔ ${t('game.gh.notRun')}`}
              </text>
            )}
          </g>
        );
      })}
    </GameStage>
  );
}
