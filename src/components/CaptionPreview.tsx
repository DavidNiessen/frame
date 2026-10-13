import { captionItems, changeCaption } from '../core/caption-items';
import { FrameObject } from './FrameObject';
import { clamp, round, resizedBox, type Box } from '../core/frame-object';
import type { EffectId } from '../core/effect-library';
import type { CaptionPosition, SubtitleCue } from '../core/subtitles';
import type { EditSettings, MediaAsset } from '../core/types';
import { defaultCaptionStyle, captionFont } from '../core/caption-style';
import { outputTimeAtSource } from '../core/fades';

function MovableCaption({
  cue,
  index,
  disabled,
  movable,
  pause,
  change,
  select,
  selected,
}: {
  cue: SubtitleCue;
  index: number;
  disabled: boolean;
  movable: boolean;
  pause: () => void;
  change: (patch: Partial<SubtitleCue>) => void;
  select: () => void;
  selected: boolean;
}) {
  const style = cue.style ?? defaultCaptionStyle;
  const horizontal = style.align === 'left' ? 0 : style.align === 'right' ? 1 : 0.5;
  function position(box: Box, frame: Box): CaptionPosition {
    const width = Math.min(100, (box.width / frame.width) * 100),
      height = Math.min(100, (box.height / frame.height) * 100);
    return {
      x: round(
        clamp(
          ((box.left + box.width * horizontal - frame.left) / frame.width) * 100,
          width * horizontal,
          100 - width * (1 - horizontal),
        ),
      ),
      y: round(clamp(((box.top + box.height - frame.top) / frame.height) * 100, height, 100)),
    };
  }
  return (
    <FrameObject
      value={cue}
      className={`caption-position align-${style.align}`}
      label={`Move caption ${index + 1}`}
      text={cue.text}
      disabled={disabled}
      movable={movable}
      selected={selected}
      select={select}
      pause={pause}
      commit={change}
      positionClass={(value) => (value.position ? 'positioned' : '')}
      style={(value) => {
        const s = value.style ?? defaultCaptionStyle;
        return {
          ...(value.position ? { left: `${value.position.x}%`, top: `${value.position.y}%` } : {}),
          fontFamily: `${JSON.stringify(captionFont(s).family)}, sans-serif`,
          fontSize: `${s.size}cqw`,
          fontWeight: s.bold ? 700 : 400,
          fontStyle: s.italic ? 'italic' : 'normal',
          color: s.color,
          textAlign: s.align,
          background: `rgba(${[1, 3, 5].map((index) => Number.parseInt(s.background.slice(index, index + 2), 16)).join(',')},${s.backgroundOpacity})`,
          WebkitTextStroke: s.outline ? `.08em ${s.outlineColor}` : undefined,
          paintOrder: 'stroke fill',
        };
      }}
      move={(base, dx, dy, { object, frame }) => ({
        ...base,
        position: position({ ...object, left: object.left + dx, top: object.top + dy }, frame),
      })}
      resize={(base, factor, corner, { object, frame }) => {
        const s = base.style ?? defaultCaptionStyle,
          size = round(clamp(s.size * factor, 1, 12));
        return {
          ...base,
          style: { ...s, size },
          position: position(resizedBox(object, corner, size / s.size), frame),
        };
      }}
      saveText={(text) => change({ text })}
    />
  );
}

export function CaptionPreview({
  outputPosition,
  asset,
  edit,
  current,
  disabled,
  pause,
  update,
  openEffect,
  selectedEffect,
  onlyInstance,
}: {
  onlyInstance?: string | null;
  openEffect: (id: EffectId, instanceId?: string) => void;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  outputPosition?: number;
  asset: MediaAsset;
  edit: EditSettings;
  current: number;
  disabled: boolean;
  pause: () => void;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const crop = edit.crop;
  const active = captionItems(edit)
    .filter((item) => {
      if (onlyInstance !== undefined && (item.instanceId ?? null) !== onlyInstance) return false;
      const time =
        item.timeSpace === 'output'
          ? (outputPosition ?? outputTimeAtSource(edit, current))
          : current;
      return item.mode !== 'none' && time >= item.start && time < item.end;
    })
    .map((item) => ({ cue: item.cue, mode: item.mode, index: item.index }));
  const area =
    crop && asset.width && asset.height
      ? {
          left: `${(crop.x / asset.width) * 100}%`,
          top: `${(crop.y / asset.height) * 100}%`,
          width: `${(crop.width / asset.width) * 100}%`,
          height: `${(crop.height / asset.height) * 100}%`,
        }
      : undefined;
  return (
    <div className="caption-preview" data-frame-area style={area}>
      <div className="caption-defaults">
        {active.map(({ cue, mode, index }) => (
          <MovableCaption
            key={captionItems(edit)[index].instanceId ?? 'primary'}
            cue={mode === 'embed' ? { ...cue, position: undefined, style: undefined } : cue}
            index={index}
            disabled={disabled}
            movable={mode === 'burn'}
            pause={pause}
            selected={
              selectedEffect?.id === 'captions' &&
              selectedEffect.instanceId === captionItems(edit)[index].instanceId
            }
            select={() => openEffect('captions', captionItems(edit)[index].instanceId)}
            change={(patch) => update(changeCaption(edit, captionItems(edit)[index], patch))}
          />
        ))}
      </div>
    </div>
  );
}
