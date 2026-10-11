import { lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, basename, sep } from 'node:path';
import {
  StableWatchFiles,
  type WatchActivity,
  type WatchFolder,
  type WatchStatus,
} from '../src/core/watch-folders';
import { collectFolderMedia } from './folders';
export interface WatchWork {
  watch: WatchFolder;
  path: string;
  relativePath: string;
  signal: AbortSignal;
  progress: (ratio: number) => void;
}
function inside(parent: string, child: string) {
  const relation = relative(parent, child);
  return (
    !relation || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  );
}
export function validateWatchNetwork(watches: Pick<WatchFolder, 'input' | 'output'>[]) {
  for (const output of watches)
    for (const source of watches) {
      if (inside(source.input, output.output) || inside(output.output, source.input))
        throw new Error(
          'Choose separate watched source and output folders. Converted files must not re-enter any watch.',
        );
    }
}
export async function validateWatchPaths(input: string, output: string) {
  if (!isAbsolute(input) || !isAbsolute(output))
    throw new Error('Choose absolute source and destination folders.');
  const [source, destination] = await Promise.all([realpath(input), realpath(output)]);
  if (!(await lstat(source)).isDirectory() || !(await lstat(destination)).isDirectory())
    throw new Error('Choose existing source and destination folders.');
  if (inside(source, destination) || inside(destination, source))
    throw new Error(
      'The output folder must be outside the watched source folder, and must not contain it.',
    );
  return { input: source, output: destination };
}
export class WatchRunner {
  watches: WatchFolder[] = [];
  error = '';
  private files = new Map<string, StableWatchFiles>();
  private activity: WatchActivity[] = [];
  private running = false;
  private stopped = false;
  private idle: (() => void)[] = [];
  private active: { id: string; abort: AbortController } | null = null;
  constructor(
    private encode: (work: WatchWork) => Promise<string>,
    private persist: () => Promise<void>,
  ) {}
  restore(watches: WatchFolder[], receipts: Record<string, Record<string, string>>) {
    this.watches = watches;
    for (const watch of watches)
      this.files.set(
        watch.id,
        new StableWatchFiles(new Map(Object.entries(receipts[watch.id] ?? {}))),
      );
  }
  async initialize(watch: WatchFolder) {
    const state = new StableWatchFiles();
    if (!watch.includeExisting)
      for (const file of (await collectFolderMedia(watch.input, watch.recursive)).files) {
        const info = await lstat(file.path);
        state.finish(file.path, `${info.size}:${info.mtimeMs}`);
      }
    this.files.set(watch.id, state);
  }
  receipts() {
    return Object.fromEntries(
      this.watches.map((watch) => [watch.id, this.files.get(watch.id)?.receipts() ?? {}]),
    );
  }
  status(): WatchStatus {
    return {
      watches: structuredClone(this.watches),
      activity: structuredClone(this.activity),
      error: this.error,
    };
  }
  retry(id: string) {
    this.files.get(id)?.retry();
  }
  cancel(id: string) {
    if (this.active?.id === id) this.active.abort.abort();
  }
  settled(): Promise<void> {
    return this.running ? new Promise((resolve) => this.idle.push(resolve)) : Promise.resolve();
  }
  stop() {
    this.stopped = true;
    this.active?.abort.abort();
  }
  private publish(job: WatchActivity) {
    this.activity = [...this.activity.filter((item) => item.id !== job.id), job].slice(-100);
  }
  async tick(now = Date.now()) {
    if (this.running || this.stopped) return;
    this.running = true;
    this.error = '';
    try {
      try {
        validateWatchNetwork(this.watches);
      } catch (issue) {
        this.error = (issue as Error).message;
        return;
      }
      const queues: {
        watch: WatchFolder;
        path: string;
        relativePath: string;
        fingerprint: string;
      }[][] = [];
      for (const watch of this.watches.filter((watch) => watch.enabled)) {
        try {
          const paths = await validateWatchPaths(watch.input, watch.output);
          if (paths.input !== watch.input || paths.output !== watch.output)
            throw new Error(
              'A watched folder moved or now points to a different location. Recreate the watch.',
            );
          const files = (await collectFolderMedia(watch.input, watch.recursive)).files,
            state = this.files.get(watch.id)!;
          state.reconcile(new Set(files.map((file) => file.path)));
          const ready = [];
          for (const file of files) {
            const info = await lstat(file.path);
            if (!info.isFile() || info.isSymbolicLink()) continue;
            const fingerprint = `${info.size}:${info.mtimeMs}`;
            if (state.observe(file.path, fingerprint, now))
              ready.push({ watch, ...file, fingerprint });
          }
          queues.push(ready);
        } catch (issue) {
          this.error = `${watch.name}: ${(issue as Error).message}`;
        }
      }
      // Interleave watches so a large collection cannot monopolize the queue.
      const work = [];
      for (let row = 0; queues.some((queue) => queue[row]); row++)
        for (const queue of queues) if (queue[row]) work.push(queue[row]);
      for (const item of work.slice(0, 50)) {
        if (this.stopped) break;
        if (!this.watches.some((watch) => watch.id === item.watch.id && watch.enabled)) continue;
        const abort = new AbortController();
        this.active = { id: item.watch.id, abort };
        const job: WatchActivity = {
          id: randomUUID(),
          watchId: item.watch.id,
          name: item.relativePath || basename(item.path),
          status: 'converting',
          progress: 0,
        };
        this.publish(job);
        try {
          const path = await this.encode({
            ...item,
            signal: abort.signal,
            progress: (ratio) => this.publish({ ...job, progress: ratio }),
          });
          this.files.get(item.watch.id)?.finish(item.path, item.fingerprint);
          this.publish({ ...job, status: 'done', progress: 1, path });
          await this.persist();
        } catch (issue) {
          if (!abort.signal.aborted)
            this.files.get(item.watch.id)?.fail(item.path, item.fingerprint);
          this.publish({
            ...job,
            status: abort.signal.aborted ? 'cancelled' : 'failed',
            error: abort.signal.aborted ? undefined : (issue as Error).message,
          });
        } finally {
          this.active = null;
        }
      }
    } finally {
      this.running = false;
      for (const resolve of this.idle.splice(0)) resolve();
    }
  }
}
