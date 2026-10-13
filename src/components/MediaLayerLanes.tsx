import { Layers, ChevronDown } from 'lucide-react';
import { TimelineRange } from './TimelineRange';
import {
  changeMediaLayer,
  removeMediaLayer,
  resizeMediaLayer,
  splitMediaLayer,
} from '../core/media-layers';
import { sourceTimeAtOutput } from '../core/fades';
import { editedDuration } from '../core/timeline';
import type { EditSettings } from '../core/types';
export function MediaLayerLanes({
  edit,
  axisDuration,
  compact,
  disabled,
  update,
  seek,
  openLayer,
}: {
  edit: EditSettings;
  axisDuration: number;
  compact: boolean;
  disabled: boolean;
  update: (patch: Partial<EditSettings>) => void;
  seek: (source: number, output?: number) => void;
  openLayer: (id: string, keepView?: boolean) => void;
}) {
  const layers = edit.mediaLayers ?? [],
    duration = editedDuration(edit);
  if (!layers.length) return null;
  return (
    <details
      className="timeline-lane-group media-layer-lanes"
      aria-label="Visual media tracks"
      open={!compact}
    >
      <summary>
        <Layers size={14} />
        Video & image tracks <span>{layers.length}</span>
        <ChevronDown size={14} />
      </summary>
      {layers.map((layer, index) =>
        layer.start >= duration ? (
          <div className="audio-track-outside" key={layer.id}>
            {layer.source.name} · outside current edit
          </div>
        ) : (
          <div className="timeline-lane visual-media-lane" key={layer.id}>
            <TimelineRange
              clipboard={{
                kind: 'visual',
                layer,
                audio: edit.audioLayers?.find((item) => item.id === layer.audioLayerId),
              }}
              wideHandles
              selectOnPointer
              range={{ start: layer.start, end: Math.min(duration, layer.end) }}
              limits={{
                start:
                  layer.source.kind === 'image' ? 0 : Math.max(0, layer.start - layer.sourceStart),
                end:
                  layer.source.kind === 'image'
                    ? duration
                    : Math.min(duration, layer.start + layer.source.duration - layer.sourceStart),
              }}
              moveLimits={{ start: -layer.start, end: duration - layer.end }}
              duration={axisDuration}
              minimum={0.05}
              snapSpace="output"
              label={`Visual track ${index + 1}: ${layer.source.name}`}
              text={`${layer.hidden ? 'Hidden · ' : ''}${layer.source.name}`}
              className={`visual-media-bar ${layer.hidden ? 'inactive' : ''}`}
              disabled={disabled || layer.locked}
              onSelect={() => openLayer(layer.id, true)}
              onPreview={(range, edge) =>
                seek(
                  sourceTimeAtOutput(edit, range[edge === 'body' ? 'start' : edge]),
                  range[edge === 'body' ? 'start' : edge],
                )
              }
              onChange={(range) => update(resizeMediaLayer(edit, layer, range))}
              onMove={(delta) =>
                update(
                  changeMediaLayer(edit, layer.id, {
                    start: layer.start + delta,
                    end: layer.end + delta,
                  }),
                )
              }
              remove={{
                label: 'Delete visual track',
                run: () => update(removeMediaLayer(edit, layer.id)),
              }}
              onSplit={(at) => update(splitMediaLayer(edit, layer.id, at))}
            />
          </div>
        ),
      )}
    </details>
  );
}
