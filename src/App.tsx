import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Clapperboard, Monitor, Globe, Keyboard, Scissors, Upload, X, LoaderCircle, Settings } from 'lucide-react';
import { acceptMedia } from './core/types';
import { useProxies } from './hooks/useProxies';
import { useAutosave } from './hooks/useAutosave';
import { SceneDetectionDialog } from './components/SceneDetectionDialog';
import { ContactSheetDialog } from './components/ContactSheetDialog';
import { WorkspaceActions } from './components/WorkspaceActions';
import { RecoveryBanner } from './components/RecoveryBanner';
import { useEditor } from './hooks/useEditor';
import { useTheme } from './hooks/useTheme';
import { useMerge } from './hooks/useMerge';
import { MergeDialog } from './components/MergeDialog';
import { useThumbnails } from './hooks/useThumbnails';
import { useWaveforms } from './hooks/useWaveforms';
import { useBatch } from './hooks/useBatch';
import { BatchDialog } from './components/BatchDialog';
import { useProjects } from './hooks/useProjects';
import { ProjectDialog } from './components/ProjectDialog';
import { Library } from './components/Library';
import { EmptyState } from './components/EmptyState';
import { Inspector } from './components/Inspector';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { Shortcuts } from './components/Shortcuts';
import { useConversion } from './hooks/useConversion';
import { ConversionWorkspace } from './components/conversion/ConversionWorkspace';
import { droppedFiles } from './engines/folder-drop';
import { useDesktopLaunches } from './hooks/useDesktopLaunches';
import { SettingsPage } from './components/settings/SettingsPage';
import { UrlImportDialog } from './components/UrlImportDialog';
import { usePreferences } from './hooks/usePreferences';
import { EditorWorkspace, type WorkspaceLayout } from './components/layout/EditorWorkspace';
import { useExpandedPreview } from './hooks/useExpandedPreview';
import { nextPlayableTime } from './core/timeline';
import { addMarker } from './core/markers';
import { skipSeconds, stepFrame } from './core/playhead';
export default function App() {
  const editor = useEditor(); const { theme, setTheme } = useTheme();
  const [workflow, setWorkflow] = useState<'edit' | 'convert'>(() => { try { return localStorage.getItem('frame:workflow') === 'convert' ? 'convert' : 'edit'; } catch { return 'edit'; } });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const { autoWaveforms, setAutoWaveforms, workspaceAutosave, setWorkspaceAutosave } = usePreferences();
  const conversion = useConversion(editor);
  const proxies = useProxies(editor);
  const [sheetOpen, setSheetOpen] = useState(false), [scenesOpen, setScenesOpen] = useState(false);
  const merge = useMerge(editor); const [mergeOpen, setMergeOpen] = useState(false);
  const thumbnails = useThumbnails(editor);
  const waves = useWaveforms(editor, !settingsOpen && workflow === 'edit', autoWaveforms);
  const batch = useBatch(editor); const [batchOpen, setBatchOpen] = useState(false);
  const projects = useProjects(editor);
  const autosave = useAutosave(editor, projects.name, projects.restoreGeneration, workspaceAutosave);
  const projectInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderSupported = editor.platform === 'desktop' || 'webkitdirectory' in document.createElement('input');
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const preview = useExpandedPreview(!settingsOpen && workflow === 'edit' && editor.asset?.kind === 'video');
  const layoutRef = useRef<WorkspaceLayout>(null);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [shortcuts, setShortcuts] = useState(false);
  function onImport() { if (editor.platform === 'desktop') void editor.importMedia(); else input.current?.click(); }
  function onUrl() { mediaRef.current?.pause(); setUrlOpen(true); }
  function onFolder() { if (editor.platform === 'desktop') void editor.importFolder(); else folderInput.current?.click(); }
  function changeWorkflow(next: 'edit' | 'convert') { setSettingsOpen(false); mediaRef.current?.pause(); setWorkflow(next); try { localStorage.setItem('frame:workflow', next); } catch { /* Session navigation still works. */ } }
  useDesktopLaunches(editor, changeWorkflow, conversion.archive.busy || !!projects.pending || batchOpen || mergeOpen || sheetOpen || scenesOpen || urlOpen, (ids, append) => conversion.setIds(current => append ? [...new Set([...current, ...ids])] : ids));
  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault(); dragDepth.current = 0; setDragging(false);
    setSettingsOpen(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 1 && files[0].name.endsWith('.frame.json')) { changeWorkflow('edit'); void projects.open(files[0]); }
    else if (editor.platform === 'desktop') { if (files.length) void editor.importMedia(files); }
    else { try { const selected = await droppedFiles(event.dataTransfer); if (selected.length) void editor.importMedia(selected); } catch (error) { editor.setNotice(error instanceof Error ? error.message : 'Could not read the dropped folder. Try Add folder instead.'); } }
  }
  const seek = useCallback((value: number) => { setCurrent(value); if (mediaRef.current) mediaRef.current.currentTime = value; }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement, tag = target?.tagName;
      const timelinePlayback = event.code === 'Space' && !!target?.closest('#media-timeline') && target.matches('input[type="range"], .range-body, [role="slider"]');
      if (event.defaultPrevented || (!timelinePlayback && ['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(tag)) || target?.isContentEditable || target?.closest('dialog[open]') || settingsOpen || shortcuts || projects.pending || batchOpen || mergeOpen || urlOpen) return;
      const modified = event.metaKey || event.ctrlKey;
      if (modified && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!editor.busy) onImport(); }
      if (workflow === 'convert') return;
      if (modified && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (!editor.edit || editor.busy || modified || event.altKey) return;
      if (event.code === 'Space' && (timelinePlayback || tag !== 'BUTTON')) { event.preventDefault(); if (event.repeat) return; const media = mediaRef.current; if (media) { if (media.paused) { media.currentTime = nextPlayableTime(editor.edit, media.currentTime) ?? editor.edit.start; void media.play().catch(() => {}); } else media.pause(); } }
      if ((event.key === ',' || event.key === '.') && editor.asset && mediaRef.current) { event.preventDefault(); mediaRef.current.pause(); seek(editor.asset.kind === 'video' ? stepFrame(editor.edit, current, editor.asset.frameRate ?? 30, event.key === ',' ? -1 : 1) : skipSeconds(editor.edit, current, event.key === ',' ? -1 : 1)); }
      if (event.key.toLowerCase() === 'm' && !event.repeat) { event.preventDefault(); try { editor.update({ markers: addMarker(editor.edit, current) }); editor.setNotice('Timeline marker added. Double-click it to rename.'); } catch (issue) { editor.setNotice((issue as Error).message); } }
      if (event.key.toLowerCase() === 'i') editor.updateClip({ start: Math.min(current, editor.scopedEdit!.end - 0.05) });
      if (event.key.toLowerCase() === 'o') editor.updateClip({ end: Math.max(current, editor.scopedEdit!.start + 0.05) });
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className={`app-shell workflow-${workflow}${preview.expanded ? ' preview-expanded' : ''}`} onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => void onDrop(event)}>
    <header className="app-header"><a className="brand" href="#" aria-label="Frame home" onClick={event => event.preventDefault()}><span className="brand-mark"><Clapperboard size={20} strokeWidth={1.75} /></span>frame<span className="brand-dot">.</span></a>
      <nav className="workflow-nav" aria-label="Workflow"><button aria-pressed={!settingsOpen && workflow === 'edit'} disabled={conversion.busy} onClick={() => changeWorkflow('edit')}><Scissors size={14} />Editor</button><button aria-pressed={!settingsOpen && workflow === 'convert'} disabled={conversion.busy} onClick={() => changeWorkflow('convert')}><ArrowDownUp size={14} />Convert</button></nav>
      <div className="header-right"><span className="platform-badge">{editor.platform === 'desktop' ? <Monitor size={13} /> : <Globe size={13} />}{editor.platform === 'desktop' ? 'Desktop' : 'Web'}<i /></span><button className="icon-button header-settings" aria-label="Settings" aria-pressed={settingsOpen} title="Settings" onClick={() => { mediaRef.current?.pause(); setSettingsOpen(value => !value); }}><Settings size={18} /></button>{!settingsOpen && workflow === 'edit' && <button className="button subtle small header-import" onClick={onImport} disabled={!!editor.busy}><Upload size={14} />Import</button>}</div>
    </header>
    {!settingsOpen && workflow === 'edit' && <div className="workspace-bar"><div><span className="status-dot" /><strong>Workspace</strong><span className="workspace-subtitle">{projects.name || 'Local session'}</span></div><WorkspaceActions scenes={() => { mediaRef.current?.pause(); setScenesOpen(true); }} hasVideo={editor.asset?.kind === 'video'} contactSheet={() => { mediaRef.current?.pause(); setSheetOpen(true); }} hasMedia={!!editor.asset} busy={!!editor.busy} saving={projects.saving} merge={() => setMergeOpen(true)} batch={() => setBatchOpen(true)} open={() => projectInput.current?.click()} save={() => void projects.save()} resetLayout={() => layoutRef.current?.reset()} /></div>}
    <RecoveryBanner autosave={autosave} disabled={!!editor.busy} restore={() => { if (autosave.recovery) { changeWorkflow('edit'); autosave.prepareRecovery(); projects.loadDocument(autosave.recovery.project); } }} />
    {settingsOpen ? <SettingsPage theme={theme} setTheme={setTheme} autoWaveforms={autoWaveforms} setAutoWaveforms={setAutoWaveforms} workspaceAutosave={workspaceAutosave} setWorkspaceAutosave={setWorkspaceAutosave} back={() => setSettingsOpen(false)} /> : workflow === 'convert' ? <ConversionWorkspace editor={editor} conversion={conversion} onFiles={onImport} onFolder={onFolder} onUrl={onUrl} folderSupported={folderSupported} /> : <EditorWorkspace ref={layoutRef} expanded={preview.expanded} hasMedia={!!editor.asset && !!editor.edit} library={<Library editor={editor} onImport={onImport} onUrl={onUrl} />} inspector={<Inspector proxies={proxies} editor={editor} current={current} seek={seek} />} preview={editor.asset && editor.edit ? <Preview assets={editor.assets} selectedClip={editor.selectedClip} expanded={preview.expanded} toggleExpanded={preview.toggle} panelRef={preview.panel} previewUrl={proxies.proxy?.url} asset={editor.asset} edit={editor.edit} mediaRef={mediaRef} current={current} setCurrent={setCurrent} update={editor.update} disabled={!!editor.busy} /> : null} timeline={editor.asset && editor.edit ? <Timeline generateTrackWaveform={source => void waves.generate(false, source)} generatingId={waves.generatingId} assets={editor.assets} waveforms={waves.all} selectedClip={editor.selectedClip} selectClip={editor.selectClip} autoWaveforms={autoWaveforms} thumbnails={thumbnails.url} generateThumbnails={() => void thumbnails.generate()} thumbnailLoading={thumbnails.loading} thumbnailProgress={thumbnails.progress} waveformLoading={waves.loading} waveformError={waves.error} cancelAnalysis={waves.loading ? waves.cancel : editor.cancel} waveform={waves.points} generateWaveform={() => void waves.generate()} analysisProgress={waves.progress} asset={editor.asset} edit={editor.edit} current={current} seek={seek} update={editor.update} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} disabled={!!editor.busy} notify={editor.setNotice} /> : null} empty={<EmptyState busy={!!editor.busy} onImport={onImport} onUrl={onUrl} onSample={() => void editor.importMedia(undefined, true)} />} />}
    <footer className="app-footer"><span><span className="status-dot" />{editor.busy === 'import' ? urlOpen ? 'Loading media from your link…' : 'Reading your files locally…' : editor.busy === 'export' || editor.busy === 'batch' ? 'Processing locally…' : 'All processing happens on your device'}</span>{!settingsOpen && (workflow === 'edit' ? <button onClick={() => setShortcuts(true)}><Keyboard size={14} />Keyboard shortcuts</button> : <button disabled={conversion.busy} onClick={onImport}><Keyboard size={14} />Ctrl / Cmd O to add files</button>)}{workflow === 'edit' && <span className="footer-version" aria-label="Autosave status">{autosave.loading ? 'Checking autosave…' : autosave.recovery ? 'Recovery pending' : !workspaceAutosave ? 'Autosave off' : autosave.error ? 'Autosave paused' : autosave.saving ? 'Saving workspace…' : autosave.savedAt ? 'Workspace autosaved' : 'Autosave ready'}</span>}</footer>
    {editor.notice && <div className="toast" role="status"><span>{editor.notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => editor.setNotice('')}><X size={16} /></button></div>}
    {editor.busy === 'import' && !urlOpen && workflow === 'edit' && <div className="import-status" role="status"><LoaderCircle className="spinner" size={18} /><span>{editor.progress?.message || 'Preparing your media…'}<small>Reading files locally.</small></span></div>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><h2>{workflow === 'convert' ? 'Drop your collection here.' : 'Drop it. Make it yours.'}</h2><p>Video and audio files & folders welcome.</p></div>}
    <input ref={input} className="sr-only" type="file" aria-label="Choose media files" accept={acceptMedia} multiple onChange={event => { if (event.target.files?.length) void editor.importMedia(Array.from(event.target.files)); event.target.value = ''; }} />
    <input ref={folderInput} className="sr-only" type="file" aria-label="Choose media folder" multiple {...{ webkitdirectory: '' }} onChange={event => { if (event.target.files?.length) void editor.importFolder(Array.from(event.target.files)); event.target.value = ''; }} />
    <input ref={projectInput} className="sr-only" type="file" aria-label="Choose project file" accept=".json" onChange={event => { const file = event.target.files?.[0]; if (file) void projects.open(file); event.target.value = ''; }} />
    <UrlImportDialog open={urlOpen} close={() => setUrlOpen(false)} editor={editor} />
    {scenesOpen && editor.asset && editor.edit && <SceneDetectionDialog editor={editor} seek={seek} close={() => setScenesOpen(false)} />}
    {sheetOpen && editor.asset && editor.edit && <ContactSheetDialog editor={editor} close={() => setSheetOpen(false)} />}
    <MergeDialog open={mergeOpen} close={() => setMergeOpen(false)} editor={editor} merge={merge} />
    <BatchDialog open={batchOpen} close={() => setBatchOpen(false)} editor={editor} batch={batch} />
    <ProjectDialog projects={projects} editor={editor} onImport={onImport} />
    <Shortcuts open={shortcuts} close={() => setShortcuts(false)} />
  </div>;
}
