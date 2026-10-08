import type { ChildProcess } from 'node:child_process';
/** One media operation owns native processes at a time, including analysis and exports. */
export class MediaJobs {
  busy = false;
  cancelled = false;
  private process: ChildProcess | null = null;
  cancel() { this.cancelled = true; this.process?.kill(); }
  async run<T>(work: (execute: (job: { child: ChildProcess; done: Promise<void> }) => Promise<void>) => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Wait for processing to finish.');
    this.busy = true; this.cancelled = false;
    try {
      return await work(async job => { this.process = job.child; if (this.cancelled) { job.child.kill(); await job.done.catch(() => {}); throw new Error('Processing cancelled.'); } await job.done; this.process = null; });
    } finally { this.process?.kill(); this.process = null; this.busy = false; }
  }
}
