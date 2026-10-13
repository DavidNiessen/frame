import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('loads the bundled CPU speech runtime in a native worker without downloading models', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-speech-runtime-')),
    executablePath = process.env.FRAME_TEST_EXECUTABLE
      ? resolve(process.env.FRAME_TEST_EXECUTABLE)
      : undefined;
  const app = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, FRAME_DEV_URL: '' },
  });
  try {
    const result = await app.evaluate(async ({ app }) => {
      const { Worker } = process.getBuiltinModule(
          'node:worker_threads',
        ) as typeof import('node:worker_threads'),
        { join } = process.getBuiltinModule('node:path') as typeof import('node:path');
      const worker = new Worker(join(app.getAppPath(), 'dist-electron', 'speech-worker.cjs'), {
        workerData: { probe: true },
      });
      try {
        return await new Promise<boolean>((resolve, reject) => {
          worker.once('message', (message) =>
            message.error ? reject(new Error(message.error)) : resolve(message.ready),
          );
          worker.once('error', reject);
          worker.once('exit', () =>
            reject(new Error('Speech runtime ended before initialization.')),
          );
        });
      } finally {
        await worker.terminate();
      }
    });
    expect(result).toBe(true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
