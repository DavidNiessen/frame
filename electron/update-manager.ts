import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { installerName, selectUpdateRelease, type UpdateStatus } from '../src/core/app-updates';
import { downloadInstaller, type UpdateFetch, verifyInstaller } from './update-download';
import { fetchUpdateReleases } from './update-releases';

const SIX_HOURS = 6 * 60 * 60 * 1000;
export class UpdateManager {
  private state: UpdateStatus;
  private preferencesPath: string;
  private ready: Promise<void>;
  private pending?: Promise<UpdateStatus>;
  private controller?: AbortController;
  private downloaded?: { path: string; checksum: string };
  private listeners = new Set<(state: UpdateStatus) => void>();
  private stopped = false;
  constructor(
    private options: {
      current: string;
      development: boolean;
      platform: string;
      arch: string;
      directory: string;
      fetcher: UpdateFetch;
    },
  ) {
    this.state = {
      current: options.current,
      development: options.development,
      supported: !!installerName('0.0.0', options.platform, options.arch),
      automatic: true,
      includePrereleases: false,
      phase: 'idle',
    };
    this.preferencesPath = join(options.directory, 'update-preferences.json');
    this.ready = readFile(this.preferencesPath, 'utf8')
      .then((text) => {
        const value = JSON.parse(text);
        if (typeof value.automatic === 'boolean') this.state.automatic = value.automatic;
        if (typeof value.includePrereleases === 'boolean')
          this.state.includePrereleases = value.includePrereleases;
      })
      .catch(() => {});
  }
  async status() {
    await this.ready;
    return structuredClone(this.state);
  }
  subscribe(listener: (state: UpdateStatus) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(patch: Partial<UpdateStatus>) {
    Object.assign(this.state, patch);
    for (const listener of this.listeners) listener(structuredClone(this.state));
  }
  async preferences(value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('automatic' in value) ||
      typeof value.automatic !== 'boolean' ||
      !('includePrereleases' in value) ||
      typeof value.includePrereleases !== 'boolean'
    )
      throw new Error('Invalid update preferences.');
    await this.ready;
    if (this.pending) throw new Error('Wait for the update operation to finish.');
    const preferences = {
      automatic: value.automatic,
      includePrereleases: value.includePrereleases,
    };
    this.pending = (async () => {
      const temporary = `${this.preferencesPath}.${randomUUID()}.tmp`;
      try {
        await mkdir(this.options.directory, { recursive: true });
        await writeFile(temporary, JSON.stringify(preferences), { mode: 0o600 });
        await rename(temporary, this.preferencesPath);
        const changedChannel = preferences.includePrereleases !== this.state.includePrereleases;
        if (changedChannel) this.downloaded = undefined;
        this.emit({
          ...preferences,
          ...(changedChannel
            ? {
                phase: 'idle',
                release: undefined,
                downloaded: undefined,
                checkedAt: undefined,
                error: undefined,
              }
            : {}),
        });
        return this.status();
      } finally {
        this.pending = undefined;
        await rm(temporary, { force: true });
      }
    })();
    return this.pending;
  }
  async check() {
    await this.ready;
    if (this.pending) return this.pending;
    if (this.stopped || !this.state.supported) return this.status();
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30000)]);
    this.emit({ phase: 'checking', error: undefined });
    this.pending = (async () => {
      try {
        const releases = await fetchUpdateReleases(
          this.options.fetcher,
          this.state.includePrereleases,
          signal,
        );
        const release = selectUpdateRelease(
          releases,
          this.state.current,
          this.options.platform,
          this.options.arch,
          this.state.includePrereleases,
        );
        const retained = release?.tag === this.state.release?.tag && this.downloaded;
        if (!retained) this.downloaded = undefined;
        this.emit({
          phase: retained ? 'downloaded' : release ? 'available' : 'current',
          release,
          checkedAt: Date.now(),
          downloaded: retained ? this.downloaded?.path : undefined,
          ratio: undefined,
        });
      } catch (cause) {
        if (!this.stopped)
          this.emit({
            phase: 'error',
            error: `Could not check for updates. ${cause instanceof Error ? cause.message : String(cause)}`,
            checkedAt: Date.now(),
          });
      } finally {
        this.pending = undefined;
        this.controller = undefined;
      }
      return this.status();
    })();
    return this.pending;
  }
  async download() {
    await this.ready;
    if (this.pending) return this.pending;
    const release = this.state.release;
    if (!release) throw new Error('Check for an available update first.');
    if (this.downloaded) return this.status();
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30 * 60 * 1000)]);
    this.emit({ phase: 'downloading', ratio: 0, error: undefined });
    let lastProgress = 0;
    this.pending = (async () => {
      try {
        this.downloaded = await downloadInstaller(
          release,
          join(this.options.directory, 'updates', release.tag),
          this.options.fetcher,
          signal,
          (ratio) => {
            if (Date.now() - lastProgress < 150 && ratio < 1) return;
            lastProgress = Date.now();
            this.emit({ ratio });
          },
        );
        this.emit({ phase: 'downloaded', downloaded: this.downloaded.path, ratio: undefined });
      } catch (cause) {
        if (!this.stopped)
          this.emit({
            phase: 'available',
            ratio: undefined,
            error: this.controller?.signal.aborted
              ? undefined
              : `Could not download the update. ${cause instanceof Error ? cause.message : String(cause)}`,
          });
      } finally {
        this.pending = undefined;
        this.controller = undefined;
      }
      return this.status();
    })();
    return this.pending;
  }
  cancelDownload() {
    if (this.state.phase === 'downloading') this.controller?.abort();
  }
  async installer() {
    if (!this.downloaded) throw new Error('Download and verify an update first.');
    const value = this.downloaded;
    try {
      await verifyInstaller(value.path, value.checksum);
    } catch (cause) {
      this.downloaded = undefined;
      this.emit({ phase: 'available', downloaded: undefined, error: (cause as Error).message });
      throw cause;
    }
    return value.path;
  }
  async periodicCheck() {
    await this.ready;
    if (
      !this.state.automatic ||
      this.options.development ||
      this.pending ||
      this.state.phase === 'downloaded' ||
      this.stopped ||
      (this.state.checkedAt && Date.now() - this.state.checkedAt < SIX_HOURS)
    )
      return;
    await this.check();
  }
  async stop() {
    this.stopped = true;
    this.controller?.abort();
    this.listeners.clear();
    await this.pending?.catch(() => {});
  }
}
