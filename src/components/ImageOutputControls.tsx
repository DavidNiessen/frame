import { parseImageOutput } from '../core/image-settings';
import type { EditSettings } from '../core/types';
export function ImageOutputControls({
  edit,
  update,
}: {
  edit: Pick<EditSettings, 'format' | 'imageOutput'>;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const value = parseImageOutput(edit.imageOutput),
    change = (patch: Partial<typeof value>) => update({ imageOutput: { ...value, ...patch } });
  return (
    <section className="control-section image-output-controls">
      {(edit.format === 'jpeg' || edit.format === 'webp') && (
        <label className="stacked-label">
          Image quality · {value.quality}%
          <input
            aria-label="Image quality"
            type="range"
            min={1}
            max={100}
            value={value.quality}
            onChange={(e) => change({ quality: Number(e.target.value) })}
          />
        </label>
      )}
      {edit.format === 'webp' && (
        <label className="switch-row">
          Lossless WebP
          <input
            type="checkbox"
            role="switch"
            checked={value.lossless}
            onChange={(e) => change({ lossless: e.target.checked })}
          />
        </label>
      )}
      {edit.format === 'jpeg' || edit.format === 'bmp' ? (
        <label className="stacked-label">
          Transparency background
          <input
            aria-label="Transparency background"
            type="color"
            value={value.background}
            onChange={(e) => change({ background: e.target.value })}
          />
          <small>Transparent areas use this color.</small>
        </label>
      ) : (
        <p className="field-note">
          Transparency is preserved. {edit.format === 'png' ? 'PNG is lossless.' : ''}
        </p>
      )}
    </section>
  );
}
