import { changeInstance } from '../core/effect-instances';
import { effectAction } from '../core/effect-actions';
import { clipEffectRows } from '../core/effect-timeline';
import { effectSummary, type EffectId } from '../core/effect-library';
import type { EditSettings, MediaAsset } from '../core/types';
import { TimelineRange } from './TimelineRange';
export function ClipEffectLanes({ asset, edit, total, disabled, update, seek, selectClip, openEffect }: {
  asset: MediaAsset; edit: EditSettings; total: number; disabled: boolean; update: (patch: Partial<EditSettings>) => void;
  seek: (time: number) => void; selectClip: (id: string | null) => void; openEffect: (id: EffectId, instanceId?: string, keepView?: boolean) => void;
}) {
  return <>{clipEffectRows(asset, edit).map(({ key, effect, items }) => <div className="timeline-lane effect-lane" key={key}>{items.map(({ clip, start, end, index, recipe, instanceId, speed }, instanceIndex) => {
    const fade = instanceId && effect.id.includes('Fade') ? effect.id as 'audioFadeIn' : null;
    const value = fade ? recipe[fade] : 0, incoming = effect.id.endsWith('In');
    const range = value ? incoming ? { start: clip.start, end: clip.start + value * speed } : { start: clip.end - value * speed, end: clip.end } : clip;
    const shown = value ? incoming ? { start, end: start + value } : { start: end - value, end } : { start, end };
    return <TimelineRange key={clip.id} selectOnPointer range={range} displayRange={edit.clips ? shown : range} displaySpeed={edit.clips ? speed : 1} limits={{ start: 0, end: asset.duration }} duration={total}
    label={`${effect.name}${instanceId ? ` instance ${items[instanceIndex].ordinal ?? 2}` : ''} clip ${index + 1}`} text={`${effect.name}${instanceId ? ` ${items[instanceIndex].ordinal}` : ''} · ${effectSummary(effect, recipe)}`} className={`clip-effect-bar ${fade ? 'clip-fade-bar' : ''}`} edges={value ? [incoming ? 'end' : 'start'] : []} disabled={disabled} onChange={range => { if (fade && instanceId) update(changeInstance(edit, instanceId, edit.clips ? clip.id : null, { [fade]: (incoming ? range.end - clip.start : clip.end - range.start) / speed })); }}
    onSelect={keepView => { selectClip(edit.clips ? clip.id : null); seek(clip.start); openEffect(effect.id, instanceId, keepView); }}
    remove={{ label: `Remove ${effect.name} from clip ${index + 1}`, run: () => update(instanceId ? changeInstance(edit, instanceId, edit.clips ? clip.id : null, 'remove') : effectAction(edit, asset, effect, edit.clips ? clip.id : null, 'remove')) }} />; })}</div>)}</>;
}
