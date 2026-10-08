import { useState } from 'react';
import { frameDimensions } from '../core/geometry';
import type { EditSettings, MediaAsset } from '../core/types';
export function GeometryControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const [locked, setLocked] = useState(true); const g = edit.geometry; const dims = frameDimensions(asset, edit);
  const change = (patch: Partial<typeof g>) => update({ geometry: { ...g, ...patch } });
  function dimension(key: 'width' | 'height', value: number) {
    if (!g.resize || !Number.isFinite(value)) return; value = Math.max(2, Math.min(8192, Math.round(value)));
    const next = { ...g.resize, [key]: value }; if (locked) { const other = key === 'width' ? 'height' : 'width'; next[other] = Math.max(2, Math.min(8192, Math.round(value * g.resize[other] / g.resize[key]))); }
    change({ resize: next });
  }
  return <details className="advanced"><summary>Rotate, flip & resize</summary><div className="advanced-content">
    <label className="stacked-label">Rotation<select aria-label="Video rotation" value={g.rotation} onChange={e => change({ rotation: Number(e.target.value) as typeof g.rotation })}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}° clockwise</option>)}</select></label>
    <label className="switch-row">Flip horizontally<input type="checkbox" checked={g.flipHorizontal} onChange={e => change({ flipHorizontal: e.target.checked })} /></label>
    <label className="switch-row">Flip vertically<input type="checkbox" checked={g.flipVertical} onChange={e => change({ flipVertical: e.target.checked })} /></label>
    <label className="stacked-label">Resize preset<select aria-label="Resize preset" value={g.resize ? 'custom' : 'original'} onChange={e => { const size = { hd: [1280, 720], full: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080], custom: [dims.width, dims.height] }[e.target.value]; change({ resize: size ? { width: size[0], height: size[1], fit: 'contain' } : null }); }}><option value="original">Keep source dimensions</option><option value="hd">720p landscape</option><option value="full">1080p landscape</option><option value="portrait">1080p portrait</option><option value="square">1080p square</option><option value="custom">Custom</option></select></label>
    {g.resize && <><label className="switch-row">Lock aspect ratio<input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} /></label><div className="field-grid">{(['width', 'height'] as const).map(key => <label key={key}>{key}<input aria-label={`Resize ${key}`} type="number" min="2" max="8192" value={g.resize![key]} onChange={e => dimension(key, Number(e.target.value))} /></label>)}</div><label className="stacked-label">Resize fit<select aria-label="Resize fit" value={g.resize.fit} onChange={e => change({ resize: { ...g.resize!, fit: e.target.value as typeof g.resize.fit } })}><option value="contain">Fit with letterbox</option><option value="cover">Fill and crop</option><option value="stretch">Stretch</option></select></label></>}
    <p className="field-note">Output frame: {dims.width} × {dims.height}. Encoded video dimensions round down to even pixels. Crop handles remain on the original source; rotation and resize follow cropping.</p>
  </div></details>;
}
