import { changeInstance } from '../core/effect-instances';
import { effectAction } from '../core/effect-actions';
import { patchClip } from '../core/clips';
import { clipEffectRows } from '../core/effect-timeline';
import { isTimedAdjustment } from '../core/timed-adjustments';
import { effectSummary, type EffectId } from '../core/effect-library';
import type { EditSettings, MediaAsset, TimeRange } from '../core/types';
import { TimelineRange } from './TimelineRange';
export function ClipEffectLanes({ asset, edit, total, disabled, update, seek, selectClip, openEffect }: {
  asset: MediaAsset; edit: EditSettings; total: number; disabled: boolean; update: (patch: Partial<EditSettings>) => void;
  seek: (time: number) => void; selectClip: (id: string | null) => void; openEffect: (id: EffectId, instanceId?: string, keepView?: boolean) => void;
}) {
  return <>{clipEffectRows(asset, edit).map(({ key, effect, items }) => <div className="timeline-lane effect-lane" key={key}>{items.map(({ clip, start, end, index, recipe, instanceId, speed, ordinal }) => {
    const fade = effect.id.includes('Fade') ? effect.id as 'audioFadeIn' : null, timed = isTimedAdjustment(effect.id);
    const value = fade ? recipe[fade] : 0, incoming = effect.id.endsWith('In');
    const stored = timed ? recipe.effectRanges?.[effect.id as 'volume'] : undefined;
    const range = stored ? { start: Math.max(clip.start, stored.start), end: Math.min(clip.end, stored.end) } : value ? incoming ? { start: clip.start, end: clip.start + value * speed } : { start: clip.end - value * speed, end: clip.end } : clip;
    if (range.end <= range.start) return null;
    const shown = { start: start + (range.start - clip.start) / speed, end: end - (clip.end - range.end) / speed };
    const scope = edit.clips ? clip.id : null;
    function changeRange(next: TimeRange) {
      if (timed) update(instanceId ? changeInstance(edit, instanceId, scope, {}, next) : scope ? patchClip(edit, scope, { effectRanges: { ...recipe.effectRanges, [effect.id]: next } }) : { effectRanges: { ...edit.effectRanges, [effect.id]: next } });
      else if (fade) { const patch = { [fade]: (incoming ? next.end - clip.start : clip.end - next.start) / speed }; update(instanceId ? changeInstance(edit, instanceId, scope, patch) : scope ? patchClip(edit, scope, patch) : patch); }
    }
    return <TimelineRange key={clip.id} selectOnPointer range={range} displayRange={shown} displaySpeed={speed} limits={timed || fade ? clip : { start: 0, end: asset.duration }} minimum={fade ? .01 * speed : Math.min(.05, range.end - range.start)} duration={total}
      label={`${effect.name}${instanceId ? ` instance ${ordinal}` : ''} clip ${index + 1}`} text={`${effect.name}${instanceId ? ` ${ordinal}` : ''} · ${effectSummary(effect, recipe)}`} className={`clip-effect-bar ${fade ? 'clip-fade-bar' : ''}`} edges={timed ? ['start', 'end'] : value ? [incoming ? 'end' : 'start'] : []} disabled={disabled} onChange={changeRange}
      onMove={timed ? delta => changeRange({ start: range.start + delta, end: range.end + delta }) : undefined}
      onPreview={(next, edge) => seek(next[edge === 'body' ? 'start' : edge])}
      onSelect={keepView => { selectClip(scope); seek(range.start); openEffect(effect.id, instanceId, keepView); }}
      remove={{ label: `Remove ${effect.name}${instanceId ? ` instance ${ordinal}` : ''} from clip ${index + 1}`, run: () => update(instanceId ? changeInstance(edit, instanceId, scope, 'remove') : effectAction(edit, asset, effect, scope, 'remove')) }} />;
  })}</div>)}</>;
}
