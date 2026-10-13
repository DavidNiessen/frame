import { animatedMedia } from '../core/keyframes';
import { recordMediaChange } from '../core/media-layers';
import { CurvesControls } from './CurvesControls';
import { useState } from 'react';
import { visualIds, visualControls, type VisualEffect } from '../core/visual-settings';
import { type MediaLayer } from '../core/media-layers';
import { VisualEffectControls } from './VisualEffectControls';
import type { Editor } from '../hooks/useEditor';
export function MediaLayerControls({
  editor,
  layer,
  current = 0,
}: {
  editor: Editor;
  layer: MediaLayer;
  current?: number;
}) {
  const edit = editor.edit!,
    change = (patch: Partial<MediaLayer>) =>
      editor.update(recordMediaChange(edit, layer, patch, current)),
    [appearance, setAppearance] = useState<VisualEffect>('exposure'),
    index = edit.mediaLayers!.findIndex((item) => item.id === layer.id),
    audio = edit.audioLayers?.find((a) => a.id === layer.audioLayerId);
  function reorder(delta: number) {
    const layers = [...edit.mediaLayers!],
      next = index + delta;
    if (next < 0 || next >= layers.length) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    editor.update({ mediaLayers: layers });
  }
  const shown = animatedMedia(layer, layer.animation, current - layer.start);
  return (
    <>
      <section className="control-section">
        <p className="field-note">
          Move or resize the picture in the player. Drag its timeline bar to move or trim it. Source
          files remain independent.
        </p>
        <div className="control-grid two-cols">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label className="stacked-label" key={key}>
              {key[0].toUpperCase() + key.slice(1)} · %
              <input
                aria-label={`Media layer ${key}`}
                type="number"
                min={key === 'x' || key === 'y' ? -100 : 1}
                max={200}
                step={1}
                value={Number(shown[key].toFixed(3))}
                onChange={(e) => change({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <label className="stacked-label">
          Picture fit
          <select
            aria-label="Media layer fit"
            value={layer.fit}
            onChange={(e) => change({ fit: e.target.value as MediaLayer['fit'] })}
          >
            <option value="contain">Fit inside</option>
            <option value="cover">Fill and crop</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
        <label className="stacked-label">
          Opacity · {Math.round(shown.opacity * 100)}%
          <input
            aria-label="Media layer opacity"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={shown.opacity}
            onChange={(e) => change({ opacity: Number(e.target.value) })}
          />
        </label>
        <div className="painting-actions">
          <button
            className="button subtle small"
            onClick={() => change({ x: 0, y: 0, width: 100, height: 100, fit: 'cover' })}
          >
            Fill frame
          </button>
          <button
            className="button subtle small"
            onClick={() => change({ x: (100 - layer.width) / 2, y: (100 - layer.height) / 2 })}
          >
            Center picture
          </button>
          <button
            className="button subtle small"
            disabled={index >= edit.mediaLayers!.length - 1}
            onClick={() => reorder(1)}
          >
            Bring forward
          </button>
          <button
            className="button subtle small"
            disabled={index === 0}
            onClick={() => reorder(-1)}
          >
            Send backward
          </button>
        </div>
        <label className="switch-row">
          Show picture
          <input
            aria-label="Show media layer"
            type="checkbox"
            role="switch"
            checked={!layer.hidden}
            onChange={(e) => change({ hidden: !e.target.checked })}
          />
        </label>
        {audio && (
          <>
            <label className="switch-row">
              Include source audio
              <input
                aria-label="Include layer source audio"
                type="checkbox"
                role="switch"
                checked={!audio.muted}
                onChange={(e) =>
                  editor.update({
                    audioLayers: edit.audioLayers!.map((a) =>
                      a.id === audio.id ? { ...a, muted: !e.target.checked } : a,
                    ),
                  })
                }
              />
            </label>
            <p className="field-note">Picture and sound move and trim together.</p>
            <button
              className="button subtle small"
              onClick={() => change({ audioLayerId: undefined })}
            >
              Unlink audio track
            </button>
          </>
        )}
      </section>
      <details className="advanced">
        <summary>Layer appearance</summary>
        <div className="advanced-content">
          <label className="stacked-label">
            Adjustment
            <select
              aria-label="Media layer appearance adjustment"
              value={appearance}
              onChange={(e) => setAppearance(e.target.value as VisualEffect)}
            >
              {visualIds.map((id) => (
                <option value={id} key={id}>
                  {visualControls[id].name}
                </option>
              ))}
            </select>
          </label>
          <VisualEffectControls
            id={appearance}
            edit={{ ...edit, visual: layer.visual }}
            update={(patch) => change({ visual: patch.visual })}
          />
          <CurvesControls
            edit={{ ...edit, curves: layer.curves }}
            update={(patch) => change({ curves: patch.curves })}
          />
        </div>
      </details>
    </>
  );
}
