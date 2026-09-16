import type { TraceHop } from '@/engines/net/types';
import { useT } from '@/i18n/useT';
import { changedFields, HEADER_FIELDS, headerValue } from './netModel';
import { FILL } from './sceneKit';

interface Props {
  hops: readonly TraceHop[];
  step: number;
  onStep: (n: number) => void;
  /** ヘッダの表を開いているか */
  inspecting: boolean;
  onInspect: () => void;
}

/**
 * ホップの一覧とヘッダの表。押したホップの時点のヘッダの全項目を出し、1つ前のホップから書き換わった項目に色を付ける。
 */
export function HopInspector({ hops, step, onStep, inspecting, onInspect }: Props) {
  const t = useT();
  const hop = hops[step];
  const changed = hop === undefined ? new Set<string>() : changedFields(hops[step - 1], hop);
  if (hops.length === 0) return null;
  return (
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
                onStep(i);
                onInspect();
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
  );
}
