import { useEffect, useRef } from 'react';
import { ChevronDown, Combine, FolderOpen, Layers, Save } from 'lucide-react';
export function WorkspaceActions({ hasMedia, busy, saving, merge, batch, open, save }: {
  hasMedia: boolean; busy: boolean; saving: boolean;
  merge: () => void; batch: () => void; open: () => void; save: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  function run(action: () => void) { if (menu.current) menu.current.open = false; action(); }
  return <div className="workspace-actions">
    <details className="workspace-tools" ref={menu} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
      <summary className="button small">Project tools<ChevronDown size={14} /></summary>
      <div className="workspace-tools-menu">
        <button disabled={busy || saving} onClick={() => run(open)}><FolderOpen size={16} />Open project</button>
        <button disabled={!hasMedia || busy} onClick={() => run(merge)}><Combine size={16} />Merge clips</button>
        <button disabled={!hasMedia || busy} onClick={() => run(batch)}><Layers size={16} />Batch export</button>
      </div>
    </details>
    <button className="button subtle small" disabled={!hasMedia || busy || saving} onClick={save}><Save size={14} />Save project</button>
  </div>;
}
