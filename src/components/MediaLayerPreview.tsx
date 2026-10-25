import { animatedMedia } from '../core/keyframes';
import { recordMediaChange } from '../core/media-layers';
import { useContext, useEffect, useMemo, useRef, type RefObject } from 'react';
import { LiveMediaLayer } from './LiveMediaLayer';
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
  live,
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
  /** Composite the layers' pictures here instead of relying on a rendered preview. */
  live?: {
    playing: boolean;
    frame: { width: number; height: number };
    /** The base video, whose fade also covers the layers. */
    base: RefObject<HTMLMediaElement | null>;
  };
}) {
  const interaction = useContext(FrameInteractionContext);
  const area = useRef<HTMLDivElement>(null),
    base = live?.base;
  useEffect(() => {
    const node = area.current;
    if (!base || !node) return;
    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);
      node.style.opacity = base.current?.style.opacity || '1';
    };
    follow();
    return () => {
      cancelAnimationFrame(frame);
      node.style.opacity = '';
    };
  }, [base]);
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
      ref={area}
      className={`media-layer-frame-area ${image ? 'image-media-area' : 'video-media-area'}${live ? ' live' : ''}`}
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
              {live && source ? (
                <div className="live-media-layer" style={{ opacity: value.opacity }}>
                  <LiveMediaLayer
                    layer={layer}
                    source={source}
                    position={position}
                    playing={live.playing}
                    box={{
                      width: (live.frame.width * value.width) / 100,
                      height: (live.frame.height * value.height) / 100,
                    }}
                  />
                </div>
              ) : image && interaction?.active && source?.kind === 'image' ? (
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
