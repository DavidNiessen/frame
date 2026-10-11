import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UpdateManager } from '../electron/update-manager';
import {
  boundedUpdateText,
  downloadInstaller,
  fetchUpdateResource,
} from '../electron/update-download';
import { FRAME_RELEASES, selectUpdateRelease } from '../src/core/app-updates';
import { fetchUpdateReleases } from '../electron/update-releases';

const bytes = new TextEncoder().encode('A portable Frame installer test fixture.');
const digest = createHash('sha256').update(bytes).digest('hex');
const name = 'Frame-1.0.1-win-x64.exe';
const asset = (name: string) => ({
  name,
  size: bytes.length,
  browser_download_url: `${FRAME_RELEASES}/download/v1.0.1/${name}`,
});
const release = {
  tag_name: 'v1.0.1',
  prerelease: false,
  draft: false,
  assets: [asset(name), asset('SHA256SUMS.txt')],
};
const selected = selectUpdateRelease([release], 'v1.0.0', 'win32', 'x64', false)!;
const directories: string[] = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), 'frame-updates-'));
  directories.push(value);
  return value;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
function fetcher(corrupt = false) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(release));
    if (url.includes('/releases?')) return new Response(JSON.stringify([release]));
    if (url.endsWith('/SHA256SUMS.txt')) return new Response(`${digest}  ${name}\n`);
    return new Response(corrupt ? new Uint8Array(bytes.length) : bytes);
  });
}
async function manager(fetch = fetcher(), development = false) {
  const root = await directory();
  return {
    root,
    fetch,
    updates: new UpdateManager({
      current: 'v1.0.0',
      development,
      platform: 'win32',
      arch: 'x64',
      directory: root,
      fetcher: fetch,
    }),
  };
}
describe('desktop updates', () => {
  it('handles repositories with only previews and retrieves paginated preview metadata', async () => {
    const signal = new AbortController().signal;
    expect(
      await fetchUpdateReleases(async () => new Response('', { status: 404 }), false, signal),
    ).toEqual([]);
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('page=1')
              ? Array.from({ length: 100 }, () => ({ tag_name: 'v1.0.1-build.1' }))
              : [release],
          ),
        ),
    );
    expect(await fetchUpdateReleases(fetch, true, signal)).toHaveLength(101);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('checks metadata without downloading, verifies bytes and detects post-download changes', async () => {
    const { updates, root, fetch } = await manager();
    const states: string[] = [];
    updates.subscribe((value) => states.push(value.phase));
    expect((await updates.check()).phase).toBe('available');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(root)).toEqual([]);
    const completed = await updates.download();
    expect(completed.phase).toBe('downloaded');
    expect(completed.downloaded).toBe(await updates.installer());
    expect(await readFile(completed.downloaded!)).toEqual(Buffer.from(bytes));
    expect(states).toContain('downloading');
    expect((await updates.check()).phase).toBe('downloaded');
    await writeFile(completed.downloaded!, 'tampered installer');
    await expect(updates.installer()).rejects.toThrow('checksum mismatch');
    expect((await updates.status()).phase).toBe('available');
    expect((await updates.status()).downloaded).toBeUndefined();
    updates.stop();
  });
  it('rejects corrupt or incomplete downloads and removes partial files before retrying', async () => {
    const { updates, root, fetch } = await manager(fetcher(true));
    await updates.check();
    expect((await updates.download()).error).toContain('checksum mismatch');
    expect(await readdir(join(root, 'updates', 'v1.0.1'))).toEqual([]);
    await expect(updates.installer()).rejects.toThrow('Download and verify');
    fetch.mockImplementation(fetcher());
    expect((await updates.download()).phase).toBe('downloaded');
    expect(await readdir(join(root, 'updates', 'v1.0.1'))).toEqual([name]);
    updates.stop();
  });
  it('aborts streaming downloads and cleans up their temporary file', async () => {
    const root = await directory(),
      controller = new AbortController();
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('SHA256SUMS.txt')) return new Response(`${digest}  ${name}`);
      return new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(bytes.slice(0, 10));
          },
        }),
      );
    });
    await expect(
      downloadInstaller(selected, root, fetch, controller.signal, () => controller.abort()),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
  it('persists preferences and checks periodically without overlapping or downloading', async () => {
    const { updates, root, fetch } = await manager();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(100000);
    await Promise.all([updates.periodicCheck(), updates.periodicCheck()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await updates.periodicCheck();
    expect(fetch).toHaveBeenCalledTimes(1);
    now.mockReturnValue(100000 + 6 * 60 * 60 * 1000);
    await updates.periodicCheck();
    expect(fetch).toHaveBeenCalledTimes(2);
    await updates.preferences({ automatic: false, includePrereleases: true });
    now.mockReturnValue(100000 + 12 * 60 * 60 * 1000);
    await updates.periodicCheck();
    expect(fetch).toHaveBeenCalledTimes(2);
    const reopened = new UpdateManager({
      current: 'v1.0.0',
      development: false,
      platform: 'win32',
      arch: 'x64',
      directory: root,
      fetcher: fetch,
    });
    expect(await reopened.status()).toMatchObject({ automatic: false, includePrereleases: true });
    await expect(reopened.preferences({ automatic: 'yes' })).rejects.toThrow('Invalid');
    updates.stop();
    reopened.stop();
    const dev = await manager(fetcher(), true);
    await dev.updates.periodicCheck();
    expect(dev.fetch).not.toHaveBeenCalled();
    dev.updates.stop();
  });
  it('downloads installed-app updates in the background, restores verified downloads and installs only on request', async () => {
    const root = await directory(),
      fetch = fetcher(),
      install = vi.fn(async (_update: { path: string; checksum: string }) => {});
    const options = {
      current: 'v1.0.0',
      development: false,
      platform: 'win32',
      arch: 'x64',
      directory: root,
      fetcher: fetch,
      install,
    };
    const updates = new UpdateManager(options);
    await updates.periodicCheck();
    expect((await updates.status()).phase).toBe('downloaded');
    expect(install).not.toHaveBeenCalled();
    const restored = new UpdateManager(options);
    expect((await restored.status()).phase).toBe('downloaded');
    await restored.install();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toMatchObject({
      checksum: digest,
      path: join(root, 'updates', 'v1.0.1', name),
    });
    await restored.stop();
    await updates.stop();
    await writeFile(join(root, 'updates', 'v1.0.1', name), 'tampered');
    const tampered = new UpdateManager(options);
    expect((await tampered.status()).phase).toBe('idle');
    await tampered.stop();
  });
  it('keeps staging failures recoverable and clears ready state when changing release channel', async () => {
    const root = await directory();
    const updates = new UpdateManager({
      current: 'v1.0.0',
      development: false,
      platform: 'win32',
      arch: 'x64',
      directory: root,
      fetcher: fetcher(),
      install: async () => {
        throw new Error('read-only installation');
      },
    });
    await updates.periodicCheck();
    expect(await updates.install()).toMatchObject({
      phase: 'downloaded',
      error: expect.stringContaining('read-only'),
    });
    await updates.preferences({ automatic: true, includePrereleases: true });
    expect((await updates.status()).phase).toBe('idle');
    expect(await readdir(root)).not.toContain('update-ready.json');
    await updates.stop();
  });
  it('keeps failures recoverable and bounds metadata and redirect destinations', async () => {
    const { updates, fetch } = await manager();
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await updates.check()).error).toContain('offline');
    expect((await updates.check()).phase).toBe('available');
    const signal = new AbortController().signal;
    const foreign = new Response('installer');
    Object.defineProperty(foreign, 'url', { value: 'https://example.com/installer' });
    await expect(
      fetchUpdateResource(async () => foreign, selected.installer.url, signal),
    ).rejects.toThrow('outside GitHub');
    await expect(boundedUpdateText(new Response('oversized metadata'), 4)).rejects.toThrow(
      'too much',
    );
    updates.stop();
  });
});
