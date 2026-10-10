import { closeEffect, openEffect } from '../helpers/effects';
import { test, expect, type Page } from '@playwright/test';

async function sample(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 45000 });
}

test('expands the existing playing preview into the workspace and restores panel sizes with Escape', async ({ page }) => {
  await sample(page);
  await page.getByRole('separator', { name: 'Resize timeline', exact: true }).press('Shift+ArrowUp');
  const preview = page.getByRole('region', { name: 'Media preview', exact: true });
  const original = (await preview.boundingBox())!;
  await page.evaluate(() => { (window as unknown as { originalVideo: Element | null }).originalVideo = document.querySelector('video'); });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // Sample the animation during its first frame rather than after a test-driver round trip.
  const animating = await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).evaluate(node => {
    (node as HTMLButtonElement).click();
    return new Promise<boolean>(resolve => requestAnimationFrame(() => resolve(document.querySelector('.preview-panel')!.getAnimations().some(animation => animation.playState === 'running'))));
  });
  expect(animating).toBe(true);
  await expect.poll(async () => (await preview.boundingBox())!.width).toBeGreaterThan(original.width + 400);
  await preview.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  const workspace = (await page.locator('.editor-layout').boundingBox())!, expanded = (await preview.boundingBox())!;
  expect(expanded.width).toBeCloseTo(workspace.width, 0); expect(expanded.height).toBeCloseTo(workspace.height, 0);
  await expect(page.locator('.library')).toBeHidden(); await expect(page.locator('.timeline')).toBeHidden();
  await expect(page.locator('.inspector')).toBeHidden(); await expect(page.locator('.workspace-bar')).toBeHidden();
  await expect(page.locator('.app-header')).toBeVisible(); await expect(page.locator('.app-footer')).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { originalVideo: Element }).originalVideo === document.querySelector('video'))).toBe(true);
  await expect(page.locator('video')).toHaveJSProperty('paused', false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).focus(); await page.mouse.move(40, 40);
  await expect.poll(() => page.locator('.transport').evaluate(node => getComputedStyle(node).opacity)).toBe('0');
  await expect(page.locator('.preview-panel .workspace-heading')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Exit fullscreen preview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit fullscreen preview', exact: true }).focus();
  await expect.poll(() => page.locator('.transport').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Fullscreen preview', exact: true })).toBeFocused();
  await preview.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  expect((await preview.boundingBox())!.height).toBeCloseTo(original.height, 0);
  await expect(page.getByRole('separator', { name: 'Resize timeline', exact: true })).toHaveAttribute('aria-valuenow', '288');
  await expect(page.locator('.timeline')).toBeVisible();
});

test('Space toggles playback on timeline ranges and clips without activating them or scrolling', async ({ page }) => {
  await sample(page);
  const targets = [page.getByLabel('Seek playhead'), page.getByLabel('Trim start', { exact: true }), page.getByLabel('Trim end', { exact: true }), page.locator('.timeline-clip .range-body'), page.getByLabel('Timeline zoom'), page.getByRole('region', { name: 'Timeline tracks', exact: true })];
  for (const target of targets) {
    await page.getByLabel('Seek playhead').fill('0.5'); await target.focus();
    const scroll = await page.evaluate(() => window.scrollY);
    await target.press('Space'); await expect(page.locator('video')).toHaveJSProperty('paused', false);
    expect(await page.locator('video').evaluate(node => (node as HTMLVideoElement).currentTime)).toBeLessThan(2);
    await target.press('Space'); await expect(page.locator('video')).toHaveJSProperty('paused', true);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  }
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  // Ordinary timeline buttons keep their native Space activation.
  await page.getByRole('button', { name: 'Split', exact: true }).press('Space');
  await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  // Typing in caption text must never invoke playback shortcuts.
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Captions');
  await page.getByLabel('Caption text', { exact: true }).fill('Hello'); await page.getByLabel('Caption text', { exact: true }).press('End'); await page.getByLabel('Caption text', { exact: true }).press('Space');
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('Hello ');
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  const captions = page.locator('.timeline-lane-group').filter({ has: page.locator('.caption-lane') });
  await captions.locator('summary').press('Space'); await expect(captions).not.toHaveAttribute('open');
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
});

test('fills phone and short desktop screens, respects reduced motion and restores on navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 650 });
  await sample(page);
  await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
  expect(await page.locator('.preview-panel').evaluate(node => node.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen preview', exact: true }).click();
  await expect(page.locator('.timeline')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await expect(page.locator('.timeline')).toBeVisible(); await expect(page.getByRole('button', { name: 'Fullscreen preview', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
  await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
  await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.locator('.timeline')).toBeVisible();
});
