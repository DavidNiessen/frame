import { TransientMessage } from './TransientMessage';
import { useMemo, useState } from 'react';
import { AudioLines, Check, ChevronRight, Film, Folder, Gauge, Plus, Search } from 'lucide-react';
import { appliedEffects, availableEffects, effectPlacement, type EffectId } from '../core/effect-library';
import { effectDragType } from '../core/effect-actions';
import { applyEditorEffect } from '../hooks/apply-editor-effect';
import { EffectRecipes } from './EffectRecipes';
import { clearClipEffects } from '../core/effect-actions';
import type { Editor } from '../hooks/useEditor';
import { CaptionTools } from './CaptionTools';
export function EffectLibrary({ editor, current, seek, openCaption, openEffect }: { editor: Editor; current: number; seek: (time: number) => void; openCaption: (instanceId?: string) => void; openEffect: (id: EffectId, instanceId?: string) => void }) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState('All'), [selected, setSelected] = useState<EffectId | null>(null), [message, setMessage] = useState(''), [messageVersion, setMessageVersion] = useState(0);
  const asset = editor.asset!, edit = editor.edit!;
  const effects = useMemo(() => availableEffects(asset), [asset]);
  const active = appliedEffects(asset, edit, null);
  const chosen = effects.find(effect => effect.id === selected);
  const filtered = effects.filter(effect => (group === 'All' || effect.group === group) && `${effect.name} ${effect.description}`.toLowerCase().includes(query.toLowerCase()));
  function apply(id: EffectId) {
    const effect = effects.find(item => item.id === id); if (!effect) return;
    setSelected(id); setMessageVersion(version => version + 1);
    try { const applied = applyEditorEffect(editor, id, current); if (!applied) return; if (applied.existing) { setMessage(''); openEffect(id, applied.instanceId); return; } } catch (error) { setMessage((error as Error).message); return; }
    setMessage(`${effect.name} added. Click its timeline bar to adjust settings.`);
  }
  return <section className="effect-browser" aria-label="Effect browser">
    <div className="effect-library-intro"><h3>Effects</h3><p>Double-click or use + to add an effect. Each effect gets its own timeline row, spanning any splits.</p>
      <label className="effect-search"><Search size={15} /><input type="search" aria-label="Search effects" placeholder="Search effects…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="effect-categories" aria-label="Effect categories">{['All', 'Audio', 'Video', 'Timing'].map(category => <button key={category} aria-pressed={group === category} onClick={() => setGroup(category)}>{category}</button>)}</div>
    </div>
    <div className="effect-bins">{(['Video', 'Audio', 'Timing'] as const).map(category => {
      const items = filtered.filter(effect => effect.group === category); if (!items.length) return null;
      return <details className="effect-bin" key={category} open><summary><ChevronRight size={13} /><Folder size={14} />{category === 'Timing' ? 'Timing' : `${category} Effects`}<span>{items.length}</span></summary>
        <div className="effect-card-grid">{items.map(effect => { const Icon = category === 'Audio' ? AudioLines : category === 'Video' ? Film : Gauge, applied = active.includes(effect); return <div className={`effect-card ${selected === effect.id ? 'selected' : ''}`} key={effect.id}>
          <button className="effect-catalog-item" aria-label={`Select ${effect.name} effect`} aria-pressed={selected === effect.id} draggable={!editor.busy} onDragStart={event => { setSelected(effect.id); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(effectDragType, effect.id); }} onClick={() => { setSelected(effect.id); setMessage(''); }} onDoubleClick={() => apply(effect.id)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(effect.id); } }}><Icon size={14} /><span><strong>{effect.name}</strong></span>{effectPlacement(effect) === 'source' ? <small>Source</small> : null}</button>
          <button className="icon-button effect-apply" aria-label={`${applied && !effect.repeatable ? 'Edit' : 'Add'} ${effect.name}`} title={applied && !effect.repeatable ? "Edit existing effect" : "Add to timeline"} onClick={() => apply(effect.id)}>{applied && !effect.repeatable ? <Check size={13} aria-label="Applied" /> : <Plus size={13} />}</button>
        </div>; })}</div>
      </details>;
    })}{!filtered.length && <p className="effect-stack-empty">No matching effects. Try another search or category.</p>}</div>
    <div className="effect-browser-selection"><strong>{chosen?.name ?? 'Choose an effect'}</strong><p>{chosen?.description ?? 'The catalogue stays here when you apply an effect.'}</p>{chosen && <span>{chosen.repeatable ? chosen.id === 'captions' || chosen.id === 'watermark' ? `Adds one timed ${chosen.id === 'captions' ? 'caption' : 'watermark'} at the playhead` : 'Adds an independent adjustment · drag its timeline bar to set timing' : effectPlacement(chosen) === 'source' ? 'Analyzes the original source · review cuts before applying' : effectPlacement(chosen) === 'layer' ? 'Adds audio layers to the output timeline' : 'Applies to the timeline track'}</span>}
      {message && <TransientMessage key={messageVersion} className="effect-apply-message" role="status">{message}</TransientMessage>}
    </div>
    {active.some(effect => effect.scope === 'clip') && <button className="effect-clear button subtle small" onClick={() => editor.update(clearClipEffects(edit, asset, null))}>Remove all track effects</button>}
    {asset.kind === 'video' && <CaptionTools editor={editor} seek={seek} openCaption={openCaption} />}
    <EffectRecipes editor={editor} />
  </section>;
}
