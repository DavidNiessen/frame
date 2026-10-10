import { Scissors, Volume2 } from 'lucide-react';
import { CropControls } from './CropControls';
import type { EditSettings, MediaAsset } from '../core/types';
import { time } from '../core/format';
import { editedDuration } from '../core/timeline';
export function EditControls({ asset, edit, update, current }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void; current: number }) {
  return <>
    <section className="control-section"><div className="section-title"><Scissors size={16} /><h3>Trim</h3><span>{time(editedDuration(edit))}</span></div>
      <p className="field-note">Drag clip edges in the timeline to trim, including split sections.</p>
      <div className="inline-actions"><button onClick={() => update({ start: Math.min(current, edit.end - 0.05) })}>Set in at playhead <kbd>I</kbd></button><button onClick={() => update({ end: Math.max(current, edit.start + 0.05) })}>Set out <kbd>O</kbd></button></div>
    </section>
    {asset.kind === 'video' && <CropControls asset={asset} edit={edit} update={update} />}
    <section className="control-section"><div className="section-title"><Volume2 size={16} /><h3>Volume</h3><span>{Math.round(edit.volume * 100)}%</span></div><input type="range" aria-label="Volume" min={0} max={3} step={0.01} value={edit.volume} disabled={!asset.hasAudio} onChange={event => update({ volume: Number(event.target.value) })} /><div className="range-labels"><span>Mute</span><button onClick={() => update({ volume: 1 })}>Reset to 100%</button><span>300%</span></div>{!asset.hasAudio ? <p className="field-note">This video has no audio track.</p> : edit.volume > 1 && <p className="field-note">Boost above 100% is applied on export and may clip.</p>}</section>
  </>;
}
