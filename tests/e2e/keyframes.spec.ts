import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
test('edits visual keyframes at the playhead, draws timeline diamonds and exports in the browser', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i);
  const buffer = await readFile(resolve('tests/fixtures/sample.mp4'));
  await page
    .getByLabel('Choose media files', { exact: true })
    .setInputFiles(
      ['Base.mp4', 'Overlay.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer })),
    );
  await page
    .getByRole('button', { name: 'Layer Overlay.mp4 over current media', exact: true })
    .click();
  await page.getByRole('switch', { name: 'Animate x position', exact: true }).check();
  await page.getByLabel('X position keyframe value', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Go to time', exact: true }).click();
  await page.getByLabel('Sequence time', { exact: true }).fill('00:00:02.000');
  await page.getByRole('button', { name: 'Go to position', exact: true }).click();
  await page.getByLabel('X position keyframe value', { exact: true }).fill('50');
  await page
    .getByLabel('X position keyframe interpolation', { exact: true })
    .selectOption('smooth');
  await expect(page.locator('.timeline-keyframe-dot')).toHaveCount(2);
  await page.getByLabel('Animated layer property', { exact: true }).selectOption('opacity');
  await page.getByRole('switch', { name: 'Animate opacity', exact: true }).check();
  await page.getByLabel('Opacity keyframe value', { exact: true }).fill('0.4');
  await expect(page.locator('.timeline-keyframe-dot')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('keyframe-editor.png') });
  await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 60000,
  });
});
