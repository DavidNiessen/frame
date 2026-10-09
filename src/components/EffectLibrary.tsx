import { useState } from 'react';
import { ArrowLeft, AudioLines, Film, Gauge, Search, Trash2, Check } from 'lucide-react';
import { availableEffects, effectActive, enableEffect, resetEffect, type EffectDefinition } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
import { SpeedControls } from './SpeedControls';
import { ColorControls } from './ColorControls';
import { GeometryControls } from './GeometryControls';
import { AudioCleanupControls } from './AudioCleanupControls';
import { SubtitleControls } from './SubtitleControls';
import { OverlayControls } from './OverlayControls';
import { SilenceControls } from './SilenceControls';
import { editedDuration } from '../core/timeline';

export function EffectLibrary({ editor, current, seek }: { editor: Editor; current: number; seek: (time: number) => void }) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState('All'), [opened, setOpened] = useState<EffectDefinition | null>(null);
  const asset = editor.asset!, scoped: Editor = { ...editor, edit: editor.scopedEdit, update: editor.updateClip }, edit = scoped.edit!;
  const target = opened?.scope === 'source' ? editor : scoped;
  function open(effect: EffectDefinition) {
    setOpened(effect);
    const recipe = effect.scope === 'source' ? editor.edit! : edit;
    if (!effectActive(effect, recipe, asset)) (effect.scope === 'source' ? editor.update : editor.updateClip)(enableEffect(effect, recipe));
  }
  if (opened) return <div className="effect-editor">
    <div className="effect-editor-heading"><button className="icon-button" aria-label="Back to effect library" onClick={() => setOpened(null)}><ArrowLeft size={16} /></button><h3>{opened.name}</h3>{opened.keys.length > 0 && <button className="icon-button" aria-label={`Remove ${opened.name}`} onClick={() => { target.update(resetEffect(opened, asset)); setOpened(null); }}><Trash2 size={15} /></button>}</div>
    <p className="effect-target-note">{opened.scope === 'source' ? 'Source-wide · timing follows clips when reordered.' : editor.selectedClip ? 'Selected clip' : 'All clips · shared settings'}</p>
    {opened.id === 'volume' && <section className="control-section"><label className="stacked-label">Volume · {Math.round(edit.volume * 100)}%<input type="range" aria-label="Volume" min={0} max={3} step={.01} value={edit.volume} onChange={event => scoped.update({ volume: Number(event.target.value) })} /></label></section>}
    {opened.id === 'speed' && <SpeedControls edit={edit} update={scoped.update} />}
    {(['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as string[]).includes(opened.id) && <section className="control-section"><label className="stacked-label">Duration · {Number(edit[opened.id as 'audioFadeIn']).toFixed(2)}s<input type="range" aria-label={`${opened.name} duration`} min={0} max={editedDuration(edit)} step={.01} value={Number(edit[opened.id as 'audioFadeIn'])} onChange={event => scoped.update({ [opened.id]: Number(event.target.value) })} /></label><p className="field-note">Drag the matching bar in the timeline to adjust its duration.</p></section>}
    {(['normalize', 'noise', 'equalizer'] as string[]).includes(opened.id) && <AudioCleanupControls editor={scoped} effect={opened.id as 'normalize' | 'noise' | 'equalizer'} />}
    {opened.id === 'color' && <ColorControls editor={scoped} current={current} expanded />}
    {opened.id === 'transform' && <GeometryControls asset={asset} edit={edit} update={scoped.update} expanded />}
    {opened.id === 'captions' && <SubtitleControls expanded edit={editor.edit!} update={editor.update} />}
    {opened.id === 'watermark' && <OverlayControls expanded edit={editor.edit!} update={editor.update} />}
    {opened.id === 'silence' && <SilenceControls expanded editor={editor} seek={seek} />}
  </div>;
  const effects = availableEffects(asset), active = effects.filter(effect => effectActive(effect, effect.scope === 'source' ? editor.edit! : edit, asset));
  return <div className="effect-library">
    <div className="effect-library-intro"><h3>Make it your own.</h3><p>Choose an effect, then fine-tune it.</p><label className="effect-search"><Search size={15} /><input type="search" aria-label="Search effects" placeholder="Search effects…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="effect-categories" aria-label="Effect categories">{['All', 'Audio', 'Video', 'Timing'].map(category => <button key={category} aria-pressed={group === category} onClick={() => setGroup(category)}>{category}</button>)}</div></div>
    {active.length > 0 && <div className="effect-applied"><h4>Applied · {active.length}</h4>{active.map(effect => <div key={effect.id}><button onClick={() => open(effect)}><Check size={13} />{effect.name}</button><button className="icon-button" aria-label={`Remove ${effect.name}`} onClick={() => (effect.scope === 'source' ? editor.update : editor.updateClip)(resetEffect(effect, asset))}><Trash2 size={13} /></button></div>)}</div>}
    <div className="effect-card-grid">{effects.filter(effect => (group === 'All' || effect.group === group) && `${effect.name} ${effect.description}`.toLowerCase().includes(query.toLowerCase())).map(effect => { const Icon = effect.group === 'Audio' ? AudioLines : effect.group === 'Video' ? Film : Gauge; return <button className="effect-card" key={effect.id} aria-label={`Add ${effect.name}`} onClick={() => open(effect)}><Icon size={18} /><span><strong>{effect.name}</strong><small>{effect.description}</small></span><small className="effect-card-scope">{effect.scope === 'source' ? 'Source' : 'Clip'}</small></button>; })}</div>
  </div>;
}
