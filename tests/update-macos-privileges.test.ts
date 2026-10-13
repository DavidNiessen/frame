import { expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { macPrivilegedUpdateScript } from '../electron/update-macos-privileges';
import type { UpdateInstallPlan } from '../electron/update-install-types';

it.skipIf(process.platform === 'win32')(
  'quotes update paths in the authorized macOS transaction and stops before altering the app if staging fails',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame privileged update '));
    try {
      const injected = join(directory, 'unexpected');
      const source = join(directory, `update';touch '${injected}';echo '.dmg`);
      const recorded = join(directory, 'args.json');
      const fakeCopy = join(directory, 'copy.cjs');
      await writeFile(
        fakeCopy,
        `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(recorded)},JSON.stringify(process.argv.slice(2)));process.exit(42);\n`,
      );
      await chmod(fakeCopy, 0o755);
      const plan: UpdateInstallPlan = {
        platform: 'darwin',
        arch: 'arm64',
        parent: 1,
        source,
        checksum: 'a'.repeat(64),
        target: join(directory, 'Frame.app'),
        version: '1.0.1',
        directory,
        userData: directory,
      };
      const script = macPrivilegedUpdateScript(plan, 501);
      await promisify(execFile)('/bin/sh', ['-n', '-c', script]);
      const stopped = script.replace('/usr/bin/ditto ', `'${fakeCopy}' `);
      await expect(promisify(execFile)('/bin/sh', ['-c', stopped])).rejects.toMatchObject({
        code: 42,
      });
      expect(JSON.parse(await readFile(recorded, 'utf8'))[0]).toBe(source);
      await expect(access(injected)).rejects.toThrow();
      expect(() => macPrivilegedUpdateScript(plan, 0)).toThrow('identity');
      expect(() => macPrivilegedUpdateScript({ ...plan, checksum: 'invalid' }, 501)).toThrow(
        'checksum',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
