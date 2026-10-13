import { parsePainting } from '../core/painting';
import { rasterPainting } from '../engines/painting-raster';
import { frameDimensions } from '../core/geometry';
import type { Editor } from '../hooks/useEditor';
export function PaintingControls({ editor }: { editor: Editor }) {
  const value = parsePainting(editor.edit!.painting),
    change = (patch: Partial<typeof value>) => editor.update({ painting: { ...value, ...patch } });
  return (
    <section className="control-section">
      <p className="field-note">
        Paint directly on the frame. Brush strokes live in this layer and stay editable. Use another
        layer for a separate drawing.
      </p>
      <div className="segmented">
        {[false, true].map((erase) => (
          <button
            key={String(erase)}
            aria-pressed={value.erase === erase}
            onClick={() => change({ erase })}
          >
            {erase ? 'Eraser' : 'Brush'}
          </button>
        ))}
      </div>
      <label className="stacked-label">
        Brush color
        <input
          aria-label="Brush color"
          type="color"
          value={value.color}
          onChange={(e) => change({ color: e.target.value })}
        />
      </label>
      <label className="stacked-label">
        Brush size · {Math.round(value.size * 1000) / 10}% of width
        <input
          type="range"
          aria-label="Brush size"
          min={0.001}
          max={0.15}
          step={0.001}
          value={value.size}
          onChange={(e) => change({ size: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Opacity · {Math.round(value.opacity * 100)}%
        <input
          aria-label="Brush opacity"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={value.opacity}
          onChange={(e) => change({ opacity: Number(e.target.value) })}
        />
      </label>
      <div className="painting-actions">
        <button
          className="button subtle small"
          disabled={!value.strokes.length}
          onClick={() =>
            void (async () => {
              try {
                const strokes = value.strokes.slice(0, -1),
                  dims = frameDimensions(editor.asset!, editor.edit!),
                  image = await rasterPainting(strokes, dims.width, dims.height);
                change({ strokes, image });
              } catch (e) {
                editor.setNotice((e as Error).message);
              }
            })()
          }
        >
          Undo stroke
        </button>
        <button
          className="button subtle small"
          disabled={!value.strokes.length}
          onClick={() => change({ strokes: [], image: null })}
        >
          Clear layer
        </button>
      </div>
    </section>
  );
}
