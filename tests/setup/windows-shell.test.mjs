import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { nativeRoot, sourceFingerprint } from '../../scripts/windows-shell-source.mjs';
import { fileDigest } from '../../scripts/media-tool-files.mjs';
import { shellPackageManifest, sparseMsix } from '../../scripts/windows-shell-package.mjs';
import { prepareWindowsShell } from '../../scripts/prepare-windows-shell.mjs';

test('native Explorer binaries match their sources and have no non-Windows runtime DLL dependencies', async () => {
  const binaries = JSON.parse(await readFile(join(nativeRoot, 'binaries.json')));
  assert.equal(await sourceFingerprint(), binaries.sourceSha256);
  for (const [name, sha256] of Object.entries(binaries.platforms['win32-x64'])) {
    const path = join(nativeRoot, 'bin/x64', name); assert.equal(await fileDigest(path), sha256);
    const content = await readFile(path); assert.equal(content.subarray(0, 2).toString(), 'MZ');
    assert.doesNotMatch(content.toString('latin1'), /libstdc\+\+-6\.dll|libgcc_s[^\x00]*\.dll|libwinpthread-1\.dll/i);
  }
});
test('packs a sparse identity with correct ZIP headers and hashes for every uncompressed block', () => {
  const identity = { name: 'Frame.MediaEditor.Shell', publisher: 'CN=Frame', version: '1.0.0.0', editClsid: 'edit-clsid', convertClsid: 'convert-clsid' };
  const manifest = shellPackageManifest(identity);
  assert.match(manifest, /windows\.fileExplorerContextMenus/); assert.match(manifest, /AllowExternalContent>true/);
  assert.match(manifest, /Id="FrameEdit" Clsid="edit-clsid"/); assert.match(manifest, /Id="FrameConvert" Clsid="convert-clsid"/);
  const files = { 'AppxManifest.xml': Buffer.from(manifest), 'Assets/large.png': Buffer.alloc(70000, 42) };
  const archive = sparseMsix(files), unpacked = unzipSync(archive), map = Buffer.from(unpacked['AppxBlockMap.xml']).toString('utf8');
  for (const [name, content] of Object.entries(files)) {
    assert.deepEqual(Buffer.from(unpacked[name]), content);
    assert.ok(map.includes(`Name="${name.replace(/\//g, '\\')}" Size="${content.length}" LfhSize="${30 + Buffer.byteLength(name)}"`));
    for (let offset = 0; offset < content.length; offset += 65536) assert.ok(map.includes(createHash('sha256').update(content.subarray(offset, offset + 65536)).digest('base64')));
  }
  assert.equal(Buffer.from(archive).readUInt16LE(8), 0); // ZIP_STORE; no compression-size fields required.
  assert.ok(unpacked['[Content_Types].xml']); assert.ok(!Object.keys(unpacked).some(name => /\.(dll|exe)$/i.test(name)));
});
test('prepares checked-in native binaries and a code-free sparse package without a compiler', async () => {
  const root = await prepareWindowsShell(), files = unzipSync(await readFile(join(root, 'FrameShell.msix')));
  assert.ok(files['AppxManifest.xml']); assert.ok(files['Assets/Logo44.png']);
  assert.ok(!files['FrameShell.dll']); assert.ok(!files['FrameShellLauncher.exe']);
  assert.ok((await readFile(join(root, 'manage-menu.ps1'), 'utf8')).includes('Remove-AppxPackage'));
});
test('quotes Unicode and special filenames and batches long selections using the native launch code', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-shell-arguments-'));
  try {
    const source = `#include "${join(nativeRoot, 'arguments.hpp')}"\n#include <cassert>\nint main() {
      assert(frame::quote(L"C:\\\\songs\\\\") == L"\\\"C:\\\\songs\\\\\\\\\\\"");
      assert(frame::quote(L"a\\\"b") == L"\\\"a\\\\\\\"b\\\"");
      assert(frame::commands(L"Frame.exe", {L"Bj\\u00f6rk & mix.wav", L"100% song.mp3"}, false)[0] == L"Frame.exe --frame-workflow=convert -- \\\"Bj\\u00f6rk & mix.wav\\\" \\\"100% song.mp3\\\"");
      std::vector<std::wstring> paths(2000, std::wstring(100, L'x') + L".wav");
      const auto batches = frame::commands(L"Frame.exe", paths, true); assert(batches.size() > 1);
      size_t total = 0; for (const auto& command : batches) { assert(command.size() <= 32760); for (const auto& path : paths) { (void)path; } total += command.size(); }
      assert(total > 200000);
      bool rejected = false; try { frame::commands(L"Frame.exe", {std::wstring(33000, L'x')}, true); } catch (const std::length_error&) { rejected = true; } assert(rejected);
    }`;
    await writeFile(join(directory, 'test.cpp'), source);
    execFileSync('g++', ['-std=c++17', join(directory, 'test.cpp'), '-o', join(directory, 'test')]);
    execFileSync(join(directory, 'test'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
