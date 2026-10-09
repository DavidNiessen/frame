import { Crop as CropIcon, RotateCcw, Scissors, Volume2 } from 'lucide-react';
import type { Crop, EditSettings, MediaAsset } from '../core/types';
import { time } from '../core/format';
import { editedDuration } from '../core/timeline';
export function EditControls({ asset, edit, update, current }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void; current: number }) {
  function cropPreset(ratio: number | null) {
    if (!asset.width || !asset.height) return;
    if (ratio === null) { update({ crop: null }); return; }
    let width = asset.width; let height = Math.floor(width / ratio);
    if (height > asset.height) { height = asset.height; width = Math.floor(height * ratio); }
    update({ crop: { x: Math.floor((asset.width - width) / 2), y: Math.floor((asset.height - height) / 2), width, height } });
  }
  function cropValue(key: keyof Crop, value: number) {
    const c = edit.crop; if (!c || !Number.isFinite(value)) return;
    const next = { ...c, [key]: Math.round(value) };
    next.x = Math.max(0, Math.min((asset.width ?? 2) - 2, next.x));
    next.y = Math.max(0, Math.min((asset.height ?? 2) - 2, next.y));
    next.width = Math.max(2, Math.min((asset.width ?? 2) - next.x, next.width));
    next.height = Math.max(2, Math.min((asset.height ?? 2) - next.y, next.height));
    update({ crop: next });
  }
  return <>
    <section className="control-section"><div className="section-title"><Scissors size={16} /><h3>Trim</h3><span>{time(editedDuration(edit))}</span></div>
      <p className="field-note">Drag clip edges in the timeline to trim, including split sections.</p>
      <div className="inline-actions"><button onClick={() => update({ start: Math.min(current, edit.end - 0.05) })}>Set in at playhead <kbd>I</kbd></button><button onClick={() => update({ end: Math.max(current, edit.start + 0.05) })}>Set out <kbd>O</kbd></button></div>
    </section>
    {asset.kind === 'video' && <section className="control-section"><div className="section-title"><CropIcon size={16} /><h3>Crop</h3><button className="icon-button" aria-label="Reset crop" onClick={() => update({ crop: null })}><RotateCcw size={13} /></button></div>
      <div className="crop-presets">{[{ label: 'Original', ratio: null }, { label: '16:9', ratio: 16 / 9 }, { label: '1:1', ratio: 1 }, { label: '9:16', ratio: 9 / 16 }].map(p => <button key={p.label} aria-pressed={p.ratio === null ? !edit.crop : !!edit.crop && Math.abs(edit.crop.width / edit.crop.height - p.ratio) < 0.01} className={(p.ratio === null ? !edit.crop : !!edit.crop && Math.abs(edit.crop.width / edit.crop.height - p.ratio) < 0.01) ? 'selected' : ''} onClick={() => cropPreset(p.ratio)}>{p.label}</button>)}</div>
      <label className="switch-row"><span>Custom crop</span><input type="checkbox" role="switch" checked={!!edit.crop} onChange={event => update({ crop: event.target.checked ? { x: 0, y: 0, width: asset.width ?? 2, height: asset.height ?? 2 } : null })} /></label>
      {edit.crop && <div className="field-grid crop-fields">{(['width', 'height', 'x', 'y'] as const).map(key => <label key={key}>{key === 'x' || key === 'y' ? `${key.toUpperCase()} offset` : key}<span className="unit">px</span><input type="number" aria-label={`Crop ${key}`} value={edit.crop![key]} min={key === 'x' || key === 'y' ? 0 : 2} step={1} onChange={event => cropValue(key, Number(event.target.value))} /></label>)}</div>}
    </section>}
    <section className="control-section"><div className="section-title"><Volume2 size={16} /><h3>Volume</h3><span>{Math.round(edit.volume * 100)}%</span></div><input type="range" aria-label="Volume" min={0} max={3} step={0.01} value={edit.volume} disabled={!asset.hasAudio} onChange={event => update({ volume: Number(event.target.value) })} /><div className="range-labels"><span>Mute</span><button onClick={() => update({ volume: 1 })}>Reset to 100%</button><span>300%</span></div>{!asset.hasAudio ? <p className="field-note">This video has no audio track.</p> : edit.volume > 1 && <p className="field-note">Boost above 100% is applied on export and may clip.</p>}</section>
  </>;
}
