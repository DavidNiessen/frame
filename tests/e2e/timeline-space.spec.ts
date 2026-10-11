import { importTestMedia } from '../helpers/import-media';
import { expect, test, type Locator } from '@playwright/test';
import { closeEffect, openEffect } from '../helpers/effects';
async function leftAtStart(range: Locator) {
  const fraction = await range.evaluate((node) => {
    const rect = node.getBoundingClientRect(),
      lane = node.closest('.timeline-lane')!.getBoundingClientRect();
    return (rect.left - lane.left) / lane.width;
  });
  expect(fraction).toBeCloseTo(0, 2);
}
for (const width of [1440, 390])
  test(`keeps clips and effects in sequence time before and after scoped edits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await importTestMedia(page);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    const start = page.getByLabel('Trim start', { exact: true }),
      clip = page.locator('.timeline-clip');
    await start.scrollIntoViewIfNeeded();
    const rect = (await start.boundingBox())!,
      lane = await start.evaluate(
        (node) => node.closest('.timeline-lane')!.getBoundingClientRect().width,
      );
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + lane / 6, rect.y + rect.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(start).toHaveAttribute('aria-valuenow', '1');
    await leftAtStart(clip);
    await expect(page.locator('.timeline-overview > span').first()).toHaveCSS('left', '0px');
    await page.locator('.timeline-ruler').scrollIntoViewIfNeeded();
    const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
    await page.mouse.click(ruler.x + ruler.width / 6, ruler.y + ruler.height / 2);
    expect(Number(await page.getByLabel('Seek playhead').inputValue())).toBeCloseTo(2, 1);
    await page.getByLabel('Seek playhead').fill('2');
    await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
    await page.getByRole('button', { name: 'Add Watermark', exact: true }).click();
    const cue = page.getByRole('button', { name: 'Caption 1', exact: true }).locator('..'),
      mark = page.getByRole('button', { name: 'Watermark effect', exact: true }).locator('..');
    await expect(cue).toHaveCSS('left', /px$/);
    expect(
      await cue.evaluate(
        (node) =>
          ((node.getBoundingClientRect().left -
            node.closest('.timeline-lane')!.getBoundingClientRect().left) /
            node.closest('.timeline-lane')!.getBoundingClientRect().width) *
          100,
      ),
    ).toBeCloseTo(100 / 6);
    expect(
      await mark.evaluate(
        (node) =>
          ((node.getBoundingClientRect().left -
            node.closest('.timeline-lane')!.getBoundingClientRect().left) /
            node.closest('.timeline-lane')!.getBoundingClientRect().width) *
          100,
      ),
    ).toBeCloseTo(100 / 6);
    const before = await clip.evaluate((node) => (node as HTMLElement).style.cssText);
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await leftAtStart(clip);
    expect(await clip.evaluate((node) => (node as HTMLElement).style.cssText)).toBe(before);
    await page.getByRole('button', { name: 'Add Crop', exact: true }).click();
    const editCrop = page.getByRole('button', { name: 'Edit Crop', exact: true });
    await expect(editCrop.locator('[aria-label="Applied"]')).toHaveCount(1);
    await expect(editCrop.locator('.lucide-plus')).toHaveCount(0);
    await expect(
      page
        .getByRole('button', { name: 'Select Crop effect', exact: true })
        .locator('[aria-label="Applied"]'),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Crop', exact: true })).toHaveCount(0);
    await editCrop.click();
    await page.getByRole('button', { name: 'Remove Crop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Crop', exact: true })).toBeVisible();
    await leftAtStart(clip);
    await openEffect(page, 'Speed');
    await page.getByLabel('Playback speed').selectOption('2');
    await closeEffect(page);
    expect(
      await cue.evaluate(
        (node) =>
          ((node.getBoundingClientRect().left -
            node.closest('.timeline-lane')!.getBoundingClientRect().left) /
            node.closest('.timeline-lane')!.getBoundingClientRect().width) *
          100,
      ),
    ).toBeCloseTo(100 / 12);
    expect(
      await mark.evaluate(
        (node) =>
          ((node.getBoundingClientRect().left -
            node.closest('.timeline-lane')!.getBoundingClientRect().left) /
            node.closest('.timeline-lane')!.getBoundingClientRect().width) *
          100,
      ),
    ).toBeCloseTo(100 / 12);
    await leftAtStart(clip);
    await start.press('PageUp');
    await leftAtStart(clip);
    await expect(start).toHaveAttribute('aria-valuenow', '2');
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(start).toHaveAttribute('aria-valuenow', '1');
    await leftAtStart(clip);
    await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
    await page.reload();
    await leftAtStart(clip);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(clip).toHaveAttribute('data-duration', '2.5');
    await leftAtStart(clip);
  });
test('gives each fade its own row and keeps a watermark across splits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('2');
  await page.getByRole('button', { name: 'Add Watermark', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('3');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: 'Add Video fade out', exact: true }).click();
  }
  const a = page.getByRole('button', { name: 'Video fade out effect', exact: true }),
    b = page.getByRole('button', { name: 'Video fade out instance 2 effect', exact: true });
  expect(
    await a.evaluate(
      (node, label) =>
        node
          .closest('.timeline-lane')!
          .contains(
            [...document.querySelectorAll('[aria-label]')].find(
              (node) => node.getAttribute('aria-label') === label,
            )!,
          ),
      'Video fade out instance 2 effect',
    ),
  ).toBe(false);
  const firstEdge = page.getByLabel('Video fade out effect start', { exact: true });
  for (let i = 0; i < 25; i++) await firstEdge.press('ArrowLeft');
  await closeEffect(page);
  await b.click();
  await expect(page.getByLabel('Video fade out duration', { exact: true })).toHaveValue('0.5');
  await closeEffect(page);
  const edge = page.getByLabel('Video fade out effect start', { exact: true });
  await edge.press('ArrowLeft');
  await expect(page.getByRole('dialog')).toBeVisible();
  await closeEffect(page);
  const marks = page.getByRole('button', { name: 'Watermark effect', exact: true });
  await expect(marks).toHaveCount(1);
  expect(
    await marks
      .first()
      .evaluate(
        (node) => node.closest('.timeline-lane')!.querySelectorAll('.watermark-bar').length,
      ),
  ).toBe(1);
  await page
    .getByRole('button', { name: 'Video fade out effect', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(b).toHaveCount(0);
  await a.click();
  await expect(page.getByLabel('Video fade out duration')).toHaveValue('0.5');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
});
