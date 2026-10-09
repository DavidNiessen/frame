import { useRef, useState } from 'react';
import type { EditSettings } from '../core/types';
export function OverlayControls({ edit, update, expanded = false }: { expanded?: boolean; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const o = edit.overlays; const fileInput = useRef<HTMLInputElement>(null); const [error, setError] = useState('');
  const change = (patch: Partial<typeof o>) => update({ overlays: { ...o, ...patch } });
  async function importImage(file: File) {
    try {
      if (file.size > 10_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image smaller than 10 MB.');
      const bitmap = await createImageBitmap(file); const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      change({ image: canvas.toDataURL('image/png') }); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load the image.'); }
  }
  return <details className="advanced" open={expanded || undefined}><summary>Text & watermark</summary><div className="advanced-content">
    <label className="stacked-label">Overlay text<textarea aria-label="Overlay text" maxLength={2000} value={o.text} onChange={e => change({ text: e.target.value })} placeholder="Add a title or credit" /></label>
    <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="Watermark image file" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importImage(file); }} />
    <button className="button subtle small" onClick={() => fileInput.current?.click()}>Choose watermark image</button>{o.image && <button className="button subtle small" onClick={() => change({ image: null })}>Remove watermark</button>}
    <div className="field-grid">{(['x', 'y', 'size', 'imageWidth'] as const).map(key => <label key={key}>{({ x: 'Horizontal position %', y: 'Vertical position %', size: 'Text size px', imageWidth: 'Image width %' })[key]}<input aria-label={`Overlay ${key}`} type="number" min={key === 'size' ? 12 : key === 'imageWidth' ? 1 : 0} max={key === 'size' ? 200 : 100} value={o[key]} onChange={e => change({ [key]: Number(e.target.value) })} /></label>)}</div>
    <label className="stacked-label">Text color<input aria-label="Overlay text color" type="color" value={o.color} onChange={e => change({ color: e.target.value })} /></label>
    <label className="stacked-label">Opacity {Math.round(o.opacity * 100)}%<input aria-label="Overlay opacity" type="range" min="0" max="1" step="0.05" value={o.opacity} onChange={e => change({ opacity: Number(e.target.value) })} /></label>
    <p className="field-note">Text and images are baked into video exports and merged clips. Position controls apply to both. Preview shows placement; font sizing is finalized on export.</p>{error && <p role="alert">{error}</p>}
  </div></details>;
}
