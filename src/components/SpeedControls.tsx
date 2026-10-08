import { Gauge } from 'lucide-react';
import { editedDuration } from '../core/timeline';
import { time } from '../core/format';
import type { EditSettings } from '../core/types';
const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export function SpeedControls({ edit, update }: { edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  return <section className="control-section"><div className="section-title"><Gauge size={16} /><h3>Speed</h3><span>{time(editedDuration(edit))}</span></div><label className="stacked-label">Playback speed<select aria-label="Playback speed" value={edit.speed} onChange={event => update({ speed: Number(event.target.value) })}>{!speeds.includes(edit.speed) && <option value={edit.speed}>{edit.speed}×</option>}{speeds.map(speed => <option value={speed} key={speed}>{speed}×{speed === 1 ? ' — Original' : speed < 1 ? ' — Slower' : ' — Faster'}</option>)}</select></label><label className="switch-row"><span>Preserve audio pitch<small>Keep voices and music in tune</small></span><input type="checkbox" aria-label="Preserve audio pitch" checked={edit.preservePitch} onChange={event => update({ preservePitch: event.target.checked })} /></label><p className="field-note">Trim boundaries and the playhead use source time. GIF speed is applied on export.</p></section>;
}
