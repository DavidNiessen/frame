import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
import { parseEdit } from '../src/core/project';
import { outputSettings, parseOutputSettings } from '../src/core/presets';
const exec = promisify(execFile), source = resolve('public/sample.mp4');
it('encodes GIF dimensions, a restricted palette and repeat behavior', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-gif-options-'));
  const asset = { ...await probeFile(source), id: 'test', name: 'sample.mp4', size: 1, previewUrl: '' };
  try {
    for (const loop of [-1, 3]) {
      const edit = { ...defaultSettings(asset), end: .5, format: 'gif' as const, fps: 4, gifWidth: 320, gifColors: 64, gifDither: 'none' as const, gifLoop: loop };
      const output = join(directory, `${loop}.gif`); await exec(ffmpegPath(), buildExportArgs(asset, edit, source, output));
      const bytes = await readFile(output); expect(bytes.readUInt16LE(6)).toBe(320); expect(bytes.readUInt16LE(8)).toBe(180);
      const extension = bytes.indexOf('NETSCAPE2.0');
      if (loop === -1) expect(extension).toBe(-1); else expect(bytes.readUInt16LE(extension + 13)).toBe(loop);
      const decoded = await exec(ffmpegPath(), ['-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1_000_000 });
      const colors = new Set<string>(); for (let i = 0; i < decoded.stdout.length; i += 3) colors.add(decoded.stdout.subarray(i, i + 3).toString('hex'));
      expect(colors.size).toBeLessThanOrEqual(64);
      expect(parseOutputSettings(outputSettings(edit))).toMatchObject({ gifWidth: 320, gifLoop: loop, gifColors: 64, gifDither: 'none' });
    }
    for (const patch of [{ gifLoop: -2 }, { gifColors: 257 }, { gifWidth: 0 }, { gifDither: 'command' }]) expect(() => parseEdit({ ...defaultSettings(asset), ...patch }, asset)).toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
