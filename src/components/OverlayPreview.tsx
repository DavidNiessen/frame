import { outputTimeAtSource } from '../core/fades';
import { changeInstance, extraInstances, sourceRecipes } from '../core/effect-instances';
import { clamp, round, resizedBox, type Box } from '../core/frame-object';
import { frameDimensions } from '../core/geometry';
import type { EffectId } from '../core/effect-library';
import type { EditSettings, MediaAsset } from '../core/types';
import type { Overlays } from '../core/overlays';
import { FrameObject } from './FrameObject';
export function OverlayPreview({
  outputPosition,
  edit,
  asset,
  current,
  disabled,
  update,
  pause,
  openEffect,
  selectedEffect,
}: {
  outputPosition?: number;
  edit: EditSettings;
  asset: MediaAsset;
  current: number;
  disabled: boolean;
  update: (patch: Partial<EditSettings>) => void;
  pause: () => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
}) {
  return (
    <div className="overlay-preview" data-frame-area>
      {sourceRecipes(edit, 'watermark')
        .filter(({ recipe }) => recipe.overlays.text || recipe.overlays.image)
        .map(({ id, recipe }, index) => {
          const o = recipe.overlays;
          const time = extraInstances(edit).some(
            (instance) => instance.id === id && instance.timeSpace === 'output',
          )
            ? (outputPosition ?? outputTimeAtSource(edit, current))
            : current;
          if (o.range && (time < o.range.start || time >= o.range.end)) return null;
          const change = (overlays: Overlays) =>
            update(id ? changeInstance(edit, id, null, { overlays }) : { overlays });
          function position(box: Box, frame: Box) {
            return {
              x: round(
                clamp(
                  ((box.left - frame.left) / Math.max(1, frame.width - box.width)) * 100,
                  0,
                  100,
                ),
              ),
              y: round(
                clamp(
                  ((box.top - frame.top) / Math.max(1, frame.height - box.height)) * 100,
                  0,
                  100,
                ),
              ),
            };
          }
          const common = {
            value: o,
            disabled,
            selected: selectedEffect?.id === 'watermark' && selectedEffect.instanceId === id,
            pause,
            commit: change,
            select: () => openEffect('watermark', id),
            move: (
              base: Overlays,
              dx: number,
              dy: number,
              { object, frame }: { object: Box; frame: Box },
            ) => ({
              ...base,
              ...position({ ...object, left: object.left + dx, top: object.top + dy }, frame),
            }),
          };
          return (
            <div key={id ?? 'primary'}>
              {o.text && (
                <FrameObject
                  {...common}
                  className="watermark-object watermark-text"
                  label={`Move watermark ${index + 1} text`}
                  text={o.text}
                  style={(value) => ({
                    left: `${value.x}%`,
                    top: `${value.y}%`,
                    transform: `translate(-${value.x}%, -${value.y}%)`,
                    opacity: value.opacity,
                    color: value.color,
                    fontSize: `${(value.size * 100) / frameDimensions(asset, edit).width}cqw`,
                    fontFamily: '"DejaVu Sans", sans-serif',
                  })}
                  resize={(base, factor, corner, { object, frame }) => {
                    const size = round(clamp(base.size * factor, 12, 200));
                    return {
                      ...base,
                      size,
                      ...position(resizedBox(object, corner, size / base.size), frame),
                    };
                  }}
                  saveText={(text) => change({ ...o, text })}
                />
              )}
              {o.image && (
                <FrameObject
                  {...common}
                  className="watermark-object watermark-image"
                  label={`Move watermark ${index + 1} image`}
                  style={(value) => ({
                    left: `${value.x}%`,
                    top: `${value.y}%`,
                    transform: `translate(-${value.x}%, -${value.y}%)`,
                    opacity: value.opacity,
                    width: `${value.imageWidth}%`,
                  })}
                  resize={(base, factor, corner, { object, frame }) => {
                    const imageWidth = round(clamp(base.imageWidth * factor, 1, 100));
                    return {
                      ...base,
                      imageWidth,
                      ...position(resizedBox(object, corner, imageWidth / base.imageWidth), frame),
                    };
                  }}
                >
                  <img src={o.image} alt="Watermark preview" draggable={false} />
                </FrameObject>
              )}
            </div>
          );
        })}
    </div>
  );
}
