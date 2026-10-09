import { supportedExtensions } from './types';

export const MAX_IMPORT_FILES = 2000;
export const isMediaFilename = (name: string) => supportedExtensions.includes(name.split('.').at(-1)?.toLowerCase() ?? '');

/** Folder pickers include the selected root; outputs are relative to that root. */
export function browserRelativePath(path: string): string | undefined {
  return path ? path.split('/').slice(1).join('/') : undefined;
}
