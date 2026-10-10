import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { importTestMedia } from '../helpers/import-media';
import { verifyJoinedPlayback } from '../helpers/joined-playback';
import { probeFile } from '../../electron/native';

test('joins retained footage after deletion, saves cuts and exports without restoring the middle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-joined-test-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await importTestMedia(page, app); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    for (const time of [2, 4]) { await page.getByLabel('Seek playhead').fill(String(time)); await page.getByRole('button', { name: 'Split', exact: true }).click(); }
    await page.locator('.timeline-clip .range-body').nth(1).click(); await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Join splits', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Join splits', exact: true }).click();
    await expect(page.locator('.timeline-clip')).toHaveCount(1);
    await expect(page.locator('.timeline-clip .audio-waveform')).toHaveCount(2);
    await expect(page.locator('.timeline-clip .audio-waveform').nth(1)).toHaveAttribute('data-start', '4');
    await verifyJoinedPlayback(page);
    const project = join(directory, 'joined.frame.json'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, project);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(async () => readFile(project, 'utf8').then(text => JSON.parse(text).sources[0].edit.clips.length).catch(() => 0)).toBe(2);
    const clips = JSON.parse(await readFile(project, 'utf8')).sources[0].edit.clips;
    expect(clips.map((clip: { start: number; end: number }) => [clip.start, clip.end])).toEqual([[0, 2], [4, 6]]); expect(clips[0].groupId).toBe(clips[1].groupId);
    const output = join(directory, 'joined.mp4'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, output);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect.poll(async () => stat(output).then(file => file.size).catch(() => 0), { timeout: 30000 }).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Export MP4', exact: true })).toBeEnabled({ timeout: 30000 });
    expect((await probeFile(output)).duration).toBeCloseTo(4, 1);
    await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
    await page.keyboard.press('Control+k'); await page.getByRole('combobox', { name: 'Search commands', exact: true }).fill('volume'); await page.locator('[data-command="effect-volume"]').click();
    await expect(page.locator('.effect-settings-overlay')).toBeVisible();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
