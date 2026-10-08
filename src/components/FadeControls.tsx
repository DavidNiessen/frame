import { AudioLines } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { editedDuration } from '../core/timeline';
export function FadeControls({ asset, edit, update }: { asset: MediaAsset; edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const duration = editedDuration(edit);
  const fields = [...(asset.hasAudio ? ['audioFadeIn', 'audioFadeOut'] as const : []), ...(asset.kind === 'video' ? ['videoFadeIn', 'videoFadeOut'] as const : [])];
  return <section className="control-section"><div className="section-title"><AudioLines size={16} /><h3>Fades</h3></div><div className="field-grid">{fields.map(key => <label key={key}>{key.startsWith('audio') ? 'Audio' : 'Video'} fade {key.endsWith('In') ? 'in' : 'out'}<span className="unit">sec</span><input type="number" aria-label={`${key.startsWith('audio') ? 'Audio' : 'Video'} fade ${key.endsWith('In') ? 'in' : 'out'}`} min={0} max={duration} step={0.1} value={edit[key]} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) update({ [key]: Math.max(0, Math.min(duration, value)) }); }} /></label>)}</div><p className="field-note">Fade times use edited output seconds, after cuts and speed changes.</p></section>;
}
