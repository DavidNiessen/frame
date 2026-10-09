import { AudioLines } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { editedDuration } from '../core/timeline';
import { fadeKeys, fadeLabel } from '../core/timed-effects';
export function FadeControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const duration = editedDuration(edit);
  return <section className="control-section"><div className="section-title"><AudioLines size={16} /><h3>Fades</h3></div>
    <div className="fade-switches">{fadeKeys(asset).map(key => <label className="switch-row" key={key}>
      <span>{fadeLabel(key)}{edit[key] > 0 && <small>{edit[key].toFixed(2)}s · drag the bar edge to adjust</small>}</span>
      <input type="checkbox" role="switch" aria-label={fadeLabel(key)} checked={edit[key] > 0}
        onChange={event => update({ [key]: event.target.checked ? Math.min(0.5, duration / 4) : 0 })} />
    </label>)}</div>
    <p className="field-note">Enabled fades appear above the timeline. Their duration follows retained output after cuts and speed changes.</p>
  </section>;
}
