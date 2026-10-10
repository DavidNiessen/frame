import { patchClip } from '../core/clips';
import { clipEffectRows } from '../core/effect-timeline';
import { effectSummary, resetEffect, type EffectId } from '../core/effect-library';
import type { EditSettings, MediaAsset } from '../core/types';
import { TimelineRange } from './TimelineRange';
export function ClipEffectLanes({ asset, edit, total, disabled, update, seek, selectClip, openEffect }: {
  asset: MediaAsset; edit: EditSettings; total: number; disabled: boolean; update: (patch: Partial<EditSettings>) => void;
  seek: (time: number) => void; selectClip: (id: string | null) => void; openEffect: (id: EffectId) => void;
}) {
  return <>{clipEffectRows(asset, edit).map(({ effect, items }) => <div className="timeline-lane effect-lane" key={effect.id}>{items.map(({ clip, start, end, index, recipe }) => <TimelineRange key={clip.id} selectOnPointer range={clip} displayRange={edit.clips ? { start, end } : clip} limits={{ start: 0, end: asset.duration }} duration={total}
    label={`${effect.name} clip ${index + 1}`} text={`${effect.name} · ${effectSummary(effect, recipe)}`} className="clip-effect-bar" edges={[]} disabled={disabled} onChange={() => {}}
    onSelect={() => { selectClip(clip.id); seek(clip.start); openEffect(effect.id); }}
    remove={{ label: `Remove ${effect.name} from clip ${index + 1}`, run: () => update(edit.clips ? patchClip(edit, clip.id, resetEffect(effect, asset)) : resetEffect(effect, asset)) }} />)}</div>)}</>;
}
