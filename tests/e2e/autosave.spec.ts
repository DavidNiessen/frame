import { trim } from '../helpers/timeline';
import { test, expect, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { conversionLibrary } from '../helpers/conversion-library';
import { openEffect } from '../helpers/effects';
async function retainedKeys(page: Page) {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('frame-workspace', 2);
    request.onsuccess = () => {
      const db = request.result, keys = db.transaction('media').objectStore('media').getAllKeys();
      keys.onsuccess = () => { resolve(keys.result.map(String)); db.close(); }; keys.onerror = () => reject(keys.error);
    }; request.onerror = () => reject(request.error);
  }));
}
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false')); });
test('automatically reopens retained browser media and edits without another import', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await trim(page, 'start', 1); await trim(page, 'end', 2);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  const keys = await retainedKeys(page);
  await page.reload();
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '1', { timeout: 45000 });
  await expect(page.getByLabel('Trim end')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4); await expect(page.locator('.asset-list li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Recover workspace' })).toHaveCount(0);
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.4'); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  expect(await retainedKeys(page)).toEqual(keys); // Editing does not copy the source again.
  await page.reload(); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.4', { timeout: 45000 });
});
test('clears the library and retained media even with a pending edit save', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.3'); await page.getByRole('button', { name: 'Clear media library', exact: true }).click();
  await expect(page.locator('.asset-list li')).toHaveCount(0); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
  expect(await retainedKeys(page)).toEqual([]);
  await page.reload(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready'); await expect(page.locator('video')).toHaveCount(0);
});
test('keeps the last saved workspace when autosave is off, and clears it explicitly', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByLabel('Autosave workspace', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.2');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); expect((await downloaded).suggestedFilename()).toMatch(/\.frame\.json$/);
  await page.reload(); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5', { timeout: 45000 }); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off');
  await page.getByRole('button', { name: 'Clear media library', exact: true }).click();
  await expect(page.locator('.asset-list li')).toHaveCount(0); expect(await retainedKeys(page)).toEqual([]);
  await page.reload(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off'); await expect(page.locator('.asset-list li')).toHaveCount(0);
});
test('restores linked audio and bulk clears sources that cannot be removed individually', async ({ page }) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await page.getByLabel('Choose media files', { exact: true }).setInputFiles(library.sources[0]); await expect(page.locator('.asset-list li')).toHaveCount(2);
    await page.getByRole('button', { name: /^Studio study.mp4/ }).click(); await openEffect(page, 'Music & voiceover');
    await page.getByLabel('Audio track source').selectOption({ label: 'Song.wav' }); await page.getByRole('button', { name: 'Add audio track', exact: true }).click(); await page.getByLabel('Track 1 volume', { exact: true }).fill('0.3');
    await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
    await page.reload(); await expect(page.locator('.asset-list li')).toHaveCount(2, { timeout: 45000 }); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveJSProperty('paused', false);
    await page.getByRole('button', { name: 'Clear media library', exact: true }).click(); await expect(page.locator('video, audio')).toHaveCount(0); expect(await retainedKeys(page)).toEqual([]);
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
test('clears the conversion library on a phone without overflowing its heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 }); await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const clear = page.getByRole('button', { name: 'Clear library', exact: true }); await expect(clear).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await clear.click(); await expect(page.getByRole('heading', { name: 'Bring your media together.' })).toBeVisible(); expect(await retainedKeys(page)).toEqual([]);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Bring your media together.' })).toBeVisible();
});
test('preserves available media and the checkpoint when a retained source is missing', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  await page.getByRole('button', { name: /Start with a sample/ }).click(); await expect(page.locator('.asset-list li')).toHaveCount(2); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  await page.evaluate(() => new Promise<void>(resolve => {
    const r = indexedDB.open('frame-workspace', 2); r.onsuccess = () => { const db = r.result, tx = db.transaction('media', 'readwrite'), store = tx.objectStore('media'), keys = store.getAllKeys(); keys.onsuccess = () => store.delete(keys.result[0]); tx.oncomplete = () => { db.close(); resolve(); }; };
  }));
  await page.reload(); await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 45000 }); await expect(page.getByRole('status').filter({ hasText: 'recovery issues' })).toBeVisible();
  // An unchanged partial recovery must still retain the missing source recipe in its checkpoint.
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); // Losing visibility flushes autosave.
  const sourceCount = await page.evaluate(() => new Promise<number>(resolve => { const r = indexedDB.open('frame-workspace', 2); r.onsuccess = () => { const db = r.result, read = db.transaction('autosave').objectStore('autosave').get('workspace'); read.onsuccess = () => { resolve(read.result.document.project.sources.length); db.close(); }; }; }));
  expect(sourceCount).toBe(2);
});
test('keeps the previous checkpoint when storage rejects a save', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'autosave') throw new DOMException('Storage is full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.2'); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave paused');
  await page.reload(); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5', { timeout: 45000 }); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
});
test('keeps library actions inside the narrowest resizable panel', async ({ page }) => {
  await page.goto('/'); const divider = page.getByRole('separator', { name: 'Resize media library', exact: true }); await divider.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '180');
  const panel = (await page.locator('#media-library').boundingBox())!;
  for (const name of ['Add media', 'Clear media library']) {
    const button = page.getByRole('button', { name, exact: true }), bounds = (await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(panel.x); expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
});
