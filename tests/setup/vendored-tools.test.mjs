import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import { fileDigest, prepareToolFile } from '../../scripts/media-tool-files.mjs';
import { ffmpegToolTarget, ensureFfmpeg } from '../../scripts/prepare-ffmpeg.mjs';
import { ensureYoutubeTools } from '../../scripts/prepare-youtube.mjs';
const require = createRequire(import.meta.url);
const ffmpeg = require('../../scripts/ffmpeg-tools.json'), youtube = require('../../scripts/youtube-tools.json');
const hash = content => createHash('sha256').update(content).digest('hex');

test('contains all pinned vendor binaries and notices with matching archive and executable hashes', async () => {
  const root = resolve('vendor/media-tools');
  for (const target of Object.values(ffmpeg.platforms)) {
    const path = join(root, 'ffmpeg', target.asset);
    assert.equal(await fileDigest(path), target.sha256);
    const digest = createHash('sha256'), input = createReadStream(path), unzip = createGunzip();
    input.on('error', error => unzip.destroy(error)); input.pipe(unzip);
    for await (const chunk of unzip) digest.update(chunk);
    assert.equal(digest.digest('hex'), target.binarySha256);
    for (const file of Object.values(target.notices)) assert.equal(await fileDigest(join(root, 'ffmpeg', file.asset)), file.sha256);
  }
  for (const target of Object.values(youtube.platforms)) assert.equal(await fileDigest(join(root, 'yt-dlp', target.asset)), target.sha256);
  for (const [name, digest] of Object.entries(youtube.notices)) assert.equal(await fileDigest(join(root, 'yt-dlp', name)), digest);
  assert.equal(ffmpegToolTarget('win32', 'x64').name, 'ffmpeg.exe');
  assert.equal(ffmpegToolTarget('darwin', 'arm64').asset, 'ffmpeg-darwin-arm64.gz');
  assert.throws(() => ffmpegToolTarget('win32', 'arm64'), /not available/);
});

test('rejects corrupt local tools, cleans incomplete extraction and repairs prepared executables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-vendor-test-'));
  const content = Buffer.from('portable binary fixture'), archive = gzipSync(content);
  const source = join(directory, 'tool.gz'), destination = join(directory, 'tool');
  const options = { source, destination, sha256: hash(archive), binarySha256: hash(content), gzip: true, executable: true };
  try {
    await writeFile(source, archive); await writeFile(destination, 'existing file');
    await assert.rejects(prepareToolFile({ ...options, binarySha256: '0'.repeat(64) }), /checksum/);
    assert.equal(await readFile(destination, 'utf8'), 'existing file'); assert.deepEqual((await readdir(directory)).sort(), ['tool', 'tool.gz']);
    await prepareToolFile(options); assert.deepEqual(await readFile(destination), content);
    await writeFile(destination, 'corrupt executable'); await prepareToolFile(options); assert.deepEqual(await readFile(destination), content);
    await writeFile(source, 'corrupt archive'); await assert.rejects(prepareToolFile(options), /Restore it from Git/);
    assert.deepEqual(await readFile(destination), content);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('prepares real FFmpeg and yt-dlp from repository files with unreachable network proxies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-offline-tools-'));
  const keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'], previous = keys.map(key => process.env[key]);
  try {
    for (const key of keys) process.env[key] = 'http://127.0.0.1:1';
    const binary = await ensureFfmpeg({ directory }); await ensureYoutubeTools({ directory });
    assert.equal(await fileDigest(binary), ffmpegToolTarget().binarySha256);
    assert.ok((await readdir(directory)).includes(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'));
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await rm(directory, { recursive: true, force: true });
  }
});
