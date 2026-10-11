import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadTool } from '../../scripts/download-tool.mjs';
import { youtubeToolTarget } from '../../scripts/prepare-youtube.mjs';

test('selects standalone YouTube binaries for supported desktop architectures', () => {
  assert.equal(youtubeToolTarget('win32', 'arm64').asset, 'yt-dlp_arm64.exe');
  assert.equal(youtubeToolTarget('win32', 'x64').name, 'yt-dlp.exe');
  assert.equal(youtubeToolTarget('darwin', 'arm64').asset, 'yt-dlp_macos');
  assert.equal(youtubeToolTarget('linux', 'x64').asset, 'yt-dlp_linux');
  assert.throws(() => youtubeToolTarget('linux', 'ia32'), /not available/);
});
test('verifies tool downloads before publishing and removes corrupt partial files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-tool-test-'));
  const content = Buffer.from('a portable tool fixture');
  const server = createServer((_request, response) => response.end(content));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/tool`;
    const path = join(directory, 'tool');
    await assert.rejects(downloadTool(url, path, '0'.repeat(64)), /checksum/);
    assert.deepEqual(await readdir(directory), []);
    await downloadTool(url, path, createHash('sha256').update(content).digest('hex'));
    assert.deepEqual(await readFile(path), content);
    assert.deepEqual(await readdir(directory), ['tool']);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
