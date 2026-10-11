import { test, expect, _electron } from '@playwright/test';
import { windowsPowerShellEnv } from '../../scripts/windows-powershell-env.mjs';
import { execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const exec = promisify(execFile);
test.use({ trace: 'retain-on-failure' });
test('downloads, installs and relaunches the packaged app through Settings', async () => {
  test.skip(
    !process.env.FRAME_TEST_EXECUTABLE || !['darwin', 'win32'].includes(process.platform),
    'Runs against the actual installed release package.',
  );
  test.setTimeout(240000);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'Frame update Ü ')));
  let application: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  let original: ChildProcess | undefined;
  let target: string | undefined;
  try {
    const supplied = resolve(process.env.FRAME_TEST_EXECUTABLE!);
    let executable = supplied;
    if (process.platform === 'darwin') {
      target = join(directory, 'Frame.app');
      await exec('/usr/bin/ditto', [dirname(dirname(dirname(supplied))), target]);
      executable = join(target, 'Contents/MacOS/Frame');
    } else {
      target = await realpath(dirname(supplied));
      executable = join(target, 'Frame.exe');
    }
    const profile = join(directory, 'profile');
    await mkdir(profile);
    await writeFile(
      join(profile, 'update-preferences.json'),
      JSON.stringify({ automatic: false, includePrereleases: true }),
    );
    application = await _electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${profile}`],
      env: { ...process.env, FRAME_DEV_URL: '' },
    });
    original = application.process();
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    const info = await application.evaluate(({ app }) => ({
      version: app.getVersion(),
      arch: process.arch,
    }));
    const name =
      process.platform === 'darwin'
        ? `Frame-${info.version}-mac-${info.arch}.dmg`
        : `Frame-${info.version}-win-x64.exe`;
    const source = resolve('release', name),
      contents = await readFile(source);
    const checksum = createHash('sha256').update(contents).digest('hex'),
      tag = `v${info.version}-build.99999999`;
    await application.evaluate(
      ({ net }, fixture) => {
        net.fetch = async (url) => {
          const address = String(url);
          if (address.includes('/releases?'))
            return new Response(
              JSON.stringify([
                {
                  tag_name: fixture.tag,
                  prerelease: true,
                  draft: false,
                  assets: [fixture.name, 'SHA256SUMS.txt'].map((name) => ({
                    name,
                    size: fixture.size,
                    browser_download_url: `https://github.com/DavidNiessen/frame/releases/download/${fixture.tag}/${name}`,
                  })),
                },
              ]),
            );
          if (address.endsWith('/SHA256SUMS.txt'))
            return new Response(`${fixture.checksum}  ${fixture.name}`);
          if (!address.endsWith('/' + fixture.name))
            throw new Error('Unexpected updater request: ' + address);
          // Electron's evaluation context has no dynamic-import callback.
          const fs = process.getBuiltinModule('fs') as typeof import('node:fs'),
            streams = process.getBuiltinModule('stream') as typeof import('node:stream');
          return new Response(
            streams.Readable.toWeb(
              fs.createReadStream(fixture.source),
            ) as ReadableStream<Uint8Array>,
          );
        };
      },
      { tag, name, checksum, source, size: contents.length },
    );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const updates = page.locator('section[aria-labelledby="updates-heading"]');
    await updates.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await updates.getByRole('button', { name: 'Install update', exact: true }).click();
    const restart = updates.getByRole('button', { name: 'Restart to update', exact: true });
    await expect(restart).toBeEnabled({ timeout: 60000 });
    await restart.click();
    await expect
      .poll(
        async () => {
          if (original!.exitCode !== null) return original!.exitCode;
          const status = await page
            .evaluate(() => window.frameDesktop!.updateStatus())
            .catch(() => null);
          if (status?.error) throw new Error(status.error);
          return null;
        },
        { timeout: 180000 },
      )
      .toBe(0);
    const cache = join(profile, 'updates', tag);
    const apply = (await readdir(cache)).find((name) => name.startsWith('apply-'))!;
    const applied = join(cache, apply);
    const planPath = join(applied, 'plan.json');
    expect(JSON.parse(await readFile(planPath, 'utf8')).target).toBe(target);
    await expect
      .poll(
        async () => {
          const files = await readdir(applied);
          if (files.includes('error.json'))
            throw new Error(await readFile(join(applied, 'error.json'), 'utf8'));
          return files;
        },
        { timeout: 120000 },
      )
      .toContain('complete');
    expect(
      (await readdir(dirname(target))).filter((name) => name.startsWith('.Frame-update-')),
    ).toEqual([]);
    if (process.platform === 'darwin') {
      await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', target]);
      const canonicalExecutable = await realpath(executable);
      await expect
        .poll(
          async () => {
            const processes = (
              await exec('/bin/ps', ['-axww', '-o', 'comm='], {
                env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
              })
            ).stdout
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.endsWith('/Contents/MacOS/Frame'));
            return Promise.all(processes.map((path) => realpath(path).catch(() => path)));
          },
          { timeout: 15000 },
        )
        .toContain(canonicalExecutable);
    } else {
      const { stdout } = await exec(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-Process Frame -ErrorAction Stop | Select-Object -ExpandProperty Path',
        ],
        { env: windowsPowerShellEnv() },
      );
      expect(stdout.toLowerCase()).toContain(join(target, 'Frame.exe').toLowerCase());
    }
  } catch (cause) {
    const profile = join(directory, 'profile');
    const updates = join(profile, 'updates');
    for (const release of await readdir(updates).catch(() => [])) {
      const cache = join(updates, release);
      for (const name of await readdir(cache).catch(() => [])) {
        if (!name.startsWith('apply-')) continue;
        const applied = join(cache, name);
        const details: Record<string, string> = {};
        for (const file of ['helper.log', 'stage', 'plan.json', 'error.json', 'runtime.pid'])
          details[file] = await readFile(join(applied, file), 'utf8').catch(() => 'Missing');
        await test.info().attach('updater-diagnostics', {
          body: JSON.stringify(details, null, 2),
          contentType: 'application/json',
        });
      }
    }
    throw cause;
  } finally {
    if (application && original?.exitCode === null) await application.close();
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
        const cleanup = join(directory, 'cleanup.ps1'),
          cleanupTarget = join(directory, 'cleanup-target.json');
        await writeFile(cleanupTarget, JSON.stringify({ target }));
        await writeFile(
          cleanup,
          "param([string]$TargetPath)\n$p=Get-Content -LiteralPath $TargetPath -Raw -Encoding UTF8 | ConvertFrom-Json\n$exe=Join-Path $p.target 'Frame.exe'\nGet-Process Frame -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force\n",
        );
        await exec(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            cleanup,
            '-TargetPath',
            cleanupTarget,
          ],
          { env: windowsPowerShellEnv() },
        ).catch(() => {});
      }
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
