import { WatermarkLanes } from './WatermarkLanes';
import { captionItems, changeCaption } from '../core/caption-items';
import { changeInstance, extraInstances, primaryPresent, sourceRecipes } from '../core/effect-instances';
import { effectAction } from '../core/effect-actions';
import { memo, useMemo, useRef } from 'react';
import { ChevronDown, Captions, AudioLines } from 'lucide-react';
import { fadeKeys, fadeLabel } from '../core/timed-effects';
import { sourceTimeAtOutput } from '../core/fades';
import { keptRanges, editedDuration } from '../core/timeline';
import { clipPositions } from '../core/clips';
import { clipEffectRows } from '../core/effect-timeline';
import { appliedEffects, type EffectId } from '../core/effect-library';
import { ClipEffectLanes } from './ClipEffectLanes';
import { TimelineEffectLanes } from './TimelineEffectLanes';
import type { EditSettings, MediaAsset } from '../core/types';
import type { TrackFilter } from './layout/TimelineNavigator';
import { TimelineRange } from './TimelineRange';
interface Props { total: number; openEffect: (id: EffectId, instanceId?: string, keepView?: boolean) => void; compact: boolean; filter: TrackFilter; selectClip: (id: string | null) => void; asset: MediaAsset; edit: EditSettings; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (time: number) => void }
export const TimedLanes = memo(function TimedLanes({ asset, edit, disabled, update, seek, compact, filter, selectClip, openEffect, total }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const outputDuration = editedDuration(edit);
  const captionRows = useMemo(() => captionItems(edit).map(cue => cue.timeSpace === 'output'
    ? [{ ...cue, speed: 1, shown: { start: cue.start, end: cue.end } }]
    : clipPositions(edit).flatMap(({ clip, start, speed }) => {
      const from = Math.max(clip.start, cue.start), to = Math.min(clip.end, cue.end);
      return to > from ? [{ ...cue, start: from, end: to, speed, shown: { start: start + (from - clip.start) / speed, end: start + (to - clip.start) / speed } }] : [];
    })).filter(row => row.length), [edit.subtitles, edit.effectInstances, edit.clips, edit.speed, edit.start, edit.end, edit.cuts, edit.splits]);
  const fades = fadeKeys(asset).filter(key => edit[key] > 0), retained = keptRanges(edit);
  const effectRows = clipEffectRows(asset, edit);
  const effectCount = fades.length + extraInstances(edit).filter(instance => instance.timeSpace && !['captions', 'watermark', 'mix', 'silence'].includes(instance.effect) || instance.effect.includes('Fade')).length + effectRows.reduce((count, row) => count + row.items.length, 0);
  const sourceEffects = appliedEffects(asset, edit, null).filter(effect => effect.scope === 'source' && effect.id !== 'captions').flatMap(effect => sourceRecipes(edit, effect.id).filter(item => item.id || primaryPresent(edit, asset, effect.id)).map(item => ({ effect, ...item, ordinal: item.id ? extraInstances(edit, effect.id).findIndex(instance => instance.id === item.id) + 2 : 1 })));
  return <div ref={root} className={`timed-lanes ${compact ? 'compact' : ''}`}>
    {filter !== 'clips' && filter !== 'effects' && captionRows.length > 0 && <details data-timeline-kind="captions" className="timeline-lane-group" open={!compact || filter === 'captions'}>
      <summary><Captions size={14} />Captions <span>{captionItems(edit).length}{captionItems(edit).every(cue => cue.mode === 'none') ? ' · off' : ''}</span><ChevronDown size={14} /></summary>
      {captionRows.map((row, rowIndex) => <div className="timeline-lane caption-lane" key={rowIndex}>
        {row.map((cue, index) => <TimelineRange selectOnPointer key={`${cue.index}-${index}`} range={cue} displayRange={cue.shown} displaySpeed={cue.speed} snapSpace={cue.timeSpace === 'output' ? 'output' : 'source'} limits={{ start: 0, end: cue.timeSpace === 'output' ? outputDuration : asset.duration }} duration={total}
          onMove={delta => update(changeCaption(edit, cue, { start: cue.cue.start + delta, end: cue.cue.end + delta }))} moveLimits={{ start: -cue.cue.start, end: (cue.timeSpace === 'output' ? outputDuration : asset.duration) - cue.cue.end }}
          onPreview={(range, edge) => { const position = range[edge === 'body' ? 'start' : edge]; seek(cue.timeSpace === 'output' ? sourceTimeAtOutput(edit, position) : position); }}
          label={`Caption ${cue.index + 1}`} text={cue.text} className={`caption-bar ${cue.mode === 'none' ? 'inactive' : ''}`} disabled={disabled}
          remove={{ label: `Remove caption ${cue.index + 1}`, run: () => update(changeCaption(edit, cue, 'remove')) }}
          onSelect={keepView => { seek(cue.timeSpace === 'output' ? sourceTimeAtOutput(edit, cue.start) : cue.start); openEffect('captions', cue.instanceId, keepView); }} onChange={range => update(changeCaption(edit, cue, { ...(range.start !== cue.start ? { start: range.start } : {}), ...(range.end !== cue.end ? { end: range.end } : {}) }))} />)}
      </div>)}
    </details>}
    {filter !== 'clips' && filter !== 'captions' && (effectCount > 0 || sourceEffects.length > 0 || extraInstances(edit).some(instance => instance.effect.includes('Fade'))) && <details data-timeline-kind="effects" className="timeline-lane-group" open={!compact || filter === 'effects'}>
      <summary><AudioLines size={14} />Effects <span>{effectCount + sourceEffects.length}</span><ChevronDown size={14} /></summary>
      <ClipEffectLanes asset={asset} edit={edit} total={total} disabled={disabled} update={update} seek={seek} selectClip={selectClip} openEffect={openEffect} />
      <TimelineEffectLanes edit={edit} total={total} disabled={disabled} update={update} seek={seek} selectClip={selectClip} openEffect={openEffect} />
      <WatermarkLanes asset={asset} edit={edit} total={total} disabled={disabled} update={update} seek={seek} openEffect={openEffect} />
      {sourceEffects.filter(item => item.effect.id !== 'watermark').map(({ effect, id, ordinal }) => <div className="timeline-lane effect-lane" key={id ?? effect.id}><TimelineRange selectOnPointer range={{ start: 0, end: outputDuration }} limits={{ start: 0, end: total }} duration={total} label={`${effect.name}${id ? ` instance ${ordinal}` : ''} effect`} text={`${effect.name} · Source`} edges={[]} disabled={disabled} onChange={() => {}} onSelect={() => openEffect(effect.id, id)} remove={{ label: `Remove ${effect.name} from source`, run: () => update(id ? changeInstance(edit, id, null, 'remove') : effectAction(edit, asset, effect, null, 'remove')) }} /></div>)}
      {extraInstances(edit).filter(instance => !instance.timeSpace && instance.effect.includes('Fade')).map((instance, index) => {
        const key = instance.effect as typeof fades[number], value = instance.settings[key] ?? 0;
        const range = key.endsWith('In') ? { start: 0, end: value || outputDuration } : { start: value ? outputDuration - value : 0, end: outputDuration };
        return <div className="timeline-lane effect-lane" key={instance.id}><TimelineRange selectOnPointer range={range} limits={{ start: 0, end: outputDuration }} snapSpace="output" duration={total} label={`${fadeLabel(key)} instance ${index + 2}`} text={`${fadeLabel(key)} · ${value.toFixed(2)}s`} edges={value ? [key.endsWith('In') ? 'end' : 'start'] : []} disabled={disabled} onSelect={keepView => { selectClip(null); openEffect(key, instance.id, keepView); }} remove={{ label: `Remove ${fadeLabel(key)} instance ${index + 2}`, run: () => update(changeInstance(edit, instance.id, null, 'remove')) }} onChange={range => update(changeInstance(edit, instance.id, null, { [key]: key.endsWith('In') ? range.end : outputDuration - range.start }))} /></div>;
      })}
      {fades.map(key => {
        const range = key.endsWith('In') ? { start: 0, end: edit[key] } : { start: outputDuration - edit[key], end: outputDuration };
        return <div className="timeline-lane effect-lane" key={key}>
          <TimelineRange selectOnPointer range={range} limits={{ start: 0, end: outputDuration }}
            duration={total} snapSpace="output" label={fadeLabel(key)} text={`${fadeLabel(key)} · ${edit[key].toFixed(2)}s`} className={`fade-bar ${key.endsWith('In') ? 'fade-in' : 'fade-out'}`} minimum={.01}
            edges={[key.endsWith('In') ? 'end' : 'start']} disabled={disabled} onSelect={keepView => { selectClip(null); seek(retained[0]?.start ?? edit.start); openEffect(key, undefined, keepView); }}
            onPreview={(range, edge) => seek(sourceTimeAtOutput(edit, range[edge === 'body' ? 'start' : edge]))}
            remove={{ label: `Remove ${fadeLabel(key)} from sequence`, run: () => update({ [key]: 0, addedEffects: edit.addedEffects?.filter(id => id !== key), ...(edit.clips ? { clips: edit.clips.map(clip => ({ ...clip, effects: { ...clip.effects, addedEffects: (clip.effects[key] ?? 0) > 0 ? clip.effects.addedEffects : clip.effects.addedEffects?.filter(id => id !== key) } })) } : {}) }) }}
            onChange={range => update({ [key]: key.endsWith('In') ? range.end : outputDuration - range.start })} />
          <span className="effect-lane-label">{fadeLabel(key)} · {edit[key].toFixed(2)}s</span>
        </div>;
      })}
    </details>}
  </div>;
});
