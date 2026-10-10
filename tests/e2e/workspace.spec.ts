import { openEffect } from '../helpers/effects';
import { test, expect } from '@playwright/test';

test('keeps desktop editing focused and preserves effects across accessible tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const effects = page.getByRole('tab', { name: 'Effects', exact: true });
  const output = page.getByRole('tab', { name: 'Export', exact: true });
  await expect(page.getByRole('tab', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(effects).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Trim start', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Playback speed')).toBeHidden();
  await expect(page.getByLabel('Export preset')).toBeHidden();
  await expect(page.getByLabel('Output format')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const timeline = (await page.locator('.timeline').boundingBox())!;
  expect(timeline.y + timeline.height).toBeLessThan(900);
  await effects.focus(); await effects.press('ArrowRight');
  await expect(output).toBeFocused();
  await expect(output).toHaveAttribute('aria-selected', 'true');
  await output.press('ArrowRight');
  await expect(effects).toBeFocused();
  await expect(effects).toHaveAttribute('aria-selected', 'true');
  await openEffect(page, 'Speed'); await page.getByLabel('Playback speed').selectOption('2');
  await output.click();
  await page.getByLabel('Output format').selectOption('gif');
  await page.getByText('Advanced settings', { exact: true }).click();
  await expect(page.getByLabel('GIF frame rate')).toBeVisible();
  await effects.click();
  await expect(page.getByLabel('Playback speed')).toHaveValue('2');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Output format')).toHaveValue('mp4');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await effects.click();
  await expect(page.locator('.effect-stack-heading h3 span')).toHaveText('0');
  await expect(page.getByLabel('Playback speed')).toHaveValue('1');
  await page.getByLabel('Project tools', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Merge clips', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Merge clips', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Merge clips', exact: true })).toBeHidden();
  await expect(page.getByLabel('Project tools', { exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
});

test('supports precise touch seeking and focused tools on narrow screens', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await page.getByLabel('Seek playhead').waitFor();
    await page.locator('.timeline-track').scrollIntoViewIfNeeded();
    const bounds = (await page.locator('.timeline-track').boundingBox())!;
    await page.touchscreen.tap(bounds.x + bounds.width * 0.2, bounds.y + bounds.height / 2);
    await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeCloseTo(1.2, 1);
    await page.getByRole('tab', { name: 'Effects', exact: true }).click();
    await expect(page.getByLabel('Search effects')).toBeVisible();
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    await expect(page.getByLabel('Export preset')).toBeVisible();
    await page.getByRole('tab', { name: 'Effects', exact: true }).click();
    await expect(page.getByLabel('Trim start', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
