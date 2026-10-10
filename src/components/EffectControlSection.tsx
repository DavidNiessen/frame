import { ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import type { EffectDefinition } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
import { EffectControls } from './EffectControls';
export function EffectControlSection({ effect, editor, summary, expanded, builtin, toggle, reset, remove, current, seek }: {
  effect: EffectDefinition; editor: Editor; summary: string; expanded: boolean; builtin: boolean; toggle: () => void; reset: () => void; remove: () => void; current: number; seek: (time: number) => void;
}) {
  return <section className={`effect-stack-item ${expanded ? 'expanded' : ''}`} data-intrinsic={builtin || undefined}>
    <div className="effect-stack-row"><button className="effect-stack-toggle" aria-label={`Edit ${effect.name}`} aria-expanded={expanded} aria-controls={expanded ? `effect-controls-${effect.id}` : undefined} onClick={toggle} onKeyDown={event => { if (!builtin && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); remove(); } }}><ChevronRight size={13} /><span><strong>{effect.name}</strong><small>{summary}</small></span>{builtin ? <em>Built-in</em> : effect.scope === 'source' ? <em>Source</em> : null}</button>
      {effect.keys.length > 0 && <button className="icon-button" title="Reset settings" aria-label={`Reset ${effect.name}`} onClick={reset}><RotateCcw size={13} /></button>}
      {!builtin && <button className="icon-button remove-effect" title="Remove effect" aria-label={`Remove ${effect.name}`} onClick={remove}><Trash2 size={13} /></button>}
    </div>
    {expanded && <div id={`effect-controls-${effect.id}`}><EffectControls effect={effect} editor={editor} current={current} seek={seek} /></div>}
  </section>;
}
