import { parseCutout } from '../core/cutout';
import type { Editor } from '../hooks/useEditor';
export function CutoutControls({ editor }: { editor: Editor }) {
  const value = parseCutout(editor.edit!.cutout),
    change = (patch: Partial<typeof value>, rebuild = true) =>
      editor.update({ cutout: { ...value, ...patch, ...(rebuild ? { image: null } : {}) } });
  return (
    <section className="control-section cutout-controls">
      <p className="field-note">
        Remove a plain or gently varying background locally. Automatic removal starts at the edges;
        use a sampled color and brush refinement for more control.
      </p>
      <div className="painting-actions">
        <button
          className="button subtle small"
          aria-pressed={value.background === 'edges'}
          onClick={() => change({ background: 'edges', sample: null })}
        >
          Automatic edges
        </button>
        <button
          className="button subtle small"
          aria-pressed={value.tool === 'sample'}
          onClick={() => change({ tool: 'sample' }, false)}
        >
          Pick background color
        </button>
      </div>
      <label className="stacked-label">
        Color tolerance · {Math.round(value.tolerance * 100)}%
        <input
          aria-label="Background color tolerance"
          type="range"
          min={0}
          max={0.8}
          step={0.01}
          value={value.tolerance}
          onChange={(e) => change({ tolerance: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Edge softness · {Math.round(value.feather * 10000) / 100}%
        <input
          aria-label="Background edge softness"
          type="range"
          min={0}
          max={0.04}
          step={0.0005}
          value={value.feather}
          onChange={(e) => change({ feather: Number(e.target.value) })}
        />
      </label>
      <label className="switch-row">
        <span>
          Remove only connected background<small>Preserve enclosed areas with similar colors</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Connected background only"
          checked={value.contiguous}
          onChange={(e) => change({ contiguous: e.target.checked })}
        />
      </label>
      <h3>Refine the mask</h3>
      <div className="segmented">
        {(['remove', 'restore'] as const).map((tool) => (
          <button
            key={tool}
            aria-pressed={value.tool === tool}
            onClick={() => change({ tool }, false)}
          >
            {tool === 'remove' ? 'Remove more' : 'Restore area'}
          </button>
        ))}
      </div>
      <label className="stacked-label">
        Refinement brush · {Math.round(value.size * 1000) / 10}%
        <input
          aria-label="Background refinement brush size"
          type="range"
          min={0.001}
          max={0.2}
          step={0.001}
          value={value.size}
          onChange={(e) => change({ size: Number(e.target.value) }, false)}
        />
      </label>
      <div className="painting-actions">
        <button
          className="button subtle small"
          disabled={!value.strokes.length}
          onClick={() => change({ strokes: value.strokes.slice(0, -1) })}
        >
          Undo mask stroke
        </button>
        <button
          className="button subtle small"
          disabled={!value.strokes.length}
          onClick={() => change({ strokes: [] })}
        >
          Clear refinements
        </button>
        <button
          className="button subtle small"
          onClick={() => change({ revision: (value.revision + 1) % 1_000_000_000 })}
        >
          Recalculate background
        </button>
      </div>
      <p className="field-note" role="status">
        {value.tool === 'sample'
          ? 'Click the background in the canvas.'
          : `Paint on the image to ${value.tool} areas.`}{' '}
        {value.strokes.length} refinements
      </p>
      <p className="field-note">
        Use PNG, WebP, or TIFF to preserve transparency. JPEG and BMP use your export background
        color.
      </p>
    </section>
  );
}
