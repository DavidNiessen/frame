import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { EnvHttpProxyAgent, fetch } from 'undici';

export async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function downloadTool(url, destination, expectedHash) {
  const dispatcher = new EnvHttpProxyAgent();
  const temporary = destination + '.part-' + randomUUID();
  let file;
  try {
    const response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Tool download failed (HTTP ${response.status}).`);
    file = await open(temporary, 'wx');
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 120 * 1024 * 1024) throw new Error('Tool download exceeded its size limit.');
      hash.update(chunk); await file.writeFile(chunk);
    }
    await file.close(); file = undefined;
    if (hash.digest('hex') !== expectedHash) throw new Error('Tool checksum verification failed.');
    await rename(temporary, destination);
  } finally { await file?.close(); await rm(temporary, { force: true }); await dispatcher.destroy(); }
}
