import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Monitor, Globe, Keyboard, Upload, X, LoaderCircle, FolderOpen, Save } from 'lucide-react';
import { acceptMedia } from './core/types';
import { useEditor } from './hooks/useEditor';
import { useTheme, type Theme } from './hooks/useTheme';
import { useProjects } from './hooks/useProjects';
import { ProjectDialog } from './components/ProjectDialog';
import { Library } from './components/Library';
import { EmptyState } from './components/EmptyState';
import { Inspector } from './components/Inspector';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { Shortcuts } from './components/Shortcuts';
export default function App() {
  const editor = useEditor(); const { theme, setTheme } = useTheme();
  const projects = useProjects(editor);
  const projectInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [shortcuts, setShortcuts] = useState(false);
  function onImport() { if (editor.platform === 'desktop') void editor.importMedia(); else input.current?.click(); }
  function seek(value: number) { setCurrent(value); if (mediaRef.current) mediaRef.current.currentTime = value; }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (event.target as HTMLElement)?.isContentEditable || shortcuts || projects.pending) return;
      const modified = event.metaKey || event.ctrlKey;
      if (modified && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!editor.busy) onImport(); }
      if (modified && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (!editor.edit || editor.busy || modified || event.altKey) return;
      if (event.code === 'Space' && tag !== 'BUTTON') { event.preventDefault(); const media = mediaRef.current; if (media) { if (media.paused) { if (media.currentTime < editor.edit.start || media.currentTime >= editor.edit.end) media.currentTime = editor.edit.start; void media.play().catch(() => {}); } else media.pause(); } }
      if (event.key.toLowerCase() === 'i') editor.update({ start: Math.min(current, editor.edit.end - 0.05) });
      if (event.key.toLowerCase() === 'o') editor.update({ end: Math.max(current, editor.edit.start + 0.05) });
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="app-shell" onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); const files = Array.from(event.dataTransfer.files); if (files.length === 1 && files[0].name.endsWith('.frame.json')) void projects.open(files[0]); else if (files.length) void editor.importMedia(files); }}>
    <header className="app-header"><a className="brand" href="#" aria-label="Frame home" onClick={event => event.preventDefault()}><span className="brand-mark"><Clapperboard size={20} strokeWidth={1.75} /></span>frame<span className="brand-dot">.</span></a><span className="header-divider" /><span className="header-title">Your media, thoughtfully edited.</span>
      <div className="header-right"><span className="platform-badge">{editor.platform === 'desktop' ? <Monitor size={13} /> : <Globe size={13} />}{editor.platform === 'desktop' ? 'Desktop' : 'Web editor'}<i /></span><label className="theme-picker"><span className="sr-only">Theme</span><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">System theme</option><option value="light">Light theme</option><option value="dark">Dark theme</option><option value="midnight">Midnight theme</option></select></label><button className="button subtle small header-import" onClick={onImport} disabled={!!editor.busy}><Upload size={14} />Import</button></div>
    </header>
    <div className="workspace-bar"><div><span className="status-dot" /><strong>Workspace</strong><span className="workspace-subtitle">{projects.name || 'Local session'}</span></div><div className="workspace-actions"><button className="button subtle small" disabled={!!editor.busy || projects.saving} onClick={() => projectInput.current?.click()}><FolderOpen size={14} /><span>Open project</span></button><button className="button subtle small" disabled={!editor.asset || !!editor.busy || projects.saving} onClick={() => void projects.save()}><Save size={14} /><span>Save project</span></button></div></div>
    <main className="workspace"><Library editor={editor} onImport={onImport} /><div className="editor-center">{editor.asset && editor.edit ? <><Preview asset={editor.asset} edit={editor.edit} mediaRef={mediaRef} current={current} setCurrent={setCurrent} update={editor.update} disabled={!!editor.busy} /><Timeline asset={editor.asset} edit={editor.edit} current={current} seek={seek} update={editor.update} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} disabled={!!editor.busy} notify={editor.setNotice} /></> : <EmptyState busy={!!editor.busy} onImport={onImport} onSample={() => void editor.importMedia(undefined, true)} />}</div><Inspector editor={editor} current={current} /></main>
    <footer className="app-footer"><span><span className="status-dot" />{editor.busy === 'import' ? 'Loading the media engine & reading your files…' : editor.busy === 'export' ? 'Processing locally…' : 'All processing happens on your device'}</span><button onClick={() => setShortcuts(true)}><Keyboard size={14} />Keyboard shortcuts</button><span className="footer-version">FRAME / 0.1</span></footer>
    {editor.notice && <div className="toast" role="status"><span>{editor.notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => editor.setNotice('')}><X size={16} /></button></div>}
    {editor.busy === 'import' && <div className="import-status" role="status"><LoaderCircle className="spinner" size={18} /><span>Preparing your media…<small>First browser import loads the local processing engine.</small></span></div>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><h2>Drop it. Make it yours.</h2><p>Video and audio files welcome.</p></div>}
    <input ref={input} className="sr-only" type="file" aria-label="Choose media files" accept={acceptMedia} multiple onChange={event => { if (event.target.files?.length) void editor.importMedia(Array.from(event.target.files)); event.target.value = ''; }} />
    <input ref={projectInput} className="sr-only" type="file" aria-label="Choose project file" accept=".json" onChange={event => { const file = event.target.files?.[0]; if (file) void projects.open(file); event.target.value = ''; }} />
    <ProjectDialog projects={projects} editor={editor} onImport={onImport} />
    <Shortcuts open={shortcuts} close={() => setShortcuts(false)} />
  </div>;
}
