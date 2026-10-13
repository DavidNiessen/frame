import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { speechModel } from '../../src/core/transcription';
const cache = process.env.FRAME_SPEECH_MODEL_CACHE,
  audio = process.env.FRAME_SPEECH_TEST_AUDIO;
test('browser speech inference uses a worker, caches its model and creates separate captions offline', async ({
  page,
}, info) => {
  test.skip(
    !cache || !audio,
    'Set FRAME_SPEECH_MODEL_CACHE and FRAME_SPEECH_TEST_AUDIO for real model inference.',
  );
  test.setTimeout(180000);
  let offline = false,
    requests = 0;
  await page.route('https://huggingface.co/**', async (route) => {
    requests++;
    if (offline) {
      await route.abort();
      return;
    }
    const prefix = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/`,
      url = route.request().url();
    if (!url.startsWith(prefix)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    const file = url.slice(prefix.length).split('?')[0];
    try {
      const body = await readFile(join(cache!, speechModel.id, speechModel.revision, file));
      await route.fulfill({
        status: 200,
        body,
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        },
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i);
  await page.getByLabel('Choose media files', { exact: true }).setInputFiles(audio!);
  await page.getByText('Caption tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Generate captions locally', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Generate captions locally', exact: true });
  await modal.getByLabel('Speech language', { exact: true }).selectOption('english');
  await modal.getByRole('button', { name: 'Generate captions locally', exact: true }).click();
  await expect(
    modal.locator('[aria-label="Generated captions"], [role="alert"]').first(),
  ).toBeVisible({ timeout: 120000 });
  await expect(modal.getByLabel('Generated captions')).toContainText(/country|Americans|ask/i, {
    timeout: 120000,
  });
  expect(requests).toBeGreaterThan(0);
  offline = true;
  const before = requests;
  await modal.getByRole('button', { name: 'Generate again', exact: true }).click();
  await expect(
    modal.locator('[aria-label="Generated captions"], [role="alert"]').first(),
  ).toBeVisible({ timeout: 120000 });
  await expect(modal.getByLabel('Generated captions')).toContainText(/country|Americans|ask/i, {
    timeout: 120000,
  });
  expect(requests).toBe(before);
  await page.screenshot({ path: info.outputPath('local-caption-generation.png') });
  await modal.getByRole('button', { name: /Add \d+ captions to timeline/ }).click();
  await expect(page.locator('.caption-bar')).not.toHaveCount(0);
});
