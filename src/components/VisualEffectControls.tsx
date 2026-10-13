import { parseVisual, visualControls, type VisualEffect } from '../core/visual-settings';
import type { EditSettings } from '../core/types';
export function VisualEffectControls({
  id,
  edit,
  update,
}: {
  id: VisualEffect;
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const control = visualControls[id],
    value = parseVisual(edit.visual),
    change = (n: number) => update({ visual: { ...value, [id]: n } });
  return (
    <section className="control-section">
      <p className="field-note">{control.description}</p>
      <label className="stacked-label">
        {control.name}
        <input
          aria-label={`${control.name} amount`}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value[id]}
          onChange={(e) => change(Number(e.target.value))}
        />
      </label>
      <label className="stacked-label">
        Amount{control.unit}
        <input
          aria-label={`${control.name} value`}
          type="number"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value[id]}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= control.min && n <= control.max) change(n);
          }}
        />
      </label>
      <p className="field-note">Preview and export use the same adjustment.</p>
    </section>
  );
}
