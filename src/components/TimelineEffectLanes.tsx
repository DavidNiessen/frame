import { changeInstance } from '../core/effect-instances';
import { effectSummary, type EffectId } from '../core/effect-library';
import { timelineEffectRows } from '../core/timeline-effects';
import { editedDuration } from '../core/timeline';
import { sourceTimeAtOutput } from '../core/fades';
import type { EditSettings } from '../core/types';
import { TimelineRange } from './TimelineRange';

export function TimelineEffectLanes({ edit, total, disabled, update, seek, selectClip, openEffect }: {
  edit: EditSettings; total: number; disabled: boolean; update: (patch: Partial<EditSettings>) => void;
  seek: (time: number) => void; selectClip: (id: string | null) => void; openEffect: (id: EffectId, instanceId?: string, keepView?: boolean) => void;
}) {
  const duration = editedDuration(edit);
  return <>{timelineEffectRows(edit).map(({ instance, effect, ordinal }) => {
    const range = instance.range ?? { start: 0, end: duration }, label = `${effect.name}${ordinal > 1 ? ` instance ${ordinal}` : ''} effect`;
    const change = (next: typeof range) => update(changeInstance(edit, instance.id, null, {}, next));
    return <div className="timeline-lane effect-lane" key={instance.id}><TimelineRange selectOnPointer
      snapSpace="output" range={range} limits={{ start: 0, end: duration }} duration={total} minimum={Math.min(.05, range.end - range.start)}
      label={label} text={`${effect.name}${ordinal > 1 ? ` ${ordinal}` : ''} · ${effectSummary(effect, { ...edit, ...instance.settings })}`} className={`clip-effect-bar ${effect.id.includes('Fade') ? 'clip-fade-bar' : ''}`}
      edges={instance.range ? ['start', 'end'] : []} disabled={disabled} onChange={change}
      onMove={instance.range ? delta => change({ start: range.start + delta, end: range.end + delta }) : undefined}
      onPreview={(range, edge) => seek(sourceTimeAtOutput(edit, range[edge === 'body' ? 'start' : edge]))}
      onSelect={keepView => { selectClip(null); seek(sourceTimeAtOutput(edit, range.start)); openEffect(effect.id, instance.id, keepView); }}
      remove={{ label: `Remove ${label}`, run: () => update(changeInstance(edit, instance.id, null, 'remove')) }} />
    </div>;
  })}</>;
}
