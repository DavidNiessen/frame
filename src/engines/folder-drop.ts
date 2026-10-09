import { isMediaFilename, MAX_IMPORT_FILES } from '../core/imports';

/** Capture entries while the drop event still owns the browser's file access. */
export async function droppedFiles(transfer: DataTransfer): Promise<File[]> {
  const files = Array.from(transfer.files);
  const roots = Array.from(transfer.items).map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  if (!roots.some(entry => entry.isDirectory)) return files;
  const found: File[] = []; let scanned = 0, mediaCount = 0;
  async function walk(entry: FileSystemEntry, parent = ''): Promise<void> {
    if (++scanned > 50000) throw new Error('This folder contains too many entries. Choose a smaller folder.');
    const path = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await walk(child, path);
      }
    } else {
      if (isMediaFilename(entry.name) && ++mediaCount > MAX_IMPORT_FILES) throw new Error(`Choose up to ${MAX_IMPORT_FILES} media files.`);
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      if (parent) Object.defineProperty(file, 'webkitRelativePath', { value: path });
      found.push(file);
    }
  }
  for (const root of roots) await walk(root);
  return found;
}
