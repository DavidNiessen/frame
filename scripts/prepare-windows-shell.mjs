import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { nativeRoot, sourceFingerprint } from './windows-shell-source.mjs';
import { prepareToolFile } from './media-tool-files.mjs';
import { shellPackageManifest, sparseMsix } from './windows-shell-package.mjs';
import { unzipSync } from 'fflate';

export async function prepareWindowsShell() {
  const root = resolve('build/generated/shell-actions/windows'), assets = join(root, 'Assets');
  const manifest = JSON.parse(await readFile(join(nativeRoot, 'binaries.json'))), identity = JSON.parse(await readFile(join(nativeRoot, 'identity.json')));
  if (process.env.FRAME_WINDOWS_SHELL_PUBLISHER) identity.publisher = process.env.FRAME_WINDOWS_SHELL_PUBLISHER;
  if (await sourceFingerprint() !== manifest.sourceSha256) throw new Error('The Windows shell sources differ from the checked-in binaries. Pull the latest repository changes or review local edits in native/windows-shell, src/core/media-extensions.json and build/icon.png. Rebuilding with npm run build:windows-shell is only needed after intentional native source changes.');
  await mkdir(assets, { recursive: true });
  for (const [name, sha256] of Object.entries(manifest.platforms['win32-x64'])) await prepareToolFile({ source: join(nativeRoot, 'bin/x64', name), destination: join(root, name), sha256 });
  const files = { 'AppxManifest.xml': Buffer.from(shellPackageManifest(identity)) };
  const ffmpeg = resolve('build/media-tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  for (const [name, size] of [['StoreLogo.png', 50], ['Logo44.png', 44], ['Logo150.png', 150]]) {
    const path = join(assets, name);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', 'build/icon.png', '-vf', `scale=${size}:${size}`, path], { timeout: 10000 });
    files[`Assets/${name}`] = await readFile(path);
  }
  await writeFile(join(root, 'AppxManifest.xml'), files['AppxManifest.xml']);
  const signed = process.env.FRAME_WINDOWS_SHELL_PACKAGE;
  if (signed) {
    const archive = await readFile(signed), contents = unzipSync(archive);
    const xml = Buffer.from(contents['AppxManifest.xml'] || []).toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (xml !== files['AppxManifest.xml'].toString('utf8') || !contents['AppxSignature.p7x']) throw new Error('The supplied signed shell package must contain the exact generated manifest and its signature.');
    await writeFile(join(root, 'FrameShell.msix'), archive);
  } else await writeFile(join(root, 'FrameShell.msix'), sparseMsix(files));
  await writeFile(join(root, 'identity.json'), JSON.stringify({ ...identity, signedPackage: !!signed }));
  await cp(join(nativeRoot, 'manage-menu.ps1'), join(root, 'manage-menu.ps1'));
  await cp(join(nativeRoot, 'package-registration.ps1'), join(root, 'package-registration.ps1'));
  return root;
}
