import { estimateSize, supportsSizeTarget, type SizeEstimate } from '../core/size';
import { bytes } from '../core/format';
import type { EditSettings, MediaAsset } from '../core/types';
export function SizeControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  let estimate: SizeEstimate | null = null; let error = ''; try { estimate = estimateSize(asset, edit); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const supported = supportsSizeTarget(edit.format);
  return <div className="size-controls">
    {supported && <><label className="switch-row">Aim for a target size<input aria-label="Target size mode" type="checkbox" checked={edit.targetSizeMb !== null} onChange={e => update({ targetSizeMb: e.target.checked ? Math.max(.1, Math.round((estimate?.high ?? 1_000_000) / 1_000_000 * 10) / 10) : null })} /></label>{edit.targetSizeMb !== null && <label className="stacked-label">Target size (MB)<input aria-label="Target size MB" type="number" min="0.1" max="100000" step="0.1" value={edit.targetSizeMb} onChange={e => update({ targetSizeMb: Number(e.target.value) })} /></label>}</>}
    <p className="field-note" aria-label="Estimated export size">{estimate ? <>Estimated {bytes(estimate.low)} – {bytes(estimate.high)}<br />{estimate.label}{estimate.bitrate && <><br />{estimate.bitrate}</>}</> : error || 'GIF size depends on motion and colors. Export to measure the actual size.'}</p>
    {supported && edit.targetSizeMb !== null && <p className="field-note">1 MB = 1,000,000 bytes. Target mode calculates average bitrates with a 5% overhead allowance. It is approximate, not a hard file-size limit; short clips, artwork and encoder behavior can vary. Lower targets reduce quality.</p>}
  </div>;
}
