import { test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyLiveEffects } from '../helpers/live-effects';
test('plays processed effects in desktop with the bundled FFmpeg', async () => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-native-effects-'));
  const app = await _electron.launch({
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      '.',
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await verifyLiveEffects(page, app);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
