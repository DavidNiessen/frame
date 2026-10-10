import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('copies track effects, saves recipes, restores them across splits and supports undo', async ({ page }) => {
  await page.goto('/'); await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.4');
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await page.getByText('Recipes & copy / paste', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy effects', exact: true }).click(); await page.getByLabel('Effect recipe name', { exact: true }).fill('Quiet review'); await page.getByRole('button', { name: 'Save effect recipe', exact: true }).click();
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.8'); await closeEffect(page); await page.getByRole('button', { name: 'Paste effects', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const doc = JSON.parse(await readFile((await (await pending).path())!, 'utf8')); expect(doc.sources[0].edit.effectInstances.find((instance: { effect: string }) => instance.effect === 'volume').settings.volume).toBe(.4); expect(doc.sources[0].edit.clips.map((clip: { effects: object }) => Object.keys(clip.effects))).toEqual([[], []]);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.8');
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await page.getByRole('button', { name: 'Quiet review', exact: true }).click();
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.4');
  await page.reload(); await expect(page.locator('video')).toHaveJSProperty('readyState', 4); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await page.getByText('Recipes & copy / paste', { exact: true }).click(); await expect(page.getByRole('button', { name: 'Quiet review', exact: true })).toBeVisible();
});
