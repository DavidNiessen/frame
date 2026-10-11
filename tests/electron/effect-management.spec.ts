import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('saves minimum split clips and removes a track effect through the native timeline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-effects-')),
    executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({
    executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await importTestMedia(page, app);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await expect(page.getByRole('tab', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Trim', exact: true })).toHaveCount(0);
    await trim(page, 'start', 2.4);
    await trim(page, 'end', 2.5);
    await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
      'aria-valuenow',
      '2.4',
    );
    await expect(page.getByLabel('Trim end')).toHaveAttribute('aria-valuenow', '2.5');
    await openEffect(page, 'Volume');
    await page.getByLabel('Volume', { exact: true }).fill('0.5');
    await page.getByLabel('Seek playhead').fill('2.45');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('.timeline-clip')).toHaveCount(2);
    await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', {
      timeout: 30000,
    });
    const destination = join(directory, 'minimum.frame.json');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      return true;
    }, destination);
    await closeEffect(page);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(
        () =>
          readFile(destination, 'utf8').then(
            (text) => JSON.parse(text).sources[0].edit.clips.length,
          ),
        { timeout: 30000 },
      )
      .toBe(2);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page
      .locator('.timeline-track-filters')
      .getByRole('button', { name: 'effects', exact: true })
      .click();
    await closeEffect(page);
    await page
      .getByRole('button', { name: 'Volume effect', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Volume effect', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(
        () =>
          readFile(destination, 'utf8').then(
            (text) => JSON.parse(text).sources[0].edit.effectInstances.length,
          ),
        { timeout: 30000 },
      )
      .toBe(0);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Volume', exact: true }).click();
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
    await page.getByRole('button', { name: 'Remove Volume', exact: true }).click();
    await expect(page.locator('.effect-lane')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Volume effect', exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
