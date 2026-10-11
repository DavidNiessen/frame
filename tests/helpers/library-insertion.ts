import { expect, type Page } from '@playwright/test';
import { closeEffect, openEffect } from './effects';
import { insertAudioLayer } from './audio-layers';
/** Same user workflow exercises native FFmpeg and the browser's independent WASM worker. */
export async function verifyLibraryInsertion(page: Page) {
  await expect(page.locator('.asset-list li')).toHaveCount(3);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Trim start', { exact: true }).press('PageUp');
  await page.getByLabel('Trim end', { exact: true }).press('PageDown');
  await openEffect(page, 'Volume');
  await page.getByLabel('Volume', { exact: true }).fill('0.4');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Insert Second.mp4 into timeline', exact: true }).click();
  await expect(page.locator('.asset-list li')).toHaveCount(4, { timeout: 60000 });
  await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '12');
  await expect(page.locator('.timeline-clip').nth(0)).toContainText('First.mp4');
  await expect(page.locator('.timeline-clip').nth(1)).toContainText('Second.mp4');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(1);
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2);
  // Drag-and-drop is an alternative to the library insert button.
  const payload = await page.evaluateHandle(
    (id) => {
      const data = new DataTransfer();
      data.setData('application/x-frame-library-media', id);
      return data;
    },
    await page
      .getByRole('button', { name: 'Insert Third.mp4 into timeline', exact: true })
      .evaluate((node) => {
        const source = node.closest('li')!.querySelector<HTMLButtonElement>('.asset-select')!;
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        return transfer.getData('application/x-frame-library-media');
      }),
  );
  await page.locator('#media-timeline').dispatchEvent('drop', { dataTransfer: payload });
  await expect(page.locator('.asset-list li')).toHaveCount(5, { timeout: 60000 });
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await expect(page.locator('.timeline-clip').nth(2)).toContainText('Third.mp4');
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '18');
  await page.getByLabel('Project tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Extract audio', exact: true }).click();
  await expect(page.locator('.asset-list li')).toHaveCount(6, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^First-audio.flac/ })).toBeVisible();
  // Extraction keeps the video selected, so its audio can immediately be inserted over the edit.
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await page.getByLabel('Seek playhead').fill('7');
  await insertAudioLayer(page, 'First-audio.flac');
  await expect(
    page.getByRole('slider', { name: 'Audio track 1: First-audio.flac start', exact: true }),
  ).toHaveAttribute('aria-valuenow', '5');
  await page.getByLabel('Track 1 volume', { exact: true }).fill('0.25');
  await expect(
    page.getByRole('button', { name: 'Select Music & voiceover effect', exact: true }),
  ).toHaveCount(0);
  await closeEffect(page);
  await page
    .getByRole('button', { name: 'Layer First-audio.flac over timeline', exact: true })
    .click();
  await expect(page.locator('.audio-layer-bar')).toHaveCount(2);
  await page.locator('.audio-layer-bar .range-body').nth(1).click();
  await expect(
    page.getByRole('dialog', { name: 'Audio layer settings', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove layer', exact: true }).click();
  await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', {
    timeout: 30000,
  });
}
