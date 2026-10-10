import { Volume2 } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
export function VolumeControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  return <section className="control-section"><div className="section-title"><Volume2 size={16} /><h3>Volume</h3><span>{Math.round(edit.volume * 100)}%</span></div>
    <input type="range" aria-label="Volume" min={0} max={3} step={0.01} value={edit.volume} disabled={!asset.hasAudio} onChange={event => update({ volume: Number(event.target.value) })} />
    <div className="range-labels"><button disabled={!asset.hasAudio} onClick={() => update({ volume: 0 })}>Mute</button><button disabled={!asset.hasAudio} onClick={() => update({ volume: 1 })}>Reset to 100%</button><span>300%</span></div>
    {!asset.hasAudio ? <p className="field-note">This video has no audio track.</p> : edit.volume > 1 && <p className="field-note">Boost above 100% is applied on export and may clip.</p>}
  </section>;
}
