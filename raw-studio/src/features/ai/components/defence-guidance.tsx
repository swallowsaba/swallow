import * as React from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { useT } from '@/i18n';

/**
 * External de-fencing guidance.
 *
 * Removing a regular net / chain-link / mesh is a specialised problem
 * ("de-fencing"): it needs a model trained on that periodic pattern, and the
 * result depends on reconstructing the background seen *through* the openings.
 * We can't do it well on-device with the generic thin-structure detector +
 * LaMa (it mis-selects and smears), and there's no free browser ONNX de-fencing
 * model to embed. Rather than ship something that produces broken output, we're
 * honest about the limit and point users to free, purpose-built web tools that
 * handle nets/fences. The user uploads their photo there; nothing here is sent
 * automatically (the app stays on-device — this is just a set of links).
 */

interface ExternalTool {
  readonly name: string;
  readonly url: string;
}

// Free, purpose-built de-fencing web tools. These are external services the
// user visits directly; the app does not send any image to them automatically.
const TOOLS: readonly ExternalTool[] = [
  { name: 'sparkpix.ai', url: 'https://sparkpix.ai/remove-fence-from-photo' },
  { name: 'EditThisPic', url: 'https://editthispic.com/edit/ai-fence-remover' },
  { name: 'OpenArt', url: 'https://openart.ai/features/remove-fence-from-photo' },
];

export function DefenceGuidance(): React.JSX.Element {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          {t('defence.explain')}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TOOLS.map((tool) => (
          <a
            key={tool.url}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            {tool.name}
            <ExternalLink className="size-3" />
          </a>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">{t('defence.privacy')}</div>
    </div>
  );
}
