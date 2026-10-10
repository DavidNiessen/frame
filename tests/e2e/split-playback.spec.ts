import { test } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { verifySplitPlayback } from '../helpers/split-playback';

test('plays through contiguous splits without seeking, while still skipping trimmed gaps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  await verifySplitPlayback(page);
});
