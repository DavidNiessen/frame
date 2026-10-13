import { FrameObject } from './FrameObject';
import { defaultShape, type ShapeSettings } from '../core/shapes';
import { sourceRecipes, changeInstance } from '../core/effect-instances';
import { activeAtSource } from '../core/timed-adjustments';
import { frameDimensions } from '../core/geometry';
import { clamp, round, resizedBox } from '../core/frame-object';
import type { EditSettings, MediaAsset } from '../core/types';
import type { EffectId } from '../core/effect-ids';
export function ShapePreview({
  edit,
  asset,
  current = 0,
  position = current,
  disabled,
  update,
  pause,
  openEffect,
  selectedEffect,
  onlyInstance,
}: {
  edit: EditSettings;
  asset: MediaAsset;
  current?: number;
  position?: number;
  disabled: boolean;
  update: (patch: Partial<EditSettings>) => void;
  pause: () => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  onlyInstance?: string | null;
}) {
  const dims = frameDimensions(asset, edit);
  return (
    <div className="shape-preview" data-frame-area>
      {sourceRecipes(edit, 'shape')
        .filter(
          (row) =>
            (onlyInstance === undefined || (row.id ?? null) === onlyInstance) && row.recipe.shape,
        )
        .map(({ id, recipe }, index) => {
          const instance = edit.effectInstances?.find((i) => i.id === id),
            time = instance?.timeSpace === 'output' ? position : current;
          if (!activeAtSource(instance?.range ?? edit.effectRanges?.shape, time)) return null;
          const shape = recipe.shape ?? defaultShape(),
            change = (shape: ShapeSettings) =>
              update(id ? changeInstance(edit, id, null, { shape }) : { shape }),
            w = (shape.width * dims.width) / 100,
            h = (shape.height * dims.height) / 100,
            lineWidth = (shape.strokeWidth * dims.width) / 100,
            head = Math.min(w * 0.35, Math.max(8, lineWidth * 6)),
            headHeight = Math.min(h / 2, head);
          return (
            <FrameObject
              key={id ?? 'primary'}
              value={shape}
              label={`Move shape ${index + 1}`}
              className="shape-object"
              disabled={disabled}
              pause={pause}
              selected={selectedEffect?.id === 'shape' && selectedEffect.instanceId === id}
              select={() => openEffect('shape', id)}
              commit={change}
              style={(s) => ({
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.width}%`,
                height: `${s.height}%`,
                transform: `rotate(${s.rotation}deg)`,
                opacity: s.opacity,
              })}
              move={(base, dx, dy, { frame }) => ({
                ...base,
                x: round(clamp(base.x + (dx / frame.width) * 100, 0, 100 - base.width)),
                y: round(clamp(base.y + (dy / frame.height) * 100, 0, 100 - base.height)),
              })}
              resize={(base, factor, corner, { object, frame }) => {
                const width = clamp(base.width * factor, 1, 100),
                  height = clamp(base.height * factor, 1, 100),
                  box = resizedBox(
                    object,
                    corner,
                    Math.min(width / base.width, height / base.height),
                  );
                return {
                  ...base,
                  width: round(width),
                  height: round(height),
                  x: round(clamp(((box.left - frame.left) / frame.width) * 100, 0, 100 - width)),
                  y: round(clamp(((box.top - frame.top) / frame.height) * 100, 0, 100 - height)),
                };
              }}
            >
              <svg
                className="shape-artwork"
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ overflow: 'visible' }}
              >
                {shape.kind === 'ellipse' ? (
                  <ellipse
                    cx={w / 2}
                    cy={h / 2}
                    rx={Math.max(0, w / 2 - lineWidth / 2)}
                    ry={Math.max(0, h / 2 - lineWidth / 2)}
                    fill={shape.fill}
                    stroke={shape.stroke}
                    strokeWidth={lineWidth}
                  />
                ) : shape.kind === 'line' ? (
                  <line
                    x1={0}
                    y1={h / 2}
                    x2={w}
                    y2={h / 2}
                    stroke={shape.fill}
                    strokeWidth={Math.max(1, lineWidth)}
                  />
                ) : shape.kind === 'arrow' ? (
                  <>
                    <line
                      x1={0}
                      y1={h / 2}
                      x2={w - head / 2}
                      y2={h / 2}
                      stroke={shape.fill}
                      strokeWidth={Math.max(1, lineWidth)}
                    />
                    <path
                      d={`M${w - head},${h / 2 - headHeight} L${w},${h / 2} L${w - head},${h / 2 + headHeight} Z`}
                      fill={shape.fill}
                    />
                  </>
                ) : (
                  <rect
                    x={lineWidth / 2}
                    y={lineWidth / 2}
                    width={Math.max(0, w - lineWidth)}
                    height={Math.max(0, h - lineWidth)}
                    rx={shape.kind === 'rounded' ? (Math.min(w, h) * shape.cornerRadius) / 100 : 0}
                    fill={shape.fill}
                    stroke={shape.stroke}
                    strokeWidth={lineWidth}
                  />
                )}
              </svg>
            </FrameObject>
          );
        })}
    </div>
  );
}
