import { animatedMedia } from '../core/keyframes';
import { recordMediaChange } from '../core/media-layers';
import { useContext, useMemo } from 'react';
import { FrameObject } from './FrameObject';
import { FrameInteractionContext } from './frame-interaction';
import { mediaLayerSource, type MediaLayer } from '../core/media-layers';
import type { EditSettings, MediaAsset } from '../core/types';
export function MediaLayerPreview({
  edit,
  assets,
  position = 0,
  onlyId,
  selectedId,
  disabled,
  update,
  openLayer,
  pause,
  image = false,
}: {
  edit: EditSettings;
  assets: MediaAsset[];
  position?: number;
  onlyId?: string;
  selectedId?: string;
  disabled: boolean;
  update: (patch: Partial<EditSettings>) => void;
  openLayer: (id: string, keepView?: boolean) => void;
  pause: () => void;
  image?: boolean;
}) {
  const interaction = useContext(FrameInteractionContext);
  const shown = useMemo(
    () =>
      (edit.mediaLayers ?? []).map((layer) => ({
        layer,
        value: animatedMedia(layer, layer.animation, position - layer.start),
      })),
    [edit.mediaLayers, position],
  );
  return (
    <div
      className={`media-layer-frame-area ${image ? 'image-media-area' : 'video-media-area'}`}
      data-frame-area
    >
      {shown
        .filter(
          ({ layer }) =>
            !layer.hidden &&
            (!onlyId || layer.id === onlyId) &&
            (image || (position >= layer.start && position < layer.end)),
        )
        .map(({ layer, value }) => {
          const source = mediaLayerSource(layer, assets);
          return (
            <FrameObject<MediaLayer>
              key={layer.id}
              value={value}
              className="media-layer-object"
              label={`Move ${layer.source.name} layer`}
              selected={selectedId === layer.id}
              disabled={disabled || layer.locked}
              select={() => openLayer(layer.id, true)}
              pause={pause}
              commit={(next) => update(recordMediaChange(edit, layer, next, position))}
              style={(value) => ({
                left: `${value.x}%`,
                top: `${value.y}%`,
                width: `${value.width}%`,
                height: `${value.height}%`,
              })}
              move={(base, dx, dy, bounds) => ({
                ...base,
                x: Math.max(-100, Math.min(200, base.x + (dx / bounds.frame.width) * 100)),
                y: Math.max(-100, Math.min(200, base.y + (dy / bounds.frame.height) * 100)),
              })}
              resize={(base, factor) => ({
                ...base,
                width: Math.max(1, Math.min(200, base.width * factor)),
                height: Math.max(1, Math.min(200, base.height * factor)),
              })}
            >
              {image && interaction?.active && source?.kind === 'image' ? (
                <img
                  src={source.previewUrl}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: layer.fit === 'stretch' ? 'fill' : layer.fit,
                    opacity: layer.opacity,
                  }}
                />
              ) : null}
            </FrameObject>
          );
        })}
    </div>
  );
}
