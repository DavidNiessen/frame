import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, probeFile } from '../electron/native';
import {
  contactSheetArgs,
  defaultContactSheet,
  parseContactSheet,
  sheetDimensions,
} from '../src/core/contact-sheet';
import { defaultSettings } from '../src/core/types';
const exec = promisify(execFile);
it('samples edited clip order into a bounded grid instead of following source chronology', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-sheet-'));
  try {
    const source = join(directory, 'scenes.mp4');
    await exec(ffmpegPath(), [
      '-y',
      ...['red', 'green', 'blue'].flatMap((color) => [
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=160x90:r=12:d=1`,
      ]),
      '-filter_complex',
      '[0:v][1:v][2:v]concat=n=3:v=1:a=0',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      source,
    ]);
    const asset = { ...(await probeFile(source)), id: 'a', name: 'scenes.mp4', previewUrl: '' },
      edit = {
        ...defaultSettings(asset),
        clips: [
          { id: 'blue', start: 2, end: 3, effects: {} },
          { id: 'red', start: 0, end: 1, effects: {} },
        ],
      };
    const options = { columns: 2, rows: 2, width: 160, timestamps: false },
      output = join(directory, 'sheet.png');
    await exec(ffmpegPath(), contactSheetArgs(asset, edit, options, source, output));
    const bytes = await readFile(output),
      dimensions = sheetDimensions(options);
    expect(bytes.readUInt32BE(16)).toBe(dimensions.width);
    expect(bytes.readUInt32BE(20)).toBe(dimensions.height);
    const decoded = await exec(
      ffmpegPath(),
      ['-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-frames:v', '1', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 1_000_000 },
    );
    const pixel = (x: number, y: number) => [
      ...decoded.stdout.subarray(
        (y * dimensions.width + x) * 3,
        (y * dimensions.width + x) * 3 + 3,
      ),
    ];
    expect(pixel(88, 53)[2]).toBeGreaterThan(200);
    expect(pixel(88, 151)[0]).toBeGreaterThan(200);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('bounds contact sheet sizes and rejects unsupported options', () => {
  for (const patch of [{ rows: 100 }, { width: 8192 }, { timestamps: 'yes' }])
    expect(() => parseContactSheet({ ...defaultContactSheet(), ...patch })).toThrow();
});
