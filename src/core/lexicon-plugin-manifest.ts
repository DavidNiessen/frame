import { LEXICON_ADD, LEXICON_IMPORT_MODE, LEXICON_RELINK } from './lexicon-plugin';

const config = {
  permissions: {
    track: {
      read: ['selected'],
      modify: ['selected'],
      modifyFields: ['location'],
      create: true,
    },
    files: { read: true, write: true, list: true },
  },
  settings: {
    [LEXICON_IMPORT_MODE]: {
      type: 'dropdown',
      default: LEXICON_RELINK,
      options: [LEXICON_RELINK, LEXICON_ADD],
    },
  },
};

/** config.json of the Lexicon plugin; see https://www.lexicondj.com/docs/developers/plugin */
export const lexiconPluginManifest = {
  id: 'frame.lexicon',
  author: { name: 'Frame', email: 'david@niessen.dev', discordUsername: 'david.niessen' },
  actions: [
    {
      id: 'frame.convert',
      name: 'Convert In Frame',
      description:
        "Opens the selected tracks in Frame's converter. Choose the format and folder there; when you close the converter, the tracks are relinked to the converted files, keeping cues, beatgrids, tags and playlists.\n\nFrame must be open.",
      config,
    },
    {
      id: 'frame.edit',
      name: 'Edit In Frame',
      description:
        "Opens the selected tracks in Frame's editor to trim, fade, normalize loudness or clean up noise. Once every track is saved, or you close the editor, the tracks are relinked to the edited files.\n\nFrame must be open.",
      config,
    },
  ],
};
