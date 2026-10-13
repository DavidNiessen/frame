import { imageBlendModes, blendModeNames } from '../core/image-compositing';
import { changeImageLayer, imageLayerKey } from '../core/image-layers';
import type { EffectId } from '../core/effect-ids';
import type { Editor } from '../hooks/useEditor';
export function ImageLayerCompositing({
  editor,
  id,
  instanceId,
  layerKey,
  opacityControl = true,
}: {
  editor: Editor;
  id: EffectId;
  instanceId?: string;
  layerKey?: string;
  opacityControl?: boolean;
}) {
  const edit = editor.edit!,
    key = layerKey ?? imageLayerKey(id, instanceId),
    state = edit.imageLayers?.entries[key] ?? {};
  return (
    <section className="control-section image-layer-compositing" aria-label="Layer compositing">
      <h3>Layer compositing</h3>
      <label className="stacked-label">
        Blend mode
        <select
          aria-label="Layer blend mode"
          value={state.blend ?? 'normal'}
          onChange={(e) =>
            editor.update(
              changeImageLayer(edit, key, {
                blend: e.target.value as (typeof imageBlendModes)[number],
              }),
            )
          }
        >
          {imageBlendModes.map((mode) => (
            <option key={mode} value={mode}>
              {blendModeNames[mode]}
            </option>
          ))}
        </select>
      </label>
      {opacityControl && (
        <label className="stacked-label">
          Opacity · {Math.round((state.opacity ?? 1) * 100)}%
          <input
            type="range"
            aria-label="Layer opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.opacity ?? 1}
            onChange={(e) =>
              editor.update(changeImageLayer(edit, key, { opacity: Number(e.target.value) }))
            }
          />
        </label>
      )}
    </section>
  );
}
