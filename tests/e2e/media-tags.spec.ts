import { expect, test } from '@playwright/test';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
test('edits output tags and uses album metadata to name bulk browser conversions', async ({
  page,
}, info) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true })
      .click();
    await page.getByLabel('Choose media folder').setInputFiles(library.root);
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2, { timeout: 30000 });
    await page.getByLabel('Conversion format').selectOption('flac');
    await page.getByText('Advanced options', { exact: true }).click();
    await page.getByText('Edit output metadata', { exact: true }).click();
    await page.getByLabel('Output album', { exact: true }).fill('Collected songs');
    await page.getByRole('button', { name: 'Remove output artist', exact: true }).click();
    await page.getByLabel('Conversion filename pattern').fill('{album}-{track}-{title}');
    await expect(page.getByLabel('Output filename preview')).toContainText(
      'Collected songs-001-Portable Song.flac',
    );
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download all (ZIP)', exact: true })).toBeVisible(
      { timeout: 30000 },
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (ZIP)', exact: true }).click();
    const files = unzipSync(await readFile((await (await pending).path())!));
    const entries = Object.keys(files).filter((name) => name.endsWith('.flac'));
    expect(entries).toEqual([
      'Album One/Collected songs-001-Portable Song.flac',
      'Album Two/Collected songs-002-Portable Song.flac',
    ]);
    for (const [index, entry] of entries.entries()) {
      const path = info.outputPath(`song-${index}.flac`);
      await writeFile(path, files[entry]);
      const tags = (await probeConversion(path)).format.tags;
      expect(tags.album).toBe('Collected songs');
      expect(tags.artist).toBeUndefined();
      expect(tags.title).toBe('Portable Song');
    }
    await page.reload();
    await page.getByText('Advanced options', { exact: true }).click();
    await page.getByText('Edit output metadata · 2 changes', { exact: true }).click();
    await expect(page.getByLabel('Output album', { exact: true })).toHaveValue('Collected songs');
    await page.getByRole('button', { name: 'Reset metadata changes', exact: true }).click();
    await expect(page.getByLabel('Output album', { exact: true })).toHaveValue('');
  } finally {
    await rm(library.directory, { recursive: true, force: true });
  }
});
