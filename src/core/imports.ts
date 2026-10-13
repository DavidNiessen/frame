import { supportedExtensions } from './types';

export const MAX_IMPORT_FILES = 2000;
export const MAX_WEB_FILE_SIZE = 500 * 1024 * 1024;
export const MAX_WEB_LIBRARY_SIZE = 800 * 1024 * 1024;
export const isMediaFilename = (name: string) =>
  supportedExtensions.includes(name.split('.').at(-1)?.toLowerCase() ?? '');

/** Folder pickers include the selected root; outputs are relative to that root. */
export function browserRelativePath(path: string): string | undefined {
  return path ? path.split('/').slice(1).join('/') : undefined;
}

/** Directory enumeration order differs across systems; keep album numbering stable. */
export function orderBrowserFiles(files: File[]): File[] {
  const folders = files
    .filter((file) => file.webkitRelativePath)
    .sort((a, b) =>
      a.webkitRelativePath.localeCompare(b.webkitRelativePath, 'en', { numeric: true }),
    );
  let index = 0;
  // Preserve the chosen order of individual files, including mixed folder drops.
  return files.map((file) => (file.webkitRelativePath ? folders[index++] : file));
}

export const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'avif'];
export const isImageFilename = (name: string) =>
  imageExtensions.includes(name.split('.').at(-1)?.toLowerCase() ?? '');
