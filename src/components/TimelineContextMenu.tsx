import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
export interface TimelineMenuAction { label: string; run: () => void; icon: LucideIcon; disabled?: boolean; reason?: string; shortcut?: string; danger?: boolean; checked?: boolean; divider?: boolean }
export function TimelineContextMenu({ x, y, title, actions, close }: { x: number; y: number; title: string; actions: TimelineMenuAction[]; close: (restore?: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const node = ref.current!, box = node.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, innerWidth - box.width - 8)), top: Math.max(8, Math.min(y, innerHeight - box.height - 8)) });
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const dismiss = (event: Event) => { if (!node.contains(event.target as Node)) close(false); };
    const layout = () => close(false);
    window.addEventListener('pointerdown', dismiss, true); window.addEventListener('contextmenu', dismiss, true);
    window.addEventListener('resize', layout); window.addEventListener('blur', layout);
    return () => { window.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('contextmenu', dismiss, true); window.removeEventListener('resize', layout); window.removeEventListener('blur', layout); };
  }, [x, y]);
  return createPortal(<div ref={ref} className="timeline-context-menu" role="menu" aria-label="Timeline actions" style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}><div className="timeline-context-title">{title}</div>{actions.map(action => <div key={action.label} className={action.divider ? 'context-divider' : undefined}><button role="menuitem" aria-label={action.label} disabled={action.disabled} title={action.reason} className={action.danger ? 'danger' : undefined} onClick={() => { close(true); action.run(); }}><action.icon size={15} /><span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}{action.checked !== undefined && <span aria-hidden="true">{action.checked ? '✓' : ''}</span>}</button></div>)}</div>, document.body);
}
