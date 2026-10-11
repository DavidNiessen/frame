import type { Editor } from '../hooks/useEditor';
import type { RefObject } from 'react';
import { acceptMedia } from '../core/types';

interface Props {
  fileInput: RefObject<HTMLInputElement | null>;
  folderInput: RefObject<HTMLInputElement | null>;
  projectInput: RefObject<HTMLInputElement | null>;
  importFiles: Editor['importMedia'];
  importFolder: Editor['importFolder'];
  openProject: (file: File) => Promise<void>;
}

export function ImportInputs({
  fileInput,
  folderInput,
  projectInput,
  importFiles,
  importFolder,
  openProject,
}: Props) {
  return (
    <>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        aria-label="Choose media files"
        accept={acceptMedia}
        multiple
        onChange={(event) => {
          if (event.target.files?.length) void importFiles(Array.from(event.target.files));
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        className="sr-only"
        type="file"
        aria-label="Choose media folder"
        multiple
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          if (event.target.files?.length) void importFolder(Array.from(event.target.files));
          event.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        className="sr-only"
        type="file"
        aria-label="Choose project file"
        accept=".json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openProject(file);
          event.target.value = '';
        }}
      />
    </>
  );
}
