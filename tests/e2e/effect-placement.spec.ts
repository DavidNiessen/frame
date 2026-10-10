import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { effectLibrary } from '../../src/core/effect-library';

test('only source-wide analysis carries Source and labels remain accurate after adding effects', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  async function check() {
    for (const effect of effectLibrary) {
      const card = page.getByRole('button', { name: `Select ${effect.name} effect`, exact: true });
      await expect(card.getByText('Source', { exact: true })).toHaveCount(effect.id === 'silence' ? 1 : 0);
    }
  }
  await check();
  for (const name of ['Captions', 'Watermark', 'Remove silence']) await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await check();
  await expect(page.getByRole('button', { name: 'Select Music & voiceover effect', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Remove silence effect', exact: true }).click();
  await expect(page.locator('.effect-browser-selection')).toContainText('Analyzes the original source');
});
