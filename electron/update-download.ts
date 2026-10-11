import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { UpdateRelease } from '../src/core/app-updates';
import { installerChecksum } from '../src/core/app-updates';

export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>;
export async function fetchUpdateResource(fetcher: UpdateFetch, url: string, signal: AbortSignal) {
  const response = await fetcher(url, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'GitHub temporarily limited update requests. Try again later.'
        : `GitHub update request failed (${response.status}).`,
    );
  if (response.url) {
    const final = new URL(response.url);
    if (
      final.protocol !== 'https:' ||
      ![
        'github.com',
        'api.github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(final.hostname)
    )
      throw new Error('The update download was redirected outside GitHub.');
  }
  return response;
}
export async function boundedUpdateText(response: Response, maximum = 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GitHub returned an empty update response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new Error('GitHub returned too much update metadata.');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function verifyInstaller(path: string, expected: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== expected)
    throw new Error('Installer checksum mismatch. Download the update again.');
}
export async function downloadInstaller(
  release: UpdateRelease,
  directory: string,
  fetcher: UpdateFetch,
  signal: AbortSignal,
  progress: (ratio: number) => void,
) {
  const checksum = installerChecksum(
    await boundedUpdateText(await fetchUpdateResource(fetcher, release.checksums, signal), 64000),
    release.installer.name,
  );
  await mkdir(directory, { recursive: true });
  const path = join(directory, release.installer.name),
    partial = `${path}.${randomUUID()}.part`;
  const response = await fetchUpdateResource(fetcher, release.installer.url, signal);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GitHub returned an empty installer.');
  const hash = createHash('sha256');
  let file: Awaited<ReturnType<typeof open>> | undefined,
    received = 0;
  try {
    file = await open(partial, 'wx', 0o600);
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > release.installer.size)
        throw new Error('The installer size does not match the release.');
      hash.update(value);
      await file.writeFile(value);
      progress(received / release.installer.size);
    }
    signal.throwIfAborted();
    if (received !== release.installer.size || hash.digest('hex') !== checksum)
      throw new Error('Installer checksum mismatch. Download the update again.');
    await file.close();
    file = undefined;
    signal.throwIfAborted();
    await rename(partial, path);
    if (release.installer.name.endsWith('.AppImage')) await chmod(path, 0o700);
    return { path, checksum };
  } finally {
    await file?.close();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await rm(partial, { force: true });
  }
}
