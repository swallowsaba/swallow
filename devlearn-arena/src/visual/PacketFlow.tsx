import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { Topology } from '@/engines/net/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { netCommands, type RunCommand } from './commands';
import {
  changedFields, deviceCenter, HEADER_FIELDS, headerValue, layoutNet, NODE_H, NODE_W, stoppedAt,
} from './netModel';
import { FILL } from './sceneKit';
import { Viewport } from './Viewport';

interface Props {
  net: Topology | null;
  /** いま自分がいる機器 */
  self: string;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

/** 1ホップ進むのにかける時間（ミリ秒） */
const HOP_MS = 800;

/**
 * 直前のパケットを1ホップずつ進める。
 * 送り直すたび（trace.id が変わるたび）に最初のホップから再生する。動きを止める設定なら最後のホップを出す。
 */
function useHopPlayer(traceId: number | undefined, hopCount: number, animate: boolean): [number, (n: number) => void] {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (hopCount === 0) return;
    if (!animate) {
      setStep(hopCount - 1);
      return;
    }
    setStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= hopCount) {
        clearInterval(timer);
        return;
      }
      setStep(i);
    }, HOP_MS);
    return () => {
      clearInterval(timer);
    };
  }, [traceId, hopCount, animate]);
  return [Math.min(step, Math.max(0, hopCount - 1)), setStep];
}

/**
 * ネットワークの構成図。
 * 機器を箱として並べ、リンクを線で結ぶ。切れているリンクは赤い破線になる。
 * 直前に送ったパケットは、deliver が返したホップの順に、線の上を1ホップずつ流れる。
 * パケットやホップを押すと、その時点のヘッダの全項目が出て、1つ前のホップから書き換わった項目に色が付く。
 * 届かなかったときは、止まった機器が赤く光り、理由が出る。
 */
