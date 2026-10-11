import { expect, test } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { conversionLibrary } from '../helpers/conversion-library';
test('previews filename templates and saves named songs inside preserved album folders', async ({
  page,
}) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true })
      .click();
    await page.getByLabel('Choose media folder').setInputFiles(library.root);
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2, { timeout: 45000 });
    await page.getByLabel('Conversion format', { exact: true }).selectOption('flac');
    await page.getByText('Advanced options', { exact: true }).click();
    await page.getByLabel('Conversion filename pattern', { exact: true }).fill('{bad}');
    await expect(
      page.getByRole('complementary', { name: 'Format & quality' }).getByRole('alert'),
    ).toContainText('Available filename tokens');
    await page
      .getByLabel('Conversion filename pattern', { exact: true })
      .fill('{folder}-{index}-{name}');
    await expect(page.getByLabel('Output filename preview')).toContainText(
      'Album One/Album One-001-Song.flac',
    );
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download all (ZIP)', exact: true })).toBeVisible(
      { timeout: 45000 },
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (ZIP)', exact: true }).click();
    const files = unzipSync(await readFile((await (await pending).path())!));
    expect(Object.keys(files).filter((name) => name.endsWith('.flac'))).toEqual([
      'Album One/Album One-001-Song.flac',
      'Album Two/Album Two-002-Song.flac',
    ]);
    expect(files['Album One/Album One-001-Song.flac'].slice(0, 4)).toEqual(
      new Uint8Array([102, 76, 97, 67]),
    );
    const reportDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save conversion report', exact: true }).click();
    const report = await readFile((await (await reportDownload).path())!, 'utf8');
    expect(report).toContain('Album One/Album One-001-Song.flac');
    expect(report).toContain('Album Two/Album Two-002-Song.flac');
    expect(report.match(/"done"/g)).toHaveLength(2);
    expect(report).toContain('Size change (%)');
  } finally {
    await rm(library.directory, { recursive: true, force: true });
  }
});
