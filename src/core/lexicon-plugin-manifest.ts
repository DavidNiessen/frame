import {
  LEXICON_ADD,
  LEXICON_EXPORT_FOLDER,
  LEXICON_IMPORT_MODE,
  LEXICON_PRESET,
  LEXICON_RELINK,
} from './lexicon-plugin';

const files = { read: true, write: true, list: true };
const importMode = {
  type: 'dropdown',
  default: LEXICON_RELINK,
  options: [LEXICON_RELINK, LEXICON_ADD],
};

/** config.json of the Lexicon plugin; see https://www.lexicondj.com/docs/developers/plugin */
export const lexiconPluginManifest = {
  id: 'frame.lexicon',
  author: { name: 'Frame', email: 'david@niessen.dev', discordUsername: 'david.niessen' },
  actions: [
    {
      id: 'frame.convert',
      name: 'Convert With Frame',
      description:
        'Converts the selected tracks with a Frame preset, then relinks them to the new files (keeping cues, beatgrids, tags and playlists) or adds them as new tracks. The original files stay on disk.\n\nFrame must be open.',
      config: {
        permissions: {
          track: {
            read: ['selected'],
            modify: ['selected'],
            modifyFields: ['location', 'sizeBytes'],
            create: true,
          },
          files,
        },
        settings: { [LEXICON_IMPORT_MODE]: importMode, [LEXICON_PRESET]: '' },
      },
    },
    {
      id: 'frame.export',
      name: 'Export With Frame',
      description:
        'Converts the selected tracks, or the selected playlist, into a folder such as a USB drive. Your library does not change.\n\nFrame must be open.',
      config: {
        permissions: { track: { read: ['selected'] }, playlist: { read: ['selected'] }, files },
        settings: { [LEXICON_EXPORT_FOLDER]: '', [LEXICON_PRESET]: '' },
      },
    },
    {
      id: 'frame.edit',
      name: 'Edit In Frame',
      description:
        'Opens the selected tracks in Frame\'s editor to trim, fade, normalize loudness or clean up noise. Save there, then run "Import From Frame".',
      config: { permissions: { track: { read: ['selected'] }, files } },
    },
    {
      id: 'frame.import',
      name: 'Import From Frame',
      description:
        'Brings edits saved in Frame into your library, relinking the tracks or adding the files as new tracks.',
      config: {
        permissions: {
          track: {
            read: ['all'],
            modify: ['all'],
            modifyFields: ['location', 'sizeBytes'],
            create: true,
          },
          files,
        },
        settings: { [LEXICON_IMPORT_MODE]: importMode },
        exclusive: true,
        confirmationMessage:
          'This updates your library with the files saved in Frame. The original files stay on disk.\n\nMake sure you have a backup. Continue?',
      },
    },
    {
      id: 'frame.status',
      name: 'Frame Status',
      description: 'Shows what was last sent to Frame and how far it is.',
      config: { permissions: { files: { read: true, list: true } } },
    },
  ],
};
