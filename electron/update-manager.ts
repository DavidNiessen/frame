import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  installerName,
  selectUpdateRelease,
  type UpdateRelease,
  type UpdateStatus,
} from '../src/core/app-updates';
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
      install?: (update: {
        path: string;
        checksum: string;
        release: UpdateRelease;
      }) => Promise<void>;
    },
  ) {
    this.state = {
      current: options.current,
      development: options.development,
      supported: !!installerName('0.0.0', options.platform, options.arch),
      installSupported: !!options.install && !options.development,
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
      .catch(() => {})
      .then(async () => {
        try {
          const saved = JSON.parse(
            await readFile(join(options.directory, 'update-ready.json'), 'utf8'),
          );
          const entry = saved.release;
          const release = selectUpdateRelease(
            [
              {
                tag_name: entry.tag,
                prerelease: entry.prerelease,
                assets: [
                  {
                    name: entry.installer.name,
                    size: entry.installer.size,
                    browser_download_url: entry.installer.url,
                  },
                  { name: 'SHA256SUMS.txt', browser_download_url: entry.checksums },
                ],
              },
            ],
            options.current,
            options.platform,
            options.arch,
            this.state.includePrereleases,
          );
          if (release && /^[a-f0-9]{64}$/.test(saved.checksum)) {
            const path = join(options.directory, 'updates', release.tag, release.installer.name);
            await verifyInstaller(path, saved.checksum);
            this.downloaded = { path, checksum: saved.checksum };
            Object.assign(this.state, { phase: 'downloaded', release, downloaded: path });
          }
        } catch {
          /* Older downloads and invalid cached updates require a fresh check. */
        }
        try {
          const errorPath = join(options.directory, 'update-install-error.json');
          const failure = JSON.parse((await readFile(errorPath, 'utf8')).replace(/^\uFEFF/, ''));
          if (typeof failure.error === 'string')
            this.state.error = `Update installation failed. ${failure.error}`;
          await rm(errorPath, { force: true });
        } catch {}
      });
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
        if (changedChannel)
          await rm(join(this.options.directory, 'update-ready.json'), { force: true });
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
    if (this.state.phase === 'installing') return this.status();
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
        const readyPath = join(this.options.directory, 'update-ready.json');
        const temporary = `${readyPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(
            temporary,
            JSON.stringify({ release, checksum: this.downloaded.checksum }),
            { mode: 0o600 },
          );
          await rename(temporary, readyPath);
        } finally {
          await rm(temporary, { force: true });
        }
        this.emit({ phase: 'downloaded', downloaded: this.downloaded.path, ratio: undefined });
      } catch (cause) {
        this.downloaded = undefined;
        if (!this.stopped)
          this.emit({
            phase: 'available',
            downloaded: undefined,
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
      await rm(join(this.options.directory, 'update-ready.json'), { force: true });
      this.emit({ phase: 'available', downloaded: undefined, error: (cause as Error).message });
      throw cause;
    }
    return value.path;
  }
  async install() {
    await this.ready;
    if (this.pending || this.state.phase === 'installing')
      throw new Error('An update operation is already running.');
    if (!this.options.install || !this.state.installSupported)
      throw new Error('Restart-to-update is available in installed Frame apps.');
    await this.installer();
    const downloaded = this.downloaded!,
      release = this.state.release!;
    this.emit({ phase: 'installing', error: undefined });
    this.pending = (async () => {
      try {
        await this.options.install!({ ...downloaded, release });
      } catch (cause) {
        this.emit({
          phase: 'downloaded',
          error: `Could not prepare the update. ${(cause as Error).message}`,
        });
      } finally {
        this.pending = undefined;
      }
      return this.status();
    })();
    return this.pending;
  }
  async periodicCheck() {
    await this.ready;
    if (
      !this.state.automatic ||
      this.options.development ||
      this.pending ||
      this.state.phase === 'downloaded' ||
      this.state.phase === 'installing' ||
      this.stopped ||
      (this.state.checkedAt && Date.now() - this.state.checkedAt < SIX_HOURS)
    )
      return;
    await this.check();
    if (
      this.state.automatic &&
      this.state.installSupported &&
      this.state.phase === 'available' &&
      !this.state.error &&
      !this.stopped
    )
      await this.download();
  }
  async stop() {
    this.stopped = true;
    this.controller?.abort();
    this.listeners.clear();
    await this.pending?.catch(() => {});
  }
}
