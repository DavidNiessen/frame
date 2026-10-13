import { defaultShape, parseShape, shapeKinds, type ShapeSettings } from '../core/shapes';
import type { EditSettings } from '../core/types';
export function ShapeControls({
  edit,
  update,
}: {
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const shape = parseShape(edit.shape) ?? defaultShape();
  const change = (patch: Partial<ShapeSettings>) => {
    const next = { ...shape, ...patch };
    next.width = Math.max(1, Math.min(100, next.width));
    next.height = Math.max(1, Math.min(100, next.height));
    next.x = Math.max(0, Math.min(100 - next.width, next.x));
    next.y = Math.max(0, Math.min(100 - next.height, next.y));
    update({ shape: next });
  };
  return (
    <section className="control-section shape-controls">
      <label className="stacked-label">
        Shape
        <select
          aria-label="Shape type"
          value={shape.kind}
          onChange={(e) =>
            change({
              kind: e.target.value as ShapeSettings['kind'],
              ...(e.target.value === 'line' ? { height: 4 } : {}),
            })
          }
        >
          {shapeKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind === 'rounded' ? 'Rounded rectangle' : kind[0].toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="shape-dimensions">
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
              min={field === 'x' || field === 'y' ? 0 : 1}
              max={100}
              aria-label={`Shape ${field}`}
              value={shape[field]}
              onChange={(e) => change({ [field]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="shape-align" role="group" aria-label="Align shape">
        <button className="button subtle small" onClick={() => change({ x: 0 })}>
          Left
        </button>
        <button
          className="button subtle small"
          onClick={() => change({ x: (100 - shape.width) / 2 })}
        >
          Center X
        </button>
        <button className="button subtle small" onClick={() => change({ x: 100 - shape.width })}>
          Right
        </button>
        <button className="button subtle small" onClick={() => change({ y: 0 })}>
          Top
        </button>
        <button
          className="button subtle small"
          onClick={() => change({ y: (100 - shape.height) / 2 })}
        >
          Center Y
        </button>
        <button className="button subtle small" onClick={() => change({ y: 100 - shape.height })}>
          Bottom
        </button>
      </div>
      <label className="stacked-label">
        Fill / line color
        <input
          type="color"
          aria-label="Shape fill color"
          value={shape.fill}
          onChange={(e) => change({ fill: e.target.value })}
        />
      </label>
      {!['line', 'arrow'].includes(shape.kind) && (
        <label className="stacked-label">
          Stroke color
          <input
            type="color"
            aria-label="Shape stroke color"
            value={shape.stroke}
            onChange={(e) => change({ stroke: e.target.value })}
          />
        </label>
      )}
      <label className="stacked-label">
        {['line', 'arrow'].includes(shape.kind) ? 'Line width' : 'Stroke width'} ·{' '}
        {shape.strokeWidth}%
        <input
          type="range"
          aria-label="Shape stroke width"
          min={0}
          max={10}
          step={0.1}
          value={shape.strokeWidth}
          onChange={(e) => change({ strokeWidth: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Rotation · {shape.rotation}°
        <input
          type="range"
          aria-label="Shape rotation"
          min={-180}
          max={180}
          step={1}
          value={shape.rotation}
          onChange={(e) => change({ rotation: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Opacity · {Math.round(shape.opacity * 100)}%
        <input
          type="range"
          aria-label="Shape opacity"
          min={0}
          max={1}
          step={0.01}
          value={shape.opacity}
          onChange={(e) => change({ opacity: Number(e.target.value) })}
        />
      </label>
      {shape.kind === 'rounded' && (
        <label className="stacked-label">
          Corner radius · {shape.cornerRadius}%
          <input
            type="range"
            aria-label="Shape corner radius"
            min={0}
            max={50}
            step={1}
            value={shape.cornerRadius}
            onChange={(e) => change({ cornerRadius: Number(e.target.value) })}
          />
        </label>
      )}
      <p className="field-note">
        Drag the shape or its corner handles on the canvas. Alignment guides and snapping also work
        for text and artwork. Hold Alt / Option while dragging for free placement.
      </p>
    </section>
  );
}
