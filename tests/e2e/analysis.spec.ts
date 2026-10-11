import { importTestMedia } from '../helpers/import-media';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('automatically generates a real video waveform in the browser', async ({ page }) => {
  await page.goto('/');
  await importTestMedia(page);
  await expect(page.getByRole('button', { name: 'Generate waveform', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({
    timeout: 45000,
  });
  expect(
    (await page
      .getByRole('img', { name: 'Audio waveform', exact: true })
      .locator('path')
      .getAttribute('d'))!.length,
  ).toBeGreaterThan(100);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await trim(page, 'start', 1);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
});
test('skips video waveform generation while disabled and starts when enabled', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('frame:auto-waveforms', 'false');
    Reflect.set(window, 'waveformRequests', 0);
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const packet = message as { type?: string; data?: { args?: string[] } };
      if (
        packet.type === 'EXEC' &&
        packet.data?.args?.some((arg) => arg.includes('astats=metadata'))
      )
        Reflect.set(window, 'waveformRequests', Reflect.get(window, 'waveformRequests') + 1);
      Reflect.apply(post, this, [message, options ?? []]);
    };
  });
  await page.goto('/');
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByRole('button', { name: /Generate waveform/ })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Generate audio waveforms automatically' }).check();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({
    timeout: 45000,
  });
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(1);
});
