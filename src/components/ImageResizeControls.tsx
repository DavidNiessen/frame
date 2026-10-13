import { useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import {
  defaultImageResize,
  imageResizeGeometry,
  imageResizePresets,
  parseImageResize,
  type ImageResize,
} from '../core/image-resize';
import type { OutputSettings } from '../core/presets';
import type { MediaAsset } from '../core/types';
const storageKey = 'frame:image-resize-presets';
interface SavedSize {
  name: string;
  settings: ImageResize;
}
function readSizes(): SavedSize[] {
  try {
    const items = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.slice(0, 20).map((p) => {
      if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60)
        throw new Error();
      return { name: p.name, settings: parseImageResize(p.settings) };
    });
  } catch {
    return [];
  }
}
export function ImageResizeControls({
  output,
  update,
  assets,
}: {
  output: OutputSettings;
  update: (patch: Partial<OutputSettings>) => void;
  assets: MediaAsset[];
}) {
  const r = output.imageResize ?? defaultImageResize(),
    [saved, setSaved] = useState(readSizes),
    [name, setName] = useState('');
  const choices = [...imageResizePresets, ...saved];
  const selected = choices.findIndex((p) => JSON.stringify(p.settings) === JSON.stringify(r));
  const change = (patch: Partial<ImageResize>) => update({ imageResize: { ...r, ...patch } });
  const persist = (sizes: SavedSize[]) => {
    setSaved(sizes);
    try {
      localStorage.setItem(storageKey, JSON.stringify(sizes));
    } catch {}
  };
  let preview = '';
  const first = assets.find((a) => a.kind === 'image');
  if (first)
    try {
      const size = imageResizeGeometry(first.width!, first.height!, r);
      preview = `${first.width} × ${first.height} → ${size?.width ?? first.width} × ${size?.height ?? first.height} px`;
    } catch (error) {
      preview = (error as Error).message;
    }
  return (
    <section className="control-section image-resize-controls" aria-label="Batch image size">
      <label className="stacked-label">
        Image size
        <select
          aria-label="Image size preset"
          value={selected < 0 ? 'custom' : selected}
          onChange={(e) => {
            if (e.target.value !== 'custom')
              update({ imageResize: choices[Number(e.target.value)].settings });
          }}
        >
          {choices.map((p, i) => (
            <option key={i} value={i}>
              {p.name}
            </option>
          ))}
          <option value="custom">Custom size</option>
        </select>
      </label>
      <label className="stacked-label">
        Resize by
        <select
          aria-label="Resize mode"
          value={r.mode}
          onChange={(e) => change({ mode: e.target.value as ImageResize['mode'] })}
        >
          <option value="original">Keep original</option>
          <option value="long-edge">Longest edge</option>
          <option value="dimensions">Width & height</option>
          <option value="percentage">Percentage</option>
        </select>
      </label>
      {r.mode !== 'original' && (
        <>
          {r.mode === 'percentage' ? (
            <label className="stacked-label">
              Scale (%)
              <input
                type="number"
                aria-label="Image scale percentage"
                min={1}
                max={400}
                value={r.percent}
                onChange={(e) => change({ percent: Number(e.target.value) })}
              />
            </label>
          ) : (
            <div className="image-resize-dimensions">
              <label className="stacked-label">
                {r.mode === 'long-edge' ? 'Longest edge (px)' : 'Width (px)'}
                <input
                  type="number"
                  aria-label="Resize width"
                  min={2}
                  max={8192}
                  value={r.width}
                  onChange={(e) => change({ width: Number(e.target.value) })}
                />
              </label>
              {r.mode === 'dimensions' && (
                <label className="stacked-label">
                  Height (px)
                  <input
                    type="number"
                    aria-label="Resize height"
                    min={2}
                    max={8192}
                    value={r.height}
                    onChange={(e) => change({ height: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          )}
          {r.mode === 'dimensions' && (
            <label className="stacked-label">
              Fit
              <select
                aria-label="Image resize fit"
                value={r.fit}
                onChange={(e) => change({ fit: e.target.value as ImageResize['fit'] })}
              >
                <option value="contain">Fit inside · preserve proportions</option>
                <option value="cover">Crop to fill</option>
                <option value="stretch">Stretch to size</option>
              </select>
            </label>
          )}
          <label className="switch-row">
            Only shrink larger images
            <input
              type="checkbox"
              checked={r.withoutEnlargement}
              onChange={(e) => change({ withoutEnlargement: e.target.checked })}
            />
          </label>
          <details>
            <summary>Save a size preset</summary>
            <div className="image-size-save">
              <input
                aria-label="Size preset name"
                placeholder="e.g. Portfolio images"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                className="icon-button"
                aria-label="Save image size preset"
                disabled={!name.trim() || saved.length >= 20}
                onClick={() => {
                  try {
                    parseImageResize(r);
                    persist([...saved, { name: name.trim(), settings: { ...r } }]);
                    setName('');
                  } catch {}
                }}
              >
                <BookmarkPlus size={16} />
              </button>
            </div>
            {saved.map((p, i) => (
              <div className="image-size-save" key={i}>
                <span>{p.name}</span>
                <button
                  className="icon-button"
                  aria-label={`Delete size preset ${p.name}`}
                  onClick={() => persist(saved.filter((_, index) => index !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </details>
        </>
      )}
      {preview && (
        <p className="field-note image-resize-example">
          {preview}
          {assets.filter((a) => a.kind === 'image').length > 1 &&
            ' · dimensions calculated per file'}
        </p>
      )}
    </section>
  );
}
