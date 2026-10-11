import { test, expect, _electron } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { UpdateInstallPlan } from '../../electron/update-install-types';

const exec = promisify(execFile);
test('updates and relaunches the installed macOS app or Windows installer through the shipped helper', async () => {
  test.skip(
    !process.env.FRAME_TEST_EXECUTABLE || !['darwin', 'win32'].includes(process.platform),
    'Runs against the actual installed release package.',
  );
  test.setTimeout(180000);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'Frame update Ü ')));
  let application: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  let worker: ReturnType<typeof spawn> | undefined;
  let target: string | undefined;
  try {
    const supplied = resolve(process.env.FRAME_TEST_EXECUTABLE!);
    let executable = supplied;
    if (process.platform === 'darwin') {
      target = join(directory, 'Frame.app');
      await exec('/usr/bin/ditto', [dirname(dirname(dirname(supplied))), target]);
      executable = join(target, 'Contents/MacOS/Frame');
    } else target = dirname(supplied);
    const profile = join(directory, 'profile');
    application = await _electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${profile}`],
      env: { ...process.env, FRAME_DEV_URL: '' },
    });
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    const info = await application.evaluate(({ app }) => ({
      version: app.getVersion(),
      arch: process.arch,
      parent: process.pid,
    }));
    const name =
      process.platform === 'darwin'
        ? `Frame-${info.version}-mac-${info.arch}.dmg`
        : `Frame-${info.version}-win-x64.exe`;
    const source = resolve('release', name),
      contents = await readFile(source);
    const plan: UpdateInstallPlan = {
      platform: process.platform as 'darwin' | 'win32',
      arch: info.arch,
      parent: info.parent,
      source,
      checksum: createHash('sha256').update(contents).digest('hex'),
      target,
      version: info.version,
      directory,
      userData: profile,
    };
    const helperName = process.platform === 'win32' ? 'update-windows.ps1' : 'update-worker.cjs';
    const packaged = await application.evaluate(async ({ app }, name) => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      return fs.readFileSync(path.join(app.getAppPath(), 'dist-electron', name)).toString('base64');
    }, helperName);
    const helper = join(directory, helperName),
      planPath = join(directory, 'plan.json');
    await writeFile(helper, Buffer.from(packaged, 'base64'));
    await writeFile(planPath, JSON.stringify(plan));
    const windows = process.platform === 'win32';
    worker = spawn(
      windows ? 'powershell.exe' : executable,
      windows
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            helper,
            '-PlanPath',
            planPath,
          ]
        : [helper, planPath],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
    );
    let diagnostics = '';
    worker.stderr?.on('data', (chunk) => {
      diagnostics += chunk;
    });
    const completed = new Promise<number | null>((resolve) => worker!.once('exit', resolve));
    await expect.poll(async () => readdir(directory), { timeout: 120000 }).toContain('armed');
    const exited = new Promise<number | null>((resolve) =>
      application!.process().once('exit', resolve),
    );
    await application.evaluate(({ app }) => app.quit());
    expect(await exited).toBe(0);
    expect(await completed, diagnostics).toBe(0);
    expect(await readdir(directory)).toContain('complete');
    expect(
      (await readdir(dirname(target))).filter((name) => name.startsWith('.Frame-update-')),
    ).toEqual([]);
    if (process.platform === 'darwin') {
      await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', target]);
      await expect
        .poll(
          async () =>
            (await exec('/bin/ps', ['-axo', 'comm='])).stdout
              .split('\n')
              .map((line) => line.trim()),
          { timeout: 15000 },
        )
        .toContain(executable);
    } else {
      await exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process Frame -ErrorAction Stop | Select-Object -ExpandProperty Path',
      ]);
    }
  } finally {
    worker?.kill();
    if (application && application.process().exitCode === null) await application.close();
    // Terminate only the relaunched executable owned by this test, never another Frame installation.
    if (target) {
      if (process.platform === 'darwin') {
        const executable = join(target, 'Contents/MacOS/Frame');
        const processes = (await exec('/bin/ps', ['-axo', 'pid=,comm='])).stdout.split('\n');
        for (const line of processes) {
          const match = /^\s*(\d+)\s+(.+)$/.exec(line);
          if (match?.[2] === executable)
            try {
              process.kill(Number(match[1]));
            } catch {}
        }
      } else {
        const cleanup = join(directory, 'cleanup.ps1');
        await writeFile(
          cleanup,
          "param([string]$PlanPath)\n$p=Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json\n$exe=Join-Path $p.target 'Frame.exe'\nGet-Process Frame -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force\n",
        );
        await exec('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          cleanup,
          '-PlanPath',
          join(directory, 'plan.json'),
        ]).catch(() => {});
      }
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
