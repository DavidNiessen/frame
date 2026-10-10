import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { openEffect } from '../helpers/effects';
test('moves loading light through the footer without shifting layout and respects reduced motion', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/ffmpeg/ffmpeg-core.wasm', async route => { await gate; await route.continue().catch(() => {}); });
  try {
    const footer = page.getByRole('contentinfo', { name: 'Workspace status' }), beam = footer.locator('.loading-beam');
    await expect(footer).toHaveAttribute('aria-busy', 'false'); const bounds = await footer.boundingBox();
    await openEffect(page, 'Equalizer'); await page.getByLabel('Equalizer mid', { exact: true }).fill('-6');
    await expect(beam).toHaveAttribute('data-active', 'true');
    await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
    const positions = await beam.locator('span').evaluate(async node => {
      const positions: string[] = [];
      for (let i = 0; i < 12; i++) { await new Promise(requestAnimationFrame); positions.push(getComputedStyle(node).transform); }
      return positions;
    });
    expect(new Set(positions).size).toBeGreaterThan(5); expect(await footer.boundingBox()).toEqual(bounds);
    await page.screenshot({ path: 'test-results/browser/footer-loading-beam.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(beam.locator('span')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Remove Equalizer', exact: true }).click();
    await expect(footer).toHaveAttribute('aria-busy', 'false'); await expect(beam).toHaveAttribute('data-active', 'false');
  } finally { release(); }
});
