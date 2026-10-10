import { test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { importTestMedia } from '../helpers/import-media';
import { verifySplitPlayback } from '../helpers/split-playback';

for (const remove of ['trim', 'delete'] as const) test(`keeps native split playback continuous across ${remove === 'trim' ? 'trimmed' : 'deleted'} gaps`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-split-playback-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' }); await importTestMedia(page, app); await verifySplitPlayback(page, remove);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
