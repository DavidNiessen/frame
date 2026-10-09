import { randomUUID } from 'node:crypto';
import { MAX_IMPORT_FILES } from '../src/core/imports';
import type { DesktopLaunchRequest } from '../src/core/launch';
import type { LaunchFiles } from './launch-arguments';

type Pending = LaunchFiles & { id: string };
/** Requests stay queued until the renderer can acquire the media operation lock. */
export class LaunchInbox {
  private pending: Pending[] = [];
  private overflow: Pending | null = null;
  constructor(private notify: () => void, private platform = process.platform) {}
  enqueue(request: LaunchFiles) {
    const key = (path: string) => this.platform === 'win32' ? path.toLowerCase() : path;
    const tail = this.pending.at(-1);
    const unique = new Map(request.paths.map(path => [key(path), path]));
    if (tail?.workflow === request.workflow) for (const path of tail.paths) unique.delete(key(path));
    const paths = [...unique.values()];
    if (this.pending.length >= 64 || paths.length + this.pending.reduce((sum, item) => sum + item.paths.length, 0) > MAX_IMPORT_FILES) {
      this.overflow = { id: randomUUID(), workflow: request.workflow, paths: [], error: `Too many files are waiting to open. Frame supports ${MAX_IMPORT_FILES} media files; try a smaller selection after processing finishes.` };
    } else if (tail?.workflow === request.workflow && !tail.error) tail.paths.push(...paths);
    else this.pending.push({ ...request, paths, id: randomUUID() });
    this.notify();
  }
  peek(): DesktopLaunchRequest | null {
    const request = this.pending[0] || this.overflow;
    return request ? { id: request.id, workflow: request.workflow, count: request.paths.length } : null;
  }
  consume(id: string): LaunchFiles {
    if (typeof id !== 'string' || this.peek()?.id !== id) throw new Error('This file-open request is no longer available.');
    const request = this.pending.shift() || this.overflow!;
    if (request === this.overflow) this.overflow = null;
    return request;
  }
}
