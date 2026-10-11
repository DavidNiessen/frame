import {
  changeInstance,
  definitionFor,
  extraInstances,
  primaryPresent,
  sourceRecipes,
} from '../core/effect-instances';
import { clipPositions } from '../core/clips';
import { editedDuration } from '../core/timeline';
import { sourceTimeAtOutput } from '../core/fades';
import { effectAction } from '../core/effect-actions';
import type { EditSettings, MediaAsset, TimeRange } from '../core/types';
import { TimelineRange } from './TimelineRange';
interface Props {
  asset: MediaAsset;
  edit: EditSettings;
  total: number;
  disabled: boolean;
  update: (patch: Partial<EditSettings>) => void;
  seek: (time: number, output?: number) => void;
  openEffect: (id: 'watermark', instanceId?: string, keepView?: boolean) => void;
}
/** Separate rows keep independent overlays accessible even when their times overlap. */
export function WatermarkLanes({ asset, edit, total, disabled, update, seek, openEffect }: Props) {
  return sourceRecipes(edit, 'watermark')
    .filter((item) => item.id || primaryPresent(edit, asset, 'watermark'))
    .map(({ id, recipe }) => {
      const timeline = extraInstances(edit).some(
        (instance) => instance.id === id && instance.timeSpace === 'output',
      );
      const maximum = timeline ? editedDuration(edit) : asset.duration;
      const range = recipe.overlays.range ?? { start: edit.start, end: edit.end };
      const ordinal = id
        ? extraInstances(edit, 'watermark').findIndex((instance) => instance.id === id) +
          (timeline && !primaryPresent(edit, asset, 'watermark') ? 1 : 2)
        : 1;
      const label = `Watermark${ordinal > 1 ? ` instance ${ordinal}` : ''} effect`;
      const patch = (range: TimeRange) =>
        update(
          id
            ? changeInstance(edit, id, null, { overlays: { ...recipe.overlays, range } })
            : { overlays: { ...recipe.overlays, range } },
        );
      const fragments = timeline
        ? [{ key: id!, range, shown: range, speed: 1 }]
        : clipPositions(edit).flatMap(({ clip, start, speed }) => {
            const from = Math.max(clip.start, range.start),
              to = Math.min(clip.end, range.end);
            return to > from
              ? [
                  {
                    key: clip.id,
                    range: { start: from, end: to },
                    shown: {
                      start: start + (from - clip.start) / speed,
                      end: start + (to - clip.start) / speed,
                    },
                    speed,
                  },
                ]
              : [];
          });
      if (!fragments.length) return null;
      return (
        <div className="timeline-lane effect-lane" key={id ?? 'watermark'}>
          {fragments.map((fragment) => (
            <TimelineRange
              clipboard={{
                kind: 'effect',
                instance: {
                  id: id ?? 'watermark',
                  effect: 'watermark',
                  timeSpace: 'output',
                  settings: { overlays: { ...recipe.overlays, range: fragment.shown } },
                },
              }}
              key={fragment.key}
              selectOnPointer
              range={fragment.range}
              displayRange={fragment.shown}
              displaySpeed={fragment.speed}
              snapSpace={timeline ? 'output' : 'source'}
              limits={{ start: 0, end: maximum }}
              duration={total}
              className="watermark-bar"
              label={label}
              text={recipe.overlays.text || `Watermark ${ordinal}`}
              disabled={disabled}
              onSelect={(keepView) => {
                seek(
                  timeline ? sourceTimeAtOutput(edit, fragment.range.start) : fragment.range.start,
                  fragment.shown.start,
                );
                openEffect('watermark', id, keepView);
              }}
              onMove={(delta) => patch({ start: range.start + delta, end: range.end + delta })}
              moveLimits={{ start: -range.start, end: maximum - range.end }}
              onPreview={(next, edge) => {
                const position = next[edge === 'body' ? 'start' : edge];
                seek(
                  timeline ? sourceTimeAtOutput(edit, position) : position,
                  timeline ? position : undefined,
                );
              }}
              onChange={(next) =>
                patch({
                  start: next.start !== fragment.range.start ? next.start : range.start,
                  end: next.end !== fragment.range.end ? next.end : range.end,
                })
              }
              remove={{
                label: `Remove Watermark${id ? ` instance ${ordinal}` : ''} from source`,
                run: () =>
                  update(
                    id
                      ? changeInstance(edit, id, null, 'remove')
                      : effectAction(edit, asset, definitionFor('watermark'), null, 'remove'),
                  ),
              }}
            />
          ))}
        </div>
      );
    });
}
