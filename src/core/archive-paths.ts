/** Number collisions so a ZIP can be extracted on case-insensitive filesystems. */
export function uniqueArchivePath(path: string, used: Set<string>): string {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid download folder structure.');
  const dot = path.lastIndexOf('.');
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const extension = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  let result = path, index = 1;
  while (used.has(result.toLowerCase())) result = `${stem}-${index++}${extension}`;
  used.add(result.toLowerCase()); return result;
}
