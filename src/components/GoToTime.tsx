import { useEffect, useRef, useState } from 'react';
import { Clock3, X } from 'lucide-react';
import { parseTimecode, preciseTimecode } from '../core/playhead';

export function GoToTime({ current, duration, disabled, seek, children }: { current: number; duration: number; disabled: boolean; seek: (time: number) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button className="timecode timecode-button" aria-label="Go to time" title="Go to an exact position" disabled={disabled} onClick={() => setOpen(true)}>{children}</button>{open && <TimeDialog current={current} duration={duration} seek={seek} close={() => setOpen(false)} />}</>;
}
function TimeDialog({ current, duration, seek, close }: { current: number; duration: number; seek: (time: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(preciseTimecode(current)), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); input.current?.select(); }, []);
  return <dialog ref={dialog} className="shortcuts-dialog" aria-label="Go to time" onCancel={close}><div className="dialog-heading"><h2><Clock3 size={18} />Go to time</h2><button className="icon-button" aria-label="Close time navigation" onClick={close}><X size={18} /></button></div><form className="time-navigation" onSubmit={event => { event.preventDefault(); try { seek(parseTimecode(value, duration)); close(); } catch (issue) { setError((issue as Error).message); } }}><label>Position in the edited sequence<input type="text" ref={input} aria-label="Sequence time" value={value} onChange={event => { setValue(event.target.value); setError(''); }} inputMode="decimal" /></label><p>Seconds, m:ss, or h:mm:ss · up to {preciseTimecode(duration)}</p>{error && <p role="alert">{error}</p>}<button type="submit" className="button primary">Go to position</button></form></dialog>;
}
