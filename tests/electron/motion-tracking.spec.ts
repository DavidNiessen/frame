import { expect, test, _electron } from '@playwright/test';
import { movingSubjectFrames } from '../helpers/moving-subject';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../../electron/native';
import { defaultSettings } from '../../src/core/types';
import { trackMotion } from '../../src/core/motion-tracking';
test('desktop extracts bounded motion frames using its bundled FFmpeg and validated bridge', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frame-motion-native-'));
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  try {
    const raw = join(dir, 'frames.raw'),
      video = join(dir, 'moving.mp4');
    await writeFile(raw, movingSubjectFrames());
    await promisify(execFile)(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-s',
      '160x90',
      '-r',
      '8',
      '-i',
      raw,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      video,
    ]);
    app = await _electron.launch({
      args: [
        `--user-data-dir=${join(dir, 'profile')}`,
        ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
        '.',
      ],
      env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
    });
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, video);
    const page = await app.firstWindow();
    const report = await page.evaluate(() => window.frameDesktop!.importFiles());
    const asset = report.assets[0],
      edit = defaultSettings(asset);
    const bytes = await page.evaluate(
      async ({ id, edit }) =>
        Array.from(
          await window.frameDesktop!.analysisData(id, edit, { kind: 'tracking', start: 0, end: 3 }),
        ),
      { id: asset.id, edit },
    );
    const result = trackMotion(new Uint8Array(bytes), 320, 180, 8, {
      x: 40,
      y: 40,
      width: 40,
      height: 40,
    });
    expect(result.points).toHaveLength(24);
    expect(result.points.at(-1)!.x).toBeCloseTo(152, 0);
  } finally {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
