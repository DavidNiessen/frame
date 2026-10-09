import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function prepareToolFile({ source, destination, sha256, binarySha256 = sha256, gzip = false, executable = false }) {
  if (await fileDigest(source).catch(() => '') !== sha256) throw new Error(`Vendored media tool is missing or corrupt: ${source}. Restore it from Git; setup does not download replacements.`);
  if (await fileDigest(destination).catch(() => '') !== binarySha256) {
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.part-${randomUUID()}`;
    try {
      const streams = [createReadStream(source), ...(gzip ? [createGunzip()] : []), createWriteStream(temporary, { flags: 'wx' })];
      await pipeline(streams);
      if (await fileDigest(temporary) !== binarySha256) throw new Error('Extracted media tool checksum verification failed.');
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  if (executable) await chmod(destination, 0o755);
  return destination;
}
