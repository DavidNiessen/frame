import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

/** Desktop actions stay inline; phones use the same controls in a keyboard-accessible disclosure. */
export function HeaderActions({ children, workflow }: { children: ReactNode; workflow: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => { setOpen(false); }, [workflow]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const media = matchMedia('(max-width: 700px)');
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss); media.addEventListener('change', resize);
    return () => { document.removeEventListener('pointerdown', dismiss); media.removeEventListener('change', resize); };
  }, []);
  function close() { setOpen(false); toggle.current?.focus({ preventScroll: true }); }
  return <div ref={root} className="header-actions" data-open={open} onKeyDown={event => {
    if (event.key === 'Escape' && open && !event.defaultPrevented) { event.preventDefault(); close(); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={toggle} className="icon-button header-menu-toggle" aria-label="App menu" title={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      {open ? <X size={20} /> : <Menu size={20} />}
    </button>
    <div className="header-menu-panel" id={panelId} role="group" aria-label="App actions" onClickCapture={event => {
      if (open && (event.target as HTMLElement).closest('button:not(:disabled)')) close();
    }}>{children}</div>
  </div>;
}
