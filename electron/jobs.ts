import type { ChildProcess } from 'node:child_process';
/** One media operation owns native processes at a time, including analysis and exports. */
export class MediaJobs {
  busy = false;
  cancelled = false;
  private process: ChildProcess | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private abort = new AbortController();
  get signal() { return this.abort.signal; }
  cancel() {
    this.cancelled = true; this.abort.abort();
    const child = this.process;
    if (!child) return;
    child.kill();
    if (this.stopTimer) clearTimeout(this.stopTimer);
    // FFmpeg can stall while shutting down a codec. Bound cancellation time.
    this.stopTimer = setTimeout(() => {
      if (this.process === child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 1000);
    this.stopTimer.unref();
  }
  async run<T>(work: (execute: (job: { child: ChildProcess; done: Promise<void> }) => Promise<void>) => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Wait for processing to finish.');
    this.busy = true; this.cancelled = false; this.abort = new AbortController();
    try {
      return await work(async job => { this.process = job.child; if (this.cancelled) { this.cancel(); await job.done.catch(() => {}); throw new Error('Processing cancelled.'); } await job.done; this.process = null; });
    } finally { if (this.stopTimer) clearTimeout(this.stopTimer); this.process?.kill(); this.process = null; this.busy = false; }
  }
}
