import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { closeEffect, openCaptionTools } from '../helpers/effects';
test('finds and replaces independent captions with case and word controls and undo', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  await openCaptionTools(page);
  const cues = Array.from(
    { length: 61 },
    (_, i) =>
      `${i + 1}\n00:00:00,000 --> 00:00:01,000\n${i === 0 ? 'Frame frame framework' : i === 60 ? 'frame' : `Caption ${i + 1}`}\n`,
  )
    .join('\n')
    .trim();
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({ name: 'many.srt', mimeType: 'text/plain', buffer: Buffer.from(cues) });
  await expect(page.locator('.caption-bar .range-body')).toHaveCount(61);
  await page.getByText('Find & replace', { exact: true }).click();
  await page.getByLabel('Find caption text', { exact: true }).fill('frame');
  await expect(page.getByLabel('Caption search matches')).toContainText('4 matches');
  await page.getByLabel('Whole words', { exact: true }).check();
  await expect(page.getByLabel('Caption search matches')).toContainText('3 matches');
  await page.getByLabel('Match case', { exact: true }).check();
  await expect(page.getByLabel('Caption search matches')).toContainText('2 matches');
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue(
    'Frame frame framework',
  );
  await closeEffect(page);
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Caption 61');
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('frame');
  await closeEffect(page);
  await page.getByLabel('Replace caption text with', { exact: true }).fill('clip');
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  await page.getByRole('button', { name: 'Caption 61', exact: true }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('clip');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await page.getByRole('button', { name: 'Caption 61', exact: true }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('frame');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  await page.getByRole('button', { name: 'Caption 62', exact: true }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('New caption');
});
