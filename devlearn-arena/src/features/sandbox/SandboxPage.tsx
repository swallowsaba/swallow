import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { createRepo } from '@/engines/github/pr';
import { HOME } from '@/engines/kernel/path';
import type { SessionOptions } from '@/engines/kernel/session';
import { EditorPanel, type EditorTarget } from '@/features/park/EditorPanel';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { useShellSession } from '@/features/terminal/useShellSession';
import { useT } from '@/i18n/useT';
import type { TKey } from '@/i18n';
import { useStore } from '@/store';
import { Splitter } from '@/ui/Splitter';
import { ClusterCanvas } from '@/visual/ClusterCanvas';
import { CommitGraph } from '@/visual/CommitGraph';
import { FileWorld } from '@/visual/FileWorld';
import { PacketFlow } from '@/visual/PacketFlow';
import { PrTimeline } from '@/visual/PrTimeline';

type Tab = 'world' | 'git' | 'k8s' | 'net' | 'gh';

/** 全部のエンジンを最初から使える状態にする。任務の縛りは無い */
function sandboxOptions(): SessionOptions {
  resetMac();
  return {
    cluster: {
      ...emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx:1.25')])]]),
      services: new Map([['default/web', service('web', { app: 'web' })]]),
    },
    net: topology(
      [
        host('pc1', [iface('eth0', '192.168.1.10', 24)], {
          routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
        }),
        router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]),
        host('web', [iface('eth0', '10.0.0.20', 24)], {
          routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
          listening: [80, 443],
        }),
      ],
      [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
      { 'web.internal': '10.0.0.20' },
    ),
    repo: createRepo('acme', 'app'),
    vars: { NET_SELF: 'pc1' },
    files: {
      [HOME]: null,
      [`${HOME}/README.md`]: '# 自由に触れる場所\n\nhelp で使えるコマンドが出ます。\n',
      '/etc/hosts': '127.0.0.1\tlocalhost\n10.0.0.20\tweb.internal\n',
    },
  };
}

const TABS: { id: Tab; key: TKey }[] = [
  { id: 'world', key: 'sandbox.tab.world' },
  { id: 'git', key: 'sandbox.tab.git' },
  { id: 'k8s', key: 'sandbox.tab.k8s' },
  { id: 'net', key: 'sandbox.tab.net' },
  { id: 'gh', key: 'sandbox.tab.gh' },
];

/**
 * サンドボックス。
 * 任務の判定も手順も無い。全部のエンジンが揃った状態で、好きに触れる。
 */
export default function SandboxPage() {
  const t = useT();
  const paneMain = useStore((s) => s.settings.paneMain);
  const updateSettings = useStore((s) => s.updateSettings);
  const options = useMemo(() => sandboxOptions(), []);
  const session = useShellSession(options);
  const terminalRef = useRef<TerminalHandle>(null);
  // 図を押したときは、そのコマンドを端末で実際に打つ
  const runFromDiagram = useCallback((line: string) => {
    terminalRef.current?.submit(line);
  }, []);
  const [tab, setTab] = useState<Tab>('world');
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  const onEditor = useCallback((request: EditorTarget) => {
    setEditing(request);
  }, []);

  const state = session.state;
  const previous = session.journal.entries[Math.max(0, session.journal.cursor - 1)]?.state;

  return (
    <div className="flex h-full min-h-[70vh] flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="title text-4xl">{t('sandbox.title')}</h1>
        <p className="max-w-2xl text-base text-ink-soft">{t('sandbox.lead')}</p>
        <Link
          to="/"
          className="ml-auto font-mono text-base text-[var(--gold-dark)] underline underline-offset-4"
        >
          {t('sandbox.toMissions')}
        </Link>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `minmax(0, ${String(paneMain)}fr) auto minmax(0, ${String(100 - paneMain)}fr)`,
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-hidden border-4 border-wood-dark bg-[var(--wood-dark)]">
            <TerminalView ref={terminalRef} session={session} onEditor={onEditor} />
          </div>
          <TimeScrubber session={session} />
        </div>

        <Splitter
          orientation="vertical"
          value={paneMain}
          label={t('sandbox.splitLabel')}
          onChange={(next) => {
            updateSettings({ paneMain: next });
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <div role="tablist" aria-label={t('sandbox.viewLabel')} className="flex flex-wrap gap-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => {
                  setTab(item.id);
                }}
                className={`border px-3 py-1.5 font-mono text-sm ${
                  tab === item.id
                    ? 'border-[var(--gold-dark)] text-[var(--gold-dark)]'
                    : 'border-wood-dark text-ink-soft hover:text-ink'
                }`}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto border border-wood-dark bg-cream p-3">
            {tab === 'world' ? (
              <FileWorld vfs={state.vfs} previous={previous?.vfs} cwd={state.cwd} />
            ) : null}
            {tab === 'git' ? <CommitGraph git={state.git} vfs={state.vfs} onCommand={runFromDiagram} /> : null}
            {tab === 'k8s' ? <ClusterCanvas cluster={state.cluster} previous={previous?.cluster} onCommand={runFromDiagram} /> : null}
            {tab === 'net' ? <PacketFlow net={state.net} self={state.vars.get('NET_SELF') ?? 'pc1'} onCommand={runFromDiagram} /> : null}
            {tab === 'gh' ? <PrTimeline repo={state.repo} onCommand={runFromDiagram} /> : null}
          </div>
        </div>
      </div>

      {editing === null ? null : (
        <EditorPanel
          target={editing}
          onSave={(content) => {
            session.saveFile(editing.path, content);
            setEditing(null);
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
