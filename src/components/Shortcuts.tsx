import { Keyboard, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
export function Shortcuts({ open, close }: { open: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const shortcuts = [['Import media', '⌘ / Ctrl + O'], ['Play / pause', 'Space'], ['Previous / next frame (audio: 1 second)', ', / .'], ['Set trim start', 'I'], ['Set trim end', 'O'], ['Undo', '⌘ / Ctrl + Z'], ['Redo', '⌘ / Ctrl + Shift + Z']];
  if (window.frameDesktop) shortcuts.push(['Window controls', 'Ctrl + Shift + Space']);
  return <dialog ref={dialog} className="shortcuts-dialog" onCancel={close} onClick={event => { if (event.target === dialog.current) close(); }}><div className="dialog-heading"><h2><Keyboard size={18} /> Keyboard shortcuts</h2><button className="icon-button" aria-label="Close shortcuts" onClick={close}><X size={18} /></button></div><dl>{shortcuts.map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl></dialog>;
}
