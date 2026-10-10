import { searchCommands } from '../core/command-search';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X, ArrowUpRight } from 'lucide-react';
export interface FrameCommand { id: string; label: string; description: string; group: string; keywords?: string; shortcut?: string; disabled?: string; run: () => void }
export function CommandPalette({ open, close, commands }: { open: boolean; close: () => void; commands: FrameCommand[] }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [activeId, setActiveId] = useState('');
  // Reset before the dialog can receive input; a deferred effect could erase a fast search.
  useLayoutEffect(() => { if (open) { setQuery(''); setActiveId(''); dialog.current?.showModal(); input.current?.focus(); } else dialog.current?.close(); }, [open]);
  const matches = open ? searchCommands(commands, query) : [];
  const active = matches.find(command => command.id === activeId) ?? matches[0];
  useEffect(() => { if (open && active) dialog.current?.querySelector<HTMLElement>(`[data-command="${active.id}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active?.id, open, query]);
  function run(command: FrameCommand) { if (command.disabled) return; close(); command.run(); }
  function move(direction: number) { const available = matches.filter(command => !command.disabled); if (!available.length) return; const index = available.findIndex(command => command.id === active?.id); const next = index < 0 ? direction > 0 ? 0 : available.length - 1 : (index + direction + available.length) % available.length; setActiveId(available[next].id); }
  return <dialog ref={dialog} data-command-palette className="command-palette" aria-label="Command palette" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
    <div className="dialog-heading"><h2>Commands</h2><button className="icon-button" aria-label="Close command palette" onClick={close}><X size={17} /></button></div>
    <label className="command-search"><Search size={18} /><input ref={input} role="combobox" maxLength={160} aria-label="Search commands" aria-expanded={open} aria-controls="frame-command-options" aria-activedescendant={active ? `frame-command-${active.id}` : undefined} aria-autocomplete="list" placeholder="Find a tool or action…" value={query} onChange={event => { setQuery(event.target.value); setActiveId(''); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); } else if (event.key === 'Enter') { event.preventDefault(); if (active) run(active); } }} /></label>
    <div className="command-options" id="frame-command-options" role="listbox" aria-label="Available commands">{matches.map((command, index) => <div key={command.id}>{matches[index - 1]?.group !== command.group && <p className="command-group">{command.group}</p>}<button role="option" id={`frame-command-${command.id}`} data-command={command.id} aria-selected={active?.id === command.id} aria-posinset={index + 1} aria-setsize={matches.length} aria-disabled={!!command.disabled} disabled={!!command.disabled} tabIndex={-1} onPointerMove={() => { if (!command.disabled) setActiveId(command.id); }} onClick={() => run(command)}><span><strong>{command.label}</strong><small>{command.disabled || command.description}</small></span>{command.shortcut ? <kbd>{command.shortcut}</kbd> : <ArrowUpRight size={14} />}</button></div>)}</div>
    {!matches.length && <p className="command-empty" role="status">No matching commands. Try “import”, “scene” or “convert”.</p>}
    <p className="command-help"><span>↑ ↓ to move</span><span>Enter to run</span><span>Esc to close</span></p>
  </dialog>;
}
