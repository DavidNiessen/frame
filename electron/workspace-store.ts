import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { MAX_AUTOSAVE_BYTES, parseAutosave, type AutosaveDocument } from '../src/core/autosave';
import { sameLayerSource } from '../src/core/audio-layers';
import { isMediaFilename, MAX_IMPORT_FILES } from '../src/core/imports';
import type { MediaAsset } from '../src/core/types';

export interface WorkspaceSource { path: string; relativePath?: string; mtimeMs: number }
export interface NativeWorkspace { document: AutosaveDocument; sources: WorkspaceSource[] }
export interface WorkspaceInput { path: string; asset: MediaAsset; temporary: boolean }
/** Serial, atomic checkpoints. Only owned download copies are removed during pruning. */
export class WorkspaceStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.catch(() => {}).then(task); this.pending = next; return next;
  }
  private cacheKey(path: string) {
    const part = relative(join(this.root, 'media'), path).split(/[\\/]/)[0];
    return /^[a-f0-9]{64}$/.test(part) ? part : undefined;
  }
  read(): Promise<NativeWorkspace | null> {
    return this.serial(async () => {
      let raw: string;
      try {
        const path = join(this.root, 'workspace.json');
        if ((await stat(path)).size > MAX_AUTOSAVE_BYTES + MAX_IMPORT_FILES * 4096) throw new Error('The saved workspace is too large.');
        raw = await readFile(path, 'utf8');
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      const value = JSON.parse(raw) as NativeWorkspace, document = parseAutosave(value.document);
      if (!Array.isArray(value.sources) || value.sources.length !== document.project.sources.length || value.sources.some(source => !source || typeof source.path !== 'string' || source.path.length > 32768 || !isAbsolute(source.path) || !isMediaFilename(source.path) || !Number.isFinite(source.mtimeMs) || source.relativePath !== undefined && typeof source.relativePath !== 'string')) throw new Error('The saved workspace has invalid source references.');
      return { document, sources: value.sources };
    });
  }
  save(input: AutosaveDocument, inputs: WorkspaceInput[]): Promise<void> {
    const document = parseAutosave(input);
    if (inputs.length !== document.project.sources.length || inputs.some((item, index) => !sameLayerSource(document.project.sources[index].source, item.asset))) return Promise.reject(new Error('The workspace is missing its original sources.'));
    return this.serial(async () => {
      const sources: WorkspaceSource[] = [], keep = new Set<string>();
      await mkdir(this.root, { recursive: true });
      for (const item of inputs) {
        let path = item.path, info = await stat(path);
        if (!info.isFile() || info.size !== item.asset.size) throw new Error(`The source “${item.asset.name}” has changed or is unavailable.`);
        if (item.temporary) {
          const key = createHash('sha256').update(`${path}\0${info.size}\0${info.mtimeMs}`).digest('hex');
          const directory = join(this.root, 'media', key), destination = join(directory, basename(path));
          await mkdir(directory, { recursive: true });
          let exists = false;
          try { exists = (await stat(destination)).size === info.size; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          if (!exists) {
            const temporary = `${destination}.${randomUUID()}.tmp`;
            try { await copyFile(path, temporary); await rename(temporary, destination); }
            finally { await rm(temporary, { force: true }); }
          }
          path = destination; info = await stat(path);
        }
        const key = this.cacheKey(path); if (key) keep.add(key);
        sources.push({ path, mtimeMs: info.mtimeMs, relativePath: item.asset.relativePath });
      }
      const temporary = join(this.root, `workspace-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify({ document, sources } satisfies NativeWorkspace));
        await rename(temporary, join(this.root, 'workspace.json'));
      } finally { await rm(temporary, { force: true }); }
      const directories = await readdir(join(this.root, 'media')).catch(() => []);
      // Cache cleanup is best effort: a video player may still hold a removed source on Windows.
      await Promise.all(directories.filter(key => /^[a-f0-9]{64}$/.test(key) && !keep.has(key)).map(key => rm(join(this.root, 'media', key), { recursive: true, force: true, maxRetries: 3 }).catch(() => {})));
    });
  }
  clear(): Promise<void> {
    return this.serial(async () => {
      await rm(join(this.root, 'workspace.json'), { force: true });
      await rm(join(this.root, 'media'), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    });
  }
}
