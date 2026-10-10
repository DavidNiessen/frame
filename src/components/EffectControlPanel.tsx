import { AudioEffectsPreview } from './AudioEffectsPreview';
import { useEffect, useState } from 'react';
import { AudioLines, Film, Gauge, Plus } from 'lucide-react';
import { appliedEffects, availableEffects, effectSummary, sameEffectSettings, type EffectDefinition, type EffectId } from '../core/effect-library';
import { clearClipEffects, effectAction } from '../core/effect-actions';
import { intrinsicEffects } from '../core/effect-ids';
import { clipRecipe, editClips } from '../core/clips';
import type { Editor } from '../hooks/useEditor';
import type { EffectRequest } from './EffectLibrary';
import { EffectControlSection } from './EffectControlSection';
import { EffectRecipes } from './EffectRecipes';
export function EffectControlPanel({ editor, current, seek, request, browse }: { editor: Editor; current: number; seek: (time: number) => void; request?: EffectRequest | null; browse: () => void }) {
  const [opened, setOpened] = useState<EffectId[]>(['volume']);
  const asset = editor.asset!, edit = editor.edit!, scoped = editor.scopedEdit!, effects = availableEffects(asset);
  const active = appliedEffects(asset, edit, editor.selectedClip);
  const visible = effects.filter(effect => intrinsicEffects.includes(effect.id) || active.includes(effect) || (effect.keys.length === 0 && opened.includes(effect.id)));
  const clips = editClips(edit).map(clip => clipRecipe(edit, clip));
  useEffect(() => { if (request) setOpened(ids => ids.includes(request.id) ? ids : [...ids, request.id]); }, [request?.token]);
  function summary(effect: EffectDefinition) {
    return effect.scope === 'clip' && !editor.selectedClip && clips.some(clip => !sameEffectSettings(effect, clips[0], clip)) ? 'Varies across clips' : effectSummary(effect, effect.scope === 'source' ? edit : scoped);
  }
  function remove(effect: EffectDefinition) { editor.update(effectAction(edit, asset, effect, editor.selectedClip, 'remove')); setOpened(ids => ids.filter(id => id !== effect.id)); }
  return <div className="effect-control-panel">
    <div className="effect-stack-heading"><div><h3>Effect Controls <span>{active.length}</span></h3><p title={asset.name}>{asset.name} · {editor.selectedClip ? 'Selected clip' : 'All clips'}</p></div><button className="icon-button" aria-label="Browse effects" title="Browse effects" onClick={browse}><Plus size={15} /></button></div>
    <div className="effect-stack" aria-label="Applied effects">{(['Video', 'Audio', 'Timing'] as const).map(group => {
      const items = visible.filter(effect => effect.group === group); if (!items.length) return null;
      const Icon = group === 'Video' ? Film : group === 'Audio' ? AudioLines : Gauge;
      return <section className="effect-control-group" key={group} aria-label={`${group} effect controls`}><h4><Icon size={13} />{group === 'Timing' ? 'Time Remapping' : `${group} Effects`}</h4>{items.map(effect => <EffectControlSection key={effect.id} effect={effect} editor={editor} summary={summary(effect)} expanded={opened.includes(effect.id)} builtin={intrinsicEffects.includes(effect.id)} toggle={() => setOpened(ids => ids.includes(effect.id) ? ids.filter(id => id !== effect.id) : [...ids, effect.id])} reset={() => editor.update(effectAction(edit, asset, effect, editor.selectedClip, 'reset'))} remove={() => remove(effect)} current={current} seek={seek} />)}{group === 'Audio' && items.some(effect => ['normalize', 'noise', 'equalizer'].includes(effect.id)) && <AudioEffectsPreview editor={{ ...editor, edit: editor.scopedEdit, update: editor.updateClip }} />}</section>;
    })}</div>
    {!active.some(effect => !intrinsicEffects.includes(effect.id)) && <p className="effect-controls-hint">Built-in adjustments stay with the clip. Find more in the Effects panel.</p>}
    {active.some(effect => effect.scope === 'clip') && <button className="effect-clear button subtle small" onClick={() => { editor.update(clearClipEffects(edit, asset, editor.selectedClip)); setOpened(ids => ids.filter(id => intrinsicEffects.includes(id))); }}>Remove all clip effects</button>}
    <EffectRecipes editor={editor} />
  </div>;
}
