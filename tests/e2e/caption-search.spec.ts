import { expect, test } from '@playwright/test';
import { closeEffect, openEffect } from '../helpers/effects';
test('finds and replaces caption text across pages with case and word controls and undo', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Captions');
  const cues = Array.from({ length: 61 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\n${i === 0 ? 'Frame frame framework' : i === 60 ? 'frame' : `Caption ${i + 1}`}\n`).join('\n').trim();
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'many.srt', mimeType: 'text/plain', buffer: Buffer.from(cues) });
  await expect(page.locator('.cue textarea')).toHaveCount(30); await page.getByText('Find & replace', { exact: true }).click();
  await page.getByLabel('Find caption text', { exact: true }).fill('frame'); await expect(page.getByLabel('Caption search matches')).toContainText('4 matches');
  await page.getByLabel('Whole words', { exact: true }).check(); await expect(page.getByLabel('Caption search matches')).toContainText('3 matches');
  await page.getByLabel('Match case', { exact: true }).check(); await expect(page.getByLabel('Caption search matches')).toContainText('2 matches');
  await page.getByRole('button', { name: 'Next match', exact: true }).click(); await page.getByRole('button', { name: 'Next match', exact: true }).click(); await expect(page.getByLabel('Subtitle 61 text', { exact: true })).toBeFocused();
  await page.getByLabel('Replace caption text with', { exact: true }).fill('clip'); await page.getByRole('button', { name: 'Replace all', exact: true }).click(); await expect(page.getByLabel('Subtitle 61 text', { exact: true })).toHaveValue('clip');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await openEffect(page, 'Captions'); await page.getByRole('button', { name: 'Next captions', exact: true }).click(); await page.getByRole('button', { name: 'Next captions', exact: true }).click(); await expect(page.getByLabel('Subtitle 61 text', { exact: true })).toHaveValue('frame');
  await closeEffect(page); await page.getByRole('button', { name: 'Add Captions', exact: true }).click(); await page.getByRole('button', { name: 'Caption 62', exact: true }).click(); await expect(page.getByLabel('Subtitle 1 text', { exact: true })).toHaveValue('New caption');
});
