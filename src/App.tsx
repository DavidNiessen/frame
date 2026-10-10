import { TransientMessage } from './components/TransientMessage';
import { availableEffects, type EffectId } from './core/effect-library';
import { EffectSettingsOverlay } from './components/EffectSettingsOverlay';
import { CommandPalette } from './components/CommandPalette';
import { useCommandPalette } from './hooks/useCommandPalette';
import { frameCommands } from './hooks/frame-commands';
import type { InspectorTab } from './components/InspectorTabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Clapperboard, Monitor, Globe, Keyboard, Scissors, Upload, X, LoaderCircle, Settings, Search } from 'lucide-react';
import { acceptMedia } from './core/types';
import { useProxies } from './hooks/useProxies';
import { useAutosave } from './hooks/useAutosave';
import { SceneDetectionDialog } from './components/SceneDetectionDialog';
import { ContactSheetDialog } from './components/ContactSheetDialog';
import { WorkspaceActions } from './components/WorkspaceActions';
import { HeaderActions } from './components/HeaderActions';
import { useEditor } from './hooks/useEditor';
import { useTheme } from './hooks/useTheme';
import { useMerge } from './hooks/useMerge';
import { MergeDialog } from './components/MergeDialog';
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
import { useDesktopChrome } from './hooks/useDesktopChrome';
import { nextPlayableTime } from './core/timeline';
import { skipSeconds, stepFrame } from './core/playhead';
export default function App() {
  const editor = useEditor(); const { theme, setTheme } = useTheme();
  const [workflow, setWorkflow] = useState<'edit' | 'convert'>(() => { try { return localStorage.getItem('frame:workflow') === 'convert' ? 'convert' : 'edit'; } catch { return 'edit'; } });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('effects');
  const [openEffect, setOpenEffect] = useState<{ id: EffectId; instanceId?: string; keepView?: boolean } | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const { autoWaveforms, setAutoWaveforms, workspaceAutosave, setWorkspaceAutosave } = usePreferences();
  const conversion = useConversion(editor);
  const proxies = useProxies(editor);
  const [sheetOpen, setSheetOpen] = useState(false), [scenesOpen, setScenesOpen] = useState(false);
  const merge = useMerge(editor); const [mergeOpen, setMergeOpen] = useState(false);
  const waves = useWaveforms(editor, !settingsOpen && workflow === 'edit', autoWaveforms);
  const batch = useBatch(editor); const [batchOpen, setBatchOpen] = useState(false);
  const projects = useProjects(editor);
  const autosave = useAutosave(editor, projects.name, projects.recovered, workspaceAutosave);
  const projectInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderSupported = editor.platform === 'desktop' || 'webkitdirectory' in document.createElement('input');
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const preview = useExpandedPreview(!settingsOpen && workflow === 'edit' && editor.asset?.kind === 'video');
  useDesktopChrome(preview.expanded);
  const layoutRef = useRef<WorkspaceLayout>(null);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [shortcuts, setShortcuts] = useState(false);
  const commandPalette = useCommandPalette(() => mediaRef.current?.pause());
  function onImport() { if (autosave.loading || autosave.clearing) return; if (editor.platform === 'desktop') void editor.importMedia(); else input.current?.click(); }
  function onUrl() { if (autosave.loading || autosave.clearing) return; mediaRef.current?.pause(); setUrlOpen(true); }
  function onFolder() { if (autosave.loading || autosave.clearing) return; if (editor.platform === 'desktop') void editor.importFolder(); else folderInput.current?.click(); }
  function changeWorkflow(next: 'edit' | 'convert') { setSettingsOpen(false); mediaRef.current?.pause(); setWorkflow(next); try { localStorage.setItem('frame:workflow', next); } catch { /* Session navigation still works. */ } }
  function showInspector(tab: InspectorTab) { changeWorkflow('edit'); if (preview.expanded) preview.toggle(); setInspectorTab(tab); }
  async function clearLibrary() {
    if (conversion.busy || projects.saving || autosave.loading || autosave.clearing || editor.busy) return;
    mediaRef.current?.pause(); setCurrent(0);
    if (await autosave.clear()) { conversion.clear(); batch.clear(); projects.reset(); editor.setNotice('Media library cleared. Your original files are unchanged.'); }
  }
  const libraryBusy = autosave.loading || autosave.clearing || conversion.busy || projects.saving;
  const commands = frameCommands(editor, projects, {
    workspaceBusy: libraryBusy,
    importFiles: () => { changeWorkflow(workflow); onImport(); }, importFolder: () => { changeWorkflow(workflow); onFolder(); }, folderSupported, url: onUrl,
    edit: () => changeWorkflow('edit'), convert: () => changeWorkflow('convert'), settings: () => { mediaRef.current?.pause(); setSettingsOpen(true); }, openProject: () => projectInput.current?.click(),
    effects: () => showInspector('effects'), exportSettings: () => showInspector('export'),
    contactSheet: () => setSheetOpen(true), scenes: () => setScenesOpen(true), merge: () => setMergeOpen(true), batch: () => setBatchOpen(true),
    waveform: () => { void waves.generate(); }, waveformBusy: !!waves.generatingId, timelineAvailable: !settingsOpen && workflow === 'edit', resetLayout: () => layoutRef.current?.reset(), shortcuts: () => setShortcuts(true),
  });
  useDesktopLaunches(editor, changeWorkflow, autosave.loading || autosave.clearing || commandPalette.open || conversion.archive.busy || !!projects.pending || batchOpen || mergeOpen || sheetOpen || scenesOpen || urlOpen || !!openEffect, (ids, append) => conversion.setIds(current => append ? [...new Set([...current, ...ids])] : ids));
  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault(); if (autosave.loading || autosave.clearing) return; commandPalette.close(); dragDepth.current = 0; setDragging(false);
    setSettingsOpen(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 1 && files[0].name.endsWith('.frame.json')) { changeWorkflow('edit'); void projects.open(files[0]); }
    else if (editor.platform === 'desktop') { if (files.length) void editor.importMedia(files); }
    else { try { const selected = await droppedFiles(event.dataTransfer); if (selected.length) void editor.importMedia(selected); } catch (error) { editor.setNotice(error instanceof Error ? error.message : 'Could not read the dropped folder. Try Add folder instead.'); } }
  }
  useEffect(() => { setOpenEffect(null); }, [editor.asset?.id, workflow, settingsOpen]);
  const seek = useCallback((value: number) => { setCurrent(value); if (mediaRef.current) mediaRef.current.currentTime = value; }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement, tag = target?.tagName;
      const textEntry = target?.matches('textarea, select, input:not([type="range"]):not([type="checkbox"]):not([type="radio"])') || target?.isContentEditable;
      if (event.code === 'Space' && !event.defaultPrevented && !textEntry && !event.metaKey && !event.ctrlKey && !event.altKey && workflow === 'edit' && !settingsOpen && editor.edit && mediaRef.current) {
        event.preventDefault(); if (event.repeat || editor.busy) return;
        const media = mediaRef.current;
        if (media.paused) { media.currentTime = nextPlayableTime(editor.edit, media.currentTime) ?? editor.edit.start; void media.play().catch(() => {}); } else media.pause();
        return;
      }
      if (event.defaultPrevented || ['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(tag) || target?.isContentEditable || target?.closest('dialog[open]') || settingsOpen || shortcuts || projects.pending || batchOpen || mergeOpen || urlOpen || openEffect) return;
      const modified = event.metaKey || event.ctrlKey;
      if (modified && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!editor.busy) onImport(); }
      if (workflow === 'convert') return;
      if (modified && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (!editor.edit || editor.busy || modified || event.altKey) return;
      if ((event.key === ',' || event.key === '.') && editor.asset && mediaRef.current) { event.preventDefault(); mediaRef.current.pause(); seek(editor.asset.kind === 'video' ? stepFrame(editor.edit, current, editor.asset.frameRate ?? 30, event.key === ',' ? -1 : 1) : skipSeconds(editor.edit, current, event.key === ',' ? -1 : 1)); }
      if (event.key.toLowerCase() === 'i') editor.updateClip({ start: Math.min(current, editor.scopedEdit!.end - 0.05) });
      if (event.key.toLowerCase() === 'o') editor.updateClip({ end: Math.max(current, editor.scopedEdit!.start + 0.05) });
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className={`app-shell workflow-${workflow}${preview.expanded ? ' preview-expanded' : ''}`} onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => void onDrop(event)}>
    <header className="app-header"><a className="brand" href="#" aria-label="Frame home" onClick={event => event.preventDefault()}><span className="brand-mark"><Clapperboard size={20} strokeWidth={1.75} /></span>frame<span className="brand-dot">.</span></a>
      <nav className="workflow-nav" aria-label="Workflow"><button aria-pressed={!settingsOpen && workflow === 'edit'} disabled={conversion.busy} onClick={() => changeWorkflow('edit')}><Scissors size={14} />Editor</button><button aria-pressed={!settingsOpen && workflow === 'convert'} disabled={conversion.busy} onClick={() => changeWorkflow('convert')}><ArrowDownUp size={14} />Convert</button></nav>
      <HeaderActions workflow={settingsOpen ? 'settings' : workflow}>
      {!settingsOpen && workflow === 'edit' && <WorkspaceActions projectName={projects.name} scenes={() => { mediaRef.current?.pause(); setScenesOpen(true); }} hasVideo={editor.asset?.kind === 'video'} contactSheet={() => { mediaRef.current?.pause(); setSheetOpen(true); }} hasMedia={!!editor.asset} busy={!!editor.busy} saving={projects.saving} merge={() => setMergeOpen(true)} batch={() => setBatchOpen(true)} open={() => projectInput.current?.click()} save={() => void projects.save()} resetLayout={() => layoutRef.current?.reset()} />}
      <div className="header-right"><span className="platform-badge">{editor.platform === 'desktop' ? <Monitor size={13} /> : <Globe size={13} />}{editor.platform === 'desktop' ? 'Desktop' : 'Web'}<i /></span><button className="icon-button" aria-label="Search commands" title="Search commands (Ctrl / ⌘ K)" onClick={commandPalette.show}><Search size={17} /><span className="header-action-label">Search commands</span></button><button className="icon-button header-settings" aria-label="Settings" aria-pressed={settingsOpen} title="Settings" onClick={() => { mediaRef.current?.pause(); setSettingsOpen(value => !value); }}><Settings size={18} /><span className="header-action-label">Settings</span></button>{!settingsOpen && workflow === 'edit' && <button className="button subtle small header-import" onClick={onImport} disabled={!!editor.busy}><Upload size={14} />Import</button>}</div>
      </HeaderActions>
    </header>
    {settingsOpen ? <SettingsPage theme={theme} setTheme={setTheme} autoWaveforms={autoWaveforms} setAutoWaveforms={setAutoWaveforms} workspaceAutosave={workspaceAutosave} setWorkspaceAutosave={setWorkspaceAutosave} back={() => setSettingsOpen(false)} /> : workflow === 'convert' ? <ConversionWorkspace editor={editor} conversion={conversion} onFiles={onImport} onFolder={onFolder} onUrl={onUrl} onClear={() => void clearLibrary()} clearDisabled={libraryBusy} folderSupported={folderSupported} /> : <EditorWorkspace ref={layoutRef} expanded={preview.expanded} hasMedia={!!editor.asset && !!editor.edit} library={<Library editor={editor} onImport={onImport} onUrl={onUrl} onClear={() => void clearLibrary()} clearDisabled={libraryBusy} hasSavedWorkspace={!!autosave.savedAt || !!autosave.error} />} inspector={<Inspector openEffect={(id, instanceId) => { mediaRef.current?.pause(); setOpenEffect({ id, instanceId }); }} openCaption={instanceId => { mediaRef.current?.pause(); setOpenEffect({ id: 'captions', instanceId }); }} current={current} tab={inspectorTab} setTab={setInspectorTab} proxies={proxies} editor={editor} seek={seek} />} preview={editor.asset && editor.edit ? <Preview selectedEffect={openEffect} openEffect={(id, instanceId) => { mediaRef.current?.pause(); setOpenEffect({ id, instanceId, keepView: true }); }} assets={editor.assets} selectedClip={editor.selectedClip} expanded={preview.expanded} toggleExpanded={preview.toggle} panelRef={preview.panel} previewUrl={proxies.proxy?.url} asset={editor.asset} edit={editor.edit} mediaRef={mediaRef} current={current} setCurrent={setCurrent} update={editor.update} disabled={!!editor.busy} /> : null} timeline={editor.asset && editor.edit ? <Timeline openEffect={(id, instanceId, keepView) => { mediaRef.current?.pause(); setOpenEffect({ id, instanceId, keepView }); }} generateTrackWaveform={source => void waves.generate(false, source)} generatingId={waves.generatingId} assets={editor.assets} waveforms={waves.all} selectedClip={editor.selectedClip} selectClip={editor.selectClip} autoWaveforms={autoWaveforms} waveformLoading={waves.loading} waveformError={waves.error} cancelAnalysis={waves.loading ? waves.cancel : editor.cancel} waveform={waves.points} generateWaveform={() => void waves.generate()} analysisProgress={waves.progress} asset={editor.asset} edit={editor.edit} current={current} seek={seek} update={editor.update} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} disabled={!!editor.busy} notify={editor.setNotice} /> : null} empty={<EmptyState busy={!!editor.busy} onImport={onImport} onUrl={onUrl} onSample={() => void editor.importMedia(undefined, true)} />} />}
    <footer className="app-footer"><span><span className="status-dot" />{editor.busy === 'import' ? urlOpen ? 'Loading media from your link…' : 'Reading your files locally…' : editor.busy === 'export' || editor.busy === 'batch' ? 'Processing locally…' : 'All processing happens on your device'}</span>{!settingsOpen && (workflow === 'edit' ? <button onClick={() => setShortcuts(true)}><Keyboard size={14} />Keyboard shortcuts</button> : <button disabled={conversion.busy} onClick={onImport}><Keyboard size={14} />Ctrl / Cmd O to add files</button>)}{workflow === 'edit' && <span className="footer-version" aria-label="Autosave status" title={workspaceAutosave ? autosave.error || undefined : undefined}>{autosave.loading ? 'Reopening workspace…' : autosave.clearing ? 'Clearing workspace…' : !workspaceAutosave ? 'Autosave off' : autosave.error ? 'Autosave paused' : autosave.saving ? 'Saving workspace…' : autosave.savedAt ? 'Workspace autosaved' : 'Autosave ready'}</span>}</footer>
    {editor.notice && <TransientMessage key={editor.noticeVersion} className="toast" expire={() => editor.setNotice('')}><span>{editor.notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => editor.setNotice('')}><X size={16} /></button></TransientMessage>}
    {editor.busy === 'import' && !urlOpen && workflow === 'edit' && <div className="import-status" role="status"><LoaderCircle className="spinner" size={18} /><span>{editor.progress?.message || 'Preparing your media…'}<small>Reading files locally.</small></span></div>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><h2>{workflow === 'convert' ? 'Drop your collection here.' : 'Drop it. Make it yours.'}</h2><p>Video and audio files & folders welcome.</p></div>}
    <input ref={input} className="sr-only" type="file" aria-label="Choose media files" accept={acceptMedia} multiple onChange={event => { if (event.target.files?.length) void editor.importMedia(Array.from(event.target.files)); event.target.value = ''; }} />
    <input ref={folderInput} className="sr-only" type="file" aria-label="Choose media folder" multiple {...{ webkitdirectory: '' }} onChange={event => { if (event.target.files?.length) void editor.importFolder(Array.from(event.target.files)); event.target.value = ''; }} />
    <input ref={projectInput} className="sr-only" type="file" aria-label="Choose project file" accept=".json" onChange={event => { const file = event.target.files?.[0]; if (file) void projects.open(file); event.target.value = ''; }} />
    {openEffect && editor.asset && editor.edit && availableEffects(editor.asset).some(effect => effect.id === openEffect.id) && <EffectSettingsOverlay key={`${editor.asset.id}-${openEffect.id}-${openEffect.instanceId ?? "primary"}`} id={openEffect.id} instanceId={openEffect.instanceId} keepView={openEffect.keepView} editor={editor} current={current} seek={seek} close={() => setOpenEffect(null)} />}
    <CommandPalette open={commandPalette.open} close={commandPalette.close} commands={commands} />
    <UrlImportDialog open={urlOpen} close={() => setUrlOpen(false)} editor={editor} />
    {scenesOpen && editor.asset && editor.edit && <SceneDetectionDialog editor={editor} seek={seek} close={() => setScenesOpen(false)} />}
    {sheetOpen && editor.asset && editor.edit && <ContactSheetDialog editor={editor} close={() => setSheetOpen(false)} />}
    <MergeDialog open={mergeOpen} close={() => setMergeOpen(false)} editor={editor} merge={merge} />
    <BatchDialog open={batchOpen} close={() => setBatchOpen(false)} editor={editor} batch={batch} />
    <ProjectDialog projects={projects} editor={editor} onImport={onImport} />
    <Shortcuts open={shortcuts} close={() => setShortcuts(false)} />
  </div>;
}
