import { useEffect, useRef } from 'react';
import { ChevronDown, Combine, FolderOpen, Layers, Save, PanelsTopLeft, Grid2X2, ScanLine, AudioLines } from 'lucide-react';
export function WorkspaceActions({ projectName, hasMedia, busy, saving, merge, batch, open, save, resetLayout, contactSheet, hasVideo, scenes, extractAudio, canExtractAudio }: {
  extractAudio: () => void; canExtractAudio: boolean;
  projectName: string;
  scenes: () => void;
  contactSheet: () => void; hasVideo: boolean;
  hasMedia: boolean; busy: boolean; saving: boolean;
  merge: () => void; batch: () => void; open: () => void; save: () => void;
  resetLayout: () => void;
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
      if (event.key === 'Escape' && event.currentTarget.open) { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
      <summary className="button small" aria-label="Project tools" title="Project tools"><FolderOpen className="project-tools-icon" size={16} /><span className="project-tools-label">Project tools</span><ChevronDown className="project-tools-chevron" size={14} /></summary>
      <div className="workspace-tools-menu">
        {projectName && <p className="project-menu-name" title={projectName}>{projectName}</p>}
        <button disabled={busy || saving} onClick={() => run(open)}><FolderOpen size={16} />Open project</button>
        <button disabled={!hasMedia || busy} onClick={() => run(merge)}><Combine size={16} />Merge clips</button>
        <button disabled={!canExtractAudio || busy} onClick={() => run(extractAudio)}><AudioLines size={16} />Extract audio</button>
        <button disabled={!hasVideo || busy} onClick={() => run(scenes)}><ScanLine size={16} />Find scene changes</button>
        <button disabled={!hasVideo || busy} onClick={() => run(contactSheet)}><Grid2X2 size={16} />Video contact sheet</button>
        <button disabled={!hasMedia || busy} onClick={() => run(batch)}><Layers size={16} />Batch export</button>
        <button onClick={() => run(resetLayout)}><PanelsTopLeft size={16} />Reset panel layout</button>
      </div>
    </details>
    <button className="button subtle small project-save" aria-label="Save project" title={projectName ? `Save project — ${projectName}` : 'Save project'} disabled={!hasMedia || busy || saving} onClick={save}><Save size={16} /><span className="project-save-label">Save project</span></button>
  </div>;
}
