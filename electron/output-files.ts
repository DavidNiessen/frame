import { copyFile, constants, lstat, mkdir } from 'node:fs/promises';
import { join, parse, dirname } from 'node:path';
export async function safeOutputPath(root: string, name: string): Promise<string> {
  const segments = name.replace(/\\/g, '/').split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Invalid output folder structure.');
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment); const existing = await lstat(parent).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing?.isSymbolicLink()) throw new Error('Output subfolders must not be symbolic links. Choose another destination.');
    if (existing && !existing.isDirectory()) throw new Error('An output subfolder is occupied by a file.');
    if (!existing) await mkdir(parent);
  }
  return join(parent, segments.at(-1)!);
}
export async function publishOutput(temporary: string, root: string, name: string): Promise<string> {
  const target = await safeOutputPath(root, name), folder = dirname(target), parts = parse(target);
  for (let index = 0; index < 10000; index++) {
    const destination = join(folder, index ? `${parts.name}-${index}${parts.ext}` : parts.base);
    try { await copyFile(temporary, destination, constants.COPYFILE_EXCL); return destination; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  throw new Error('Too many files with this name in the export folder.');
}