export function PacketFlow({ net, self, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const placed = useMemo(() => (net === null ? null : layoutNet(net)), [net]);
  const trace = net?.trace;
  const hops = trace?.hops ?? [];
  const [step, setStep] = useHopPlayer(trace?.id, hops.length, animate);
  // ヘッダの表を開いているか。パケットかホップを押すと開く
  const [inspecting, setInspecting] = useState(false);

  if (net === null || placed === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t('viz.noNet')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noNetLead')}
          </p>
        </div>
      </div>
    );
  }

  const byName = new Map(placed.nodes.map((n) => [n.name, n]));
  const hop = hops[step];
  const hopNode = hop === undefined ? undefined : byName.get(hop.device);
  const at = hopNode === undefined ? null : deviceCenter(hopNode);
  // いまのホップまでに通った線
  const walked = new Set(
    hops.slice(1, step + 1).map((h, i) => [hops[i]?.device ?? '', h.device].sort().join('>')),
  );
  const stopped = stoppedAt(trace);
  const finished = step >= hops.length - 1;
  const changed = hop === undefined ? new Set<string>() : changedFields(hops[step - 1], hop);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onCommand ? <p className="shrink-0 px-4 pt-2 text-xs text-ink-soft">{t('viz.clickHint')}</p> : null}
      <div className="min-h-0 flex-1">
      <Viewport label={t('park.tab.net')}>
      <div className="relative m-4" style={{ width: placed.width, height: placed.height }}>
        <svg className="absolute left-0 top-0" width={placed.width} height={placed.height}>
          {placed.edges.map((edge) => {
            const from = deviceCenter(edge.from);
            const to = deviceCenter(edge.to);
            const onPath = walked.has([edge.from.name, edge.to.name].sort().join('>'));
            const toggle = netCommands.toggleLink(net, edge.link, self);
            return (
              <g key={`${edge.link.a}-${edge.link.b}`} data-link={`${edge.link.a}-${edge.link.b}`} data-up={edge.up ? 'true' : 'false'}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={edge.up ? 'var(--wood)' : 'var(--bad)'}
                  strokeWidth={edge.up ? 8 : 5}
                  strokeDasharray={edge.up ? undefined : '10 8'}
                />
                {onPath && edge.up ? (
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--gold)" strokeWidth={3} />
                ) : null}
                {onCommand ? (
                  // 押しやすいよう、見えない太い線を重ねる
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="transparent"
                    strokeWidth={22}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onClick={() => {
                      onCommand(toggle);
                    }}
                  >
                    <title>{toggle}</title>
                  </line>
                ) : null}
              </g>
            );
          })}
        </svg>

        {placed.nodes.map((node) => {
          const isSelf = node.name === self;
          const ping = netCommands.pingTo(net, node.name);
          const isStop = finished && stopped === node.name;
          return (
            <div
              key={node.name}
              data-device={node.name}
              data-stopped={isStop ? 'true' : 'false'}
              className={`absolute border-4 ${isStop || isSelf ? 'border-[var(--bad)]' : 'border-wood-dark'}`}
              style={{
                left: node.x,
                top: node.y,
                width: NODE_W,
                minHeight: NODE_H,
                backgroundColor: isStop ? FILL.bad : node.up ? 'var(--cream)' : 'var(--cream-dark)',
                boxShadow: isStop ? '0 0 0 4px var(--bad), 0 0 18px var(--bad)' : '0 5px 0 rgba(0,0,0,0.2)',
              }}
            >
              <div
                className={`flex items-center gap-1 px-2 py-1 text-sm font-extrabold ${
                  isSelf ? 'bg-[var(--bad)] text-cream' : 'plate'
                }`}
              >
                <span aria-hidden>{node.kind === 'router' ? '🔀' : node.kind === 'switch' ? '🔗' : '💻'}</span>
                <span className="truncate">{node.name}</span>
              </div>
              <div className="px-2 py-1">
                {/* 箱を押すと、いまいる機器からこの機器へ ping を打つ */}
                <button
                  type="button"
                  disabled={!onCommand || ping === null || isSelf}
                  aria-label={t('viz.pingTo', { name: node.name })}
                  title={ping ?? undefined}
                  className="block w-full text-left disabled:cursor-default"
                  onClick={() => {
                    if (ping !== null) onCommand?.(ping);
                  }}
                >
                  {node.ips.map((ip) => (
                    <span key={ip} className="block truncate font-mono text-xs">
                      {ip}
                    </span>
                  ))}
                </button>
                {isSelf ? (
                  <p className="mt-1 font-mono text-xs text-[var(--bad)]">
                    {t('viz.youAreHere')}
                  </p>
                ) : onCommand && node.kind !== 'switch' ? (
                  <button
                    type="button"
                    className="mt-1 border-2 border-wood-dark px-1 font-mono text-[11px]"
                    title={netCommands.operateOn(node.name)}
                    onClick={() => {
                      onCommand(netCommands.operateOn(node.name));
                    }}
                  >
                    {t('viz.operateHere')}
                  </button>
                ) : null}
              </div>
              {isStop && trace?.error ? (
                <p data-testid="stop-reason" className="border-t-2 border-[var(--bad)] bg-cream px-2 py-1 text-xs font-bold text-[var(--bad)]">
                  ✗ {trace.error}
                </p>
              ) : null}
            </div>
          );
        })}

        {/* パケット。いまのホップの機器の上にいて、次のホップへ線の上を進む。押すとヘッダが見える */}
        {at !== null ? (
          <motion.button
            type="button"
            key={`packet-${String(trace?.id ?? 0)}`}
            data-testid="packet"
            aria-label={t('viz.inspectPacket')}
            title={t('viz.inspectPacket')}
            className="absolute z-10 grid h-8 w-8 place-items-center rounded-full border-4 border-wood-dark text-sm"
            style={{ backgroundColor: 'var(--gold)', marginLeft: -16, marginTop: -16 }}
            initial={{ left: at.x, top: at.y }}
            animate={{ left: at.x, top: at.y }}
            transition={{ duration: animate ? (HOP_MS * 0.8) / 1000 : 0, ease: 'easeInOut' }}
            onClick={() => {
              setInspecting(true);
            }}
          >
            ✉
          </motion.button>
        ) : null}
      </div>

      </Viewport>
      </div>

      {/* 図の下の欄。拡大縮小に巻き込まず、いつも同じ大きさで読めるようにする */}
      <div className="max-h-[45%] shrink-0 overflow-auto border-t-4 border-wood-dark px-4 pb-4">
      {/* ホップの一覧とヘッダ。押したホップの時点のヘッダを出す */}
      {hops.length > 0 ? (
        <section aria-label={t('viz.hops')} className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">{t('viz.hops')}</p>
          <ol className="mt-1 flex flex-wrap gap-1">
            {hops.map((h, i) => (
              <li key={`${h.device}-${String(i)}`}>
                <button
                  type="button"
                  data-hop={i}
                  aria-current={i === step ? 'step' : undefined}
                  className={`border-2 px-2 py-0.5 font-mono text-xs ${
                    i === step ? 'border-[var(--bad)] bg-gold' : 'border-wood-dark bg-cream'
                  }`}
                  title={h.note}
                  onClick={() => {
                    setStep(i);
                    setInspecting(true);
                  }}
                >
                  {i + 1}. {h.device}
                </button>
              </li>
            ))}
          </ol>
          {hop !== undefined ? <p className="mt-1 font-mono text-xs text-ink-soft">{hop.note}</p> : null}
          {inspecting && hop !== undefined ? (
            <table data-testid="headers" className="mt-2 w-full border-collapse font-mono text-xs">
              <caption className="text-left text-xs font-bold">
                {t('viz.headersAt', { n: step + 1, device: hop.device })}
              </caption>
              <tbody>
                {HEADER_FIELDS.map(({ field, label, layer }) => {
                  const isChanged = changed.has(field);
                  return (
                    <tr
                      key={field}
                      data-field={field}
                      data-changed={isChanged ? 'true' : 'false'}
                      style={{ backgroundColor: isChanged ? FILL.warn : undefined }}
                    >
                      <td className="border border-wood-dark px-1 text-ink-soft">{layer}</td>
                      <th scope="row" className="border border-wood-dark px-1 text-left font-bold">
                        {label}
                      </th>
                      <td className="border border-wood-dark px-1">{headerValue(hop, field)}</td>
                      <td className="border border-wood-dark px-1 font-sans font-bold">
                        {isChanged ? `${t('viz.rewritten')} ← ${headerValue(hops[step - 1] ?? hop, field)}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-xs text-ink-soft">{t('viz.inspectLead')}</p>
          )}
        </section>
      ) : null}

      {/* キーボードでも抜き挿しできるよう、ケーブルの一覧も置く */}
      {onCommand && placed.edges.length > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">{t('viz.toggleLink')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {placed.edges.map((edge) => {
              const toggle = netCommands.toggleLink(net, edge.link, self);
              return (
                <li key={`${edge.link.a}-${edge.link.b}`}>
                  <button
                    type="button"
                    className={`border-2 px-2 py-0.5 font-mono text-xs ${
                      edge.up ? 'border-wood-dark' : 'border-[var(--bad)] text-[var(--bad)]'
                    }`}
                    title={toggle}
                    onClick={() => {
                      onCommand(toggle);
                    }}
                  >
                    {edge.link.a} – {edge.link.b} {edge.up ? '🔌' : '✂'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {net.dns.size > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">{t('viz.dns')}</p>
          <ul className="mt-1">
            {[...net.dns.entries()].map(([name, ip]) => (
              <li key={name} className="font-mono text-sm">
                {name} → {ip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
    </div>
  );
}
