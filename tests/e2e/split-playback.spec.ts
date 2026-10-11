import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { verifySplitPlayback } from '../helpers/split-playback';

for (const remove of ['trim', 'delete'] as const)
  test(`plays through split clips with ${remove === 'trim' ? 'trimmed' : 'deleted'} gaps without seeking`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await importTestMedia(page);
    await verifySplitPlayback(page, remove);
  });

for (const control of ['button', 'Space'])
  test(`cancels playback intent with ${control} while the decoder is paused for a handoff`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await importTestMedia(page);
    const media = page.locator('video');
    await expect(media).toHaveJSProperty('readyState', 4);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/ffmpeg/ffmpeg-core.wasm', async (route) => {
      await gate;
      await route.continue();
    });
    try {
      for (const time of [2, 4]) {
        await page.getByLabel('Seek playhead').fill(String(time));
        await page.getByRole('button', { name: 'Split', exact: true }).click();
      }
      await page.locator('.timeline-clip .range-body').nth(1).click();
      await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
      await page.getByLabel('Seek playhead').fill('4.5');
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(media).toHaveJSProperty('paused', false);
      // Simulate the decoder's pause arriving before React observes it. The
      // control still says Pause, as it does during the CI source-swap race.
      await media.evaluate((node) => {
        const pause = (event: Event) => event.stopImmediatePropagation();
        node.addEventListener('pause', pause, { capture: true, once: true });
        (node as HTMLVideoElement).pause();
      });
      if (control === 'button')
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
      else await page.keyboard.press('Space');
      await expect(media).toHaveJSProperty('paused', true);
      const stopped = await page.getByLabel('Seek playhead').inputValue();
      release();
      await expect(media).toHaveAttribute('data-preview-clock', 'sequence', { timeout: 60000 });
      await expect(media).not.toHaveAttribute('data-preview-switching', 'true');
      await expect(media).toHaveJSProperty('paused', true);
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Export', exact: true }).click();
      await expect(page.getByLabel('Seek playhead')).toHaveValue(stopped);
    } finally {
      release();
    }
  });

test('keeps playback and editing available while preparing and replacing a preview', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  const media = page.locator('video');
  await expect(media).toHaveJSProperty('readyState', 4);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/ffmpeg/ffmpeg-core.wasm', async (route) => {
    await gate;
    await route.continue();
  });
  for (const time of [2, 4]) {
    await page.getByLabel('Seek playhead').fill(String(time));
    await page.getByRole('button', { name: 'Split', exact: true }).click();
  }
  await page.locator('.timeline-clip .range-body').nth(1).click();
  await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
  try {
    await expect(page.getByRole('contentinfo', { name: 'Workspace status' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export MP4', exact: true })).toBeEnabled();
    await page.getByLabel('Seek playhead').fill('0.5');
    await page.getByLabel('Trim end', { exact: true }).press('Space');
    await expect(media).toHaveJSProperty('paused', false);
    await page.getByLabel('Trim end', { exact: true }).press('Space');
    await expect(media).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
    await expect(page.locator('.effect-settings-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
    // Keep this short fixture playing even when worker startup consumes most of its duration.
    await page.getByLabel('Playback loop', { exact: true }).click();
    await page.getByRole('button', { name: 'Loop sequence', exact: true }).click();
    await page.getByLabel('Seek playhead').fill('0.5');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    release();
    await expect(media).toHaveAttribute('data-preview-clock', 'sequence', { timeout: 60000 });
    await expect(media).not.toHaveAttribute('data-preview-switching', 'true');
    await expect(media).toHaveJSProperty('paused', false);
    const handoffCursor = Number(await page.getByLabel('Seek playhead').inputValue());
    await expect
      .poll(async () =>
        Math.abs(Number(await page.getByLabel('Seek playhead').inputValue()) - handoffCursor),
      )
      .toBeGreaterThan(0.3);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(media).toHaveJSProperty('paused', true);
    const previous = (await media.getAttribute('src'))!;
    // Further trimming retains the last stream, applies the new range immediately, and replaces it in the background.
    let nextRelease!: () => void;
    const nextGate = new Promise<void>((resolve) => {
      nextRelease = resolve;
    });
    await page.unroute('**/ffmpeg/ffmpeg-core.wasm');
    await page.route('**/ffmpeg/ffmpeg-core.wasm', async (route) => {
      await nextGate;
      await route.continue();
    });
    try {
      await page.getByLabel('Trim end', { exact: true }).press('PageDown');
      await expect(media).toHaveAttribute('src', previous);
      await expect(media).toHaveAttribute('data-preview-stale', 'true');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      nextRelease();
      await expect(media).not.toHaveAttribute('src', previous, { timeout: 60000 });
      await expect(media).not.toHaveAttribute('data-preview-stale', 'true');
    } finally {
      nextRelease();
    }
  } finally {
    release();
  }
});
