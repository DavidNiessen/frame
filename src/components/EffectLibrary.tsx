import { useMemo, useState } from 'react';
import { AudioLines, Check, ChevronRight, Film, Folder, Gauge, Plus, Search } from 'lucide-react';
import { appliedEffects, availableEffects, type EffectId } from '../core/effect-library';
import { effectAction, effectDragType } from '../core/effect-actions';
import { intrinsicEffects } from '../core/effect-ids';
import type { Editor } from '../hooks/useEditor';
export interface EffectRequest { id: EffectId; token: number }
export function EffectLibrary({ editor, requestControls, showControls }: { editor: Editor; requestControls: (id: EffectId) => void; showControls: () => void }) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState('All'), [selected, setSelected] = useState<EffectId | null>(null), [message, setMessage] = useState('');
  const asset = editor.asset!, edit = editor.edit!;
  const effects = useMemo(() => availableEffects(asset), [asset]);
  const active = appliedEffects(asset, edit, editor.selectedClip);
  const chosen = effects.find(effect => effect.id === selected);
  const filtered = effects.filter(effect => (group === 'All' || effect.group === group) && `${effect.name} ${effect.description}`.toLowerCase().includes(query.toLowerCase()));
  function apply(id: EffectId) {
    const effect = effects.find(item => item.id === id); if (!effect) return;
    setSelected(id);
    if (!intrinsicEffects.includes(id)) editor.update(effectAction(edit, asset, effect, editor.selectedClip, 'add'));
    requestControls(id);
    setMessage(`${effect.name}${intrinsicEffects.includes(id) ? ' is a built-in control' : ' applied'}. Adjust it in Effect Controls.`);
  }
  return <section className="effect-browser" aria-label="Effect browser">
    <div className="effect-library-intro"><h3>Effects</h3><p>Drag onto a clip, double-click, or use + to apply. Adjust settings in Effect Controls.</p>
      <label className="effect-search"><Search size={15} /><input type="search" aria-label="Search effects" placeholder="Search effects…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="effect-categories" aria-label="Effect categories">{['All', 'Audio', 'Video', 'Timing'].map(category => <button key={category} aria-pressed={group === category} onClick={() => setGroup(category)}>{category}</button>)}</div>
    </div>
    <div className="effect-bins">{(['Video', 'Audio', 'Timing'] as const).map(category => {
      const items = filtered.filter(effect => effect.group === category); if (!items.length) return null;
      return <details className="effect-bin" key={category} open><summary><ChevronRight size={13} /><Folder size={14} />{category === 'Timing' ? 'Timing' : `${category} Effects`}<span>{items.length}</span></summary>
        <div className="effect-card-grid">{items.map(effect => { const Icon = category === 'Audio' ? AudioLines : category === 'Video' ? Film : Gauge, builtin = intrinsicEffects.includes(effect.id), applied = active.includes(effect); return <div className={`effect-card ${selected === effect.id ? 'selected' : ''}`} key={effect.id}>
          <button className="effect-catalog-item" aria-label={`Select ${effect.name} effect`} aria-pressed={selected === effect.id} draggable={!editor.busy} onDragStart={event => { setSelected(effect.id); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(effectDragType, effect.id); }} onClick={() => { setSelected(effect.id); setMessage(''); }} onDoubleClick={() => apply(effect.id)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(effect.id); } }}><Icon size={14} /><span><strong>{effect.name}</strong></span>{builtin ? <small>Built-in</small> : applied ? <Check size={13} aria-label="Applied" /> : effect.scope === 'source' ? <small>Source</small> : null}</button>
          <button className="icon-button effect-apply" aria-label={`Add ${effect.name}`} title={builtin ? 'Prepare built-in controls' : 'Apply effect'} onClick={() => apply(effect.id)}><Plus size={13} /></button>
        </div>; })}</div>
      </details>;
    })}{!filtered.length && <p className="effect-stack-empty">No matching effects. Try another search or category.</p>}</div>
    <div className="effect-browser-selection"><strong>{chosen?.name ?? 'Choose an effect'}</strong><p>{chosen?.description ?? 'The catalogue stays here when you apply an effect.'}</p>{chosen && <span>{intrinsicEffects.includes(chosen.id) ? 'Built-in clip adjustment' : chosen.scope === 'source' ? 'Applies to the entire source' : editor.selectedClip ? 'Applies to the selected clip' : 'Applies to all clips'}</span>}
      <div className="inline-actions">{chosen && !intrinsicEffects.includes(chosen.id) && <button className="button subtle small" onClick={() => apply(chosen.id)}>Apply effect</button>}<button className="button subtle small" onClick={showControls}>Open Effect Controls</button></div>
      {message && <p className="effect-apply-message" role="status">{message}</p>}
    </div>
  </section>;
}
