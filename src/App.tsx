import { AppFooter } from './components/LoadingBeam';
import { useAppUpdateActivity } from './hooks/useAppUpdates';
import { useLoadingActivity } from './hooks/useLoadingActivity';
import { AudioLayerOverlay } from './components/AudioLayerOverlay';
import { useLibraryInsertion } from './hooks/useLibraryInsertion';
import { TransientMessage } from './components/TransientMessage';
import { availableEffects, type EffectId } from './core/effect-library';
import { EffectSettingsOverlay } from './components/EffectSettingsOverlay';
import { CommandPalette } from './components/CommandPalette';
import { useCommandPalette } from './hooks/useCommandPalette';
import { frameCommands } from './hooks/frame-commands';
import { applyEditorEffect } from './hooks/apply-editor-effect';
import type { InspectorTab } from './components/InspectorTabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Upload, X } from 'lucide-react';
import { ImportInputs } from './components/ImportInputs';
import { seekPreviewTime, hasPreviewClock } from './core/preview-clock';
import { useJoinedPreview } from './hooks/useJoinedPreview';
import { useProxies } from './hooks/useProxies';
import { useAutosave } from './hooks/useAutosave';
import { SceneDetectionDialog } from './components/SceneDetectionDialog';
import { ContactSheetDialog } from './components/ContactSheetDialog';
import { WorkspaceActions } from './components/WorkspaceActions';
import { AppHeader } from './components/AppHeader';
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
import { outputTimeAtSource } from './core/fades';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';
export default function App() {
  useAppUpdateActivity();
  const editor = useEditor();
  const { theme, setTheme } = useTheme();
  const [workflow, setWorkflow] = useState<'edit' | 'convert'>(() => {
    try {
      return localStorage.getItem('frame:workflow') === 'convert' ? 'convert' : 'edit';
    } catch {
      return 'edit';
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('effects');
  const [openEffect, setOpenEffect] = useState<{
    id: EffectId;
    instanceId?: string;
    keepView?: boolean;
  } | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [openLayer, setOpenLayer] = useState<{ id: string; keepView?: boolean } | null>(null);
  const {
    autoWaveforms,
    setAutoWaveforms,
    workspaceAutosave,
    setWorkspaceAutosave,
    timelinePreview,
    setTimelinePreview,
  } = usePreferences();
  const conversion = useConversion(editor);
  const proxies = useProxies(editor);
  const joinedPreview = useJoinedPreview(editor, !settingsOpen && workflow === 'edit');
  const [sheetOpen, setSheetOpen] = useState(false),
    [scenesOpen, setScenesOpen] = useState(false);
  const merge = useMerge(editor);
  const [mergeOpen, setMergeOpen] = useState(false);
  const waves = useWaveforms(editor, !settingsOpen && workflow === 'edit', autoWaveforms);
  const batch = useBatch(editor);
  const [batchOpen, setBatchOpen] = useState(false);
  const projects = useProjects(editor);
  const autosave = useAutosave(editor, projects.name, projects.recovered, workspaceAutosave);
  useLoadingActivity(!!editor.busy, 'Processing media…');
  useLoadingActivity(conversion.busy, 'Converting your files…');
  useLoadingActivity(
    autosave.loading || autosave.clearing || autosave.saving,
    autosave.loading
      ? 'Reopening workspace…'
      : autosave.clearing
        ? 'Clearing workspace…'
        : 'Saving workspace…',
  );
  useLoadingActivity(
    joinedPreview.preparing,
    joinedPreview.effects ? 'Updating effects preview…' : 'Preparing continuous playback…',
  );
  const projectInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderSupported =
    editor.platform === 'desktop' || 'webkitdirectory' in document.createElement('input');
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const preview = useExpandedPreview(
    !settingsOpen && workflow === 'edit' && editor.asset?.kind === 'video',
  );
  useDesktopChrome(preview.expanded);
  const layoutRef = useRef<WorkspaceLayout>(null);
  const [current, setCurrent] = useState(0);
  const [, refreshSeek] = useState(0);
  const insertion = useLibraryInsertion(editor, current);
  const insertMedia = (id: string) => {
    void insertion.insert(id);
  };
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [shortcuts, setShortcuts] = useState(false);
  const commandPalette = useCommandPalette(() => mediaRef.current?.pause());
  function onImport() {
    if (autosave.loading || autosave.clearing) return;
    if (editor.platform === 'desktop') void editor.importMedia();
    else input.current?.click();
  }
  function onUrl() {
    if (autosave.loading || autosave.clearing) return;
    mediaRef.current?.pause();
    setUrlOpen(true);
  }
  function onFolder() {
    if (autosave.loading || autosave.clearing) return;
    if (editor.platform === 'desktop') void editor.importFolder();
    else folderInput.current?.click();
  }
  function changeWorkflow(next: 'edit' | 'convert') {
    setSettingsOpen(false);
    mediaRef.current?.pause();
    setWorkflow(next);
    try {
      localStorage.setItem('frame:workflow', next);
    } catch {
      /* Session navigation still works. */
    }
  }
  function showInspector(tab: InspectorTab) {
    changeWorkflow('edit');
    if (preview.expanded) preview.toggle();
    setInspectorTab(tab);
  }
  async function clearLibrary() {
    if (conversion.busy || projects.saving || autosave.loading || autosave.clearing || editor.busy)
      return;
    mediaRef.current?.pause();
    setCurrent(0);
    if (await autosave.clear()) {
      conversion.clear();
      batch.clear();
      projects.reset();
      editor.setNotice('Media library cleared. Your original files are unchanged.');
    }
  }
  const libraryBusy = autosave.loading || autosave.clearing || conversion.busy || projects.saving;
  const commands = frameCommands(editor, projects, {
    workspaceBusy: libraryBusy,
    importFiles: () => {
      changeWorkflow(workflow);
      onImport();
    },
    importFolder: () => {
      changeWorkflow(workflow);
      onFolder();
    },
    folderSupported,
    url: onUrl,
    edit: () => changeWorkflow('edit'),
    convert: () => changeWorkflow('convert'),
    settings: () => {
      mediaRef.current?.pause();
      setSettingsOpen(true);
    },
    openProject: () => projectInput.current?.click(),
    effects: () => showInspector('effects'),
    exportSettings: () => showInspector('export'),
    extractAudio: () => {
      void insertion.extractAudio();
    },
    insertMedia,
    applyEffect: (id) => {
      showInspector('effects');
      try {
        const applied = applyEditorEffect(editor, id, current);
        if (applied) setOpenEffect({ id, instanceId: applied.instanceId });
      } catch (error) {
        editor.setNotice((error as Error).message);
      }
    },
    contactSheet: () => setSheetOpen(true),
    scenes: () => setScenesOpen(true),
    merge: () => setMergeOpen(true),
    batch: () => setBatchOpen(true),
    timelineAvailable: !settingsOpen && workflow === 'edit',
    resetLayout: () => layoutRef.current?.reset(),
    shortcuts: () => setShortcuts(true),
  });
  useDesktopLaunches(
    editor,
    changeWorkflow,
    autosave.loading ||
      autosave.clearing ||
      commandPalette.open ||
      conversion.archive.busy ||
      !!projects.pending ||
      batchOpen ||
      mergeOpen ||
      sheetOpen ||
      scenesOpen ||
      urlOpen ||
      !!openEffect ||
      !!openLayer,
    (ids, append) =>
      conversion.setIds((current) => (append ? [...new Set([...current, ...ids])] : ids)),
  );
  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (autosave.loading || autosave.clearing) return;
    commandPalette.close();
    dragDepth.current = 0;
    setDragging(false);
    setSettingsOpen(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 1 && files[0].name.endsWith('.frame.json')) {
      changeWorkflow('edit');
      void projects.open(files[0]);
    } else if (editor.platform === 'desktop') {
      if (files.length) void editor.importMedia(files);
    } else {
      try {
        const selected = await droppedFiles(event.dataTransfer);
        if (selected.length) void editor.importMedia(selected);
      } catch (error) {
        editor.setNotice(
          error instanceof Error
            ? error.message
            : 'Could not read the dropped folder. Try Add folder instead.',
        );
      }
    }
  }
  useEffect(() => {
    setOpenEffect(null);
    setOpenLayer(null);
  }, [editor.asset?.id]);
  useEffect(() => {
    if (workflow !== 'edit' || settingsOpen) {
      setOpenEffect(null);
      setOpenLayer(null);
    }
  }, [workflow, settingsOpen]);
  const seek = useCallback((value: number, output?: number) => {
    if (mediaRef.current) seekPreviewTime(mediaRef.current, value, output);
    setCurrent(value);
    refreshSeek((version) => version + 1);
  }, []);
  const outputPosition = editor.edit
    ? outputTimeAtSource(
        editor.edit,
        current,
        mediaRef.current && hasPreviewClock(mediaRef.current)
          ? mediaRef.current.currentTime
          : undefined,
      )
    : 0;
  useEditorShortcuts({
    editor,
    current,
    workflow,
    settingsOpen,
    mediaRef,
    onImport,
    seek,
    blocked: !!(
      shortcuts ||
      projects.pending ||
      batchOpen ||
      mergeOpen ||
      urlOpen ||
      openEffect ||
      openLayer
    ),
  });
  return (
    <div
      className={`app-shell workflow-${workflow}${preview.expanded ? ' preview-expanded' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => void onDrop(event)}
    >
      <AppHeader
        workflow={workflow}
        settingsOpen={settingsOpen}
        conversionBusy={conversion.busy}
        importBusy={libraryBusy || !!editor.busy}
        platform={editor.platform}
        changeWorkflow={changeWorkflow}
        showCommands={commandPalette.show}
        onImport={onImport}
        toggleSettings={() => {
          mediaRef.current?.pause();
          setSettingsOpen((value) => !value);
        }}
      >
        {!settingsOpen && workflow === 'edit' && (
          <WorkspaceActions
            extractAudio={() => {
              mediaRef.current?.pause();
              void insertion.extractAudio();
            }}
            canExtractAudio={editor.asset?.kind === 'video' && editor.asset.hasAudio}
            projectName={projects.name}
            scenes={() => {
              mediaRef.current?.pause();
              setScenesOpen(true);
            }}
            hasVideo={editor.asset?.kind === 'video'}
            contactSheet={() => {
              mediaRef.current?.pause();
              setSheetOpen(true);
            }}
            hasMedia={!!editor.asset}
            busy={!!editor.busy}
            saving={projects.saving}
            merge={() => setMergeOpen(true)}
            batch={() => setBatchOpen(true)}
            open={() => projectInput.current?.click()}
            save={() => void projects.save()}
            resetLayout={() => layoutRef.current?.reset()}
          />
        )}
      </AppHeader>
      {settingsOpen ? (
        <SettingsPage
          timelinePreview={timelinePreview}
          setTimelinePreview={setTimelinePreview}
          theme={theme}
          setTheme={setTheme}
          autoWaveforms={autoWaveforms}
          setAutoWaveforms={setAutoWaveforms}
          workspaceAutosave={workspaceAutosave}
          setWorkspaceAutosave={setWorkspaceAutosave}
          back={() => setSettingsOpen(false)}
        />
      ) : workflow === 'convert' ? (
        <ConversionWorkspace
          editor={editor}
          conversion={conversion}
          onFiles={onImport}
          onFolder={onFolder}
          onUrl={onUrl}
          onClear={() => void clearLibrary()}
          clearDisabled={libraryBusy}
          folderSupported={folderSupported}
        />
      ) : (
        <EditorWorkspace
          ref={layoutRef}
          expanded={preview.expanded}
          hasMedia={!!editor.asset && !!editor.edit}
          library={
            <Library
              onInsert={insertMedia}
              editor={editor}
              onImport={onImport}
              onUrl={onUrl}
              onClear={() => void clearLibrary()}
              clearDisabled={libraryBusy}
              hasSavedWorkspace={!!autosave.savedAt || !!autosave.error}
            />
          }
          inspector={
            <Inspector
              openEffect={(id, instanceId) => {
                mediaRef.current?.pause();
                setOpenLayer(null);
                setOpenEffect({ id, instanceId });
              }}
              openCaption={(instanceId) => {
                mediaRef.current?.pause();
                setOpenLayer(null);
                setOpenEffect({ id: 'captions', instanceId });
              }}
              current={current}
              tab={inspectorTab}
              setTab={setInspectorTab}
              proxies={proxies}
              editor={editor}
              seek={seek}
            />
          }
          preview={
            editor.asset && editor.edit ? (
              <Preview
                selectedEffect={openEffect}
                openEffect={(id, instanceId) => {
                  mediaRef.current?.pause();
                  setOpenLayer(null);
                  setOpenEffect({ id, instanceId, keepView: true });
                }}
                assets={editor.assets}
                selectedClip={editor.selectedClip}
                expanded={preview.expanded}
                toggleExpanded={preview.toggle}
                panelRef={preview.panel}
                previewUrl={joinedPreview.proxy?.url ?? proxies.proxy?.url}
                previewRanges={joinedPreview.ranges}
                previewProcessed={joinedPreview.processed}
                effectsRequested={joinedPreview.effects}
                previewStale={joinedPreview.stale}
                preparing={joinedPreview.preparing}
                previewError={joinedPreview.error}
                retryPreview={joinedPreview.retry}
                asset={editor.asset}
                edit={editor.edit}
                mediaRef={mediaRef}
                current={current}
                setCurrent={setCurrent}
                update={editor.update}
                disabled={!!editor.busy}
              />
            ) : null
          }
          timeline={
            editor.asset && editor.edit ? (
              <Timeline
                outputPosition={outputPosition}
                onInsert={insertMedia}
                openAudioLayer={(id, keepView) => {
                  setOpenEffect(null);
                  setOpenLayer({ id, keepView });
                }}
                timelinePreview={timelinePreview}
                openEffect={(id, instanceId, keepView) => {
                  mediaRef.current?.pause();
                  setOpenLayer(null);
                  setOpenEffect({ id, instanceId, keepView });
                }}
                generatingId={waves.generatingId}
                assets={editor.assets}
                waveforms={waves.all}
                selectedClip={editor.selectedClip}
                selectClip={editor.selectClip}
                autoWaveforms={autoWaveforms}
                waveformLoading={waves.loading}
                waveformError={waves.error}
                cancelAnalysis={waves.loading ? waves.cancel : editor.cancel}
                waveform={waves.points}
                retryWaveform={() => void waves.generate()}
                analysisProgress={waves.progress}
                asset={editor.asset}
                edit={editor.edit}
                current={current}
                seek={seek}
                update={editor.update}
                undo={editor.undo}
                redo={editor.redo}
                canUndo={editor.canUndo}
                canRedo={editor.canRedo}
                disabled={!!editor.busy}
                notify={editor.setNotice}
              />
            ) : null
          }
          empty={
            <EmptyState busy={libraryBusy || !!editor.busy} onImport={onImport} onUrl={onUrl} />
          }
        />
      )}
      <AppFooter>
        {!settingsOpen &&
          (workflow === 'edit' ? (
            <button onClick={() => setShortcuts(true)}>
              <Keyboard size={14} />
              Keyboard shortcuts
            </button>
          ) : (
            <button disabled={conversion.busy} onClick={onImport}>
              <Keyboard size={14} />
              Ctrl / Cmd O to add files
            </button>
          ))}
        {workflow === 'edit' && (
          <span
            className="footer-version"
            aria-label="Autosave status"
            title={workspaceAutosave ? autosave.error || undefined : undefined}
          >
            {autosave.loading
              ? 'Reopening workspace…'
              : autosave.clearing
                ? 'Clearing workspace…'
                : !workspaceAutosave
                  ? 'Autosave off'
                  : autosave.error
                    ? 'Autosave paused'
                    : autosave.saving
                      ? 'Saving workspace…'
                      : autosave.savedAt
                        ? 'Workspace autosaved'
                        : 'Autosave ready'}
          </span>
        )}
      </AppFooter>
      {editor.notice && (
        <TransientMessage
          key={editor.noticeVersion}
          className="toast"
          expire={() => editor.setNotice('')}
        >
          <span>{editor.notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => editor.setNotice('')}
          >
            <X size={16} />
          </button>
        </TransientMessage>
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={36} />
          <h2>
            {workflow === 'convert' ? 'Drop your collection here.' : 'Drop it. Make it yours.'}
          </h2>
          <p>Video and audio files & folders welcome.</p>
        </div>
      )}
      <ImportInputs
        fileInput={input}
        folderInput={folderInput}
        projectInput={projectInput}
        importFiles={editor.importMedia}
        importFolder={editor.importFolder}
        openProject={projects.open}
      />
      {openEffect &&
        editor.asset &&
        editor.edit &&
        availableEffects(editor.asset).some((effect) => effect.id === openEffect.id) && (
          <EffectSettingsOverlay
            key={`${editor.asset.id}-${openEffect.id}-${openEffect.instanceId ?? 'primary'}`}
            id={openEffect.id}
            instanceId={openEffect.instanceId}
            keepView={openEffect.keepView}
            editor={editor}
            current={current}
            seek={seek}
            close={() => setOpenEffect(null)}
          />
        )}
      {openLayer && editor.asset && editor.edit && (
        <AudioLayerOverlay
          key={`${editor.asset.id}-${openLayer.id}`}
          id={openLayer.id}
          keepView={openLayer.keepView}
          editor={editor}
          close={() => setOpenLayer(null)}
        />
      )}
      <CommandPalette open={commandPalette.open} close={commandPalette.close} commands={commands} />
      <UrlImportDialog open={urlOpen} close={() => setUrlOpen(false)} editor={editor} />
      {scenesOpen && editor.asset && editor.edit && (
        <SceneDetectionDialog editor={editor} seek={seek} close={() => setScenesOpen(false)} />
      )}
      {sheetOpen && editor.asset && editor.edit && (
        <ContactSheetDialog editor={editor} close={() => setSheetOpen(false)} />
      )}
      <MergeDialog
        open={mergeOpen}
        close={() => setMergeOpen(false)}
        editor={editor}
        merge={merge}
      />
      <BatchDialog
        open={batchOpen}
        close={() => setBatchOpen(false)}
        editor={editor}
        batch={batch}
      />
      <ProjectDialog projects={projects} editor={editor} onImport={onImport} />
      <Shortcuts open={shortcuts} close={() => setShortcuts(false)} />
    </div>
  );
}
