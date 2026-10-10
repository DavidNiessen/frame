import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Refuse partial releases and hash the exact installers produced by this run. */
export async function prepareRelease(directory, { version, runNumber, sha, notesPath }) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) || !/^[1-9]\d*$/.test(runNumber) || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Release version, build number, and commit must be valid.');
  }
  const platforms = [
    ['Windows x64', 'win-x64.exe'], ['Mac Apple Silicon', 'mac-arm64.dmg'],
    ['Mac Intel', 'mac-x64.dmg'], ['Linux x64', 'linux-x64.AppImage'],
  ];
  const names = platforms.map(([, suffix]) => `Frame-${version}-${suffix}`);
  const actual = (await readdir(directory)).filter(name => /\.(exe|dmg|AppImage)$/.test(name));
  if (names.some(name => !actual.includes(name)) || actual.some(name => !names.includes(name))) {
    throw new Error(`Expected exactly these four installers: ${names.join(', ')}. Found: ${actual.join(', ')}`);
  }
  const checksums = [];
  for (const name of names) {
    const path = join(directory, name), info = await stat(path);
    if (!info.isFile() || !info.size) throw new Error(`Installer is empty or invalid: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
  const notes = [
    `Desktop installers built from commit ${sha}, after all CI checks passed.`, '',
    '| Platform | Installer |', '| --- | --- |',
    ...platforms.map(([label], index) => `| ${label} | \`${names[index]}\` |`), '',
    'Download the installer for your platform. SHA256SUMS.txt contains the SHA-256 checksums.', '',
    'These development builds are prereleases. Windows installers and macOS apps are not yet code-signed or notarized; the Windows Explorer extension has separate certificate trust. See [distribution notes](https://github.com/' + (process.env.GITHUB_REPOSITORY ?? 'DavidNiessen/frame') + '/blob/' + sha + '/docs/DISTRIBUTION.md).', '',
  ].join('\n');
  await writeFile(notesPath, notes);
  return { tag: `v${version}-build.${runNumber}`, title: `Frame ${version} (build ${runNumber})` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const result = await prepareRelease(process.argv[2], {
    version, runNumber: process.env.GITHUB_RUN_NUMBER, sha: process.env.GITHUB_SHA, notesPath: process.argv[3],
  });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tag=${result.tag}\ntitle=${result.title}\n`);
}
