import { Keyboard, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
export function Shortcuts({ open, close }: { open: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} className="shortcuts-dialog" onCancel={close} onClick={event => { if (event.target === dialog.current) close(); }}><div className="dialog-heading"><h2><Keyboard size={18} /> Keyboard shortcuts</h2><button className="icon-button" aria-label="Close shortcuts" onClick={close}><X size={18} /></button></div><dl>{[['Import media', '⌘ / Ctrl + O'], ['Play / pause', 'Space'], ['Set trim start', 'I'], ['Set trim end', 'O'], ['Undo', '⌘ / Ctrl + Z'], ['Redo', '⌘ / Ctrl + Shift + Z']].map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl></dialog>;
}
