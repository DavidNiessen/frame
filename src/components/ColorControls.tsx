import { useRef, useState } from 'react';
import { defaultColor, parseCube } from '../core/color';
import { useFramePreview } from '../hooks/useFramePreview';
import type { Editor } from '../hooks/useEditor';
export function ColorControls({ editor, current, expanded = false }: { expanded?: boolean; editor: Editor; current: number }) {
  const file = useRef<HTMLInputElement>(null); const [error, setError] = useState(''); const preview = useFramePreview(editor, current); const c = editor.edit!.color;
  return <details className="advanced" open={expanded || undefined}><summary>Color & LUTs</summary><div className="advanced-content">
    {(['brightness', 'contrast', 'saturation', 'temperature'] as const).map(key => <label className="stacked-label" key={key}>{key} {c[key].toFixed(2)}<input aria-label={`Color ${key}`} type="range" min={key === 'brightness' || key === 'temperature' ? -1 : 0} max={key === 'brightness' || key === 'temperature' ? 1 : 3} step="0.01" value={c[key]} onChange={e => editor.update({ color: { ...c, [key]: Number(e.target.value) } })} /></label>)}
    <input type="file" ref={file} hidden accept=".cube" aria-label="LUT file" onChange={e => { const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return; void selected.text().then(text => { editor.update({ color: { ...c, lut: parseCube(text), lutName: selected.name.slice(0, 255) } }); setError(''); }).catch(e => setError(e.message)); }} />
    <button className="button subtle small" onClick={() => file.current?.click()}>Import .cube LUT</button>{c.lut && <><span>{c.lutName}</span><button className="button subtle small" onClick={() => editor.update({ color: { ...c, lut: null, lutName: null } })}>Remove LUT</button></>}
    <button className="button subtle small" onClick={() => editor.update({ color: defaultColor() })}>Reset color</button>
    <button className="button subtle small" onClick={() => void preview.generate()} disabled={preview.loading || !!editor.busy}>{preview.loading ? 'Rendering…' : 'Render edited frame'}</button>
    {preview.url && <a href={preview.url} download="edited-frame.png"><img className="processed-frame" src={preview.url} alt="Rendered edited frame" /></a>}
    <p className="field-note">Render the playhead frame to inspect color, LUTs, cropping, transforms, captions and overlays. Preview is limited to 720 pixels; exports keep your selected resolution. Click the rendered frame to save it.</p>{(error || preview.error) && <p role="alert">{error || preview.error}</p>}
  </div></details>;
}
