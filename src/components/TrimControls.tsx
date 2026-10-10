import { Scissors } from 'lucide-react';
import type { EditSettings } from '../core/types';
import { time } from '../core/format';
import { editedDuration } from '../core/timeline';
export function TrimControls({ edit, update, current }: { edit: EditSettings; update: (patch: Partial<EditSettings>) => void; current: number }) {
  return <section className="control-section"><div className="section-title"><Scissors size={16} /><h3>Trim</h3><span>{time(editedDuration(edit))}</span></div>
    <p className="field-note">Drag clip edges in the timeline to trim, including split sections.</p>
    <div className="inline-actions"><button onClick={() => update({ start: Math.min(current, edit.end - 0.05) })}>Set in at playhead <kbd>I</kbd></button><button onClick={() => update({ end: Math.max(current, edit.start + 0.05) })}>Set out <kbd>O</kbd></button></div>
  </section>;
}
