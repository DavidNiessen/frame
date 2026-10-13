import { useState } from 'react';
import {
  animatedMediaProperties,
  animationLimits,
  type AnimatedMediaProperty,
} from '../core/keyframes';
import { KeyframeEditor } from './KeyframeEditor';
import { changeMediaLayer, type MediaLayer } from '../core/media-layers';
import type { Editor } from '../hooks/useEditor';
const names = {
  x: 'X position',
  y: 'Y position',
  width: 'Width',
  height: 'Height',
  opacity: 'Opacity',
};
export function MediaLayerAnimation({
  editor,
  layer,
  current,
  seek,
}: {
  editor: Editor;
  layer: MediaLayer;
  current: number;
  seek: (output: number) => void;
}) {
  const [property, setProperty] = useState<AnimatedMediaProperty>('x');
  if (editor.asset?.kind !== 'video') return null;
  const [min, max] = animationLimits[property];
  return (
    <details className="advanced" open>
      <summary>Motion & keyframes</summary>
      <div className="advanced-content">
        <label className="stacked-label">
          Animate property
          <select
            aria-label="Animated layer property"
            value={property}
            onChange={(e) => setProperty(e.target.value as AnimatedMediaProperty)}
          >
            {animatedMediaProperties.map((p) => (
              <option key={p} value={p}>
                {names[p]}
              </option>
            ))}
          </select>
        </label>
        <KeyframeEditor
          label={names[property]}
          track={layer.animation?.[property]}
          value={layer[property]}
          min={min}
          max={max}
          current={current - layer.start}
          duration={layer.end - layer.start}
          seek={(at) => seek(at + layer.start)}
          change={(track) => {
            const animation = { ...layer.animation };
            if (track) animation[property] = track;
            else delete animation[property];
            editor.update(changeMediaLayer(editor.edit!, layer.id, { animation }));
          }}
        />
      </div>
    </details>
  );
}
