import { SizeControls } from './SizeControls';
import { ChevronDown, Settings2 } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { PresetControls } from './PresetControls';
import { getFormat } from '../core/formats';
export function ExportControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const format = getFormat(edit.format);
  const lossless = ['wav', 'flac'].includes(edit.format);
  return <>
    <section className="control-section"><div className="section-title"><Settings2 size={16} /><h3>Output</h3></div><PresetControls asset={asset} edit={edit} update={update} />
      <SizeControls asset={asset} edit={edit} update={update} />
      {format.kind === 'video' && edit.format !== 'gif' && <><label className="stacked-label quality-label">Quality</label><div className="segmented">{(['high', 'balanced', 'small'] as const).map(q => <button key={q} aria-pressed={edit.quality === q} className={edit.quality === q ? 'selected' : ''} onClick={() => update({ quality: q })}>{q === 'small' ? 'Smaller file' : q}</button>)}</div><p className="field-note">{edit.targetSizeMb !== null ? 'Target size determines the average bitrate.' : edit.videoBitrate ? 'Custom bitrate overrides the quality preset.' : edit.quality === 'high' ? 'More detail, larger file.' : edit.quality === 'small' ? 'Less detail, smaller file.' : 'A good balance of quality and file size.'}</p></>}
      {edit.format === 'gif' && <p className="field-note">Animated GIFs don’t contain audio. Choose a lower frame rate for a smaller file.</p>}
    </section>
    <details className="advanced"><summary><Settings2 size={15} />Advanced settings<ChevronDown size={15} /></summary><div className="advanced-content">
      {format.kind === 'video' && edit.format !== 'gif' && <label className="stacked-label">Video bitrate <span className="unit">kbps</span><input type="number" aria-label="Video bitrate" disabled={edit.targetSizeMb !== null} placeholder="Auto (quality preset)" min={100} max={100000} step={100} value={edit.videoBitrate ?? ''} onChange={event => update({ videoBitrate: event.target.value === '' ? null : Number(event.target.value) })} /></label>}
      {asset.hasAudio && edit.format !== 'gif' && !lossless && <label className="stacked-label">Audio bitrate<select aria-label="Audio bitrate" value={edit.audioBitrate} onChange={event => update({ audioBitrate: Number(event.target.value) })}>{[64, 96, 128, 192, 256, 320].map(value => <option value={value} key={value}>{value} kbps</option>)}</select></label>}
      {edit.format === 'gif' && <label className="stacked-label">GIF frame rate <span className="unit">fps</span><input type="number" aria-label="GIF frame rate" min={1} max={60} value={edit.fps} onChange={event => update({ fps: Number(event.target.value) })} /></label>}
      <label className="switch-row"><span>Include artwork<small>{format.artwork ? asset.artworkIndex === undefined ? 'No embedded artwork in this file' : 'Keep the embedded cover image' : 'Not supported by this output format'}</small></span><input type="checkbox" role="switch" aria-label="Include artwork" checked={edit.includeArtwork} disabled={!format.artwork} onChange={event => update({ includeArtwork: event.target.checked })} /></label>
      <label className="switch-row"><span>Keep metadata<small>Titles, artists, and source tags</small></span><input type="checkbox" role="switch" aria-label="Keep metadata" checked={edit.keepMetadata} onChange={event => update({ keepMetadata: event.target.checked })} /></label>
      {lossless && <p className="field-note">{edit.format.toUpperCase()} uses lossless audio. Bitrate is determined by the source and encoder.</p>}
    </div></details>
  </>;
}
