import { expect, test, type Page } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { openEffect, closeEffect } from '../helpers/effects';
async function clipMenu(page: Page, index = 0, fraction = 0.5) {
  const body = page.locator('.timeline-clip .range-body').nth(index),
    box = (await body.boundingBox())!;
  await body.click({ button: 'right', position: { x: box.width * fraction, y: box.height / 2 } });
  return page.getByRole('menu', { name: 'Timeline actions' });
}
test('trims at the clicked position, restores edges, undoes and supports keyboard menu navigation', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  let menu = await clipMenu(page, 0, 0.2);
  await menu.getByRole('menuitem', { name: 'Set start here', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Trim start', { exact: true }).getAttribute('aria-valuenow')),
    )
    .toBeCloseTo(1.2, 1);
  menu = await clipMenu(page, 0, 0.5);
  await menu.getByRole('menuitem', { name: 'Set end here', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Trim end', { exact: true }).getAttribute('aria-valuenow')),
    )
    .toBeCloseTo(3.6, 1);
  menu = await clipMenu(page);
  await menu.getByRole('menuitem', { name: 'Restore trimmed edges' }).click();
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await page.locator('.timeline-clip .range-body').focus();
  await page.keyboard.press('Shift+F10');
  menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Compact lanes' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Set start here' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.timeline-clip .range-body')).toBeFocused();
  menu = await clipMenu(page);
  await menu.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Trim end', { exact: true }).getAttribute('aria-valuenow')),
    )
    .toBeCloseTo(3.6, 1);
});
test('copies and pastes sections, plays repeated footage with the correct cursor, and exports it', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  let menu = await clipMenu(page);
  await menu.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  menu = await clipMenu(page, 0, 0.5);
  await menu.getByRole('menuitem', { name: 'Paste here' }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await expect(page.locator('.timeline-summary strong')).toContainText('0:12.0');
  const video = page.locator('video');
  await expect(video).toHaveAttribute('data-preview-clock', 'sequence', { timeout: 45000 });
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true', { timeout: 45000 });
  menu = await clipMenu(page, 1, 0.75);
  await menu.getByRole('menuitem', { name: 'Move playhead here' }).click();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeCloseTo(7.5, 1);
  const before = await page
    .locator('.playhead')
    .evaluate((node) => Number.parseFloat((node as HTMLElement).style.left));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.playhead')
        .evaluate((node) => Number.parseFloat((node as HTMLElement).style.left)),
    )
    .toBeGreaterThan(before + 2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  menu = await clipMenu(page, 1);
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await page.locator('.timeline-clip .range-body').first().focus();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await page.getByLabel('Output format').selectOption('gif');
  await page.getByRole('button', { name: 'Export GIF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
test('duplicates captions independently, edits settings, deletes explicitly and fits a mobile viewport', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  await openEffect(page, 'Captions');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Caption 1', exact: true }).click({ button: 'right' });
  let menu = page.getByRole('menu');
  await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toHaveCount(1);
  await menu.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await closeEffect(page);
  await expect(page.locator('.caption-bar')).toHaveCount(2);
  await page.getByRole('button', { name: 'Caption 2', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit settings' }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toBeVisible();
  await closeEffect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.getByRole('button', { name: 'Caption 2', exact: true }).click({ button: 'right' });
  menu = page.getByRole('menu');
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'test-results/browser/timeline-context-mobile.png' });
  await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.caption-bar')).toHaveCount(1);
});
