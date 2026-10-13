import type { FrameCommand } from '../components/CommandPalette';
import type { Editor } from './useEditor';
import type { Projects } from './useProjects';
import { availableEffects, effectLibrary, type EffectId } from '../core/effect-library';
import { existingEffectTarget } from '../core/effect-actions';
interface Actions {
  workspaceBusy: boolean;
  importFiles: () => void;
  importFolder: () => void;
  folderSupported: boolean;
  url: () => void;
  edit: () => void;
  convert: () => void;
  settings: () => void;
  openProject: () => void;
  effects: () => void;
  exportSettings: () => void;
  applyEffect: (id: EffectId) => void;
  extractAudio?: () => void;
  insertMedia?: (id: string) => void;
  layerMedia?: (id: string) => void;
  contactSheet: () => void;
  scenes: () => void;
  merge: () => void;
  batch: () => void;
  timelineAvailable: boolean;
  resetLayout: () => void;
  shortcuts: () => void;
}
export function frameCommands(
  editor: Editor,
  projects: Projects,
  actions: Actions,
): FrameCommand[] {
  const busy =
    actions.workspaceBusy || editor.busy ? 'Wait for the current operation to finish' : undefined;
  const media = busy || (!editor.asset ? 'Import media first' : undefined);
  const video = media || (editor.asset?.kind !== 'video' ? 'Select a video first' : undefined);
  const editing = (run: () => void) => () => {
    actions.edit();
    run();
  };
  return [
    {
      id: 'import',
      label: 'Import media files',
      description: 'Add images, video and audio to the current workflow',
      group: 'Import',
      shortcut: 'Ctrl / ⌘ O',
      keywords: 'upload add songs',
      disabled: busy,
      run: actions.importFiles,
    },
    {
      id: 'folder',
      label: 'Import a folder',
      description: 'Add an entire media collection',
      group: 'Import',
      keywords: 'directory albums bulk songs photos',
      disabled:
        busy ||
        (!actions.folderSupported ? 'Folder selection is unavailable in this browser' : undefined),
      run: actions.importFolder,
    },
    {
      id: 'url',
      label: 'Load from URL',
      description:
        editor.platform === 'desktop'
          ? 'Load a direct media or YouTube link'
          : 'Load a direct media link',
      group: 'Import',
      keywords: 'download link',
      disabled: busy,
      run: actions.url,
    },
    {
      id: 'editor',
      label: 'Open editor workspace',
      description: 'Trim, arrange and refine your media',
      group: 'Workspace',
      disabled: busy,
      run: actions.edit,
    },
    {
      id: 'convert',
      label: 'Open conversion workspace',
      description: 'Convert files or folders in bulk',
      group: 'Workspace',
      keywords: 'transcode format batch',
      disabled: busy,
      run: actions.convert,
    },
    {
      id: 'settings',
      label: 'Open settings',
      description: 'Appearance, preferences and desktop integrations',
      group: 'Workspace',
      keywords:
        'theme light dark waveform disable autosave notifications watch folders recent history shell menu',
      run: actions.settings,
    },
    {
      id: 'layout',
      label: 'Reset panel layout',
      description: 'Restore the editor panel sizes',
      group: 'Workspace',
      keywords: 'islands resize',
      disabled: !actions.timelineAvailable ? 'Open the editor workspace first' : undefined,
      run: actions.resetLayout,
    },
    {
      id: 'project-open',
      label: 'Open a project',
      description: 'Relink media and restore saved edits',
      group: 'Projects',
      disabled: busy || (projects.saving ? 'Finish saving first' : undefined),
      run: editing(actions.openProject),
    },
    {
      id: 'project-save',
      label: 'Save project',
      description: 'Save all source recipes in a portable project file',
      group: 'Projects',
      disabled: media || (projects.saving ? 'Finish saving first' : undefined),
      run: () => {
        void projects.save();
      },
    },
    {
      id: 'undo',
      label: 'Undo editor change',
      description: 'Undo the last change for the selected source',
      group: 'Editing',
      shortcut: 'Ctrl / ⌘ Z',
      disabled: busy || (!editor.canUndo ? 'No change to undo' : undefined),
      run: editing(editor.undo),
    },
    {
      id: 'redo',
      label: 'Redo editor change',
      description: 'Restore the last undone change',
      group: 'Editing',
      shortcut: 'Ctrl / ⌘ Shift Z',
      disabled: busy || (!editor.canRedo ? 'No change to redo' : undefined),
      run: editing(editor.redo),
    },
    {
      id: 'effects',
      label: 'Show effects',
      description: 'Browse adjustments, layers and timed media effects',
      group: 'Editing',
      keywords:
        'editing controls crop volume speed voiceover ducking audio filters subtitles recipes',
      disabled: media,
      run: actions.effects,
    },
    {
      id: 'extract-audio',
      label: 'Extract audio to library',
      description: 'Create a separate FLAC source from the selected video',
      group: 'Editing',
      keywords: 'detach separate sound strip',
      disabled: video || (!editor.asset?.hasAudio ? 'This video has no audio stream' : undefined),
      run: editing(() => actions.extractAudio?.()),
    },
    ...editor.assets
      .filter(
        (asset) =>
          asset.id !== editor.selected && asset.kind !== 'image' && editor.asset?.kind !== 'image',
      )
      .map((asset) => ({
        id: `insert-${asset.id}`,
        label: `${asset.kind === 'video' ? 'Insert' : 'Layer'} ${asset.name}`,
        description:
          asset.kind === 'video'
            ? 'Add to the end of the current video sequence'
            : 'Add an audio layer at the playhead',
        group: 'Library',
        keywords: 'insert media append combine audio soundtrack',
        disabled:
          media ||
          (asset.kind === 'video' && editor.asset?.kind !== 'video'
            ? 'Select a video sequence first'
            : undefined),
        run: editing(() => actions.insertMedia?.(asset.id)),
      })),
    ...editor.assets
      .filter(
        (asset) =>
          asset.id !== editor.selected &&
          asset.kind !== 'audio' &&
          editor.asset?.kind !== 'audio' &&
          (editor.asset?.kind === 'video' || asset.kind === 'image'),
      )
      .map((asset) => ({
        id: `visual-layer-${asset.id}`,
        label: `Layer ${asset.name} over current media`,
        description: 'Create an independent picture track at the playhead',
        group: 'Library',
        keywords: 'layer overlay picture video image multitrack',
        disabled: media,
        run: editing(() => actions.layerMedia?.(asset.id)),
      })),
    ...effectLibrary.map((definition) => {
      const variant = editor.asset
        ? availableEffects(editor.asset).find((effect) => effect.id === definition.id)
        : definition;
      const supported = !!variant;
      const effect = variant ?? definition;
      const existing =
        editor.asset && editor.edit
          ? existingEffectTarget(editor.edit, editor.asset, effect, null)
          : null;
      return {
        id: `effect-${effect.id}`,
        label: `${existing ? 'Edit' : 'Add'} ${effect.name}`,
        description: effect.description,
        group: editor.asset?.kind === 'image' ? 'Image effects' : `${effect.group} effects`,
        keywords: `effect ${effect.id} ${effect.id === 'captions' ? 'subtitles text' : effect.id === 'equalizer' ? 'EQ bass mids treble' : ''}`,
        disabled:
          media ||
          (!supported
            ? effect.group === 'Video'
              ? 'Select a video first'
              : 'This source has no audio'
            : undefined),
        run: editing(() => actions.applyEffect(effect.id)),
      };
    }),
    {
      id: 'scenes',
      label: 'Find scene changes',
      description: 'Review likely scene boundaries and split points',
      group: 'Review',
      keywords: 'detect cuts scan',
      disabled: video,
      run: editing(actions.scenes),
    },
    {
      id: 'contact-sheet',
      label: 'Create video contact sheet',
      description: 'Download a grid of processed frames and timestamps',
      group: 'Review',
      keywords: 'thumbnails storyboard png',
      disabled: video,
      run: editing(actions.contactSheet),
    },
    {
      id: 'export-settings',
      label: 'Show export settings',
      description: 'Format, bitrate, audio delivery, metadata and artwork',
      group: 'Export',
      keywords: 'cover tags palette gif precision channels sample rate chapters',
      disabled: media,
      run: actions.exportSettings,
    },
    {
      id: 'export',
      label: 'Export edited media',
      description: 'Save the selected source with its current recipe',
      group: 'Export',
      disabled: media,
      run: editing(() => {
        void editor.exportMedia();
      }),
    },
    {
      id: 'merge',
      label: 'Merge media files',
      description: 'Arrange imported files into one output',
      group: 'Export',
      keywords: 'join combine concatenate',
      disabled:
        media ||
        (editor.asset?.kind === 'image' ? 'Select a video or audio source to merge' : undefined),
      run: editing(actions.merge),
    },
    {
      id: 'batch',
      label: 'Batch export edits',
      description: 'Export multiple files with editing recipes',
      group: 'Export',
      disabled: media,
      run: editing(actions.batch),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      description: 'See playback and editing shortcuts',
      group: 'Help',
      run: actions.shortcuts,
    },
  ];
}
