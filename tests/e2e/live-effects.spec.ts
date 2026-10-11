import { test } from '@playwright/test';
import { verifyLiveEffects } from '../helpers/live-effects';
test('automatically plays audible EQ and real LUTs without export or losing editable captions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('frame:auto-waveforms', 'false');
    localStorage.setItem('frame:workspace-autosave', 'false');
  });
  await page.goto('/');
  await verifyLiveEffects(page);
});
