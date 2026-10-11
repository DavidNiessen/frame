import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { closeEffect } from '../helpers/effects';
for (const width of [1440, 390])
  test(`moves and trims independent watermarks while keeping settings open at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await importTestMedia(page);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByLabel('Seek playhead').fill('1');
    await page.getByRole('button', { name: 'Add Watermark', exact: true }).click();
    await page.getByRole('button', { name: 'Watermark effect', exact: true }).click();
    await page.getByLabel('Overlay text', { exact: true }).fill('First overlay');
    await closeEffect(page);
    await page.getByLabel('Seek playhead').fill('4');
    await page.getByRole('button', { name: 'Add Watermark', exact: true }).click();
    await page.getByRole('button', { name: 'Watermark instance 2 effect', exact: true }).click();
    await page.getByLabel('Overlay text', { exact: true }).fill('Second overlay');
    await closeEffect(page);
    const first = page.getByRole('button', { name: 'Watermark effect', exact: true }),
      start = page.getByLabel('Watermark effect start', { exact: true }),
      end = page.getByLabel('Watermark effect end', { exact: true });
    await first.focus();
    await first.press('ArrowRight');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(start).toHaveAttribute('aria-valuenow', '1.01');
    await expect(end).toHaveAttribute('aria-valuenow', '3.01');
    await expect(page.getByLabel('Overlay text', { exact: true })).toHaveValue('First overlay');
    await first.press('ArrowRight');
    await expect(start).toHaveAttribute('aria-valuenow', '1.02');
    await closeEffect(page);
    await end.press('Home');
    await expect(page.getByRole('dialog')).toBeVisible();
    await closeEffect(page);
    const a = (await start.boundingBox())!,
      b = (await end.boundingBox())!;
    expect(a.width).toBeGreaterThanOrEqual(16);
    expect(b.width).toBeGreaterThanOrEqual(16);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2);
    await page.mouse.up();
    expect(Number(await end.getAttribute('aria-valuenow'))).toBeGreaterThan(1.07);
    await closeEffect(page);
    await first.focus();
    const shown = Number(await start.getAttribute('aria-valuenow'));
    await first.press('ArrowRight');
    await expect(start).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((shown + 0.01) * 100) / 100),
    );
    await closeEffect(page);
    await page.getByLabel('Seek playhead').fill('4.5');
    await expect(
      page.getByRole('button', { name: 'Move watermark 2 text', exact: true }),
    ).toHaveText('Second overlay');
    await expect(
      page.getByRole('button', { name: 'Move watermark 1 text', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Watermark instance 2 effect', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Watermark', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Watermark instance 2 effect', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Watermark instance 2 effect', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
