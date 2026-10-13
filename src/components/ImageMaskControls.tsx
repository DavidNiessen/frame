import { useEffect, useRef, useState } from 'react';
import { defaultImageMask, parseImageMask, type ImageMask } from '../core/image-masks';
import { changeImageLayer, imageLayerKey } from '../core/image-layers';
import { rasterPainting } from '../engines/painting-raster';
import { frameDimensions } from '../core/geometry';
import type { EffectId } from '../core/effect-ids';
import type { Editor } from '../hooks/useEditor';
export function ImageMaskControls({
  editor,
  id,
  instanceId,
}: {
  editor: Editor;
  id: EffectId;
  instanceId?: string;
}) {
  const edit = editor.edit!,
    key = imageLayerKey(id, instanceId),
    m = parseImageMask(edit.imageLayers?.entries[key]?.mask),
    latest = useRef(editor),
    alive = useRef(true),
    [saving, setSaving] = useState(false);
  latest.current = editor;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const change = (patch: Partial<ImageMask>) =>
    editor.update(changeImageLayer(edit, key, { mask: { ...m, ...patch } }));
  const region = (field: 'x' | 'y' | 'width' | 'height', value: number) => {
    const next = { ...m, [field]: value / 100 };
    next.width = Math.max(0.01, Math.min(1, next.width));
    next.height = Math.max(0.01, Math.min(1, next.height));
    if (field === 'x') next.x = Math.max(0, Math.min(1 - next.width, next.x));
    if (field === 'y') next.y = Math.max(0, Math.min(1 - next.height, next.y));
    if (field === 'width') next.width = Math.min(next.width, 1 - next.x);
    if (field === 'height') next.height = Math.min(next.height, 1 - next.y);
    change(next);
  };
  return (
    <section className="control-section image-mask-controls" aria-label="Selective effect mask">
      <h3>Mask</h3>
      <label className="stacked-label">
        Apply to
        <select
          aria-label="Effect mask type"
          value={m.mode}
          onChange={(e) => change({ mode: e.target.value as ImageMask['mode'] })}
        >
          <option value="none">Entire image</option>
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="brush">Paint a selection</option>
        </select>
      </label>
      {m.mode !== 'none' && (
        <>
          {(m.mode === 'rectangle' || m.mode === 'ellipse') && (
            <>
              <p className="field-note">Drag the selection or its corners directly on the image.</p>
              <div className="image-mask-region">
                {(['x', 'y', 'width', 'height'] as const).map((field) => (
                  <label className="stacked-label" key={field}>
                    {field === 'x'
                      ? 'Left'
                      : field === 'y'
                        ? 'Top'
                        : field[0].toUpperCase() + field.slice(1)}{' '}
                    (%)
                    <input
                      type="number"
                      aria-label={`Mask ${field}`}
                      min={field === 'x' || field === 'y' ? 0 : 1}
                      max={100}
                      step={1}
                      value={Math.round(m[field] * 1000) / 10}
                      onChange={(e) => region(field, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {m.mode === 'brush' && (
            <>
              <p className="field-note">
                Paint on the image to reveal this effect. Use the eraser to remove areas from the
                selection.
              </p>
              <div className="segmented">
                {[false, true].map((erase) => (
                  <button
                    key={String(erase)}
                    aria-pressed={m.brush.erase === erase}
                    onClick={() => change({ brush: { ...m.brush, erase } })}
                  >
                    {erase ? 'Erase mask' : 'Paint mask'}
                  </button>
                ))}
              </div>
              <label className="stacked-label">
                Brush size · {Math.round(m.brush.size * 100)}%
                <input
                  aria-label="Mask brush size"
                  type="range"
                  min={0.005}
                  max={0.3}
                  step={0.005}
                  value={m.brush.size}
                  onChange={(e) => change({ brush: { ...m.brush, size: Number(e.target.value) } })}
                />
              </label>
              <label className="stacked-label">
                Brush strength · {Math.round(m.brush.opacity * 100)}%
                <input
                  aria-label="Mask brush strength"
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={m.brush.opacity}
                  onChange={(e) =>
                    change({ brush: { ...m.brush, opacity: Number(e.target.value) } })
                  }
                />
              </label>
              <div className="painting-actions">
                <button
                  className="button subtle small"
                  disabled={saving || !m.brush.strokes.length}
                  onClick={() =>
                    void (async () => {
                      setSaving(true);
                      const previous = m.brush;
                      try {
                        const strokes = previous.strokes.slice(0, -1),
                          dims = frameDimensions(editor.asset!, edit),
                          image = await rasterPainting(strokes, dims.width, dims.height);
                        const now = latest.current.edit!,
                          mask = parseImageMask(now.imageLayers?.entries[key]?.mask);
                        if (alive.current && mask.brush === previous)
                          latest.current.update(
                            changeImageLayer(now, key, {
                              mask: { ...mask, brush: { ...previous, strokes, image } },
                            }),
                          );
                        else if (
                          alive.current &&
                          JSON.stringify(mask.brush) === JSON.stringify(previous)
                        )
                          latest.current.update(
                            changeImageLayer(now, key, {
                              mask: { ...mask, brush: { ...previous, strokes, image } },
                            }),
                          );
                      } catch (error) {
                        editor.setNotice((error as Error).message);
                      } finally {
                        if (alive.current) setSaving(false);
                      }
                    })()
                  }
                >
                  Undo mask stroke
                </button>
                <button
                  className="button subtle small"
                  disabled={saving || !m.brush.strokes.length}
                  onClick={() => change({ brush: { ...m.brush, strokes: [], image: null } })}
                >
                  Clear mask strokes
                </button>
              </div>
            </>
          )}
          <label className="stacked-label">
            Feather · {Math.round(m.feather * 100)}%
            <input
              aria-label="Mask feather"
              type="range"
              min={0}
              max={0.2}
              step={0.005}
              value={m.feather}
              onChange={(e) => change({ feather: Number(e.target.value) })}
            />
          </label>
          <label className="switch-row">
            Invert mask
            <input
              type="checkbox"
              checked={m.invert}
              onChange={(e) => change({ invert: e.target.checked })}
            />
          </label>
          <button className="button subtle small" onClick={() => change(defaultImageMask())}>
            Remove mask
          </button>
        </>
      )}
    </section>
  );
}
