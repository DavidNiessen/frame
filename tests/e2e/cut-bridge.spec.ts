import { expect, test } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';

test('bridges a deleted section with the standby decoder instead of freezing on a seek', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  const media = page.locator('video[data-frame-source]'),
    bridge = page.locator('canvas[data-cut-bridge]');
  await expect(media).toHaveJSProperty('readyState', 4);
  for (const time of [2, 4]) {
    await page.getByLabel('Seek playhead').fill(String(time));
    await page.getByRole('button', { name: 'Split', exact: true }).click();
  }
  await page.locator('.timeline-clip .range-body').nth(1).click();
  await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
  await expect(bridge).toHaveCount(1);
  // The bridge never adds a second video to the document.
  await expect(page.locator('video')).toHaveCount(1);
  await page.getByLabel('Seek playhead').fill('0.8');
  await media.evaluate((node: HTMLVideoElement) => {
    const record = window as unknown as { seeks: number[]; bridged: boolean };
    record.seeks = [];
    record.bridged = false;
    node.addEventListener('seeking', () => record.seeks.push(node.currentTime));
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-cut-bridge]')!;
    const watch = () => {
      if (canvas.style.visibility === 'visible') record.bridged = true;
      if (!record.bridged) requestAnimationFrame(watch);
    };
    watch();
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('Seek playhead').inputValue()), {
      timeout: 10000,
    })
    .toBeGreaterThan(4.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const record = await page.evaluate(() => {
    const { seeks, bridged } = window as unknown as { seeks: number[]; bridged: boolean };
    return { seeks, bridged };
  });
  expect(record.bridged).toBe(true);
  // The source seeks past the cut by the time the seek takes, while the
  // standby decoder shows the first frames of the next clip.
  expect(record.seeks).toHaveLength(1);
  expect(record.seeks[0]).toBeGreaterThan(4);
  expect(record.seeks[0]).toBeLessThan(5);
  await expect(bridge).toHaveCSS('visibility', 'hidden');
});
