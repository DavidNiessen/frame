import { addMarker } from '../core/markers';
import type { FrameCommand } from '../components/CommandPalette';
import type { Editor } from './useEditor';
import type { Projects } from './useProjects';
interface Actions {
  workspaceBusy: boolean; importFiles: () => void; importFolder: () => void; folderSupported: boolean; url: () => void;
  edit: () => void; convert: () => void; settings: () => void; openProject: () => void;
  editControls: () => void; effects: () => void; exportSettings: () => void;
  contactSheet: () => void; scenes: () => void; merge: () => void; batch: () => void;
  waveform: () => void; waveformBusy: boolean; timelineAvailable: boolean; resetLayout: () => void; shortcuts: () => void;
}
export function frameCommands(editor: Editor, projects: Projects, current: number, actions: Actions): FrameCommand[] {
  const busy = actions.workspaceBusy ? 'Wait for the current operation to finish' : undefined;
  const media = busy || (!editor.asset ? 'Import media first' : undefined);
  const video = media || (editor.asset?.kind !== 'video' ? 'Select a video first' : undefined);
  const editing = (run: () => void) => () => { actions.edit(); run(); };
  return [
    { id: 'import', label: 'Import media files', description: 'Add videos and audio to the current workflow', group: 'Import', shortcut: 'Ctrl / ⌘ O', keywords: 'upload add songs', disabled: busy, run: actions.importFiles },
    { id: 'folder', label: 'Import a folder', description: 'Add an entire media collection', group: 'Import', keywords: 'directory albums bulk songs', disabled: busy || (!actions.folderSupported ? 'Folder selection is unavailable in this browser' : undefined), run: actions.importFolder },
    { id: 'url', label: 'Load from URL', description: editor.platform === 'desktop' ? 'Load a direct media or YouTube link' : 'Load a direct media link', group: 'Import', keywords: 'download link', disabled: busy, run: actions.url },
    { id: 'editor', label: 'Open editor workspace', description: 'Trim, arrange and refine your media', group: 'Workspace', disabled: busy, run: actions.edit },
    { id: 'convert', label: 'Open conversion workspace', description: 'Convert files or folders in bulk', group: 'Workspace', keywords: 'transcode format batch', disabled: busy, run: actions.convert },
    { id: 'settings', label: 'Open settings', description: 'Appearance, preferences and desktop integrations', group: 'Workspace', keywords: 'theme light dark waveform disable autosave notifications watch folders recent history shell menu', run: actions.settings },
    { id: 'layout', label: 'Reset panel layout', description: 'Restore the editor panel sizes', group: 'Workspace', keywords: 'islands resize', disabled: !actions.timelineAvailable ? 'Open the editor workspace first' : undefined, run: actions.resetLayout },
    { id: 'project-open', label: 'Open a project', description: 'Relink media and restore saved edits', group: 'Projects', disabled: busy || (projects.saving ? 'Finish saving first' : undefined), run: editing(actions.openProject) },
    { id: 'project-save', label: 'Save project', description: 'Save all source recipes in a portable project file', group: 'Projects', disabled: media || (projects.saving ? 'Finish saving first' : undefined), run: () => { void projects.save(); } },
    { id: 'undo', label: 'Undo editor change', description: 'Undo the last change for the selected source', group: 'Editing', shortcut: 'Ctrl / ⌘ Z', disabled: busy || (!editor.canUndo ? 'No change to undo' : undefined), run: editing(editor.undo) },
    { id: 'redo', label: 'Redo editor change', description: 'Restore the last undone change', group: 'Editing', shortcut: 'Ctrl / ⌘ Shift Z', disabled: busy || (!editor.canRedo ? 'No change to redo' : undefined), run: editing(editor.redo) },
    { id: 'edit-controls', label: 'Show editing controls', description: 'Trim, crop and adjust the selected clip', group: 'Editing', disabled: media, run: actions.editControls },
    { id: 'effects', label: 'Show effects', description: 'Volume, speed, music, color, captions and overlays', group: 'Editing', keywords: 'voiceover ducking audio filters subtitles recipes', disabled: media, run: actions.effects },
    { id: 'marker', label: 'Add timeline marker', description: 'Bookmark the current moment for navigation or chapters', group: 'Review', shortcut: 'M', disabled: media || (!actions.timelineAvailable ? 'Open the editor workspace first' : undefined), run: editing(() => { if (!editor.edit) return; try { editor.update({ markers: addMarker(editor.edit, current) }); } catch (error) { editor.setNotice((error as Error).message); } }) },
    { id: 'waveform', label: 'Generate audio waveform', description: 'Analyze peaks for the selected source', group: 'Review', disabled: media || (!editor.asset?.hasAudio ? 'This source has no audio' : actions.waveformBusy ? 'Waveform analysis is already running' : undefined), run: editing(actions.waveform) },
    { id: 'scenes', label: 'Find scene changes', description: 'Review likely scene boundaries and split points', group: 'Review', keywords: 'detect cuts scan', disabled: video, run: editing(actions.scenes) },
    { id: 'contact-sheet', label: 'Create video contact sheet', description: 'Download a grid of processed frames and timestamps', group: 'Review', keywords: 'thumbnails storyboard png', disabled: video, run: editing(actions.contactSheet) },
    { id: 'export-settings', label: 'Show export settings', description: 'Format, bitrate, audio delivery, metadata and artwork', group: 'Export', keywords: 'cover tags palette gif precision channels sample rate chapters', disabled: media, run: actions.exportSettings },
    { id: 'export', label: 'Export edited media', description: 'Save the selected source with its current recipe', group: 'Export', disabled: media, run: editing(() => { void editor.exportMedia(); }) },
    { id: 'merge', label: 'Merge media files', description: 'Arrange imported files into one output', group: 'Export', keywords: 'join combine concatenate', disabled: media, run: editing(actions.merge) },
    { id: 'batch', label: 'Batch export edits', description: 'Export multiple files with editing recipes', group: 'Export', disabled: media, run: editing(actions.batch) },
    { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'See playback and editing shortcuts', group: 'Help', run: actions.shortcuts },
  ];
}
