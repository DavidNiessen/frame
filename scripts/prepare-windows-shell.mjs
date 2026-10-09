import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { createHash, X509Certificate } from 'node:crypto';
import { join, resolve } from 'node:path';
import { nativeRoot, sourceFingerprint } from './windows-shell-source.mjs';
import { prepareToolFile } from './media-tool-files.mjs';
import { shellPackageManifest } from './windows-shell-package.mjs';
import { unzipSync } from 'fflate';

export async function prepareWindowsShell() {
  const root = resolve('build/generated/shell-actions/windows');
  const manifest = JSON.parse(await readFile(join(nativeRoot, 'binaries.json'))), identity = JSON.parse(await readFile(join(nativeRoot, 'identity.json')));
  if (process.env.FRAME_WINDOWS_SHELL_PUBLISHER) identity.publisher = process.env.FRAME_WINDOWS_SHELL_PUBLISHER;
  if (await sourceFingerprint() !== manifest.sourceSha256) throw new Error('The Windows shell sources differ from the checked-in binaries. Pull the latest repository changes or review local edits in native/windows-shell, src/core/media-extensions.json and build/icon.png. Rebuilding with npm run build:windows-shell is only needed after intentional native source changes.');
  await mkdir(join(root, 'Assets'), { recursive: true });
  for (const [name, sha256] of Object.entries(manifest.platforms['win32-x64'])) await prepareToolFile({ source: join(nativeRoot, 'bin/x64', name), destination: join(root, name), sha256 });
  const custom = process.env.FRAME_WINDOWS_SHELL_PACKAGE;
  const signature = JSON.parse(await readFile(join(nativeRoot, 'package/signature.json')));
  const archive = await readFile(custom || join(nativeRoot, 'package/FrameShell.msix')), contents = unzipSync(archive);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  if (!custom && digest(archive) !== signature.packageSha256) throw new Error('The bundled signed shell package is corrupt. Restore native/windows-shell/package from Git.');
  const xml = Buffer.from(contents['AppxManifest.xml'] || []).toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (xml !== shellPackageManifest(identity) || !contents['AppxSignature.p7x']) throw new Error('The signed shell package must contain the exact generated manifest and its signature. Re-sign after changing the manifest.');
  for (const name of ['AppxManifest.xml', 'Assets/StoreLogo.png', 'Assets/Logo44.png', 'Assets/Logo150.png']) {
    if (!contents[name]) throw new Error(`The signed shell package is missing ${name}.`);
    await writeFile(join(root, name), contents[name]);
  }
  await writeFile(join(root, 'FrameShell.msix'), archive);
  const certificate = await readFile(join(nativeRoot, 'package/Frame.cer')), cert = new X509Certificate(certificate);
  if (digest(certificate) !== signature.certificateSha256 || cert.ca || cert.subject !== signature.publisher || !cert.keyUsage?.includes('1.3.6.1.5.5.7.3.3')) throw new Error('The bundled Frame code-signing certificate is invalid. Restore it from Git.');
  await writeFile(join(root, 'Frame.cer'), certificate);
  await writeFile(join(root, 'identity.json'), JSON.stringify({ ...identity, signedPackage: true, certificate: !custom ? { ...signature, helperSha256: manifest.platforms['win32-x64']['FrameCertificateHelper.exe'] } : null }));
  await cp(join(nativeRoot, 'manage-menu.ps1'), join(root, 'manage-menu.ps1'));
  await cp(join(nativeRoot, 'package-registration.ps1'), join(root, 'package-registration.ps1'));
  await cp(join(nativeRoot, 'certificate.ps1'), join(root, 'certificate.ps1'));
  return root;
}
