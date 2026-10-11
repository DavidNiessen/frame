import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('exits on the first quit request, including from macOS fullscreen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-quit-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  const application = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${directory}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, FRAME_DEV_URL: '' },
  });
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    if (process.platform === 'darwin') {
      await (
        await application.browserWindow(page)
      ).evaluate((window) => window.setFullScreen(true));
      await expect
        .poll(() =>
          page.evaluate(async () => (await window.frameDesktop!.windowState()).fullscreen),
        )
        .toBe(true);
    }
    const exited = new Promise<number | null>((resolve) =>
      application.process().once('exit', resolve),
    );
    await application.evaluate(({ app, Menu }) => {
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.role === 'quit');
      if (item) item.click();
      else app.quit();
    });
    expect(await exited).toBe(0);
  } finally {
    if (application.process().exitCode === null) await application.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
