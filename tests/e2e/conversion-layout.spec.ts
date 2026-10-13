import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const noPageScroll = async (page: import('@playwright/test').Page) => {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - innerWidth,
      height: document.documentElement.scrollHeight - innerHeight,
    })),
  ).toEqual({ width: 0, height: 0 });
};

test('keeps conversion actions visible while a large queue and advanced options scroll independently', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Workflow' })
    .getByRole('button', { name: 'Convert', exact: true })
    .click();
  await noPageScroll(page);
  await expect(page.getByRole('button', { name: 'Add files', exact: true })).toBeEnabled();
  const source = await readFile('tests/fixtures/sample.mp4');
  await page.getByLabel('Choose media files').setInputFiles(
    Array.from({ length: 18 }, (_, index) => ({
      name: `A long media filename for conversion ${index + 1}.mp4`,
      mimeType: 'video/mp4',
      buffer: source,
    })),
  );
  await expect(page.locator('.conversion-table tbody tr')).toHaveCount(18, { timeout: 30000 });
  await page.getByLabel('Conversion format').selectOption('mp4');
  await page.getByText('Advanced options', { exact: true }).click();
  for (const [width, height] of [
    [1440, 700],
    [1100, 600],
    [900, 500],
  ]) {
    await page.setViewportSize({ width, height });
    await noPageScroll(page);
    await page.getByLabel('Conversion filename pattern').scrollIntoViewIfNeeded();
    expect(
      await page.locator('.conversion-settings-body').evaluate((node) => node.scrollTop),
    ).toBeGreaterThan(0);
    await expect(
      page.getByRole('button', { name: 'Convert 18 files', exact: true }),
    ).toBeInViewport();
    await expect(page.locator('.app-footer')).toBeInViewport();
    await page.locator('.conversion-table-wrap').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(
      page.getByLabel('Convert A long media filename for conversion 18.mp4', { exact: true }),
    ).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Files to convert' })).toBeInViewport();
    await noPageScroll(page);
  }
  await page.screenshot({ path: 'test-results/conversion-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const panels = page.getByRole('navigation', { name: 'Conversion panels' });
  await expect(page.getByLabel('Conversion format')).toBeVisible();
  await page.getByLabel('Conversion filename pattern').scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Convert 18 files', exact: true }),
  ).toBeInViewport();
  await noPageScroll(page);
  await panels.getByRole('button', { name: /^Files/ }).click();
  await expect(page.getByRole('heading', { name: 'Files to convert' })).toBeVisible();
  await page.getByLabel('Search conversion files').fill('18.mp4');
  await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
  await noPageScroll(page);
  await page.screenshot({ path: 'test-results/conversion-mobile.png' });
  await panels.getByRole('button', { name: 'Format & quality', exact: true }).click();
  await expect(page.getByLabel('Conversion format')).toBeVisible();
});

test('shows import actions in the mobile files pane and opens options after importing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Workflow' })
    .getByRole('button', { name: 'Convert', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Add files', exact: true })).toBeVisible();
  await noPageScroll(page);
  await page.getByLabel('Choose media files').setInputFiles('tests/fixtures/sample.mp4');
  await expect(page.getByLabel('Conversion format')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Convert 1 file', exact: true })).toBeInViewport();
  await noPageScroll(page);
});
