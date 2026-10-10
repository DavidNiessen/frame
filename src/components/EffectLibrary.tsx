import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AudioLines, Film, Gauge, Search, Trash2, Plus, RotateCcw, ChevronDown } from 'lucide-react';
import { appliedEffects, availableEffects, effectActive, effectSummary, enableEffect, resetEffect, sameEffectSettings, type EffectDefinition, type EffectId } from '../core/effect-library';
import { clipRecipe, editClips } from '../core/clips';
import type { Editor } from '../hooks/useEditor';
import { EffectControls } from './EffectControls';
export interface EffectRequest { id: EffectId; token: number }
export function EffectLibrary({ editor, current, seek, request }: { editor: Editor; current: number; seek: (time: number) => void; request?: EffectRequest | null }) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState('All'), [opened, setOpened] = useState<EffectId | null>(null), [browse, setBrowse] = useState(true);
  const asset = editor.asset!, edit = editor.edit!, scoped = editor.scopedEdit!;
  const effects = useMemo(() => availableEffects(asset), [asset]);
  const active = useMemo(() => appliedEffects(asset, edit, editor.selectedClip), [asset, edit, editor.selectedClip]);
  const visible = effects.filter(effect => active.includes(effect) || effect.id === opened);
  const summaries = useMemo(() => {
    const clips = editClips(edit).map(clip => clipRecipe(edit, clip));
    return new Map(effects.map(effect => [effect.id, effect.scope === 'clip' && !editor.selectedClip && clips.some(clip => !sameEffectSettings(effect, clips[0], clip)) ? 'Varies across clips' : effectSummary(effect, effect.scope === 'source' ? edit : scoped)]));
  }, [effects, edit, scoped, editor.selectedClip]);
  useEffect(() => { if (request) { setOpened(request.id); setBrowse(false); } }, [request?.token]);
  function recipe(effect: EffectDefinition) { return effect.scope === 'source' ? edit : scoped; }
  function remove(effect: EffectDefinition) { (effect.scope === 'source' ? editor.update : editor.updateClip)(resetEffect(effect, asset)); if (opened === effect.id) setOpened(null); }
  function add(effect: EffectDefinition) { setOpened(effect.id); setBrowse(false); if (!effectActive(effect, recipe(effect), asset)) (effect.scope === 'source' ? editor.update : editor.updateClip)(enableEffect(effect, recipe(effect))); }
  return <div className="effect-library">
    <div className="effect-stack-heading"><div><h3>Applied effects <span>{active.length}</span></h3><p>{editor.selectedClip ? 'Selected clip' : 'All clips'} · expand to adjust</p></div><button className="button subtle small" aria-expanded={browse} onClick={() => setBrowse(!browse)}><Plus size={14} />Add effect</button></div>
    <div className="effect-stack" aria-label="Applied effects">
      {!visible.length && <p className="effect-stack-empty">No effects applied. Add one below or adjust the clip in Edit.</p>}
      {visible.map(effect => <section key={effect.id} className={`effect-stack-item ${opened === effect.id ? 'expanded' : ''}`}>
        <div className="effect-stack-row"><button className="effect-stack-toggle" aria-label={`Edit ${effect.name}`} aria-expanded={opened === effect.id} aria-controls={opened === effect.id ? `effect-controls-${effect.id}` : undefined} onClick={() => setOpened(opened === effect.id ? null : effect.id)} onKeyDown={event => { if (effect.keys.length && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); remove(effect); } }}><ChevronDown size={14} /><span><strong>{effect.name}</strong><small>{active.includes(effect) ? summaries.get(effect.id) : 'Default settings'}</small></span>{effect.scope === 'source' && <em>Source</em>}</button>
          {effect.keys.length > 0 && <><button className="icon-button" title="Reset settings" aria-label={`Reset ${effect.name}`} onClick={() => (effect.scope === 'source' ? editor.update : editor.updateClip)(resetEffect(effect, asset))}><RotateCcw size={14} /></button><button className="icon-button remove-effect" title="Remove effect" aria-label={`Remove ${effect.name}`} onClick={() => remove(effect)}><Trash2 size={14} /></button></>}
        </div>
        {opened === effect.id && <div id={`effect-controls-${effect.id}`}><EffectControls effect={effect} editor={editor} current={current} seek={seek} /></div>}
      </section>)}
    </div>
    {active.some(effect => effect.scope === 'clip') && <button className="effect-clear button subtle small" onClick={() => { editor.updateClip(Object.assign({}, ...effects.filter(effect => effect.scope === 'clip').map(effect => resetEffect(effect, asset)))); setOpened(null); }}>Remove all clip effects</button>}
    {opened && <button className="effect-back button subtle small" aria-label="Back to effect library" onClick={() => { setOpened(null); setBrowse(true); }}><ArrowLeft size={14} />Browse effects</button>}
    {browse && <div className="effect-browser"><div className="effect-library-intro"><h3>Effect browser</h3><p>Add to the selected clip. Source effects apply across the edit.</p><label className="effect-search"><Search size={15} /><input type="search" aria-label="Search effects" placeholder="Search effects…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="effect-categories" aria-label="Effect categories">{['All', 'Audio', 'Video', 'Timing'].map(category => <button key={category} aria-pressed={group === category} onClick={() => setGroup(category)}>{category}</button>)}</div></div>
      <div className="effect-card-grid">{effects.filter(effect => (group === 'All' || effect.group === group) && `${effect.name} ${effect.description}`.toLowerCase().includes(query.toLowerCase())).map(effect => { const Icon = effect.group === 'Audio' ? AudioLines : effect.group === 'Video' ? Film : Gauge; return <button className="effect-card" key={effect.id} aria-label={`Add ${effect.name}`} onClick={() => add(effect)}><Icon size={18} /><span><strong>{effect.name}</strong><small>{effect.description}</small></span><small className="effect-card-scope">{effect.scope === 'source' ? 'Source' : 'Clip'}</small></button>; })}</div>
    </div>}
  </div>;
}
