import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { openMobileMenu } from '../helpers/header';
import { effectLibrary } from '../../src/core/effect-library';
import { closeEffect } from '../helpers/effects';
test('finds commands with keyboard navigation, respects unavailable actions and opens editor tools', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Search commands', exact: true });
  await expect(search).toBeFocused();
  await search.fill('save project');
  await expect(page.getByRole('option', { name: /Save project/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toBeVisible();
  await search.fill('scene');
  await expect(page.getByRole('option', { name: /Find scene changes/ })).toBeDisabled();
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toBeVisible();
  await search.fill('convert');
  await search.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Command palette', exact: true }),
  ).not.toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+k');
  await search.fill('editor');
  await search.press('Enter');
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('Control+k');
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await search.fill('marker');
  await expect(
    page.getByRole('dialog', { name: 'Command palette', exact: true }).getByRole('option'),
  ).toHaveCount(0);
  await search.fill('effects');
  await search.press('Enter');
  await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await search.fill('undo');
  await search.press('Enter');
  await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await search.fill('save project');
  const projectDownload = page.waitForEvent('download');
  await search.press('Enter');
  expect((await projectDownload).suggestedFilename()).toMatch(/\.frame\.json$/);
  await page.keyboard.press('Control+k');
  await search.fill('export settings');
  await search.press('Enter');
  await expect(page.getByRole('tab', { name: 'Export', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
  await page.keyboard.press('Control+k');
  await search.fill('export settings');
  await search.press('Enter');
  await expect(page.locator('.app-shell')).not.toHaveClass(/preview-expanded/);
  await page.keyboard.press('Control+k');
  await search.fill('scene');
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Find scene changes', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Command palette', exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  await search.fill('does-not-exist');
  await expect(page.getByRole('status').filter({ hasText: 'No matching commands' })).toBeVisible();
  await search.press('Escape');
  await expect(page.getByRole('button', { name: 'Search commands', exact: true })).toBeFocused();
});
for (const width of [1440, 390])
  test(`adds every effect from commands and reopens singleton settings at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const search = page.getByRole('combobox', { name: 'Search commands', exact: true });
    await search.fill('captions');
    await expect(page.locator('[data-command="effect-captions"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await importTestMedia(page);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    async function apply(id: string, query: string) {
      await closeEffect(page);
      await page.keyboard.press('Control+k');
      await search.fill(query);
      await page.locator(`[data-command="effect-${id}"]`).click();
      await expect(
        page.getByRole('dialog', { name: 'Command palette', exact: true }),
      ).not.toBeVisible();
      await expect(page.locator('.effect-settings-overlay')).toBeVisible();
      await closeEffect(page);
    }
    for (const effect of effectLibrary.filter(
      (item) => !item.mediaKinds || item.mediaKinds.includes('video'),
    )) {
      await apply(effect.id, effect.name);
      const card = page
        .getByRole('button', { name: `Select ${effect.name} effect`, exact: true })
        .locator('..');
      if (effect.repeatable) {
        await expect(card.locator('[aria-label="Applied"]')).toHaveCount(0);
        await expect(
          card.getByRole('button', { name: `Add ${effect.name}`, exact: true }),
        ).toBeVisible();
      } else
        await expect(
          card.getByRole('button', { name: `Edit ${effect.name}`, exact: true }),
        ).toBeVisible();
    }
    await apply('captions', 'captions');
    await expect(page.getByRole('button', { name: 'Caption 2', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Caption 1', exact: true }).click();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toBeVisible();
    await search.fill('EQ');
    await page.locator('[data-command="effect-equalizer"]').click();
    await closeEffect(page);
    await expect(
      page.getByRole('button', { name: 'Equalizer instance 2 effect', exact: true }),
    ).toHaveCount(1);
    await page.keyboard.press('Control+k');
    await search.fill('crop');
    await expect(page.locator('[data-command="effect-crop"]')).toContainText('Edit Crop');
    await page.keyboard.press('Escape');
    await apply('crop', 'crop');
    await expect(page.getByRole('button', { name: 'Crop effect', exact: true })).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Crop instance 2 effect', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true })
      .click();
    await apply('volume', 'volume');
    await expect(
      page
        .getByRole('navigation', { name: 'Workflow' })
        .getByRole('button', { name: 'Editor', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test('opens search from settings inputs, navigates with arrows and fits a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMobileMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Autosave workspace', { exact: true }).focus();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search commands', exact: true });
  await expect(search).toBeFocused();
  await search.fill('import');
  const before = await search.getAttribute('aria-activedescendant');
  await search.press('ArrowDown');
  expect(await search.getAttribute('aria-activedescendant')).not.toBe(before);
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', before!);
  const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.x).toBeGreaterThanOrEqual(0);
  await search.fill('url');
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Load from URL', exact: true })).toBeVisible();
});
