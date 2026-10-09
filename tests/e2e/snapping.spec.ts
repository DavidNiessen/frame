import { expect, test } from '@playwright/test';
test('snaps dragged trim edges to markers and allows Alt and the toggle to bypass snapping', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('heading', { name: 'Timeline', exact: true }).click(); await page.keyboard.press('m');
  await page.getByLabel('Seek playhead').fill('3');
  const handle = page.getByRole('slider', { name: 'Trim end', exact: true });
  async function drag(alt = false) {
    const box = (await handle.boundingBox())!;
    const track = await handle.evaluate(node => { const lane = node.closest('.timeline-lane')!; const bounds = lane.getBoundingClientRect(); return { left: bounds.left, width: bounds.width, total: Number(node.parentElement!.getAttribute('data-duration')) }; });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + track.width * (2 - Number(await handle.getAttribute('aria-valuenow'))) / track.total + 3, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  }
  await drag(); await expect(handle).toHaveAttribute('aria-valuenow', '2');
  await handle.press('End'); await drag(true); expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(2.01);
  await handle.press('End'); await page.getByRole('button', { name: 'Timeline snapping', exact: true }).click(); await drag();
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(2.01);
  await page.reload(); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.getByRole('button', { name: 'Timeline snapping', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
